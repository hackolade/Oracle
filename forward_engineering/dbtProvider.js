/**
 * @typedef {import('./types').ColumnDefinition} ColumnDefinition
 * @typedef {import('./types').JsonSchema} JsonSchema
 * @typedef {import('./types').ConstraintDto} ConstraintDto
 */
const { toLower, toUpper } = require('lodash');

const types = require('./configs/descriptors');
const defaultTypes = require('./configs/defaultTypes');
const { decorateType } = require('./ddlProvider/ddlHelpers/columnDefinitionHelpers/decorateType');
const getKeyHelper = require('./ddlProvider/ddlHelpers/keyHelper');

class DbtProvider {
	/**
	 * @returns {DbtProvider}
	 */
	static createDbtProvider() {
		return new DbtProvider();
	}

	/**
	 * @param {string} type
	 * @returns {string | undefined}
	 */
	getDefaultType(type) {
		return defaultTypes[type];
	}

	/**
	 * @returns {Record<string, object>}
	 */
	getTypesDescriptors() {
		return types;
	}

	/**
	 * @param {string} type
	 * @returns {boolean}
	 */
	hasType(type) {
		return Object.keys(types).map(toLower).includes(toLower(type));
	}

	/**
	 * @param {{ columnDefinition: ColumnDefinition }}
	 * @returns {string}
	 */
	decorateType({ columnDefinition }) {
		const type = toUpper(columnDefinition.mode || columnDefinition.childType || columnDefinition.type);
		const dataType = decorateType(type, columnDefinition);

		return dataType.trim();
	}

	/**
	 * @param {{ jsonSchema: JsonSchema }}
	 * @returns {ConstraintDto[]}
	 */
	getCompositeKeyConstraints({ jsonSchema }) {
		const keyHelper = getKeyHelper(value => value);

		return keyHelper.getCompositeKeyConstraints({ jsonSchema });
	}

	/**
	 * @param {{ columnDefinition: ColumnDefinition }}
	 * @returns {ConstraintDto[]}
	 */
	getColumnConstraints({ columnDefinition }) {
		const keyHelper = getKeyHelper(value => value);

		return keyHelper.getColumnConstraints({ columnDefinition });
	}
}

module.exports = DbtProvider;
