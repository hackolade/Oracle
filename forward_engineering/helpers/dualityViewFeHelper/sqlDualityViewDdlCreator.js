const {AbstractDualityViewFeDdlCreator} = require('./abstractDualityViewDdlCreator');


class SqlDualityViewDdlCreator extends AbstractDualityViewFeDdlCreator {

    /**
     * @param ddlTemplates {Object}
     * @param assignTemplates {(template: string, values: Object) => string}
     * @throws {Error}
     * */
    constructor(ddlTemplates, assignTemplates) {
        super(ddlTemplates, assignTemplates);
    }


    convertDualityViewToDdl(view) {
        return '';
    }
}

module.exports = {
    SqlDualityViewDdlCreator,
}
