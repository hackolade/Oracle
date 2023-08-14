/**
 * @abstract
 * */
class AbstractDualityViewFeDdlCreator {

    /**
     * @throws {Error}
     * */
    constructor() {
        if (this.constructor === AbstractDualityViewFeDdlCreator) {
            throw new Error("Abstract classes can't be instantiated.");
        }
    }

    /**
     * @param view {Object}
     * @return {string}
     * */
    convertDualityViewToDdl(view) {
        throw new Error(`Not implemented`);
    }

}

module.exports = {
    AbstractDualityViewFeDdlCreator
}
