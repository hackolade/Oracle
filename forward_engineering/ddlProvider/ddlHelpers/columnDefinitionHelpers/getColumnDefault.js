const { isEmpty, isNumber, trim } = require('lodash');

/**
 * @enum
 */
const GENERATED_TYPE = {
	always: 'ALWAYS',
	byDefault: 'BY DEFAULT',
};

/**
 * @typedef {{
 * identityStart?: number;
 * identityIncrement?: number;
 * numberToCache?: number;
 * }} Identity
 *
 * @typedef {{
 * generatedType: GENERATED_TYPE | '';
 * asIdentity?: boolean;
 * generatedOnNull?: boolean;
 * expression?: string;
 * identity?: Identity;
 * }} GeneratedDefaultValue
 */

/**
 *
 * @param {{ type: string; }}
 * @returns {boolean}
 */
const canHaveIdentity = ({ type }) => {
	const typesAllowedToHaveAutoIncrement = ['number'];
	return typesAllowedToHaveAutoIncrement.includes(type.toLowerCase());
};

/**
 * @param {{ onNull: boolean; }}
 * @returns {string}
 */
const getOnNullClause = ({ onNull }) => (onNull ? ' ON NULL' : '');

/**
 * @param {{ generatedType: string; generatedOnNull?: boolean; }}
 * @returns {string}
 */
const getGeneratedClause = ({ generatedType, generatedOnNull }) => {
	if (generatedType === GENERATED_TYPE.byDefault) {
		const onNull = getOnNullClause({ onNull: generatedOnNull });

		return ` GENERATED BY DEFAULT${onNull}`;
	}

	return ' GENERATED ALWAYS';
};

/**
 * @param {{ identityStart?: number; identityIncrement?: number; numberToCache?: number; }}
 * @returns {string}
 */
const getIdentityOptions = ({ identityStart, identityIncrement, numberToCache }) => {
	const startWith = isNumber(identityStart) ? ` START WITH ${identityStart}` : '';
	const incrementBy = isNumber(identityIncrement) ? ` INCREMENT BY ${identityIncrement}` : '';
	const cache = isNumber(numberToCache) ? ` CACHE ${numberToCache}` : ' NOCACHE';

	return trim(`${startWith}${incrementBy}${cache}`);
};

/**
 * @param {{ type: string; default: any; defaultOnNull?: boolean; generatedDefaultValue?: GeneratedDefaultValue }}
 * @returns {string}
 */
const getColumnDefault = ({ type, default: defaultValue, defaultOnNull, generatedDefaultValue = {} }) => {
	const { generatedType, generatedOnNull, asIdentity, identity, expression } = generatedDefaultValue;
	const generatedClause = getGeneratedClause({ generatedType, generatedOnNull });
	const expressionValue = trim(expression);

	if (asIdentity && canHaveIdentity({ type }) && !isEmpty(identity)) {
		const identityOptions = getIdentityOptions(identity);

		return `${generatedClause} AS IDENTITY (${identityOptions})`;
	}

	if (expressionValue) {
		return `${generatedClause} AS (${expressionValue})`;
	}

	if (defaultValue || defaultValue === 0) {
		const onNull = getOnNullClause({ onNull: defaultOnNull });

		return ` DEFAULT${onNull} ${defaultValue}`;
	}

	return '';
};

module.exports = {
	getColumnDefault,
};
