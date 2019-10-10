const SlotUtil = require("../../utils/slotUtil");
const BlockUtil = require("../utils/blockUtil");

module.exports = class PeerController {
    constructor({ blockchain, config, peers }) {
        this.blockchain = blockchain;
        this.config = config;
        this.peers = peers;
    }

    getPeerList() {
        return (req, res) => {
            res.send({
                success: true,
                peers: this.peers.getPeerList()
            });
        }
    }

    getStatus() {
        return (req, res) => {
            const latest = this.blockchain.getLatest();
            latest.idHex = BlockUtil.getIdHex(latest);
            console.log(latest.idHex)
            const status = {
                success: true,
                height: latest.height,
                forgingAllowed: SlotUtil.isForgingAllowed(),
                currentSlot: SlotUtil.getSlotNumber(),
                header: latest
            };

            res.send(status);
        }
    }

    getVersion() {
        return (req, res) => {
            res.send({
                success: true,
                version: this.config.headers.version,
                build: ""
            });
        }
    }

    postBlock() {
        return (req, res) => {
            //If peering is disabled, just echo back success and don't send the block anywhere
            if(!this.config.peering)
            return res.send({ success: true, id: req.body.block.id });

            //Add block to local blockchain
            const block = req.body.block;
            const added = this.blockchain.addBlock(block);

            res.send({ success: added, id: block.id });
        }
    }
};
