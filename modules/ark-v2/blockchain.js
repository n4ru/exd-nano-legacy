const request = require("request-promise-native");
const config = require("../../config.json");
const BlockUtil = require("../../utils/blockUtil");
const Util = require("../../utils/util");

const Block = require("../../models/block");

class Blockchain {
    constructor(config) {
        this.config = config;
        this._blocks = [];
        this.forked = false;
        this.rebuilding = false;
    }

    share(obj) {
        Object.keys(obj).forEach(key => {
            this[key] = obj[key];
        })
    }

    verifyBlock(block) {
        const goodSignature = BlockUtil.verifySignature(block);
        return goodSignature;
    }

    verifyChain() {
        //Make sure every block after points to block before
        for (let i = this.getLength() - 1; i > 0; i--) {
            const currentBlock = this._blocks[i];
            if (!BlockUtil.verifySignature(currentBlock))
                return false;

            if (i > 0 && currentBlock.previousBlock != this._blocks[i - 1].id)
                return false;
        }

        return true;
    }

    getLatest() {
        return this._tail;
    }

    getHeight() {
        return this.getLatest().height;
    }

    getLength() {
        return this._blocks.length;
    }

    getBlock(id) {
        return this._blocks.find(block => block.id == id);
    }

    hasBlock(id) {
        return this._blocks.some(block => block.id == id);
    }

    getBlocks(limit) {
        //api responds with highest block first
        let blocks = this._blocks
            //.map(b => b.getData())
            .sort((a, b) => b.height - a.height)

        if (limit)
            blocks = blocks.slice(0, limit);

        return blocks;
    }

    async buildBlocks(peerList) {
        let errCount = 0;
        const peerBlocks = {};
        await Promise.all(
            peerList.map(peer => {
                return request({
                        "url": `http://${peer.ip}:${peer.port}/peer/blocks`,
                        "headers": this.config.headers,
                        "timeout": this.config.timeout
                    })
                    .then(dataInit => {
                        request({
                                "url": `http://${peer.ip}:${peer.port}/peer/blocks?lastBlockHeight=${JSON.parse(dataInit).blocks[0].data.height - this.config.blocks}`,
                                "headers": this.config.headers,
                                "timeout": this.config.timeout
                            })
                            .then(data => {
                                data = JSON.parse(data);
                                peerBlocks[peer.ip] = data.blocks.sort((a, b) => b.height - a.height);
                            })
                            .catch(err => {
                                errCount++;
                                this.peers.killPeer(peer.ip);
                            })
                    })
                    .catch(err => {
                        errCount++;
                        this.peers.killPeer(peer.ip);
                    })
            })
        );

        if (errCount > 0)
            console.log("Error querying", errCount, "peers for blocks.");

        if (Object.keys(peerBlocks).length == 0) {
            console.log("♻️  Error getting any blocks. Attempting to resync again.");
            if (this.peers.peerList == 0)
                await this.peers.buildList();
            return await this.buildBlocks(this.config.peers);
        } else {
            console.log("♻️  Processing blocks from", Object.keys(peerBlocks).length, "peers.");
            let diffCount = 0;
            let consensusPeer = false;
            const syncedPeers = [];
            Object.keys(peerBlocks).forEach(peer => {
                if (!consensusPeer) {
                    consensusPeer = peerBlocks[peer];
                }

                if (JSON.stringify(peerBlocks[peer]) !== JSON.stringify(consensusPeer)) {
                    // Blocks differ!
                    const latest = peerBlocks[peer][0];
                    if (latest.height == consensusPeer[0].height && latest.blockSignature != consensusPeer[0].blockSignature) {
                        // Signatures differ! Take the smallest timestamp.
                        if (this.verifyBlock(latest) && latest.timestamp < consensusPeer[0].timestamp) {
                            diffCount++;
                            console.log("Orphaned block found with ID", consensusPeer[0].id);
                            consensusPeer = peerBlocks[peer];
                        }
                    } else if (latest.height > consensusPeer[0].height) {
                        // Peer height differs by more than one slot, update the latest block
                        //console.log("Block height difference, accepting highest block.");
                        diffCount++;
                        if (this.verifyBlock(latest)) {
                            consensusPeer = peerBlocks[peer];
                        }
                    }
                }
                else
                    syncedPeers.push({ ip: peer });
            });

            // Are too many nodes more than a block apart?
            if (diffCount > parseFloat(this.peers.peerList.length * 0.51)) {
                this._blocks = [];
                console.log("❌  Potential fork! Network majority cannot be determined.");
                this.forked = true;
                this.rebuilding = false;
            } else {
                this.forked = false;

                this._blocks = consensusPeer.map(b => new Block(b))
                    .sort((a, b) => a.height - b.height);
                this._head = this._blocks[0];
                this._tail = this._blocks[this._blocks.length - 1];

                if (!this.verifyChain()) {
                    console.log("❌  Blockchain blocks failed validation! Attempting to sync again.");
                    await this.peers.buildList();
                    if (peering)
                        return await this.buildBlocks(this.peers.getPeerList());
                } else {
                    this.rebuilding = false;
                    console.log("✔️  Latest height -", this._tail.height, "-", this._tail.id);

                    //Query the good peers for the latest list of delegates
                    this.delegates.build(syncedPeers);
                }

            }
        }
    }

