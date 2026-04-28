
import { MongoClient, ServerApiVersion } from 'mongodb';
import { v7 as uuidv7, parse } from 'uuid';
import bs58 from 'bs58';
import validator from 'validator';

// ── Shared state ──────────────────────────────────────────────────────────────

export const globalDefaultFlags = ['canRequest'];

export class dlcListClass {
    constructor() {
        this.currentDLC = 'DLC not set!';
    }
}
export const dlcList = new dlcListClass(); 
// singleton, импортируется в commands.js и bot.js
// singleton, imported into commands.js and bot.js

// ── Models ────────────────────────────────────────────────────────────────────

class userDataJsonObject {
    constructor(userID, flags = globalDefaultFlags) {
        this.jsonData = {
            twitch_userID: userID,
            flags: [...flags],
        };
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
class dlcRequestJsonObject {
    constructor(requestString, userName, timeStamp, imdbURL, channel_ID) {
        this.jsonData = {
            dlc_request:           requestString,
            user_name:             userName,
            dlc_request_timestamp: timeStamp,
            dlc_played_timestamp:  'not played',
            imdb_url:              imdbURL,
            has_played:            'No',
            long_uuid:             'no uuid',
            short_uuid:            'no uuid',
            channel_requestedIn:   channel_ID,
        };
    }
    generateUUID() {
        const long_uuid = uuidv7();
        this.jsonData.long_uuid  = long_uuid;
        this.jsonData.short_uuid = bs58.encode(Buffer.from(parse(long_uuid)));
    }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

export function stringCleanup(str) {
    return validator.whitelist(str.trim(), 'a-zA-Z0-9 ');
}

export async function imdbLookup(movieName) {
    const s = (movieName || '').trim();
    if (!s) {
        console.log('imdbLookup called without a movie name');
        return null;
    }
    try {
        const res  = await fetch(
            `https://api.imdbapi.dev/search/titles?query=${encodeURIComponent(s)}&limit=1`,
            { signal: AbortSignal.timeout(5000), method: 'GET', headers: { 'Content-type': 'application/json' } }
        );
        const data = await res.json();
        return `https://www.imdb.com/title/${data.titles[0].id}`;
    } catch (err) {
        console.error('imdbLookup error:', err);
        return 'Could not find movie on IMDB.';
    }
}
export async function getParentsGuide(dlcLink, category) {
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
        for (let i = 0; i < ratingResponse.parentsGuide.length; i++) {
            if (category == ratingResponse.parentsGuide[i].category) {
                index = i;
                break;
            }
        }
        console.log(ratingResponse.parentsGuide[index].severityBreakdowns);
        for (let i = 0; i < ratingResponse.parentsGuide[index].severityBreakdowns.length; i++) {
            if (highestResponses < ratingResponse.parentsGuide[index].severityBreakdowns[i].voteCount) {
                highestResponses = ratingResponse.parentsGuide[index].severityBreakdowns[i].voteCount;
                highestResponsesIndex = i;
                continue;
            }
        }
        console.log(ratingResponse.parentsGuide[index].severityBreakdowns[highestResponsesIndex].severityLevel);
        let returnString = `has level of category ${category} : ` + ratingResponse.parentsGuide[index].severityBreakdowns[highestResponsesIndex].severityLevel;
        return returnString;
    }
    catch (error) {
        console.error("error retrieving sexual content warning: ", error, "for:  ", dlcLink)
        return "unsucessful in retrieving sexual content warning";
    }
}
// ── Database handler ──────────────────────────────────────────────────────────

export class dataHandler {
    constructor() {
        this.mongo_Client = new MongoClient(process.env.MONGO_URI, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true,
            },
        });
        this.dbName                  = 'BotData';
        this.userDataCollectionName  = 'UserData';
        this.movieDataCollectionName = 'MovieData';
        this.movieLogCollectionName = 'MovieLogs'
    }

    async connect() {
        await this.mongo_Client.connect();
        console.log('MongoDB connected.');
    }

    async close() {
        await this.mongo_Client.close();
        console.log('MongoDB connection closed.');
    }

    // Внутренний хелпер — убирает повторение this.mongo_Client.db(...)...collection(...)
    // Internal helper — removes the repetition of this.mongo_Client.db(...)...collection(...)
    _col(collectionName) {
        return this.mongo_Client.db(this.dbName).collection(collectionName);
    }

    async addRequest(requestString, userName, timeStamp, userID, channel_ID) {
        const clean   = stringCleanup(requestString);
        const imdbURL = await imdbLookup(clean);
        const obj     = new dlcRequestJsonObject(
            clean, userName, new Date(timeStamp).toUTCString(), imdbURL, channel_ID
        );
        obj.generateUUID();
        try {
            await this._col(this.movieDataCollectionName).insertOne(obj.jsonData);
            console.log('Request added for userID:', userID);
        } catch (err) {
            console.error('addRequest error:', err);
        }
    }

    // BUGFIX: был undefined `userID` в console.log — убрано
    // BUGFIX: there was an undefined `userID` in the console.log — removed
    async setRequestPlayed(short_uuid) {
        try {
            await this._col(this.movieDataCollectionName).findOneAndUpdate(
                { short_uuid },
                { $set: { has_played: 'Yes', dlc_played_timestamp: new Date().toUTCString() } }
            );
            console.log('Marked as played, uuid:', short_uuid);
        } catch (err) {
            console.error('setRequestPlayed error:', err);
        }
    }
    async logPlayed(dlcName, userID) {
        try {
            const dlcLog = new dlcLogObject(dlcName, movieURL, new Date(), userID)
            await this._col(movieLogCollectionName).insertOne(dlcLog.jsonData)
        }
        catch (error) {
            console.error("Error adding log:", error);
            return "Couldn't log your movie! sorry";
        }
    }
    async lastPlayed(dlcName) {
        try {
            let movieLogCollection = this._col(this.movieLogCollectionName);
            let imdbLink = await imdbLookup(dlcName);
            const movie = await movieLogCollection.find({ imdb_link: imdbLink }); // finds all of the times a movie was played
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
    async addUserDataMongo(userID) {
        try {
            await this._col(this.userDataCollectionName).insertOne(
                new userDataJsonObject(userID).jsonData
            );
        } catch (err) {
            console.error('addUserData error:', err);
        }
    }

    async checkFlagMongo(userID, flag) {
        const userData = await this._col(this.userDataCollectionName)
            .findOne({ twitch_userID: userID });
        if (!userData) {
            this.addUserDataMongo(userID); 
            // fire-and-forget, намеренно
            // fire-and-forget, intentionally
            return globalDefaultFlags.includes(flag);
        }
        return userData.flags.includes(flag);
    }

    async addFlagMongo(userID, newFlag) {
        await this._col(this.userDataCollectionName).findOneAndUpdate(
            { twitch_userID: userID },
            { $push: { flags: newFlag } }
        );
    }

    async removeFlagMongo(userID, flag) {
        await this._col(this.userDataCollectionName).findOneAndUpdate(
            { twitch_userID: userID },
            { $pull: { flags: flag } }
        );
    }
}
