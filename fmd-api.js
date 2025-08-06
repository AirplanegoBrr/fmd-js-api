const axios = require('axios');
const { hashPasswordForLogin, unwrapPrivateKey, decryptPacketModern, signString } = require('./crypto');
// This whole file is vodo magic
const defaultServer = "https://fmd.nulide.de:1008/"

/**
 * @typedef {Object} apiConfig
 * @property {String} apiConfig.url URL of server (Defaults to: https://fmd.nulide.de:1008/)
 */

/**
 * @typedef {Object} loginData
 * @property {Object} accessToken Used for server auth
 * @property {CryptoKey} privateKey Uses to decrypt data returned
 */

/**
 * @typedef {Object} LocationData
 * @property {'fused' | 'gps' | 'network' | 'opencell'} provider What provider provided the lat and lon data
 * @property {Number} date Date the loction was saved (Number)
 * @property {String} bat Battery level of device
 * @property {String} lon Device Longitude
 * @property {String} lat Device Latitude
 * @property {String} time Date the loction was saved (String)
 * @property {String} [speed] Current speed (kph)
 * @property {String} [accuracy] Accuracy of location
 * @property {String} [altitude] Altitude of location
 */

class FMD_API {
    /**
     * FMD API!
     * @param {String} deviceID The Device ID
     * @param {String} password Your password
     * @param {apiConfig} config Config
     */
    constructor(deviceID, password, config = {}) {
        this.deviceID = deviceID;
        this.password = password;

        config ??= {}
        config.url ??= defaultServer

        this.config = config
        this.url = config.url
        this.commands = {
            locate: () => this.sendToPhone("locate"),
            locate_gps: () => this.sendToPhone("locate gps"),
            locate_cell: () => this.sendToPhone("locate cell"),
            locate_last: () => this.sendToPhone("locate last"),
            ring: () => this.sendToPhone("ring"),
            lock: () => this.sendToPhone("lock"),
            camera_front: () => this.sendToPhone("camera front"),
            camera_back: () => this.sendToPhone("camera back")
        }
    }

    /**
     * Login to FMD server
     * @return {Promise<loginData>} The login data containing accessToken and privateKey
     */
    async login() {
        try {
            let saltResponse = await axios.put(`${this.url}/salt`, { IDT: this.deviceID, Data: "unused" })
            let saltJSON = saltResponse.data
            let salt = saltJSON.Data

            let res = await hashPasswordForLogin(this.password, salt)
            // console.log("res", res)

            let accessResponse = await axios.put(`${this.url}/requestAccess`, { IDT: this.deviceID, Data: res })
            let AccessData = accessResponse.data
            this.accessToken = AccessData.Data

            let keyResponse = await axios.put(`${this.url}/key`, { IDT: this.accessToken, Data: "unused" })
            let keyData = keyResponse.data
            // console.log("keyData",keyData)
            const { decryptKey, signKey } = await unwrapPrivateKey(this.password, keyData.Data);
            this.privateKeyForDecrypt = decryptKey;
            this.privateKeyForSign = signKey;
            
            return {
                accessToken: this.accessToken,
                privateKeyForDecrypt: this.privateKeyForDecrypt,
                privateKeyForSign: this.privateKeyForSign
            }
        } catch (error) {
            console.error("Login failed:", error);
            throw new Error("Unable to login to FMD server.");
        }
    }

    /**
     * 
     * @returns {Promise<Number>}
     */
    async getLocationCount() {
        try {
            let responseDataSize = await axios.put(`${this.url}/locationDataSize`, { IDT: this.accessToken, Data: "unused" })
            let newestLocationDataIndex = parseInt(responseDataSize.data.Data, 10) - 1;
            return newestLocationDataIndex;
        } catch (error) {
            console.error("getLocationCount failed:", error);
            throw new Error("Unable to get location count.");
        }
    }

    /**
     * Get location (1:1 of FMD.locate)
     * @property {Number} requestedIndex Location index (Default: -1)
     * @returns {Promise<LocationData>}
     */
    async getLocation(index = -1) {
        return await this.locate(index);
    }

    /**
     * Get location
     * @property {Number} requestedIndex Location index (Default: -1)
     * @returns {Promise<LocationData>}
     */
    async locate(requestedIndex = -1) {
        try {
            let newestLocationDataIndex = await this.getLocationCount()

            if (requestedIndex == -1) {
                requestedIndex = newestLocationDataIndex;
            }

            let responseLocation = await axios.put(`${this.url}/location`, {
                IDT: this.accessToken,
                Data: requestedIndex.toString()
            });

            // console.log("responseLocation", responseLocation.data)

            let rawLocation = await decryptPacketModern(this.privateKeyForDecrypt, responseLocation.data.Data)
            let location = JSON.parse(rawLocation)

            return location
        } catch (error) {
            console.error("Location get failed:", error);
            throw new Error("Unable to get location.");
        }
    }

    /**
     * Send command to device
     * @property {String} command Command to send
     * @returns {Promise<Boolean>} Whether the command was successfully sent
     */
    async sendToPhone(command) {
        try {
            const unixTime = Date.now(); // Current time in milliseconds
            const toSign = `${unixTime}:${command}`;
            
            // Sign the command using the private key
            const signature = await signString(this.privateKeyForSign, toSign);

            const commandData = {
                IDT: this.accessToken,
                Data: command,
                UnixTime: unixTime,
                CmdSig: signature
            };

            let res = await axios.post(`${this.url}/command`, commandData);
            return res.status == 200;
        } catch (error) {
            console.error("SendToPhone failed:", error);
            throw new Error("Unable to send command to FMD server.");
        }
    }

    /**
     * Get old commands!
     * @deprecated Doesn't work currently - Not impemnted fully FMD side
     * @returns {null} Doesn't do anything for now!!
     */
    async getOldCommands() {
        return null
        let res = await axios.post(`${this.url}/commandLogs`, { IDT: this.accessToken, Data: "" })
        // console.log(res)
    }

    /**
     * Get amount of pictures the server has
     * @returns {Promise<Number>} Count of picturs on the server
     */
    async getPictureCount() {
        try {
            let resPictureSize = await axios.put(`${this.url}/pictureSize`, { IDT: this.accessToken, Data: "" })
            return resPictureSize.data.Data
        } catch (error) {
            console.error("getPictureCount failed:", error);
            throw new Error("Unable to get picture count.");
        }
    }

    /**
     * Get picture the server has at the given index
     * @property {Number} pictureIndex Index of picture
     * @returns {Promise<Buffer>} Picture buffer
     */
    async getPicture(pictureIndex) {
        try {
            const resPicture = await axios.put(`${this.url}/picture`, { IDT: this.accessToken, Data: pictureIndex.toString() })
            let pictureDataRaw = resPicture.data
            let pictureData = await decryptPacketModern(this.privateKeyForDecrypt, pictureDataRaw)
            return Buffer.from(pictureData, "base64")
        } catch (error) {
            console.error("getPicture failed:", error);
            throw new Error("Unable to get picture from FMD server.");
        }
    }
}

module.exports = FMD_API