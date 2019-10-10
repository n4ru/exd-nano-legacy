// DPoS Nano by biz_network
const DPoSNano = require("./nano");
const fs = require("fs");
const cmdArgs = require("command-line-args");

const argDefs = [{
    name: "verbose",
    alias: "v",
    type: Boolean
}]
const options = cmdArgs(argDefs);
const config = { ...require("./config.json"),
    ...options
};

process.on("unhandledRejection", (reason, promise) => console.log(`⚠️  Uncaught | ${reason} ${JSON.stringify(promise)}`));

console.log(fs.readFileSync("art.txt", "utf8"));

const nano = new DPoSNano(config);
nano.start();