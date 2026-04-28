import WebSocket from 'ws';
import open, {apps} from 'open';
import fs from 'node:fs/promises';
import { URLSearchParams } from 'node:url';
import { Octokit} from 'octokit';
import validator from "validator";
import {v7 as uuidv7, parse} from 'uuid';
import bs58 from 'bs58';
import EventEmitter from 'node:events';
import {EventSub, getTokenTwitchACGF, getCodeTwitchACGF, websocketData} from "twitchwebsocketsjs";
import { MongoClient, ServerApiVersion, BSON } from 'mongodb';
import {commandObject, commandsList} from './commands.js';
import {channelList, channelObject} from './channels.js';
const mongo_uri = process.env.MONGO_URI;
const BOT_USER_ID = process.env.BOT_USER_ID; // This is the User ID of the chat bot
const CLIENT_ID = process.env.CLIENT_ID;
const CHAT_CHANNEL_USER_ID = process.env.CHAT_CHANNEL_USER_ID; // This is the User ID of the channel that the bot will join and listen to chat messages of
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URL = process.env.REDIRECT_URL;
const GITHUB_TOKEN = process.env.GITHUB_PERSONAL_TOKEN;
const EVENTSUB_WEBSOCKET_URL = 'wss://eventsub.wss.twitch.tv/ws';
const EVENTSUB_ENDPOINT = 'https://api.twitch.tv/helix/eventsub/subscriptions';
const TEST_SERVER = "ws://localhost:8080/ws";
const TEST_ENDPOINT = "http://localhost:8080/eventsub/subscriptions";

class dataAcessible {
    constructor(requestedData, data) {
        this.channel_id_sentIn = data.payload.event.broadcaster_user_id,
        this.userCalling = data.payload.event.chatter_user_id,
        this.timeStamp = data.timeStamp,
        this.userName = data.payload.event.chatter_user_name,
        this.stringArray = stringArray,
        this.dlcList = dlcList,
        this.fullText = data.payload.event.message.text
        for (i=0; i < requestedData.length;i++) {
            requestedData[i].name = requestedData[i].address;
        }
    }
}

class dlcListClass {
    constructor() {
    this.currentDLC = "DLC not set!";
    }

}
let dlcList = new dlcListClass();
const globalDefaultFlags = ["canRequest"];
class userDataJsonObject {
    // default flags are canRequest for now
    constructor(userID, flags = globalDefaultFlags) {
        this.jsonData = 
        {
            "twitch_userID" : userID,
            "flags" : flags // an array of flags
        }
    }  
        // dont know if this will ever get used but I guess its worth adding
        set setFlags(flags) {
            this.jsonData.flags = flags
        }
}

class dlcRequestJsonObject {
    constructor(requestString, userName, timeStamp, imdbURL, channel_ID) {
        this.jsonData = 
        {
       "dlc_request" : requestString,
       "user_name" : userName,
        "dlc_request_timestamp" : timeStamp,
        "dlc_played_timestamp" : "not played",
        "imdb_url" : imdbURL,
        "has_played" : "No",
        "long_uuid" : "no uuid",
        "short_uuid" : "no uuid",
        "channel_requestedIn" : channel_ID
        }
    }
    generateUUID() {
    const long_uuid = uuidv7();
    this.jsonData.long_uuid = long_uuid;
    const bytes = parse(long_uuid);
    this.jsonData.short_uuid = bs58.encode(Buffer.from(bytes));
    return;
    }
}
class dlcLogObject {
    constructor(dlcName, imdbLink, timeStamp, userID) {
        this.jsonData =  {
        "played_on" : timeStamp,
        "dlc_name" : dlcName,
        "imdb_link" : imdbLink,
        "logged_by_twitchID" : userID
        }
    }
}


class dataHandler {
    constructor()
        {
        this.mongo_Client = new MongoClient(mongo_uri, {
        serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
        }
        });
        this.dbName = "BotData";
        this.userDataCollectionName = "UserData";
        this.movieDataCollectionName = "MovieDataRequests";
        this.movieLogCollectionName = "MovieLogs"
        }

async openDB(dbName) {
        try {
            await this.mongo_Client.connect();
            const db = await this.mongo_Client.db(dbName);
            return db;

        } catch (error) {
            console.error('Error connecting to MongoDB:', error);
        }
        finally {
            
        }
    }
