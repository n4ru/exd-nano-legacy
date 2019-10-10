const crypto = require("crypto");
const BigNumber = require("bignumber.js");
const ByteBuffer = require("bytebuffer");

module.exports = class Util {
    constructor() {}

    static shuffle(array) {
        return array.sort(() => Math.random() - 0.5);
    }
}
