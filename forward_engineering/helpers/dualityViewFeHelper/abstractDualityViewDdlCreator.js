/**
 * @abstract
 * */
class AbstractDualityViewFeDdlCreator {

    /**
     * @param ddlTemplates {Object}
     * @param assignTemplates {(template: string, values: Object) => string}
     * @throws {Error}
     * */
    constructor(ddlTemplates, assignTemplates) {
        if (this.constructor === AbstractDualityViewFeDdlCreator) {
            throw new Error("Abstract classes can't be instantiated.");
        }
        this._ddlTemplates = ddlTemplates;
        this._assignTemplates = assignTemplates;
    }

    /**
     * @param view {Object}
     * @return {string}
     * */
    getCreateJsonRelationalDualityViewHeadingDdl(view) {
        const template = this._ddlTemplates?.dualityView?.createJsonRelationalDualityViewHeading || '';

        const orReplaceStatement = '';
        const forceStatement = '';
        const editionableStatement = '';
        const viewName = '';

        const params = {
            orReplaceStatement,
            forceStatement,
            editionableStatement,
            viewName,
        };
        return this._assignTemplates(template, params);
    }

    /**
     * @param view {Object}
     * @return {string}
     * */
    getDualityViewBodyDdl(view) {
        throw new Error(`Not implemented`);
    }

    /**
     * @param view {Object}
     * @return {string}
     * */
    convertDualityViewToDdl(view) {
        const heading = this.getCreateJsonRelationalDualityViewHeadingDdl(view);
        const body = this.getDualityViewBodyDdl(view);
        return heading + '\n' + body;
    }

}

module.exports = {
    AbstractDualityViewFeDdlCreator
}
