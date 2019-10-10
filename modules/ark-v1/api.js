const BlockController = require("./controllers/blockController");
const PeerController = require("./controllers/peerController");
const request = require("request-promise-native");

module.exports = class Api {
    constructor(nano) {
        if(nano){
            Object.assign(this, nano);
        }
        else
            throw "Api can't be created without a nano instance";
    }

    init() {
        const blocks = new BlockController(this);
        const peer = new PeerController(this);

        //Blocks
        this.p2p_server.get("/api/blocks/getHeight", blocks.getHeight());
        this.p2p_server.get("/api/blocks/get", blocks.getBlock());
        this.p2p_server.get("/api/blocks", blocks.getBlocks());

        ////Peers
        this.p2p_server.get("/api/peers/version", peer.getVersion());
        this.p2p_server.all("/api/peers", peer.getPeerList());
        this.p2p_server.get("/peer/status", peer.getStatus());
        this.p2p_server.post("/peer/blocks", peer.postBlock());

        //Proxy requests it can't handle
        this.p2p_server.use("/", (req, res) => {
            //Don't proxy requests sent to self?
            if(req.connection.remoteAddress.includes(this.p2p_server.publicIp))
                return;
    
            if(this.config.verbose)
                console.log(`Proxying request: ${req.method} ${req.originalUrl} from ${req.connection.remoteAddress}`);
    
            this.proxyRequest(req, res);
        });
    }

    async proxyRequest(req, res) {
        const proxiedPeer = this.config.useAnchor ? this.config.anchor : this.peers.getRandomPeer();
    
        try {
            const proxiedReq = {
                url: `http://${proxiedPeer.ip}:${proxiedPeer.port}${req.originalUrl}`,
                headers: this.config.headers,
                qs: req.query,
                timeout: this.config.timeout,
                method: req.method,
                resolveWithFullResponse: true
            };
    
            if(req.body)
                proxiedReq.json = req.body
    
            const resp = await request(proxiedReq);
    
            //Copy over proxied response's headers and body
            resp.headers.version = this.config.headers.version;
            res.set(resp.headers);
            return res.send(resp.body);
        }
        catch(err) {
            console.log("ERROR START: " + req.originalUrl);
            console.log(err.error);
            console.log("ERROR END");
            if(err.statusCode)
                res.status(err.statusCode);
            res.set(err.headers);
            return res.send(err.error);
        }
    };
};
