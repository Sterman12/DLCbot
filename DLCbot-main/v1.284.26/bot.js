import { Octokit }                                                          from 'octokit';
import { EventSub, getTokenTwitchACGF, getCodeTwitchACGF, websocketData }  from 'twitchwebsocketsjs';
import { dataHandler, dlcList }                                            from './db.js';
import { commandsList }                                                    from './commands.js';
import { channelList }                                                     from './channels.js';

// ── Config ────────────────────────────────────────────────────────────────────

const BOT_USER_ID            = process.env.BOT_USER_ID;
const CLIENT_ID              = process.env.CLIENT_ID;
const CLIENT_SECRET          = process.env.CLIENT_SECRET;
const REDIRECT_URL           = process.env.REDIRECT_URL;
const GITHUB_TOKEN           = process.env.GITHUB_PERSONAL_TOKEN;
const EVENTSUB_WEBSOCKET_URL = 'wss://eventsub.wss.twitch.tv/ws';
const EVENTSUB_ENDPOINT      = 'https://api.twitch.tv/helix/eventsub/subscriptions';

// ── Channel state ─────────────────────────────────────────────────────────────

class channelData {
    constructor(channelID, cooldown = 0) {
        this.id               = channelID;
        this.cooldownDuration = cooldown;
        this.localDlcList     = null;
        // CORE FIX: per-user cooldown instead of one global for the entire channel.
        // Earlier: one lastMessage — one user pulled the command, all the others were blocked.
        // Now: each user has their own timer, the others are not affected.
        //  this.userCooldowns = new Map();   userID → timestamp of the last command

        // CORE FIX: per-user кулдаун вместо одного глобального на весь канал.
        // Раньше: один lastMessage — один юзер дёргал команду, все остальные блокировались.
        // Теперь: у каждого юзера свой таймер, остальные не затронуты.
        this.userCooldowns    = new Map(); // userID → timestamp последней команды
    }

    isOnCooldown(userID, now) {
        if (!this.userCooldowns.has(userID)) return false;
        return (this.userCooldowns.get(userID) + this.cooldownDuration) > now;
    }

    secondsLeft(userID, now) {
        if (!this.userCooldowns.has(userID)) return 0;
        return Math.ceil((this.userCooldowns.get(userID) + this.cooldownDuration - now) / 1000);
    }

    updateCooldown(userID, now) {
        this.userCooldowns.set(userID, now);
    }
}

// ── Core bot ──────────────────────────────────────────────────────────────────

class coreBot {
    constructor(BOT_USER_ID, CLIENT_ID, CLIENT_SECRET, wsUrl, wsEndpoint, octokit) {
        this.bot_ID          = BOT_USER_ID;
        this.client_ID       = CLIENT_ID;
        this.client_Secret   = CLIENT_SECRET;
        this.octokit         = octokit;
        this.authCode        = null;
        this.channelDataList = [];
        this.websocketData   = new websocketData(wsUrl, wsEndpoint);
        this.db              = new dataHandler();
        this.createdAt       = Date.now();
        this.commandList     = [...commandsList];
    }

    addNewChannel(channelID, cooldownMs) {
        this.channelDataList.push(new channelData(channelID, cooldownMs));
        console.log(`Channel added: ${channelID} (cooldown: ${cooldownMs}ms)`);
    }

    removeChannel(channelID) {
        this.channelDataList = this.channelDataList.filter(c => c.id !== channelID);
    }

    async closeBot() {
        console.log('Shutting down bot...');
        this.websocketData.client.close();
        await this.db.close();
    }

