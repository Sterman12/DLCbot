
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
