import WebSocket from 'ws';
import open from 'open';
import fs from 'node:fs/promises';
import { URLSearchParams } from 'node:url';
import { Octokit} from 'octokit';
import { loadEnvFile} from 'node:process';
import crypto from 'node:crypto';
import validator from "validator";
import http from 'node:http';
loadEnvFile('bot.env')

const BOT_USER_ID = process.env.BOT_USER_ID; // This is the User ID of the chat bot
const CLIENT_ID = process.env.CLIENT_ID;
const CHAT_CHANNEL_USER_ID = process.env.CHAT_CHANNEL_USER_ID; // This is the User ID of the channel that the bot will join and listen to chat messages of
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URL = process.env.REDIRECT_URL;
const GITHUB_TOKEN = process.env.GITHUB_PERSONAL_TOKEN;
const EVENTSUB_WEBSOCKET_URL = 'wss://eventsub.wss.twitch.tv/ws';
var dlcList = "DLC not set!";
const authUrl = `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URL}&scope=user%3Abot+user%3Aread%3Achat+user%3Awrite%3Achat`;


class userDataJsonObject {
    // default flags are canRequest for now
    constructor(userID, flags = ["canRequest"]) {
        this.jsonData = 
        {
            "twitch_userID" : userID,
            "flags" : flags // an array of flags?
        }
    }  
        // dont know if this will ever get used but I guess its worth adding
        set setFlags(flags) {
            this.jsonData.flags = flags
        }
}

class dlcRequestJsonObject {
    constructor(requestString, userName, timeStamp, imdbURL) {
        this.jsonData = 
        {
       "dlc_request" : requestString,
       "user_name" : userName,
        "dlc_request_timestamp" : timeStamp,
        "imdb_url" : imdbURL,
        "has_played" : "No"
        }
    }
    
}

class dataHandler {
  constructor()
  {

  }
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
async addFlag(userID, newFlag) {
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

async checkFlag(userID, flag, channel_ID) {
    let oldData = await this.getUserDataJson();
    const matchingIndex = await oldData.findIndex((oldData) => {
        if (userID == oldData.twitch_userID) {return true;}
        else {return false;}
    });
    if (matchingIndex === -1) {
        await this.addUserDataJson(userID); // create new entry if it doesnt exist
        return;
    }
    if (oldData[matchingIndex].flags.includes(flag)) {
        return true;
    }
    else {
        return false;
    }
}

async removeFlag(userID, flag) {
    let oldData =  await this.getUserDataJson();
    const matchingIndex = await oldData.findIndex((oldData) => {
        if (userID == oldData.twitch_userID) {return true; }
        else {return false;}
        });
    if (matchingIndex === -1) {
        await this.addUserDataJson(userID); // create new entry if it doesnt exist
        console.log("creating new entry for: ", userID)
        return;
    }
    console.log(oldData[matchingIndex], "at index: ", matchingIndex);
    const matchingFlagIndex = await oldData[matchingIndex].flags.findIndex((value, index) => {
        if (flag == value[index]) {return true;}
        else {return false;}
    });
    if (matchingIndex === -1) {
        return;
    }
    oldData[matchingIndex].flags.splice(matchingFlagIndex,1)
    let jsonString = JSON.stringify(oldData,null, 2);
    await fs.writeFile('userData.json', jsonString, err => {
    if (err) {
    console.error(err);
}
});
}
  
}
class coreBot {
    constructor(BOT_USER_ID, CLIENT_ID, CLIENT_SECRET, EVENTSUB_WEBSOCKET_URL, DATA_HANDLER_OBJ, OCTOKIT_OBJ)
    {
        this.bot_ID = BOT_USER_ID;
        this.client_ID = CLIENT_ID;
        this.client_Secret = CLIENT_SECRET;
        this.eventsub_Websocket_Url = EVENTSUB_WEBSOCKET_URL;
        this.authCode;
        this.channelList = [];
        this.websocketClient;
        this.websocketSessionID;
        this.lastMessage;
        this.dataHandlerObject = DATA_HANDLER_OBJ;
        this.octoKitObject = OCTOKIT_OBJ;
    }
    set setAuthCode(authCode) {
        this.authCode = authCode
    }
    set removeChannel(removedChannel) {
        //
    }

    addNewChannel(newChannel) {
        this.channelList.push(newChannel)
    }


    async closeBot() {
        console.log("Shutting down bot instance!")
        this.websocketClient.close()
    }



