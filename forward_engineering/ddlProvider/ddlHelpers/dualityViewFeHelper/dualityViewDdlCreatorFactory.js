const { DualityViewSyntaxType } = require('../../../enums/DualityViewSyntaxType');
const { SqlDualityViewDdlCreator } = require('./sqlDualityViewDdlCreator');

class DualityViewDdlCreatorFactory {
	/**
	 * @param syntax {string}
	 * @param ddlTemplates {Object}
	 * @param lodash {any}
	 * @param assignTemplates {(template: string, values: Object) => string}
	 * @throws {Error}
	 * @return {AbstractDualityViewFeDdlCreator}
	 * */
	static getCreatorInstance(syntax, { ddlTemplates, assignTemplates, lodash }) {
		switch (syntax?.toUpperCase()) {
			case DualityViewSyntaxType.SQL:
				return new SqlDualityViewDdlCreator(ddlTemplates, assignTemplates, lodash);
			default:
				throw new Error(`Unknown syntax config: ${syntax}`);
		}
	}
}

module.exports = {
	DualityViewDdlCreatorFactory,
};
