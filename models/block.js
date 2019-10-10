const BlockUtil = require("../utils/blockUtil");

module.exports = class Block {
    constructor(obj) {
        let data;
        if(obj instanceof String)
            data = JSON.parse(data);
        else if(obj instanceof Object)
            data = obj;
        else
            throw "Invalid block data";

        if(!BlockUtil.verifySignature(data))
            throw "Invalid block signature";
        
        Object.assign(this, data);

        /*
        {
            id,
            height,
            version,
            totalAmount,
            totalFee,
            reward,
            payloadHash,
            timestamp,
            numberOfTransactions,
            payloadLength,
            previousBlock,
            generatorPublicKey,
            blockSignature,
            transactions
        */
    }

    getData() {
        const obj = { ...this };

        return obj;
    }
}
