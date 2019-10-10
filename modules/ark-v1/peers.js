const request = require("request-promise-native");

module.exports = class Peers {
    constructor(config) {
        this.config = config;
        this.delegates = {};
        this.peerList = {};
        this.deadPeers = {};
    }

    share(obj) {
        Object.keys(obj).forEach(key => {
            this[key] = obj[key];
        })
    }

    //Returns this.peerList as an array
    getPeerList() {
        return Object.keys(this.peerList).map(key => this.peerList[key]);
    }

    killPeer(ip) {
        this.deadPeers[ip] = this.peerList[ip];
        delete this.peerList[ip];
    }

    addPeer(peer) {
        //Don't peer with other ark nanos
        if(peer.version && (peer.version.includes("n") || peer.version < this.config.minimumVersion))
            return;

        this.peerList[peer.ip] = peer;
        delete this.deadPeers[peer.ip];
    }

    getRandomPeer() {
        const ips = Object.keys(this.peerList);
        return this.peerList[Object.keys(this.peerList)[Math.floor(Math.random() * ips.length)]];
    }

    async buildList() {
        console.log("Building peer list...");
        let errCount = 0;
        if(this.config.fetchPeers)
        {
            await Promise.all(
                this.config.peers.map(peer => request(`http://${peer.ip}:${peer.port}/api/peers`)
                    .then(data => {
                        JSON.parse(data).peers.forEach(peer => {
                            this.addPeer(peer);
                        });
                    })
                    .catch(err => {
                        errCount++;
                        this.killPeer(peer.ip);

                        console.log("Error querying for peers -", peer.ip)
                    })
                )
            );

            if(errCount > 0)
                console.log("Error querying", errCount, "peers for peer lists.");   
        }
        else
            this.config.peers.forEach(peer => this.addPeer(peer));

        console.log("Peers found -", Object.keys(this.peerList).length);
    }

    async refreshStatus() {
        // Verify the peer list we built
        let errCount = 0;
        const peerStatuses = {};
        const currentPeerIps = Object.keys(this.peerList).concat(Object.keys(this.deadPeers));
        await Promise.all(
            currentPeerIps.map(ip => {
                const peer = this.peerList[ip] ? this.peerList[ip]
                            : this.deadPeers[ip] ? this.deadPeers[ip] 
                            : {};

                return request({
                    "url": `http://${peer.ip}:${peer.port}/peer/status`,
                    "headers": this.config.headers,
                    "timeout": this.config.timeout
                })
                    .then(data => {
                        data = JSON.parse(data);
                        peerStatuses[peer.ip] = data;

                        this.addPeer(peer);
                    })
                    .catch(err => {
                        errCount++;
                        
                        this.killPeer(peer.ip);
                    })
            })
        );

        if(errCount > 0)
            console.log("Error querying", errCount, "peers for status.");
        
        //Get largest peer height
        const largestHeight = Math.max.apply(Math, Object.keys(peerStatuses).map(peer => peerStatuses[peer].header.height));

        let diffCount = 0;
        Object.keys(peerStatuses).forEach(ip => {
            if (peerStatuses[ip].header.height < largestHeight - this.config.acceptableBlockLag) {
                diffCount++;
                
                this.killPeer(ip);
            }
        });

        // Are too many nodes more than a block apart?
        if (diffCount > 0)
            console.log("Found", diffCount, "peers too far behind chain.")

        if (diffCount > parseFloat(Object.keys(this.peerList).length * 0.51)) {
            this.forked = false;
            this.block = [];
            console.log("Potential fork! Network majority cannot be determined.");
        }
    }

    buildDelegates() {
        return new Promise((res, rej) => {
            this.peerList.forEach(peer => { })
            res();
        })
    }

    buildRound() { }

    returnDelegates(req, res, next) {
        res.json(this.delegates);
    }
}
