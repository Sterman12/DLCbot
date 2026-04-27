class commandObject {
    constructor(name, functionReference, hasCooldown = true, needsFlags = false, isAsync = false) {
        this.name = name;
        this.functionReference = functionReference;
        this.hasCooldown = hasCooldown;
        this.aliases = [];
        this.needsFlags = needsFlags;
        this.isAsync = isAsync;
    }
}
const commandsList = [];
commandsList.push(new commandObject("!dlc", function() {
    console.log("DLC command executed!");
    return this.dlcList.currentDLC;
}, true, false));

commandsList.push(new commandObject("!setdlc", async function() {
    if ((await this.dataHandling.checkFlagMongo(this.userCalling, "canEditDLC"))) {
    let message = this.fullText.replace(this.stringArray[0], "");
    if ((message.trim() === "" ) || (!message)) {
        let returnMessage = "DLC reset!"
        this.dlcList.currentDLC = "There is no live dlc right now"
        return returnMessage;
    } else {
    let returnMessage;
    this.dlcList.currentDLC = message;
    returnMessage = "DLC set!"
    return returnMessage;
    }
    }
    else {
        return "You don't have permission to use this command!";
    }
}, true, true, true)); 

commandsList.push(new commandObject("!cock", function() {
    let cockSizeInches = Math.floor(Math.random()*10);
    var message;
    if (cockSizeInches <= 3) {
        message = "paulieLaughingAtYou so lidl! only " + cockSizeInches + " inches"
        return message;
    }
    else if ((cockSizeInches > 3) && (cockSizeInches < 7)) {
        message = "Creature not bad " + cockSizeInches + " inches"
        return message;
    }
    else if (cockSizeInches >= 7) {
        message = "Very big! gachiHYPER " + cockSizeInches + " inches"
        return message;
    }
    else {
        message = 'doctorWTF an error occurred? anyways your cock was ' + cockSizeInches + ' inches'
        return message;
    }
    return message;
}, true)); 

commandsList.push(new commandObject("!addflag", async function() {
if (this.dataHandling.checkFlagMongo(this.userCalling, "canEditApprovedUsers")) {
await this.dataHandling.addFlagMongo(this.stringArray[1], this.stringArray[2]); 
return "Flag added!";
}
return;
}, true, true, true)); 

commandsList.push(new commandObject("!removeflag", async function() {
if (this.dataHandling.checkFlagMongo(this.userCalling, "canEditApprovedUsers")) {
await this.dataHandling.removeFlag(this.stringArray[1], this.stringArray[2]);
return "Flag removed!"
}
return;
}, true, true, true)); 

commandsList.push(new commandObject("!requests", function() {
return "Website is currently unavailable sorry!";
}, true));


commandsList.push(new commandObject("!addrequest", async function() {
if (!(await this.dataHandling.checkFlagMongo(this.userCalling, "canRequest"))) {
return "You are currently banned from requesting dlc";
}
await this.dataHandling.addRequest(this.fullText.replace(this.stringArray[0], ""), this.userName, this.timeStamp, this.userCalling, this.channel_id_sentIn);
return "Request added!";
}, true,true, true));

commandsList.push(new commandObject("!setrequestplayed", async function() {
if (!(await this.dataHandling.checkFlagMongo(this.userCalling, "canEditDLC"))) {
    return "You cannot set dlc played";
}
await this.dataHandling.setRequestPlayed(this.stringArray[1]);
return "set dlc played status";
}, true,true, true));




export { commandsList, commandObject };