const {DualityViewSyntaxType} = require("../../enums/DualityViewSyntaxType");
const {SqlDualityViewDdlCreator} = require("./sqlDualityViewDdlCreator");

class DualityViewDdlCreatorFactory {

    /**
     * @param syntax {string}
     * @throws {Error}
     * @return {AbstractDualityViewFeDdlCreator}
     * */
    static getCreatorInstance(syntax) {
        switch (syntax?.toUpperCase()) {
            case DualityViewSyntaxType.SQL:
                return new SqlDualityViewDdlCreator();
            default:
                throw new Error(`Unknown syntax config: ${syntax}`);
        }
    }

}

module.exports = {
    DualityViewDdlCreatorFactory
}