async addRequest(requestString, userName, timeStamp, userID, channel_ID) {

    requestString = stringCleanup(requestString);    
    const imdbURL = await imdbLookup(requestString);
    const dateObj = new Date(timeStamp);
    const dateObjUTC = dateObj.toUTCString();
    const obj = new dlcRequestJsonObject(requestString, userName, dateObjUTC, imdbURL, channel_ID);
    obj.generateUUID()
    try {
    const db = await this.mongo_Client.db(this.dbName);
    let userDataCollection = db.collection(this.movieDataCollectionName);
    await userDataCollection.insertOne((obj.jsonData))
    console.log("Added request to MongoDB for userID: ", userID);
}
catch (error) {
    console.error("Error adding user data to MongoDB: ", error)
}

}
async logPlayed(dlcName, userID) {
try {
    const movieURL = await imdbLookupCall(dlcName);
    const db = await this.mongo_Client.db(this.dbName);
    let movieLogCollection = db.collection(this.movieLogCollectionName);
    const dlcLog = new dlcLogObject(dlcName, movieURL, new Date(), userID)
    await movieLogCollection.insertOne(dlcLog.jsonData)
    
}
catch (error) {
    console.error("Error adding log:", error);
    return "Couldn't log your movie! sorry";
}
}
async lastPlayed(dlcName) {
try {
    const movieURL = await imdbLookupCall(dlcName);
    const db = await this.mongo_Client.db(this.dbName);
    let movieLogCollection = db.collection(this.movieLogCollectionName);
    let imdbLink = await imdbLookupCall(dlcName);
    const movie = await movieLogCollection.find({imdb_link: imdbLink}); // finds all of the times a movie was played
    //if (!movie.hasNext()) {
    //    throw new Error("Couldn't find any movie matching link");
    //}
    await movie.sort('played_on', -1)
    let movies = await movie.toArray()
    console.log(movies);

    let doc = movies[0];
    let dateObj = new Date(doc.played_on)
    return dateObj.toString();
}
catch (error) {
    console.error("Error retrieving last played date:", error);
    return "Couldn't find your movie! sorry";
}

}
async setRequestPlayed(short_uuid) {
    try {
    const db = await this.mongo_Client.db(this.dbName);
    let userDataCollection = db.collection(this.movieDataCollectionName);
    await userDataCollection.findOneAndUpdate({short_uuid: short_uuid}, {$set: {has_played: "Yes", dlc_played_timestamp: new Date().toUTCString()}}, (err, result) => {
        if (err) {
            console.error("Error finding user data in MongoDB: ", err);
            return;
        }
    });
    console.log("Set request played in MongoDB for userID: ", userID);
    }
catch (error) {
    console.error("Error setting request played in MongoDB: ", error)
}

}    
async addUserDataMongo(userID) {
const userDataObject = new userDataJsonObject(userID);
try {
    const db = await this.mongo_Client.db(this.dbName);
    let userDataCollection = db.collection(this.userDataCollectionName);
    await userDataCollection.insertOne((userDataObject.jsonData))
    console.log("Added user data to MongoDB for userID: ", userID);
}
catch (error) {
    console.error("Error adding user data to MongoDB: ", error)
}
finally {
    
}
return;
}
/*  
async addUserDataJson(userID){
const userDataObject = new userDataJsonObject(userID);
let oldData = await this.getUserDataJson();
await oldData.push(userDataObject.jsonData);
let jsonString = JSON.stringify(oldData, null, 2);
await fs.writeFile('userData.json', jsonString, err => {
if (err) {
    console.error(err);
}
});
}
*/
async getUserDataMongo(userID) {
    const db = await this.mongo_Client.db(this.dbName);
    let userDataCollection = db.collection(this.userDataCollectionName);
    return userDataCollection.findOne({twitch_userID: userID}, (err, result) => {
        if (err) {
            console.error("Error finding user data in MongoDB: ", err);
            return;
        }
    
    });
}
/*  
async getUserDataJson() {
const userData = await fs.readFile('userData.json', 'utf8', (err) => {
    if (err) {
        console.error(err);
        return;
    }
});
let userDataParsed = await JSON.parse(userData);
return userDataParsed;
}
*/
async addFlagMongo(userID, newFlag) {
    const db = await this.mongo_Client.db(this.dbName);
    let userDataCollection = db.collection(this.userDataCollectionName);
    await userDataCollection.findOneAndUpdate({twitch_userID: userID}, {$push: {flags: newFlag}}, (err, result) => {
        if (err) {
            console.error("Error adding flag to user data in MongoDB: ", err);
            return;
        }
});
}
/*  async addFlag(userID, newFlag) {
    let oldData = await this.getUserDataJson();
    const matchingIndex = await oldData.findIndex((oldData) => {
        if (userID == oldData.twitch_userID) {return true;}
        else {return false;}
    });
    if (matchingIndex === -1) {
        await this.addUserDataJson(userID);
        return;
    }
    await oldData[matchingIndex].flags.push(newFlag);
    let jsonString = JSON.stringify(oldData, null, 2);
    await fs.writeFile('userData.json', jsonString, err => {
    if (err) {
    console.error(err);
}
});
}
*/
async checkFlagMongo(userID, flag) { 
    const db = await this.mongo_Client.db(this.dbName);
    let userDataCollection = db.collection(this.userDataCollectionName);
    let userData = await userDataCollection.findOne({twitch_userID: userID}, (err, result) => {
        if (err) {
            console.error("Error finding user data in MongoDB: ", err);
            return;
        }
    });
    if (userData == undefined || userData == null) { 
        this.addUserDataMongo(userID);
        if (globalDefaultFlags.includes(flag)) {
            return true;
        }
        else {
            return false;
        }
    }
    if (userData.flags.includes(flag)) {
        return true;
    }
    else {
        return false;
    }
}
async removeFlagMongo(userID, flag) {
    const db = await this.mongo_Client.db(this.dbName);
    let userDataCollection = db.collection(this.userDataCollectionName);
    await userDataCollection.findOneAndUpdate({twitch_userID: userID}, {$pull: {flags: flag}}, (err, result) => {
        if (err) {
            console.error("Error removing flag from user data in MongoDB: ", err);
            return;
        }
    });
}
}