    websocketClientStart() {
    this.websocketClient = new WebSocket(this.eventsub_Websocket_Url);

	this.websocketClient.on('error', console.error);

	this.websocketClient.on('open', () => {
		console.log('WebSocket connection opened to ' + this.eventsub_Websocket_Url);
	});

	this.websocketClient.on('message', (data) => {   
        let objectJSON = JSON.parse(data.toString())
        objectJSON.timeStamp = Date.now();
		this.handleWebSocketMessage(objectJSON);
	});
    this.websocketClient.on('close', () => {
        console.error('websocketClient shut down!');
        this.websocketClient.close()
        this.websocketClientStart();
    });
    }
    async registerEventSubListeners(channel_id) {
	// Register channel.chat.message
	let response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
		method: 'POST',
		headers: {
			'Authorization': 'Bearer ' + this.authCode,
			'Client-Id': this.client_ID,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			type: 'channel.chat.message',
			version: '1',
			condition: {
				broadcaster_user_id: channel_id,
				user_id: this.bot_ID
			},
			transport: {
				method: 'websocket',
				session_id: this.websocketSessionID
			}
		})
	});

	if (response.status != 202) {
		let data = await response.json();
		console.error("Failed to subscribe to channel.chat.message. API call returned status code " + response.status);
		console.error(data);
		process.exit(1);
	} else {
		const data = await response.json();
		console.log(`Subscribed to channel.chat.message [${data.data[0].id}]`);
	}
}  

    async sendChatMessage(chatMessage, channel_ID) {
	let response = await fetch('https://api.twitch.tv/helix/chat/messages', {
		method: 'POST',
		headers: {
			'Authorization': 'Bearer ' + this.authCode,
			'Client-Id': this.client_ID,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			broadcaster_id : channel_ID,
			sender_id: this.bot_ID,
			message: chatMessage
		})
	});

	if (response.status != 200) {
		let data = await response.json();
		console.error("Failed to send chat message");
		console.error(data);
	} else {
		console.log("Sent chat message: " + chatMessage);
	}
    }



    async handleWebSocketMessage(data) {
        switch (data.metadata.message_type) {
            case 'session_welcome': // First message you get from the WebSocket server when connecting
                console.log("Adding new listeners!");
                this.websocketSessionID = data.payload.session.id; // Register the Session ID it gives us
                let loopLength = this.channelList.length; 
                // Listen to EventSub, which joins the chatroom from your bot's account
                for ( let i = 0; i < loopLength;i++) {
                await this.registerEventSubListeners(this.channelList[i]); }
                break;
            case 'notification': // An EventSub notification has occurred, such as channel.chat.message
                switch (data.metadata.subscription_type) {
                    case 'channel.chat.message':
                        console.log(`MSG #${data.payload.event.broadcaster_user_login} <${data.payload.event.chatter_user_login}> <${data.timeStamp}> ${data.payload.event.message.text}`);

                        if(!(data.payload.event.message.text.charAt(0) == "!")) {
                                break;
                            }
                        if(!(coolDownElapsed(data.timeStamp, this.lastMessage))) {
                                console.log("cooldown not expired!");
                                break;
                            }
                        
                        // First, print the message to the program's console.
                        // find what channel is what sent in
                        let channel_id_sentIn = data.payload.event.broadcaster_user_id;
                        let lowerCasedStringArray = data.payload.event.message.text.toLowerCase().trim().split(" ")
                        let stringArray = data.payload.event.message.text.trim().split(" ")
                        let userCalling = data.payload.event.chatter_user_id
                        let dataHandling = this.dataHandlerObject;
                        switch(lowerCasedStringArray[0]) {
                            case '!dlc':
                                this.lastMessage = data.timeStamp; 
                                await this.sendChatMessage(await retrieveDLC(), channel_id_sentIn);
                                break;
                            case '!cock':
                                this.lastMessage = data.timeStamp; 
                                await this.sendChatMessage(cockSize(), channel_id_sentIn);
                                break;
                            case '!uploadrequests':
                                this.lastMessage = data.timeStamp; 
                                await this.sendChatMessage("updating dlc requests",channel_id_sentIn);
                                await uploadDlcRequests(this.octoKitObject);
                                break;
                            case '!setdlc':
                                if (!(dataHandling.checkFlag(userCalling, "canEditDLC", channel_id_sentIn))) { console.log("Lacking permission to set dlc"); }
                                this.lastMessage = data.timeStamp;
                                let message = await setDLC(data.payload.event.message.text.replace(stringArray[0], ""))
                                await this.sendChatMessage(message, channel_id_sentIn)
                                break;
                            case '!addflag':
                                this.lastMessage = data.timeStamp; 
                                if (dataHandling.checkFlag(userCalling, "canEditApprovedUsers", channel_id_sentIn)) {
                                await dataHandling.addFlag(stringArray[1], stringArray[2]);
                                this.sendChatMessage("edited flags",channel_id_sentIn);
                                }
                                break;
                            case '!requests':
                                this.lastMessage = data.timeStamp;
                                await this.sendChatMessage("https://github.com/Sterman12/DLCDataTracking/blob/main/DLCData.json", channel_id_sentIn);
                                break;
                            case '!removeflag':
                                this.lastMessage = data.timeStamp; 
                                if (dataHandling.checkFlag(userCalling, "canEditApprovedUsers", channel_id_sentIn)) {
                                await dataHandling.removeFlag(stringArray[1], stringArray[2]);
                                this.sendChatMessage("edited flags", channel_id_sentIn);
                                }
                                break;
                            case '!addrequest':
                                this.lastMessage = data.timeStamp; 
                                if ((await dataHandling.checkFlag(userCalling, "canRequest", channel_id_sentIn))) {
                                this.sendChatMessage("You are currently banned from requesting dlc", channel_id_sentIn);
                                }
                                await addRequest(data.payload.event.message.text.replace(stringArray[0], ""), data.payload.event.chatter_user_name, data.timeStamp, userCalling, channel_id_sentIn);
                                this.sendChatMessage("Added your request to the list", channel_id_sentIn);
                                break;
                            case '!imdblookup':
                                this.lastMessage = data.timeStamp; 
                                await this.sendChatMessage(await imdbLookup(data.payload.event.message.text.replace(stringArray[0], "")), channel_id_sentIn);
                                break;
                            case '!help':
                                this.lastMessage = data.timeStamp;
                                await this.sendChatMessage(await commandList(), channel_id_sentIn);
                                break;
                            case '!taffer':
                                if (!(await dataHandling.checkFlag(userCalling, "canEditApprovedUsers", channel_id_sentIn))) {
                                this.lastMessage = data.timeStamp;
                                await this.sendChatMessage(await getTafferList(), channel_id_sentIn); }
                                break;
                            case '!addtaffer':
                                this.lastMessage = data.timeStamp;
                                break;
                            default:
                                console.log("was not valid command did not update cooldown!");
                                break;


                        } 
                        break;
                }
                break;
        }

    }


    }


