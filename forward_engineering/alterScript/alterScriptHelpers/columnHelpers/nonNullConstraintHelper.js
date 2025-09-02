const _ = require('lodash');
const { AlterScriptDto } = require('../../types/AlterScriptDto');
const { assignTemplates } = require('../../../utils/assignTemplates');
const templates = require('../../../ddlProvider/templates');
const {
	wrapInQuotes,
	getSchemaOfAlterCollection,
	getFullCollectionName,
	prepareNameForScriptFormat,
} = require('../../../utils/general');

/**
 * @param {string} tableName
 * @param {string} columnName
 * @return {string}
 * */
const setNotNullConstraint = (tableName, columnName) => {
	return assignTemplates(templates.addNotNullConstraint, {
		tableName,
		columnName,
	});
};

/**
 * @param {object} params
 * @property {string} [scriptFormat]
 * @property {AlterCollectionDto} collection
 * @return {AlterScriptDto[]}
 * */
const getModifyNonNullColumnsScriptDtos = ({ scriptFormat, collection }) => {
	const prepareName = prepareNameForScriptFormat(scriptFormat);
	const collectionSchema = getSchemaOfAlterCollection(collection);
	const fullTableName = getFullCollectionName(scriptFormat)(collectionSchema);

	const currentRequiredColumnNames = collection.required || [];
	const previousRequiredColumnNames = collection.role.required || [];

	const columnNamesToAddNotNullConstraint = _.difference(currentRequiredColumnNames, previousRequiredColumnNames);
	const columnNamesToRemoveNotNullConstraint = _.difference(previousRequiredColumnNames, currentRequiredColumnNames);

	const addNotNullConstraintsScript = _.toPairs(collection.properties)
		.filter(([name, jsonSchema]) => {
			const oldName = jsonSchema.compMod.oldField.name;
			const shouldRemoveForOldName = columnNamesToRemoveNotNullConstraint.includes(oldName);
			const shouldAddForNewName = columnNamesToAddNotNullConstraint.includes(name);
			return shouldAddForNewName && !shouldRemoveForOldName;
		})
		.map(([columnName]) => setNotNullConstraint(fullTableName, prepareName(columnName)))
		.map(script => AlterScriptDto.getInstance([script], true, false));

	return addNotNullConstraintsScript;
};

module.exports = {
	getModifyNonNullColumnsScriptDtos,
};