class channelData {
    constructor(CHANNEL_ID, COOLDOWN = 0) {
        this.id = CHANNEL_ID
        this.cooldownDuration = COOLDOWN
        this.localDlcList; // todo: impelement local dlc lists (i.e. for each channel)
        this.lastMessage;
        this.scopes;
    }
    setDLC(dlcName) {
        this.localDlcList = dlcName;
    }

}
class coreBot {
    constructor(BOT_USER_ID, CLIENT_ID, CLIENT_SECRET, EVENTSUB_WEBSOCKET_URL, EVENTSUB_ENDPOINT, OCTOKIT_OBJ)
    {
        this.bot_ID = BOT_USER_ID;
        this.client_ID = CLIENT_ID;
        this.client_Secret = CLIENT_SECRET;
        this.authCode;
        this.channelList = [];
        this.channelDataList = [];
        this.websocketData = new websocketData(EVENTSUB_WEBSOCKET_URL, EVENTSUB_ENDPOINT);
        this.dataHandlerObject = new dataHandler();
        this.createdAt = Date.now();
        this.commandList = []; // dynamic command importation eventually clueless
        for (let i = 0; i < commandsList.length; i++) {
            this.importCommand(commandsList[i]);
        }
    }
    set setAuthCode(authCode) {
        this.authCode = authCode;
    }
    async importCommand(commandObject) {
        // maybe I also give access to variables to pass here? hmm
        this.commandList.push(commandObject);
    }
    removeChannel(removedChannel) {
    oldData = this.channelList;
    const indexChannel = oldData.indexOf(removedChannel);
    oldData.splice(indexChannel, 1) // for now doesnt remove any actual subscription

    }

    addNewChannel(newChannel, cooldownLength) {
        if (this.maxTotalCost == 10) {console.error("Cannot add anymore channels!"); 
            return;
        }
        
        this.channelDataList.push(new channelData(newChannel, cooldownLength));  
        console.log("Added new channel to the bot");
    }


    async closeBot() {
        console.log("Shutting down bot instance!")
        this.websocketData.client.close()
    }