// Start executing the bot from here
(async () => {
    let testBot = new coreBot(BOT_USER_ID, CLIENT_ID, CLIENT_SECRET, EVENTSUB_WEBSOCKET_URL, new dataHandler(), new Octokit({
    auth : GITHUB_TOKEN,
    userAgent : 'DLC v1'
    }));
    let authCodeTwitch = await getCodeTwitch();
    let twitch_Token = await getTokenTwitch(authCodeTwitch);
	// Verify that the authentication is valid
	let isTokenGood = await getAuthTwitch(twitch_Token);
    if (!isTokenGood) {process.exit(1)}
    testBot.authCode = twitch_Token;
    testBot.addNewChannel(CHAT_CHANNEL_USER_ID);
    testBot.addNewChannel('429902083')
    testBot.websocketClientStart();
	// Start WebSocket client and register handlers
    setInterval(() => {
        uploadDlcRequests(testBot.octoKitObject)
    },3600000);

    process.on('SIGTERM', async() => {
        await uploadDlcRequests(testBot.octoKitObject);
        await testBot.closeBot()
        process.exit(0)
    });
    process.on('SIGINT', async() => {
        await uploadDlcRequests(testBot.octoKitObject); 
        await testBot.closeBot()
        process.exit(0)
    });
})();


async function getCodeTwitch(){
function handleServer(server) {
return new Promise((resolve,reject) => {
server.on('request', (request) => {
    if (request.url) {
        resolve(request.url)
    }
});

server.on('error', (err) => {
    console.error(err);
    reject(err)
})


})
}

async function splitUrl(requestUrl) {
    let obtainedCode = await requestUrl.slice(requestUrl.indexOf("=")+1, requestUrl.indexOf("&")).trim();
    // console.log(fixedUrl);
    return obtainedCode;
}

open(authUrl);
const server = http.createServer();
server.listen(3000);
const serverData = await handleServer(server);
const code = await splitUrl(serverData);

server.close()
return code;
}


async function getTafferList() {
    let TafferList = "@handsomeScag @sterman00 @politeTrout "
    return TafferList;
}
async function uploadDlcRequests(octokit) {
let response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
  owner: 'Sterman12',
  repo: 'DLCDataTracking',
  path: 'DLCData.json',
  headers: {
    'X-GitHub-Api-Version': '2026-03-10'
  }
})
let oldSha = response.data.sha;
let dlcData = await grabDLCRequestData();
dlcData = JSON.stringify(dlcData, null, 2);
let newHash = crypto.createHash('sha1');

newHash.update(dlcData)


let newDigest = newHash.digest('hex');
console.log("previous: ", oldSha)
console.log("new :", newDigest)
if (newDigest === oldSha) {
    return; // early return in case it doesnt need to be updated for now this doesnt actually work as I need to 
}
dlcData = JSON.stringify(dlcData, null, 2);
dlcData = btoa(dlcData); // converts to base 64;



