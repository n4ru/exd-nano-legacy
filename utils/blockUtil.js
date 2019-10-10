const { crypto } = require("@arkecosystem/crypto");
const { createHash } = require("crypto");
const Bignum = require('bigi');
const BigNumber = require("bignumber.js");
const ByteBuffer = require("bytebuffer");

const toBytesHex = (buffer) => {
  let temp = buffer.toString('hex')
  return '0'.repeat(16 - temp.length) + temp
}

  /**
  * Fix to allow blocks to be backwards-compatible.
  * @param {Object} data
  */
 const applyV1Fix = (data) => {
    // START Fix for v1 api
    data.totalAmount = parseInt(data.totalAmount)
    data.totalFee = parseInt(data.totalFee)
    data.reward = parseInt(data.reward)
    data.previousBlockHex = data.previousBlock ? toBytesHex(new Bignum(data.previousBlock).toBuffer()) : '0000000000000000'
    data.idHex = toBytesHex(new Bignum(data.id).toBuffer())
    // END Fix for v1 api
  
    // order of transactions messed up in mainnet V1
    // if (block.data.transactions.length === 2 && (block.data.height === 3084276 || block.data.height === 34420)) {
    //   const temp = block.data.transactions[0]
    //   block.data.transactions[0] = block.data.transactions[1]
    //   block.data.transactions[1] = temp
    // }
  }

module.exports = class BlockUtil {
    constructor() {}

    static unborkHash(number) {
        let hstr = new BigNumber(number|| "0").toString(16);
        while(hstr.length < 16) 
            hstr = "0" + hstr;
        return hstr;
    }

    static getBytes(block, includeSignature = false) {
        let size = 4 + 4 + 4 + 8 + 4 + 8 + 8 + 8 + 4 + 32 + 33;
        let previousBlockHexStr = BlockUtil.unborkHash(block.previousBlock);

        if(includeSignature)
            size += Buffer.byteLength(block.blockSignature, "hex");

        let bb = new ByteBuffer(size, true);
        bb.writeInt(block.version);
        bb.writeInt(block.timestamp);
        bb.writeInt(block.height);

        bb.append(previousBlockHexStr, "hex");

        bb.writeInt(block.numberOfTransactions);
        bb.writeLong(block.totalAmount);
        bb.writeLong(block.totalFee);
        bb.writeLong(block.reward);

        bb.writeInt(block.payloadLength);

        bb.append(block.payloadHash, "hex");
        bb.append(block.generatorPublicKey, "hex");

        if(includeSignature)
            bb.append(block.blockSignature, "hex");

        return bb.flip().toBuffer();
    }

    static getHash(block, sig = false) {
        return createHash("sha256").update(BlockUtil.getBytes(block, sig)).digest();      
    }

    static getId(block, sig = false) {
        const idHex = BlockUtil.getIdHex(block);
        //console.log("ID HEX::::::::::" + idHex);
        return new BigNumber(idHex, 16).toFixed();
        //new BigNumber(BlockUtil.getHash(block, true).slice(0, 8).swap64().toString("hex"), 16).toFixed();
    }

    static getIdHex(block, sig = false) {
        const hash = createHash("sha256").update(BlockUtil.serialize(block, true)).digest()
        const temp = Buffer.alloc(8)
    
        for (let i = 0; i < 8; i++) {
          temp[i] = hash[7 - i]
        }
        return temp.toString('hex')
    }

    static verifySignature(block) {
        const bytes = BlockUtil.serialize(block, false)
        const hash = createHash("sha256")
          .update(bytes)
          .digest();
  
        return crypto.verifyHash(
          hash,
          block.blockSignature,
          block.generatorPublicKey,
        );
    }

    

  /*
   * Deserialize block from hex string.
   * @param  {String} hexString
   * @return {Object}
   * @static
   */
  static deserialize (hexString) {
    const block = {}
    const buf = ByteBuffer.fromHex(hexString, true)
    block.version = buf.readUInt32(0)
    block.timestamp = buf.readUInt32(4)
    block.height = buf.readUInt32(8)
    block.previousBlockHex = buf.slice(12, 20).toString('hex')
    block.previousBlock = Bignum(block.previousBlockHex, 16).toString()
    block.numberOfTransactions = buf.readUInt32(20)
    block.totalAmount = buf.readUInt64(24).toNumber()
    block.totalFee = buf.readUInt64(32).toNumber()
    block.reward = buf.readUInt64(40).toNumber()
    block.payloadLength = buf.readUInt32(48)
    block.payloadHash = hexString.substring(104, 104 + 64)
    block.generatorPublicKey = hexString.substring(104 + 64, 104 + 64 + 33 * 2)

    const length = parseInt('0x' + hexString.substring(104 + 64 + 33 * 2 + 2, 104 + 64 + 33 * 2 + 4), 16) + 2
    block.blockSignature = hexString.substring(104 + 64 + 33 * 2, 104 + 64 + 33 * 2 + length * 2)

    let transactionOffset = (104 + 64 + 33 * 2 + length * 2) / 2
    block.transactions = []
    if (hexString.length === transactionOffset * 2) return block

    for (let i = 0; i < block.numberOfTransactions; i++) {
      block.transactions.push(buf.readUint32(transactionOffset))
      transactionOffset += 4
    }

    for (let i = 0; i < block.numberOfTransactions; i++) {
      const transactionsLength = block.transactions[i]
      block.transactions[i] = Transaction.deserialize(buf.slice(transactionOffset, transactionOffset + transactionsLength).toString('hex'))
      transactionOffset += transactionsLength
    }

    return block
  }

  /*
   * Serialize block.
   * @param  {Object} data
   * @return {Buffer}
   * @static
   */
  static serializeFull (block) {
    const buf = new ByteBuffer(1024, true)
    buf.append(Block.serialize(block, true))

    const serializedTransactions = block.transactions.map(transaction => Transaction.serialize(transaction))
    serializedTransactions.forEach(transaction => buf.writeUInt32(transaction.length))
    serializedTransactions.forEach(transaction => buf.append(transaction))
    buf.flip()

    return buf.toBuffer()
  }

    /*
   * Serialize block
   * TODO split this method between bufferize (as a buffer) and serialize (as hex)
   * @param  {Object} block
   * @param  {(Boolean|undefined)} includeSignature
   * @return {Buffer}
   * @static
   */
  static serialize (block, includeSignature = true) {
    applyV1Fix(block)
    const bb = new ByteBuffer(256, true)
    bb.writeUInt32(block.version)
    bb.writeUInt32(block.timestamp)
    bb.writeUInt32(block.height)

    // TODO: previousBlock can stay as 8byte hex, it will be simple to process
    if (block.previousBlockHex) {
      bb.append(block.previousBlockHex, 'hex')
    } else {
      bb.append('0000000000000000', 'hex')
    }

    bb.writeUInt32(block.numberOfTransactions)
    bb.writeUInt64(block.totalAmount)
    bb.writeUInt64(block.totalFee)
    bb.writeUInt64(block.reward)
    bb.writeUInt32(block.payloadLength)
    bb.append(block.payloadHash, 'hex')
    bb.append(block.generatorPublicKey, 'hex')

    if (includeSignature && block.blockSignature) {
      bb.append(block.blockSignature, 'hex')
    }

    bb.flip()
    return bb.toBuffer()
  }
}