    async websocketHandleChannelChatMessage(data) {
                        console.log(`MSG #${data.payload.event.broadcaster_user_login} <${data.payload.event.chatter_user_login}> <${data.timeStamp}> ${data.payload.event.message.text}`);
                        
                        if(!(data.payload.event.message.text.charAt(0) == "!")) {
                                return;
                            }
                        // First, print the message to the program's console.
                        // find what channel is what sent in
                        let channel_id_sentIn = data.payload.event.broadcaster_user_id;
                        let lowerCasedStringArray = data.payload.event.message.text.toLowerCase().trim().split(" ")
                        let stringArray = data.payload.event.message.text.trim().split(" ")
                        let userCalling = data.payload.event.chatter_user_id
                        let dataHandling = this.dataHandlerObject;
                        if (await dataHandling.checkFlagMongo(userCalling, "isBanned")) {
                            return;
                        }
                        // find relevant per channel data 
                        let channelData = await this.channelDataList.find((oldData) => {
                        if (channel_id_sentIn == oldData.id) {return true;}
                        else {return false;}
                        });
                        if (channelData == null) {console.error("A serious error has occured")}
                        if(!(coolDownElapsed(data.timeStamp, channelData.lastMessage, channelData.cooldownDuration))) {
                            console.log("cooldown not expired!");
                            return; }
                        for (let i = 0; i < this.commandList.length; i++) {
                            if (lowerCasedStringArray[0] == this.commandList[i].name || this.commandList[i].aliases.includes(lowerCasedStringArray[0])) {
                                if (this.commandList[i].hasCooldown) {channelData.lastMessage = data.timeStamp};

                                const dataAccessible = {
                                    channel_id_sentIn : data.payload.event.broadcaster_user_id,
                                    userCalling : data.payload.event.chatter_user_id,
                                    timeStamp : data.timeStamp,
                                    userName : data.payload.event.chatter_user_name,
                                    stringArray : stringArray,
                                    dlcList : dlcList,
                                    fullText : data.payload.event.message.text,
                                    imdbLookupCall : imdbLookupCall,
                                    getParentsGuide : getParentsGuide,
                                    dataHandling : dataHandling // might be dangerous and or heavy on performance?
                                }
                                // need to add a specific way to request variables from the main program
                                if (this.commandList[i].isAsync ) {
                                    const returnMessage = await this.commandList[i].functionReference.apply(dataAccessible);
                                    if (returnMessage) {
                                        await EventSub.sendChatMessage(returnMessage, channel_id_sentIn, this.authCode);
                                    }
                                }
                                else {
                                    const returnMessage = await this.commandList[i].functionReference.apply(dataAccessible);
                                    if (returnMessage) {
                                        await EventSub.sendChatMessage(returnMessage, channel_id_sentIn, this.authCode);
                                    }
                                }
                            }
                        }
                        switch(lowerCasedStringArray[0]) { // list of commands
                            /*case '!setdlc':
                                if ((await dataHandling.checkFlagMongo(userCalling, "canEditDLC"))) { 
                                channelData.lastMessage = data.timeStamp;
                                let message = await setDLC(data.payload.event.message.text.replace(stringArray[0], ""))
                                await EventSub.sendChatMessage(message, channel_id_sentIn, this.authCode) }
                                break;*/
                            /*case '!cock':
                                channelData.lastMessage = data.timeStamp; 
                                await EventSub.sendChatMessage(cockSize(), channel_id_sentIn, this.authCode);
                                break;*/
                            /*case '!uploadrequests':
                                channelData.lastMessage = data.timeStamp; 
                                if (!(await dataHandling.checkFlagMongo(userCalling, "canEditDLC"))) {
                                    await EventSub.sendChatMessage("You cannot use this command", channel_id_sentIn, this.authCode);
                                    break;
                                }
                                await EventSub.sendChatMessage("updating dlc requests",channel_id_sentIn, this.authCode);
                                break; */
                            /*case '!addflag':
                                channelData.lastMessage = data.timeStamp; 
                                if (dataHandling.checkFlagMongo(userCalling, "canEditApprovedUsers")) {
                                await dataHandling.addFlagMongo(stringArray[1], stringArray[2]);
                                EventSub.sendChatMessage("edited flags",channel_id_sentIn, this.authCode);
                                }
                                break;*/
                            /*case '!removeflag':
                                channelData.lastMessage = data.timeStamp; 
                                if (dataHandling.checkFlagMongo(userCalling, "canEditApprovedUsers")) {
                                await dataHandling.removeFlag(stringArray[1], stringArray[2]);
                                EventSub.sendChatMessage("edited flags", channel_id_sentIn, this.authCode);
                                }
                                break;*/
                            /*case '!requests':
                                channelData.lastMessage = data.timeStamp;
                                await EventSub.sendChatMessage("https://sterman12.github.io/DLCSite/", channel_id_sentIn, this.authCode);
                                break;  */
                            /*case '!addrequest':
                                channelData.lastMessage = data.timeStamp; 
                                if (!(await dataHandling.checkFlagMongo(userCalling, "canRequest"))) {
                                await EventSub.sendChatMessage("You are currently banned from requesting dlc", channel_id_sentIn, this.authCode);
                                break; }
                                await dataHandling.addRequest(data.payload.event.message.text.replace(stringArray[0], ""), data.payload.event.chatter_user_name, data.timeStamp, userCalling, channel_id_sentIn);
                                EventSub.sendChatMessage("Added your request to the list, website updates every hour", channel_id_sentIn, this.authCode);
                                break;*/
                            /*case '!setrequestplayed':
                                channelData.lastMessage = data.timeStamp;
                                if (!(await dataHandling.checkFlagMongo(userCalling, "canEditDLC"))) {
                                    await EventSub.sendChatMessage("You cannot set dlc played", channel_id_sentIn, this.authCode);
                                    break;
                                }
                                await dataHandling.setRequestPlayed(stringArray[1]);
                                await EventSub.sendChatMessage("set dlc played status", channel_id_sentIn, this.authCode);
                                break; */
                            case '!imdblookup':
                                channelData.lastMessage = data.timeStamp; 
                                await EventSub.sendChatMessage(await imdbLookup(data.payload.event.message.text.replace(stringArray[0], "")), channel_id_sentIn, this.authCode);
                                break;
                            case '!help':
                                channelData.lastMessage = data.timeStamp;
                                await EventSub.sendChatMessage(await commandList(), channel_id_sentIn, this.authCode);
                                break;
                            case '!taffer':
                                channelData.lastMessage = data.timeStamp;
                                if ((await dataHandling.checkFlagMongo(userCalling, "canEditApprovedUsers"))) {
                                await EventSub.sendChatMessage(await getTafferList(), channel_id_sentIn, this.authCode); }
                                break;
                            case '!cooldown':
                                channelData.lastMessage = data.timeStamp;
                                await EventSub.sendChatMessage(("this channel currently has a " + channelData.cooldownDuration/1000 + " second cooldown."), channel_id_sentIn, this.authCode);
                                break;
                            case '!uptime':
                                channelData.lastMessage = data.timeStamp;
                                await EventSub.sendChatMessage("creatureBot has been alive since " + Math.floor((data.timeStamp-this.createdAt) / 60000) + " minutes and "+ Math.floor(((data.timeStamp-this.createdAt) / 1000)%60) +" seconds ago." , channel_id_sentIn, this.authCode);
                                break;
                            case '!cs':
                                channelData.lastMessage = data.timeStamp;
                                await EventSub.sendChatMessage("https://strawpoll.com/BDyNz0dmqyR date yet to be determined",channel_id_sentIn, this.authCode);
                                break;
                            default:
                                console.log("was not valid command did not update cooldown!");
                                break;

    }
    }
}

