const { toPairs } = require('lodash');
const { AlterScriptDto } = require('../../types/AlterScriptDto');
const { AlterCollectionDto } = require('../../types/AlterCollectionDto');
const {
	prepareNameForScriptFormat,
	getSchemaOfAlterCollection,
	getFullCollectionName,
} = require('../../../utils/general');
const { assignTemplates } = require('../../../utils/assignTemplates');
const { getColumnDefault } = require('../../../ddlProvider/ddlHelpers/columnDefinitionHelpers/getColumnDefault');
const templates = require('../../../ddlProvider/templates');

/**
 * @param {object} props
 * @property {string} tableName
 * @property {string} columnName
 * @property {string} defaultValue
 * @return {string}
 * */
const updateColumnDefaultValue = ({ tableName, columnName, defaultValue }) => {
	return assignTemplates(templates.updateColumnDefaultValue, {
		tableName,
		columnName,
		defaultValue,
	});
};

/**
 * @param {object} props
 * @property {string} [scriptFormat]
 * @property {AlterCollectionDto} collection
 * @returns {Array<AlterScriptDto>}
 * */
const getUpdatedDefaultColumnValueScriptDtos = ({ scriptFormat, collection }) => {
	const prepareName = prepareNameForScriptFormat(scriptFormat);
	const collectionSchema = getSchemaOfAlterCollection(collection);
	const fullTableName = getFullCollectionName(scriptFormat)(collectionSchema);

	return toPairs(collection.properties)
		.filter(([_name, jsonSchema]) => {
			const oldName = jsonSchema.compMod.oldField.name;
			const newDefaultValue = getColumnDefault(jsonSchema);
			const oldDefaultValue = getColumnDefault(collection.role.properties[oldName] ?? {});

			return newDefaultValue !== oldDefaultValue;
		})
		.map(([columnName, jsonSchema]) => {
			const scriptGenerationConfig = {
				tableName: fullTableName,
				columnName: prepareName(columnName),
				defaultValue: getColumnDefault(jsonSchema),
			};

			const script = updateColumnDefaultValue(scriptGenerationConfig);
			return AlterScriptDto.getInstance(script, true, false);
		})
		.filter(Boolean);
};

/**
 * @param {object} props
 * @property {string} [scriptFormat]
 * @property {AlterCollectionDto} collection
 * @returns {Array<AlterScriptDto>}
 * */
const getModifiedDefaultColumnValueScriptDtos = ({ scriptFormat, collection }) => {
	const updatedDefaultValuesScriptDtos = getUpdatedDefaultColumnValueScriptDtos({
		scriptFormat,
		collection,
	});

	return [...updatedDefaultValuesScriptDtos];
};

module.exports = {
	getModifiedDefaultColumnValueScriptDtos,
};
