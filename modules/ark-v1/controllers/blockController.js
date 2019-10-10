module.exports = class BlockController {
    constructor({ blockchain, config, peers, proxyRequest}) {
        this.blockchain = blockchain;
        this.config = config;
        this.peers = peers;
        this.proxyRequest = proxyRequest;
    }

    getHeight() {
        return (req, res) => {
            const latest = this.blockchain.getLatest();
            res.send({
                success: true,
                height: latest.height,
                id: latest.id
            });
        }
    }

    getBlocks() {
        return (req, res) => {
            if(req.query.limit > this.config.blocks)
                return this.proxyRequest(req, res);

            const blocks = this.blockchain.getBlocks(req.query.limit);
            res.json({
                success: true,
                blocks: blocks
            });
        }
    }

    getBlock() {
        return (req, res) => {
            if(!req.query.id)
                res.json({ success:false, error: "Missing required property: id" });

            const block = this.blockchain.getBlock(req.query.id);
            if(!block)
                return this.proxyRequest(req, res);
            
            res.json({
                block
            })
        }
    }
};
