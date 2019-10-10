const fs = require("fs");
const publicIp = require("public-ip");
const express = require("express");
const bodyParser = require("body-parser");

const getConstructors = (chain) => {
    return {
        Api: require(`./modules/${chain}/api`),
        Peers: require(`./modules/${chain}/peers`),
        Blockchain: require(`./modules/${chain}/blockchain`),
        Delegates: require(`./modules/${chain}/delegates`),
    };
}

module.exports = class Nano {
    constructor(config) {
        this.config = config;
        this.Constructors = getConstructors(this.config.chain);

        if(this.config.peering)
        {
            // P2P API
            this.p2p_server = express();
            this.p2p_server.use(bodyParser.json());
            // Public REST API
            this.api_server = express();
            this.api_server.use(bodyParser.json());
        }

        this.peers = new this.Constructors.Peers(this.config);
        this.blockchain = new this.Constructors.Blockchain(this.config);
        this.delegates = new this.Constructors.Delegates(this.config);

        // Share class instances with each other
        this.peers.share({
            blockchain: this.blockchain
        });
        this.blockchain.share({
            peers: this.peers,
            delegates: this.delegates
        });
        this.delegates.share({
            peers: this.peers,
            blockchain: this.blockchain
        });
    }

    async init(peering) {
        await this.peers.buildList();

        if(peering)
            await this.blockchain.buildBlocks(this.peers.getPeerList());

        setInterval(async () => {
            await this.peers.refreshStatus();
        }, 8000);

        setInterval(async () => {
            await this.peers.buildList();
        }, this.config.peerRefresh * 1000);

        // Load Plugins
        console.log("Loading Plugins")
        this.Plugin = {};
        this.config.plugins.forEach(plug => {
            let pluginConfig = require(`./plugins/${plug}/config.json`);
            this.Constructors[plug] = require(`./plugins/${plug}/${pluginConfig.constructor}`);
            console.log(`- ${plug} (v${pluginConfig.version}) loaded!`);

            this.Plugin[plug] = new this.Constructors[plug](this.config);
            if (this.Plugin[plug].share) {
                pluginConfig.resources.forEach(res => {
                    eval(`this.Plugin[plug].share({
                        ${res}: this.${res}
                    })`)
                })
            }

            //Added this for the forging plugin but can be used for others
            this.Plugin[plug].start();
        });
    }

    async start() {
        console.log(`Nano starting as [${this.config.chain}] node.`);

        this.p2p_server.publicIp = (await Promise.all([publicIp.v4(), this.init(this.config.peering)]))[0];

        await this.p2p_server.listen(this.config.port.p2p);
        console.log(`P2P API started on ${this.config.port.p2p}!`)
        await this.api_server.listen(this.config.port.api);
        console.log(`Public API started on ${this.config.port.api}!`)

        if(this.config.peering)
        {
            this.api = new this.Constructors.Api(this);
            this.api.init();

            console.log(`Nano started in ${this.config.peering ? "PEERING" : "OBSERVER"} mode`)
        }
    }

    getStats() {
        return async (req, res) => {
            let resp = fs.readFileSync("art.html", "utf8");

            if(this.blockchain.forked)
                resp += "Potential fork! Network majority cannot be determined.<br /> <br />";

            const heightToPeers = {};
            this.peers.getPeerList().forEach(peer => {
                if(heightToPeers[peer.height])
                    heightToPeers[peer.height].push(peer.ip);
                else
                    heightToPeers[peer.height] = [ peer.ip ];
            });

            resp += "<table border='1'><tr><td>Height</td><td>Count</td><td>IPs</td>";
            Object.keys(heightToPeers).sort((a,b) => b - a).forEach(height =>{
                const peers = heightToPeers[height];
                resp += "<tr>";

                resp += "<td>";
                resp += height;
                resp += "</td>";

                resp += "<td>";
                resp += peers.length;
                resp += "</td>";

                resp += "<td>";
                resp += peers.join("<br />");
                resp += "</td>";

                resp += "</tr>";
            });
            resp += "</table>";

            return res.send(resp);
        };
    }
}