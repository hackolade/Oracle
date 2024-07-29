const { AlterScriptDto } = require('../../types/AlterScriptDto');

// TODO: THIS WILL BE CHANGED TO SUPPORT LENGTH, PRECISION, SCALE TYPE ATTRIBUTES
/**
 * @return {(collection: Object) => AlterScriptDto[]}
 * */
const getUpdateTypesScriptDtos = (_, ddlProvider, scriptFormat) => collection => {
	const {
		checkFieldPropertiesChanged,
		prepareNameForScriptFormat,
		getNamePrefixedWithSchemaNameForScriptFormat,
		getEntityName,
	} = require('../../../utils/general')(_);

	const collectionSchema = { ...collection, ...(_.omit(collection?.role, 'properties') || {}) };
	const tableName = getEntityName(collectionSchema);
	const schemaName = collectionSchema.compMod?.keyspaceName;
	const fullName = getNamePrefixedWithSchemaNameForScriptFormat(scriptFormat)(tableName, schemaName);

	return _.toPairs(collection.properties)
		.filter(([name, jsonSchema]) => checkFieldPropertiesChanged(jsonSchema.compMod, ['type', 'mode']))
		.map(
			([name, jsonSchema]) =>
				`ALTER TABLE ${fullName} MODIFY (${prepareNameForScriptFormat(scriptFormat)(name)} ${_.toUpper(
					jsonSchema.compMod.newField.mode || jsonSchema.compMod.newField.type,
				)});`,
		)
		.map(script => AlterScriptDto.getInstance([script], true, false));
};

module.exports = {
	getUpdateTypesScriptDtos,
};
