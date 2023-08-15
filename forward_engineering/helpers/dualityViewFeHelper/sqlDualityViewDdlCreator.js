const {AbstractDualityViewFeDdlCreator} = require('./abstractDualityViewDdlCreator');


class SqlDualityViewDdlCreator extends AbstractDualityViewFeDdlCreator {

    /**
     * @param ddlTemplates {Object}
     * @param lodash {any}
     * @param assignTemplates {(template: string, values: Object) => string}
     * @throws {Error}
     * */
    constructor(ddlTemplates, assignTemplates, lodash) {
        super(ddlTemplates, assignTemplates, lodash);
    }


    getDualityViewBodyDdl(view) {
        return '';
    }
}

module.exports = {
    SqlDualityViewDdlCreator,
}