await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
  owner: 'Sterman12',
  repo: 'DLCDataTracking',
  path: 'DLCData.json',
  message: 'This is an automated commit performed by a bot',
  committer: {
    name: 'Monalisa Octocat',
    email: 'octocat@github.com'
  },
  content: dlcData,
  sha: oldSha,
  headers: {
    'X-GitHub-Api-Version': '2026-03-10'
  } 
})

}


async function getTokenTwitch(authCode){
let response = await fetch ('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
		client_id : CLIENT_ID,
		client_secret: CLIENT_SECRET,
		grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: REDIRECT_URL
		})
});
const data = await response.json();
// OAUTH_TOKEN = data.access_token;
console.log("Access token obtained: " + data.access_token)
return data.access_token;
}


async function getAuthTwitch(OAUTH_TOKEN) {
	// https://dev.twitch.tv/docs/authentication/validate-tokens/#how-to-validate-a-token
	let response = await fetch('https://id.twitch.tv/oauth2/validate', {
		method: 'GET',
		headers: {
			'Authorization': 'OAuth ' + OAUTH_TOKEN
		}
	});

	if (response.status != 200) {
		let data = await response.json();
		console.error("Token is not valid. /oauth2/validate returned status code " + response.status);
		console.error(data);
		process.exit(1);
	}
	console.log("Validated token.");
    return true;
}



async function addRequest(requestString, userName, timeStamp, userID, channel_ID) {

    requestString = stringCleanup(requestString);

    var jsonString;
    
    let imdbURL = await imdbLookup(requestString);
    const dateObj = new Date(timeStamp);
    let dateObjUTC = dateObj.toUTCString();
    const obj = new dlcRequestJsonObject(requestString, userName, dateObjUTC, imdbURL);
    let dlcDataArray = await grabDLCRequestData();
    dlcDataArray.push(obj.jsonData);
    try {jsonString = JSON.stringify(dlcDataArray, null, 2)}
    catch (error) {console.error("Invalid data: ", error.message)
        return;
    }
    await fs.writeFile('dlcRequests.json', jsonString, err => {
    if (err) {
    console.error(err);
    } 
}); }

function stringCleanup(string) {
    let returnString = string.trim();
    returnString = validator.whitelist(returnString, 'a-zA-Z0-9|" "')
    return returnString;
    }


function coolDownElapsed(currentMessage, lastMessage) {
    if (lastMessage == null) {return true;}
    console.log("time of last message: ",lastMessage);
    console.log("time of current message: ", currentMessage);
    let cooldownDuration = 10*1000; //  10 second cooldown

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

async function grabDLCRequestData() {
    const dlcData = await fs.readFile('dlcRequests.json', 'utf8', (err) => {
    if (err) {
        console.error(err);
        return;
    }
    });   
    let dlcDataParsed = await JSON.parse(dlcData);
    console.log(dlcDataParsed);
    return dlcDataParsed;
    
}

async function commandList() {
    let commandList = "!dlc, !cock, !imdblookup, !addrequest, !requests";
    return commandList;
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
console.log("removeFromApprovedList called without a movie name or link!");
return;
 }
let response = await imdbLookupCall(movieName);
return response;
}

async function imdbLookupCall(movieName) {
let response = await fetch(`https://api.imdbapi.dev/search/titles?query=${movieName}&limit=1`, {
    method: 'GET',
    headers: {
        'Content-type': 'application/json'
    }

});
if ((response.code) || (!response)) {
    console.error("Failed to retrieve imdb data: ", response)
}
let data = await response.json();
const movieURL = await convertImdbResponseToLink(data);
return movieURL;
}
async function convertImdbResponseToLink(data) {
    try {let movieURL = `https://www.imdb.com/title/${data.titles[0].id}` || `https://www.imdb.com/title/${data.titles.id}`; 
        return movieURL; }
    catch (error) {console.error(error)}
}

async function retrieveDLC() {
    return dlcList;
}
function cockSize() {
    let cockSizeInches = Math.floor(Math.random()*10);
    var message;
    if (cockSizeInches < 3) {
        message = "paulieLaughingAtYou so lidl! only " + cockSizeInches + " inches"
    }
    if ((cockSizeInches > 4) && (cockSizeInches < 6)) {
        message = "Creature not bad " + cockSizeInches + " inches"
    }
    if (cockSizeInches > 7) {
        message = "Very big! gachiHYPER " + cockSizeInches + " inches"
    }
    else {
        message = 'doctorWTF an error occurred? anyways your cock was ' + cockSizeInches + ' inches'
    }
    return message;
}



