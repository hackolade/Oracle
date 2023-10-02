const {AlterScriptDto} = require("../../types/AlterScriptDto");

/**
 * @return {(collection: Object) => AlterScriptDto[]}
 * */
const getRenameColumnScriptDtos = (_, ddlProvider) => (collection) => {
    const {checkFieldPropertiesChanged, getEntityName, getNamePrefixedWithSchemaName, wrapInQuotes} = require('../../../utils/general')(_);
    const collectionSchema = { ...collection, ...(_.omit(collection?.role, 'properties') || {}) };
    const tableName = getEntityName(collectionSchema);
    const schemaName = collectionSchema.compMod?.keyspaceName;
    const fullName = getNamePrefixedWithSchemaName(tableName, schemaName);

    return _.values(collection.properties)
        .filter(jsonSchema => checkFieldPropertiesChanged(jsonSchema.compMod, ['name']))
        .map(
            jsonSchema => {
                const oldColumnName = wrapInQuotes(jsonSchema.compMod.oldField.name);
                const newColumnName = wrapInQuotes(jsonSchema.compMod.newField.name);
                return ddlProvider.renameColumn(fullName, oldColumnName, newColumnName);
            }
        )
        .map(script => AlterScriptDto.getInstance([script], true, false));
}

module.exports = {
    getRenameColumnScriptDtos
}