    broadcastLatestBlock() {
        const postBlock = (peer) => {
            return {
                uri: `http://${peer.ip}:${peer.port}/peer/blocks`,
                method: "POST",
                agent: false,
                headers: {
                    "User-Agent": "Mozilla/4.0 (compatible; ARK API Lite)",
                    "Content-type": "application/json",
                    ...this.config.headers
                },
                timeout: 60 * 1000
            };
        };

        const latestBlock = this.getLatest();

        //We can't get txs without db so don't broadcast if there are txs in the block
        if (latestBlock.numberOfTransactions != 0)
            return;

        const peers = this.peers.getPeerList();
        const broadcastTo = Util.shuffle(peers).slice(0, Math.ceil(this.config.broadcastRange * peers.length));

        console.log(`Broadcasting block to ${broadcastTo.length} peers`);

        broadcastTo.forEach(peer => {
            const postReq = postBlock({
                ip: peer.ip,
                port: peer.port
            });

            latestBlock.transactions = latestBlock.transactions ? latestBlock.transactions : [];

            postReq.json = {
                block: latestBlock
            };

            request(postReq); //.then(resp => console.log(resp));
        });
    }

    async addBlock(block) {
        const MAX = this.config.blocks;

        const latestBlock = this.getLatest();
        const heightDiff = block.height - latestBlock.height;

        if (heightDiff > 1) {
            if (!this.rebuilding)
                console.log(`❌  Blockchain not ready. Incoming: ${block.height} | Latest Height: ${latestBlock.height}`);
            if (!this.rebuilding) {
                this.rebuilding = true;
                let peers = this.peers.getPeerList();
                if (peers.length == 0) {
                    console.log("Resyncing with hardcoded peers");
                    return await this.buildBlocks(this.config.peers);
                } else {
                    console.log("Resyncing with current peers");
                    return await this.buildBlocks(peers);
                }
            }
        } else if (heightDiff == 0) {
            if (block.id != latestBlock.id)
                return console.log(`❌  Orphaned block received! Height: ${latestBlock.height} ID: ${latestblock} | ReceivedID: ${block.id}`);

            //return console.log("Received duplicate latest block. Discarding.");
            return;
        }

        if (block.previousBlock != latestBlock.id && !this.rebuilding)
            return console.log(`❌  Forked block received! Expected PreviousBlock: ${latestBlock.id} | Received's previous: ${block.previousBlock}`);

        if (!BlockUtil.verifySignature(block))
            return console.log(`❌  Invalid block signature received. ID: ${block.id} | Height: ${block.height}`);

        //Append block and update references
        console.log(`✔️  Adding new block. ID: ${block.id} | Height: ${block.height}`);
        const blockObj = new Block(block);
        this._blocks.push(blockObj);
        this._tail = blockObj;

        //Remove oldest block if over max
        if (this.getLength() > MAX) {
            this._blocks.shift();
            this._head = this._blocks[0];
        }

        if (config.peering)
            this.broadcastLatestBlock();
    }
}

module.exports = Blockchain;