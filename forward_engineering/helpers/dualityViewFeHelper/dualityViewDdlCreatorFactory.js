const {DualityViewSyntaxType} = require("../../enums/DualityViewSyntaxType");
const {SqlDualityViewDdlCreator} = require("./sqlDualityViewDdlCreator");

class DualityViewDdlCreatorFactory {

    /**
     * @param syntax {string}
     * @param ddlTemplates {Object}
     * @param assignTemplates {(template: string, values: Object) => string}
     * @throws {Error}
     * @return {AbstractDualityViewFeDdlCreator}
     * */
    static getCreatorInstance(syntax, {
        ddlTemplates,
        assignTemplates,
    }) {
        switch (syntax?.toUpperCase()) {
            case DualityViewSyntaxType.SQL:
                return new SqlDualityViewDdlCreator(
                    ddlTemplates,
                    assignTemplates,
                );
            default:
                throw new Error(`Unknown syntax config: ${syntax}`);
        }
    }

}

module.exports = {
    DualityViewDdlCreatorFactory
}
