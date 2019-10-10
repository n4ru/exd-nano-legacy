"use strict";

const request = require("request-promise-native");
const config = require("../config.json");

class Forging {
    constructor(peers, mempool) {
        this.peers = peers;
        this.mempool = mempool;
    }

    share(obj) {
        Object.keys(obj).forEach(key => {
            this[key] = obj[key];
        })
    }

}

module.exports = Forging;