    async websocketHandleChannelChatMessage(data) {
        const text = data.payload.event.message.text;

        // Игнорируем всё кроме команд
        // Ignore everything except commands
        if (text.charAt(0) !== '!') return;

        const channel_id_sentIn = data.payload.event.broadcaster_user_id;
        const userCalling       = data.payload.event.chatter_user_id;
        const userName          = data.payload.event.chatter_user_name;
        const now               = data.timeStamp;
        const stringArray       = text.trim().split(' ');
        const lowerCmd          = stringArray[0].toLowerCase();

        console.log(`MSG #${data.payload.event.broadcaster_user_login} <${userName}> ${text}`);

        // Проверка бана
        // Checking the ban
        if (await this.db.checkFlagMongo(userCalling, 'isBanned')) return;

        // Ищем данные канала
        // Searching for channel data
        const channel = this.channelDataList.find(c => c.id === channel_id_sentIn);
        if (!channel) {
            console.error('Unknown channel:', channel_id_sentIn);
            return;
        }

        // Per-user кулдаун
        // Per-user cooldown
        if (channel.isOnCooldown(userCalling, now)) {
            const secs = channel.secondsLeft(userCalling, now);
            console.log(`Cooldown: ${userName} — ${secs}s left`);

            return;
        }

        // Ищем команду
        // Looking for a team
        const cmd = this.commandList.find(
            c => c.name === lowerCmd || c.aliases.includes(lowerCmd)
        );
        if (!cmd) {
            console.log('Unknown command:', lowerCmd);
            return;
        }

        // Применяем кулдаун сразу, до выполнения — чтобы повторные сообщения не проскочили
        // We apply a cooldown immediately, before execution, so that repeated messages do not slip through
        if (cmd.hasCooldown) channel.updateCooldown(userCalling, now);

        // Контекст, доступный командам через `this`
        // The context available to commands via `this`
        const ctx = {
            channel_id_sentIn,
            userCalling,
            timeStamp:       now,
            userName,
            stringArray,
            dlcList,
            fullText:        text,
            dataHandling:    this.db,
            botCreatedAt:    this.createdAt,
            channelCooldown: channel.cooldownDuration,
            commandNames:    this.commandList.map(c => c.name).join(', '),
        };

        try {
            const reply = await cmd.functionReference.call(ctx);
            if (reply) await EventSub.sendChatMessage(reply, channel_id_sentIn, this.authCode);
        } catch (err) {
            console.error(`Error in ${cmd.name}:`, err);
        }
    }
}

// ── Entry point ───────────────────────────────────────────────────────────────

(async function () {
    const bot = new coreBot(
        BOT_USER_ID, CLIENT_ID, CLIENT_SECRET,
        EVENTSUB_WEBSOCKET_URL, EVENTSUB_ENDPOINT,
        new Octokit({ auth: GITHUB_TOKEN, userAgent: 'DLC v1' })
    );

    await bot.db.connect();

    const authUrl  = `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URL}&scope=user%3Abot+user%3Aread%3Achat+user%3Awrite%3Achat`;
    const authCode = await getCodeTwitchACGF(authUrl);
    bot.authCode = await getTokenTwitchACGF(authCode, CLIENT_ID, CLIENT_SECRET, REDIRECT_URL, BOT_USER_ID);
    bot.websocketData.authCode = bot.authCode;

    // Регистрируем обработчик сообщений
    // Registering a message handler
    bot.websocketData.eventEmitter.on('channel.chat.message', (data) => {
        // .catch() снаружи — чтобы необработанное исключение не убило весь процесс
        // .catch() outside — to prevent an unhandled exception from killing the entire process
        bot.websocketHandleChannelChatMessage(data).catch(err =>
            console.error('Unhandled error in message handler:', err)
        );
    });

    // Добавляем каналы
    // Adding channels
    for (const ch of channelList) {
        console.log(`Adding channel: ${ch.name} (id: ${ch.id}, cooldown: ${ch.cooldown}ms)`);
        bot.addNewChannel(ch.id, ch.cooldown);
        bot.websocketData.addNewChannel(ch.id, ch.cooldown);
    }

    await bot.websocketData.websocketClientStart();

    // Плавное завершение работы
    // Graceful shutdown
    process.on('SIGTERM', async () => { await bot.closeBot(); process.exit(0); });
    process.on('SIGINT',  async () => { await bot.closeBot(); process.exit(0); });
    process.on('uncaughtException',  (err)    => { console.error('Uncaught exception:', err); bot.closeBot(); });
    process.on('unhandledRejection', (reason) => { console.error('Unhandled rejection:', reason); throw reason; });
})();
