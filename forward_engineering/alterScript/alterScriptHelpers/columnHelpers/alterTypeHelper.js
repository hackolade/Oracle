const _ = require('lodash');
const { AlterScriptDto } = require('../../types/AlterScriptDto');
const {
	checkFieldPropertiesChanged,
	prepareNameForScriptFormat,
	getNamePrefixedWithSchemaNameForScriptFormat,
	getEntityName,
} = require('../../../utils/general');
const { assignTemplates } = require('../../../utils/assignTemplates');
const templates = require('../../../ddlProvider/templates');
const { decorateType } = require('../../../ddlProvider/ddlHelpers/columnDefinitionHelpers/decorateType');

/**
 * @param {string} tableName
 * @param {string} columnName
 * @param {string} type
 * @param {object} columnDefinition
 * @return string
 * */
const alterColumnType = (tableName, columnName, type, columnDefinition) => {
	const decoratedType = decorateType(type, columnDefinition);

	return assignTemplates(templates.alterColumn, {
		tableName,
		columnName,
		dataType: decoratedType,
	});
};

/**
 * @return {boolean}
 * */
const haveTypeRelatedPropertiesChanged = (collection, oldFieldName, currentJsonSchema) => {
	const oldProperty = collection.role.properties[oldFieldName];

	const oldLength = oldProperty?.length;
	const newLength = currentJsonSchema?.length;

	const oldPrecision = oldProperty?.precision;
	const newPrecision = currentJsonSchema?.precision;

	const oldScale = oldProperty?.scale;
	const newScale = currentJsonSchema?.scale;

	const oldFractSecPrecision = oldProperty?.fractSecPrecision;
	const newFractSecPrecision = currentJsonSchema?.fractSecPrecision;

	const oldWithTimeZone = oldProperty?.withTimeZone;
	const newWithTimeZone = currentJsonSchema?.withTimeZone;

	const oldLocalTimeZone = oldProperty?.localTimeZone;
	const newLocalTimeZone = currentJsonSchema?.localTimeZone;

	const oldYearPrecision = oldProperty?.yearPrecision;
	const newYearPrecision = currentJsonSchema?.yearPrecision;

	const oldDayPrecision = oldProperty?.dayPrecision;
	const newDayPrecision = currentJsonSchema?.dayPrecision;

	return (
		oldLength !== newLength ||
		oldPrecision !== newPrecision ||
		oldScale !== newScale ||
		oldFractSecPrecision !== newFractSecPrecision ||
		oldWithTimeZone !== newWithTimeZone ||
		oldLocalTimeZone !== newLocalTimeZone ||
		oldYearPrecision !== newYearPrecision ||
		oldDayPrecision !== newDayPrecision
	);
};

/**
 * @param {Object} ddlProvider
 * @param {string} scriptFormat
 * @return {(collection: Object) => AlterScriptDto[]}
 * */
const getUpdateTypesScriptDtos = (ddlProvider, scriptFormat) => collection => {
	const collectionSchema = { ...collection, ...(_.omit(collection?.role, 'properties') || {}) };
	const tableName = getEntityName(collectionSchema);
	const schemaName = collectionSchema.compMod?.keyspaceName;
	const fullName = getNamePrefixedWithSchemaNameForScriptFormat(scriptFormat)(tableName, schemaName);

	return _.toPairs(collection.properties)
		.filter(([name, jsonSchema]) => {
			const hasTypeChanged = checkFieldPropertiesChanged(jsonSchema.compMod, ['type', 'mode']);
			if (!hasTypeChanged) {
				const oldName = jsonSchema.compMod.oldField.name;
				return haveTypeRelatedPropertiesChanged(collection, oldName, jsonSchema);
			}
			return hasTypeChanged;
		})
		.map(([name, jsonSchema]) => {
			const type = _.toUpper(jsonSchema.compMod.newField.mode || jsonSchema.compMod.newField.type);
			const columnName = prepareNameForScriptFormat(scriptFormat)(name);
			const script = alterColumnType(fullName, columnName, type, jsonSchema);
			return AlterScriptDto.getInstance(script, true, true);
		});
};

module.exports = {
	getUpdateTypesScriptDtos,
};
