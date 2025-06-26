const argon2 = require('argon2');
const { Crypto } = require('@peculiar/webcrypto');
const crypto = new Crypto();

argon2.limits.timeCost.min = 1 // I have no clue what I am doing!!!

const AES_GCM_IV_SIZE_BYTES = 12;

const RSA_KEY_SIZE_BYTES = 3072 / 8;

const ARGON2_T = 1;
const ARGON2_P = 4;
const ARGON2_M = 131072;
const ARGON2_HASH_LENGTH = 32;
const ARGON2_SALT_LENGTH = 16;

const CONTEXT_STRING_ASYM_KEY_WRAP = "context:asymmetricKeyWrap";
const CONTEXT_STRING_FMD_PIN = "context:fmdPin"; // Not even used??
const CONTEXT_STRING_LOGIN = "context:loginAuthentication";

function base64Decode(encodedData) {
    return Uint8Array.from(atob(encodedData), c => c.charCodeAt(0))
}

async function hashPasswordArgon2(password, salt, raw = false) {
    if (typeof salt === "string") {
        salt = base64Decode(salt);
    }
    let res = await argon2.hash(password, {
        salt: Buffer.from(salt),
        hashLength: ARGON2_HASH_LENGTH,
        timeCost: ARGON2_T,
        parallelism: ARGON2_P,
        memoryCost: ARGON2_M,
        raw: raw
    });
    return res
}

async function hashPasswordForLogin(password, salt) {
    return await hashPasswordArgon2(CONTEXT_STRING_LOGIN + password, salt);
}

async function unwrapPrivateKey(password, keyData) { // -> CryptoKey
    const concatBytes = base64Decode(keyData);
    const saltBytes = concatBytes.slice(0, ARGON2_SALT_LENGTH);
    const ivBytes = new Uint8Array(concatBytes.slice(ARGON2_SALT_LENGTH, ARGON2_SALT_LENGTH + AES_GCM_IV_SIZE_BYTES));
    const wrappedKeyBytes = Buffer.from(concatBytes.slice(ARGON2_SALT_LENGTH + AES_GCM_IV_SIZE_BYTES));

    // console.log("wrappedKeyBytes",wrappedKeyBytes)

    let rawAesKey = await hashPasswordArgon2(`${CONTEXT_STRING_ASYM_KEY_WRAP}${password}`, saltBytes, true);
    // console.log("rawAesKey",rawAesKey)

    const unwrappingCryptoKey = await crypto.subtle.importKey("raw", rawAesKey, "AES-GCM", false, ["decrypt"]);
    // console.log("unwrappingCryptoKey", unwrappingCryptoKey)

    const pemBytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, unwrappingCryptoKey, wrappedKeyBytes);
    // const pemBytes = await crypto.subtle.decrypt("AES-GCM", unwrappingCryptoKey, wrappedKeyBytes);
    // console.log("pemBytes", pemBytes)

    let pemString = new TextDecoder().decode(pemBytes);
    pemString = pemString.replaceAll("-----BEGIN PRIVATE KEY-----", "");
    pemString = pemString.replaceAll("-----END PRIVATE KEY-----", "");
    pemString = pemString.replaceAll("\n", "");
    const binaryDer = base64Decode(pemString);

    // console.log("binaryDer",binaryDer)

    const privateKeyForDecrypt = await crypto.subtle.importKey(
        "pkcs8",
        binaryDer,
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["decrypt"]
    );

    const privateKeyForSign = await crypto.subtle.importKey(
        "pkcs8",
        binaryDer,
        { name: "RSA-PSS", hash: "SHA-256" },
        false,
        ["sign"]
    );

    return {
        decryptKey: privateKeyForDecrypt,
        signKey: privateKeyForSign
    };
}

async function decryptPacketModern(rsaCryptoKey, packetBase64) {
    const concatBytes = base64Decode(packetBase64);
    const sessionKeyPacketBytes = concatBytes.slice(0, RSA_KEY_SIZE_BYTES);
    const ivBytes = concatBytes.slice(RSA_KEY_SIZE_BYTES, RSA_KEY_SIZE_BYTES + AES_GCM_IV_SIZE_BYTES);
    const ctBytes = concatBytes.slice(RSA_KEY_SIZE_BYTES + AES_GCM_IV_SIZE_BYTES);

    const sessionKeyBytes = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, rsaCryptoKey, sessionKeyPacketBytes);

    const sessionKeyCryptoKey = await crypto.subtle.importKey("raw", sessionKeyBytes, "AES-GCM", false, ["decrypt"]);

    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, sessionKeyCryptoKey, ctBytes);

    const plaintextString = new TextDecoder().decode(plaintext);
    return plaintextString
}

async function signString(privateKey, dataString) {
    const encoder = new TextEncoder();
    const data = encoder.encode(dataString);

    const signature = await crypto.subtle.sign(
        {
            name: "RSA-PSS",
            saltLength: 32,
        },
        privateKey,
        data
    );

    return Buffer.from(signature).toString('base64');
}

module.exports = {
    hashPasswordForLogin,
    unwrapPrivateKey,
    decryptPacketModern,
    signString
}