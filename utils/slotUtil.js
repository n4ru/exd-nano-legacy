const constants = require("./constants");

module.exports = class SlotUtil {
    static getEpochStart() {
        return constants.EPOCH_TIME;
    }

    static getEpochTime(time) {
        if(!time)
            time = (new Date()).getTime();
        
        const epochTime = SlotUtil.getEpochStart().getTime();

        return Math.floor((time - epochTime) / 1000);
    }

    static getRealTime(epochTime) {
        if(!epochTime)
            epochTime = SlotUtil.getEpochTime();
        
        const epoch = Math.floor(SlotUtil.getEpochStart() / 1000) * 1000;

        return epoch + epochTime * 1000;
    }

    static getSlotNumber(epochTime) {
        if(!epochTime)
            epochTime = SlotUtil.getEpochTime();
        
        return Math.floor(epochTime / constants.BLOCKTIME);
    }

    //Forging is only allowed during the first half of blocktime
    static isForgingAllowed(epochTime) {
        if(!epochTime)
            epochTime = SlotUtil.getEpochTime();
        
        return Math.floor(epochTime / constants.BLOCKTIME) == Math.floor((epochTime + constants.BLOCKTIME / 2) / constants.BLOCKTIME);
    }

    static getSlotTime(slot) {
        return slot * constants.BLOCKTIME;
    }

    static getNextSlot() {
        return SlotUtil.getSlotNumber() + 1;
    }

    static getLastSlot(nextSlot) {
        return nextSlot + constants.ACTIVE_DELEGATES;
    }

    static roundTime(date) {
        return Math.floor(date.getTime() / 1000) * 1000;
    }
}