// Start executing the bot from here
(async function () {

    let testBot = new coreBot(BOT_USER_ID, CLIENT_ID, CLIENT_SECRET, EVENTSUB_WEBSOCKET_URL, EVENTSUB_ENDPOINT, new Octokit({
        auth: GITHUB_TOKEN,
        userAgent: 'DLC v1'
    }));
    
    const authUrl = `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URL}&scope=user%3Abot+user%3Aread%3Achat+user%3Awrite%3Achat`;
    // let authTokenTwitch = await getOauthTwitchCCGF(CLIENT_ID,CLIENT_SECRET);
    let authCodeTwitch = await getCodeTwitchACGF(authUrl);
    testBot.authCode = await getTokenTwitchACGF(authCodeTwitch, CLIENT_ID, CLIENT_SECRET, REDIRECT_URL, BOT_USER_ID);
    testBot.websocketData.authCode = testBot.authCode;
    testBot.websocketData.eventEmitter.on('channel.chat.message', (data) => {
        testBot.websocketHandleChannelChatMessage(data);
    });

    for (let i = 0; i < channelList.length; i++) {
        console.log("Adding channel: ", channelList[i].name, " with ID: ", channelList[i].id, " and cooldown: ", channelList[i].cooldown);
        testBot.addNewChannel(channelList[i].id, channelList[i].cooldown);
        testBot.websocketData.addNewChannel(channelList[i].id, channelList[i].cooldown);
    }
    await testBot.websocketData.websocketClientStart();
    // Start WebSocket client and register handlers

    process.on('SIGTERM', async () => {
        await testBot.closeBot();
        process.exit(0);
    });
    process.on('SIGINT', async () => {
        await testBot.closeBot();
        process.exit(0);
    });
    process.on('uncaughtException', (err) => {
        console.error('Uncaught Exception:', err);
        testBot.closeBot();

    });
    process.on('unhandledRejection', (reason, promise) => {
        console.error('Unhandled Rejection:', reason, promise);
        throw reason;
    });

})();




