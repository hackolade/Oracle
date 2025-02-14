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
const hasLengthChanged = (collection, oldFieldName, currentJsonSchema) => {
	const oldProperty = collection.role.properties[oldFieldName];

	const previousLength = oldProperty?.length;
	const newLength = currentJsonSchema?.length;
	return previousLength !== newLength;
};

/**
 * @return {boolean}
 * */
const hasPrecisionOrScaleChanged = (collection, oldFieldName, currentJsonSchema) => {
	const oldProperty = collection.role.properties[oldFieldName];

	const previousPrecision = oldProperty?.precision;
	const newPrecision = currentJsonSchema?.precision;
	const previousScale = oldProperty?.scale;
	const newScale = currentJsonSchema?.scale;

	return previousPrecision !== newPrecision || previousScale !== newScale;
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
				const isNewLength = hasLengthChanged(collection, oldName, jsonSchema);
				const isNewPrecisionOrScale = hasPrecisionOrScaleChanged(collection, oldName, jsonSchema);
				return isNewLength || isNewPrecisionOrScale;
			}
			return hasTypeChanged;
		})
		.map(([name, jsonSchema]) => {
			const type = _.toUpper(jsonSchema.compMod.newField.mode || jsonSchema.compMod.newField.type);
			const columnName = prepareNameForScriptFormat(scriptFormat)(name);
			return alterColumnType(fullName, columnName, type, jsonSchema);
		})
		.map(script => AlterScriptDto.getInstance([script], true, true));
};

module.exports = {
	getUpdateTypesScriptDtos,
};
