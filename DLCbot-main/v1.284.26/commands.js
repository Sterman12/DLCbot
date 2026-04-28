
import { imdbLookup, dlcList } from './db.js';

// ── Cooldown helper ───────────────────────────────────────────────────────────

export function coolDownElapsed(currentTs, lastTs, duration) {
    if (lastTs == null) return true;
    return (lastTs + duration) < currentTs;
}

// ── Taffer list ───────────────────────────────────────────────────────────────

export function getTafferList() {
    return 'TafferArrive THE BAR IS OPENING! @handsomeScag @sterman00 @politeTrout @heythere_chat';
}

// ── Command class ─────────────────────────────────────────────────────────────

export class commandObject {
    constructor(name, fn, hasCooldown = true, needsFlags = false, isAsync = false) {
        this.name              = name;
        this.functionReference = fn;
        this.hasCooldown       = hasCooldown;
        this.aliases           = [];
        this.needsFlags        = needsFlags;
        this.isAsync           = isAsync;
    }
}

// ── Commands list ─────────────────────────────────────────────────────────────
// Каждая функция вызывается через .call(ctx), где ctx — объект с контекстом.

// Each function is called via .call(ctx) where ctx is the message context object.
//   stringArray, dlcList, fullText, dataHandling,
//   botCreatedAt, channelCooldown, commandNames

export const commandsList = [];

// !dlc — показать текущий DLC
// !dlc — show the current DLC
commandsList.push(new commandObject('!dlc', function () {
    return dlcList.currentDLC;
}));

// !setdlc — установить DLC (требует флаг canEditDLC)
// !setdlc — install DLC (requires the canEditDLC flag)
commandsList.push(new commandObject('!setdlc', async function () {
    if (!(await this.dataHandling.checkFlagMongo(this.userCalling, 'canEditDLC'))) {
        return "You don't have permission to use this command!";
    }
    const text = this.fullText.replace(this.stringArray[0], '').trim();
    if (!text) {
        dlcList.currentDLC = 'There is no live dlc right now';
        return 'DLC reset!';
    }
    dlcList.currentDLC = text;
    return 'DLC set!';
}, true, true, true));

// !cock — генератор случайного размера
// !cock — a random-size generator
commandsList.push(new commandObject('!cock', function () {
    const inches = Math.floor(Math.random() * 10);
    if (inches <= 3) return `paulieLaughingAtYou so lidl! only ${inches} inches`;
    if (inches < 7)  return `Creature not bad ${inches} inches`;
    return `Very big! gachiHYPER ${inches} inches`;
}));

// !addflag  BUGFIX: добавлен await перед checkFlagMongo
// !addflag BUGFIX: await added before checkFlagMongo
commandsList.push(new commandObject('!addflag', async function () {
    if (!(await this.dataHandling.checkFlagMongo(this.userCalling, 'canEditApprovedUsers'))) return;
    await this.dataHandling.addFlagMongo(this.stringArray[1], this.stringArray[2]);
    return 'Flag added!';
}, true, true, true));

// !removeflag  BUGFIX: await + правильное имя метода removeFlagMongo (было removeFlag)
// !removeflag BUGFIX: await + the correct method name is removeFlagMongo (it was removeFlag)
commandsList.push(new commandObject('!removeflag', async function () {
    if (!(await this.dataHandling.checkFlagMongo(this.userCalling, 'canEditApprovedUsers'))) return;
    await this.dataHandling.removeFlagMongo(this.stringArray[1], this.stringArray[2]);
    return 'Flag removed!';
}, true, true, true));

// !requests
commandsList.push(new commandObject('!requests', function () {
    return 'Website is currently unavailable sorry!';
}));

// !addrequest
commandsList.push(new commandObject('!addrequest', async function () {
    if (!(await this.dataHandling.checkFlagMongo(this.userCalling, 'canRequest'))) {
        return 'You are currently banned from requesting dlc';
    }
    await this.dataHandling.addRequest(
        this.fullText.replace(this.stringArray[0], ''),
        this.userName, this.timeStamp, this.userCalling, this.channel_id_sentIn
    );
    return 'Request added!';
}, true, true, true));

// !setrequestplayed
commandsList.push(new commandObject('!setrequestplayed', async function () {
    if (!(await this.dataHandling.checkFlagMongo(this.userCalling, 'canEditDLC'))) {
        return 'You cannot set dlc played';
    }
    await this.dataHandling.setRequestPlayed(this.stringArray[1]);
    return 'Set dlc played status.';
}, true, true, true));

// !imdblookup — перенесено из switch-блока
// !imdblookup — moved from the switch block
commandsList.push(new commandObject('!imdblookup', async function () {
    const query = this.fullText.replace(this.stringArray[0], '').trim();
    return (await imdbLookup(query)) || 'Nothing found on IMDB.';
}, true, false, true));

// !help — теперь динамически читает список из ctx.commandNames
// !help — now dynamically reads the list from ctx.commandNames
commandsList.push(new commandObject('!help', function () {
    return `Commands: ${this.commandNames}`;
}));

// !taffer — перенесено из switch-блока
// !taffer — moved from the switch block
commandsList.push(new commandObject('!taffer', async function () {
    if (!(await this.dataHandling.checkFlagMongo(this.userCalling, 'canEditApprovedUsers'))) return;
    return getTafferList();
}, true, true, true));

// !cooldown — показывает текущий per-user кулдаун канала
// !cooldown — shows the current per-user cooldown of the channel
commandsList.push(new commandObject('!cooldown', function () {
    return `This channel has a ${this.channelCooldown / 1000}s per-user cooldown.`;
}, false));

// !uptime — перенесено из switch-блока
// !uptime — moved from the switch block
commandsList.push(new commandObject('!uptime', function () {
    const elapsed = Date.now() - this.botCreatedAt;
    const mins = Math.floor(elapsed / 60000);
    const secs = Math.floor((elapsed / 1000) % 60);
    return `creatureBot has been alive for ${mins} minutes and ${secs} seconds.`;
}, false));