async function getTafferList() {
    let TafferList = "TafferArrive THE BAR IS OPENING! @handsomeScag @sterman00 @politeTrout @heythere_chat"
    return TafferList;
}




function stringCleanup(string) {
    let returnString = string.trim();
    returnString = validator.whitelist(returnString, 'a-zA-Z0-9|" "')
    return returnString;
    }


function coolDownElapsed(currentMessage, lastMessage, duration) {
    if (lastMessage == null) {return true;}
    console.log("time of last message: ",lastMessage);
    console.log("time of current message: ", currentMessage);
    let cooldownDuration = duration; //  10 second cooldown default

    if ((lastMessage + cooldownDuration) < currentMessage) 
        {
        return true; // cooldown has elapsed
        }
        else 
        {
        return false; // cooldown hasn't elapsed
        }
        return false; // if this gets trigged something very bad has happened
    }


function commandList() {
    let commandList = "!dlc, !cock, !imdblookup, !addrequest, !requests";
    return commandList;
}


function conductorGuide() {
    let conductorGuideLink = "";
    return conductorGuideLink;
}
async function getParentsGuide(dlcLink, category) {
let index;
let highestResponses = 0;
let highestResponsesIndex = 0;
try {
let response = await fetch(`https://api.imdbapi.dev/titles/${dlcLink}/parentsGuide`, {
    signal: AbortSignal.timeout(5000),
    method: 'GET',
    headers: {
        'Content-type': 'application/json'
    }
});
let ratingResponse = await response.json()

for (let i=0;i<ratingResponse.parentsGuide.length; i++) {
    if (category == ratingResponse.parentsGuide[i].category) {
        index = i;
        break;
    }
}
console.log(ratingResponse.parentsGuide[index].severityBreakdowns);
for (let i=0;i<ratingResponse.parentsGuide[index].severityBreakdowns.length;i++) {
    if (highestResponses < ratingResponse.parentsGuide[index].severityBreakdowns[i].voteCount) {
        highestResponses = ratingResponse.parentsGuide[index].severityBreakdowns[i].voteCount;
        highestResponsesIndex = i;
        continue;
    }
}
console.log(ratingResponse.parentsGuide[index].severityBreakdowns[highestResponsesIndex].severityLevel);
let returnString =  `has level of category ${category} : ` + ratingResponse.parentsGuide[index].severityBreakdowns[highestResponsesIndex].severityLevel;
return returnString;
}
catch (error) {
    console.error("error retrieving sexual content warning: ", error, "for:  ", dlcLink)
    return "unsucessful in retrieving sexual content warning";
}
}

async function setDLC(dlcData) {
    if ((dlcData.trim() === "" ) || (!dlcData)) {
        let returnMessage;
        returnMessage = "DLC reset!"
        dlcList = "There is no live dlc right now"
        return returnMessage;
    }
    let returnMessage;
    dlcList = dlcData;
    returnMessage = "DLC set!"
    return returnMessage;
}
async function imdbLookup(movieName) {
let movieString = movieName || "";
if ((movieString.trim() === "" ) || (!movieString)) {
console.log("imdblookup called without a movie name or link!");
return;
}
let response = await imdbLookupCall(movieName);
return response;
}

async function imdbLookupCall(movieName) {
try {
let response = await fetch(`https://api.imdbapi.dev/search/titles?query=${movieName}&limit=1`, {
    signal: AbortSignal.timeout(5000),
    method: 'GET',
    headers: {
        'Content-type': 'application/json'
    }

});
if ((response.code) || (!response)) {
    console.error("Failed to retrieve imdb data: ", response)
}
let data = await response.json(); 
let movieURL = `https://www.imdb.com/title/${data.titles[0].id}` || `https://www.imdb.com/title/${data.titles.id}`;
return movieURL; 
}
catch (error) {
    console.error(error)
    }
}




