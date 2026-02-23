const _ = require('lodash');
const { AlterScriptDto } = require('../../types/AlterScriptDto');
const {
	checkFieldPropertiesChanged,
	getEntityName,
	getNamePrefixedWithSchemaNameForScriptFormat,
	prepareNameForScriptFormat,
} = require('../../../utils/general');

/**
 * @return {(collection: Object) => AlterScriptDto[]}
 * */
const getRenameColumnScriptDtos = (ddlProvider, scriptFormat) => collection => {
	const collectionSchema = { ...collection, ...(_.omit(collection?.role, 'properties') || {}) };
	const tableName = getEntityName(collectionSchema);
	const schemaName = collectionSchema.compMod?.keyspaceName;
	const fullName = getNamePrefixedWithSchemaNameForScriptFormat(scriptFormat)(tableName, schemaName);

	return _.values(collection.properties)
		.filter(jsonSchema => checkFieldPropertiesChanged(jsonSchema.compMod, ['name']))
		.map(jsonSchema => {
			const oldColumnName = prepareNameForScriptFormat(scriptFormat)(jsonSchema.compMod.oldField.name);
			const newColumnName = prepareNameForScriptFormat(scriptFormat)(jsonSchema.compMod.newField.name);
			const script = ddlProvider.renameColumn(fullName, oldColumnName, newColumnName);
			return AlterScriptDto.getInstance(script, true, false);
		});
};

module.exports = {
	getRenameColumnScriptDtos,
};
