const BlockController = require("./controllers/blockController");
const PeerController = require("./controllers/peerController");
const InternalController = require("./controllers/internalController");
const request = require("request-promise-native");

module.exports = class Api {
    constructor(nano) {
        if (nano) {
            Object.assign(this, nano);
        } else
            throw "Api can't be created without a nano instance";
    }

    init() {
        const blocks = new BlockController(this);
        const peer = new PeerController(this);
        const internal = new InternalController(this);

        // Status Codes to retry on failure
        this.retry = [
            "429",
            "403",
            "500",
            "503"
        ]

        //Plugin routes before
        Object.keys(this.Plugin).forEach(plug => {
            if (this.Plugin[plug].routes) {
                this.Plugin[plug].routes().forEach(route => {
                    if (route.port == "p2p" || route.port == "all")
                        this.p2p_server[route.type](route.route, route.func);
                    if (route.port == "api" || route.port == "all")
                        this.api_server[route.type](route.route, route.func);
                    if (this.config.verbose)
                        console.log(`Loaded custom route: ${route.route} on ${route.port}`);
                })
            }
        })

        //Blocks
        this.api_server.get("/api/blocks/getHeight", blocks.getHeight());
        this.api_server.get("/api/blocks/get", blocks.getBlock());
        this.api_server.get("/api/blocks", blocks.getBlocks());

        //Peers
        this.api_server.get("/api/peers/version", peer.getVersion());
        this.p2p_server.all("/peer/list", peer.getPeerList());
        this.p2p_server.get("/peer/status", peer.getStatus());
        this.p2p_server.post("/peer/blocks", peer.postBlock());

        //Internal
        this.p2p_server.get("/internal/network/state", internal.getNetworkState());
        this.p2p_server.get("/internal/blockchain/sync", internal.getSync());
        this.p2p_server.get("/internal/utils/usernames", internal.getUsernames());
        this.p2p_server.get("/internal/utils/events", internal.getEvents());
        this.p2p_server.get("/internal/rounds/current", internal.getCurrentRound());
        this.p2p_server.get("/internal/transactions/forging", internal.getTransactions());

        //Proxy requests it can't handle
        this.p2p_server.use("/", (req, res) => {
            // Ignore requests below minVer
            if (req.headers.version && req.headers.version < this.config.minimumVersion)
                return;
            // Don't proxy requests sent to self?
            if (req.connection.remoteAddress.includes(this.p2p_server.publicIp))
                return;

            if (this.config.verbose)
                console.log(`🔹  P2P: Proxying ${req.method} ${req.originalUrl} from ${req.connection.remoteAddress}`);

            this.proxyRequest(req, res, this.config.port.p2p);
        });

        // Proxy Public API requests
        this.api_server.use("/", (req, res) => {
            // Ignore requests below minVer
            if (req.headers.version && req.headers.version < this.config.minimumVersion)
                return;
            // Don't proxy requests sent to self?
            if (req.connection.remoteAddress.includes(this.api_server.publicIp))
                return;

            if (this.config.verbose)
                console.log(`🔸  API: Proxying ${req.method} ${req.originalUrl} from ${req.connection.remoteAddress}`);

            this.proxyRequest(req, res, this.config.port.api);
        });
    }

    async proxyRequest(req, res, port) {
        const proxiedPeer = this.config.useAnchor ? this.config.anchor : this.peers.getRandomPeer();

        try {
            const proxiedReq = {
                url: `http://${proxiedPeer.ip}:${port}${req.originalUrl}`,
                headers: (req.connection.localPort == this.config.headers.p2p) ? this.config.headers : req.headers,
                qs: req.query,
                method: req.method,
                resolveWithFullResponse: true
            };

            if (req.body)
                proxiedReq.json = req.body

            return request(proxiedReq).pipe(res).on('error', console.log);

        } catch (err) {
            if (this.retry.includes(err.statusCode)) {
                console.log(`⚠️  Retrying request ${req.originalUrl} due to ${err.statusCode}.`);
                this.proxyRequest(req, res, port);
            } else {
                console.log(`⛔  ERROR for request ${req.originalUrl}: ${JSON.stringify(typeof err.message == "string" ? err.message : err.error)}`);
                return res.json(typeof err.message == "string" ? err.message : err.error);
            }
        }
    };

};