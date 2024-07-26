const { AlterScriptDto } = require('../../types/AlterScriptDto');

/**
 * @return {(collection: Object) => AlterScriptDto[]}
 * */
const getRenameColumnScriptDtos = (_, ddlProvider, scriptFormat) => collection => {
	const {
		checkFieldPropertiesChanged,
		getEntityName,
		getNamePrefixedWithSchemaNameForScriptFormat,
		prepareNameForScriptFormat,
	} = require('../../../utils/general')(_);
	const collectionSchema = { ...collection, ...(_.omit(collection?.role, 'properties') || {}) };
	const tableName = getEntityName(collectionSchema);
	const schemaName = collectionSchema.compMod?.keyspaceName;
	const fullName = getNamePrefixedWithSchemaNameForScriptFormat(scriptFormat)(tableName, schemaName);

	return _.values(collection.properties)
		.filter(jsonSchema => checkFieldPropertiesChanged(jsonSchema.compMod, ['name']))
		.map(jsonSchema => {
			const oldColumnName = prepareNameForScriptFormat(scriptFormat)(jsonSchema.compMod.oldField.name);
			const newColumnName = prepareNameForScriptFormat(scriptFormat)(jsonSchema.compMod.newField.name);
			return ddlProvider.renameColumn(fullName, oldColumnName, newColumnName);
		})
		.map(script => AlterScriptDto.getInstance([script], true, false));
};

module.exports = {
	getRenameColumnScriptDtos,
};
