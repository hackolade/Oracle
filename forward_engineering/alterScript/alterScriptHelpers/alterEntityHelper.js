const {AlterScriptDto} = require("../types/AlterScriptDto");
const {getUpdateTypesScriptDtos} = require("./columnHelpers/alterTypeHelper");
const {getRenameColumnScriptDtos} = require("./columnHelpers/renameColumnHelper");
const { getModifyIndexesScriptDtos } = require("./entityHelpers/indexesHelper");

/**
 * @return {(collection: AlterCollectionDto) => AlterScriptDto | undefined}
 * */
const getAddCollectionScriptDto =
    ({app, dbVersion, modelDefinitions, internalDefinitions, externalDefinitions}) =>
        collection => {
            const _ = app.require('lodash');
            const {getEntityName} = require('../../utils/general')(_);
            const {createColumnDefinitionBySchema} = require('./createColumnDefinition')(app);
            const ddlProvider = require('../../ddlProvider/ddlProvider')(null, { dbVersion }, app);
            const {getDefinitionByReference} = app.require('@hackolade/ddl-fe-utils');

            const schemaName = collection.compMod.keyspaceName;
            const schemaData = {schemaName, dbVersion};
            const jsonSchema = {...collection, ...(_.omit(collection?.role, 'properties') || {})};
            const columnDefinitions = _.toPairs(jsonSchema.properties).map(([name, column]) => {
                const definitionJsonSchema = getDefinitionByReference({
                    propertySchema: column,
                    modelDefinitions,
                    internalDefinitions,
                    externalDefinitions,
                });

                return createColumnDefinitionBySchema({
                    name,
                    jsonSchema: column,
                    parentJsonSchema: jsonSchema,
                    ddlProvider,
                    schemaData,
                    definitionJsonSchema,
                });
            });
            const checkConstraints = (jsonSchema.chkConstr || []).map(check =>
                ddlProvider.createCheckConstraint(ddlProvider.hydrateCheckConstraint(check)),
            );
            const tableData = {
                name: getEntityName(jsonSchema),
                columns: columnDefinitions.map(data => ddlProvider.convertColumnDefinition(data)),
                checkConstraints: checkConstraints,
                foreignKeyConstraints: [],
                schemaData,
                columnDefinitions,
            };
            const hydratedTable = ddlProvider.hydrateTable({tableData, entityData: [jsonSchema], jsonSchema});

            const indexesOnNewlyCreatedColumnsScripts = getIndexesBasedOnNewlyCreatedColumnsScript({_, ddlProvider, collection, dbVersion}).flatMap(({scripts}) => scripts.map(({script}) => script))
            const script = ddlProvider.createTable(hydratedTable, jsonSchema.isActivated);
            return AlterScriptDto.getInstance([script, ...indexesOnNewlyCreatedColumnsScripts], true, false)
        };

/**
 * @return {(collection: AlterCollectionDto) => AlterScriptDto | undefined}
 * */
const getDeleteCollectionScriptDto = app => collection => {
    const _ = app.require('lodash');
    const {getEntityName, getNamePrefixedWithSchemaName} = require('../../utils/general')(_);

    const jsonData = {...collection, ...(_.omit(collection?.role, 'properties') || {})};
    const tableName = getEntityName(jsonData);
    const schemaName = collection.compMod.keyspaceName;
    const fullName = getNamePrefixedWithSchemaName(tableName, schemaName);

    const script = `DROP TABLE ${fullName};`;
    return AlterScriptDto.getInstance([script], true, true);
};

/**
 * @return {(collection: AlterCollectionDto) => AlterScriptDto[]}
 * */
const getModifyCollectionScriptDtos = ({ app, dbVersion }) => collection => {
		const _ = app.require('lodash');
		const ddlProvider = require('../../ddlProvider/ddlProvider')(null, { dbVersion }, app);

		const modifyIndexesScriptDtos = getModifyIndexesScriptDtos({ _, ddlProvider })({ collection });
		return [...modifyIndexesScriptDtos].filter(Boolean);
	};

/**
 * @return {(collection: Object) => AlterScriptDto[]}
 * */
const getAddColumnScriptDtos =
    ({app, dbVersion, modelDefinitions, internalDefinitions, externalDefinitions}) =>
        collection => {
            const _ = app.require('lodash');
            const {getEntityName, getNamePrefixedWithSchemaName} = require('../../utils/general')(_);
            const {createColumnDefinitionBySchema} = require('./createColumnDefinition')(app);
            const ddlProvider = require('../../ddlProvider/ddlProvider')(null, { dbVersion }, app);
            const {getDefinitionByReference} = app.require('@hackolade/ddl-fe-utils');

            const collectionSchema = {...collection, ...(_.omit(collection?.role, 'properties') || {})};
            const tableName = getEntityName(collectionSchema);
            const schemaName = collectionSchema.compMod?.keyspaceName;
            const fullName = getNamePrefixedWithSchemaName(tableName, schemaName);
            const schemaData = {schemaName, dbVersion};

            const scripts = _.toPairs(collection.properties)
                .filter(([name, jsonSchema]) => !jsonSchema.compMod)
                .map(([name, jsonSchema]) => {
                    const definitionJsonSchema = getDefinitionByReference({
                        propertySchema: jsonSchema,
                        modelDefinitions,
                        internalDefinitions,
                        externalDefinitions,
                    });

                    return createColumnDefinitionBySchema({
                        name,
                        jsonSchema,
                        parentJsonSchema: collectionSchema,
                        ddlProvider,
                        schemaData,
                        definitionJsonSchema,
                    });
                })
                .map(data => ddlProvider.convertColumnDefinition(data))
                .map(script => `ALTER TABLE ${fullName} ADD (${script});`)
                .map(script => AlterScriptDto.getInstance([script], true, false))
                .filter(Boolean);

            const indexesOnNewlyCreatedColumns = getIndexesBasedOnNewlyCreatedColumnsScript({_, ddlProvider, collection})
            return scripts.concat(indexesOnNewlyCreatedColumns).filter(Boolean)
        };

/**
 * 
 * @return {AlterScriptDto[]}
 * */
const getIndexesBasedOnNewlyCreatedColumnsScript = ({_, ddlProvider, dbVersion, collection}) => {
    const newIndexes = collection?.role?.compMod?.Indxs?.new || collection?.role?.Indxs || []
    const newPropertiesIds = Object.values(collection?.properties).map(({GUID}) => GUID)

    if (newIndexes.length === 0 || newPropertiesIds.length === 0) {
        return []
    }

    const doAnyIndexUseNewlyCreatedColumn = newIndexes.some(({indxKey}) => indxKey.find(({keyId}) => newPropertiesIds.includes(keyId)))

    if (!doAnyIndexUseNewlyCreatedColumn) {
        return []
    }

    return getModifyIndexesScriptDtos({ _, ddlProvider })({ collection, dbVersion })
}

/**
 * @return {(collection: Object) => AlterScriptDto[]}
 * */
const getDeleteColumnScriptDtos = app => collection => {
    const _ = app.require('lodash');
    const {getEntityName, getNamePrefixedWithSchemaName, wrapInQuotes} = require('../../utils/general')(_);
    const collectionSchema = {...collection, ...(_.omit(collection?.role, 'properties') || {})};
    const tableName = getEntityName(collectionSchema);
    const schemaName = collectionSchema.compMod?.keyspaceName;
    const fullName = getNamePrefixedWithSchemaName(tableName, schemaName);

    return _.toPairs(collection.properties)
        .filter(([name, jsonSchema]) => !jsonSchema.compMod)
        .map(([name]) => `ALTER TABLE ${fullName} DROP COLUMN ${wrapInQuotes(name)};`)
        .map(script => AlterScriptDto.getInstance([script], true, true))
        .filter(Boolean);
};

/**
 * @return {(collection: Object) => AlterScriptDto[]}
 * */
const getModifyColumnScriptDtos = (app, dbVersion) => collection => {
    const _ = app.require('lodash');
    const ddlProvider = require('../../ddlProvider/ddlProvider')(null, { dbVersion }, app);

    const renameColumnScriptDtos = getRenameColumnScriptDtos(_, ddlProvider)(collection);
    const updateTypeScriptDtos = getUpdateTypesScriptDtos(_, ddlProvider)(collection);

    return [
        ...renameColumnScriptDtos,
        ...updateTypeScriptDtos,
    ].filter(Boolean);
};

module.exports = {
    getAddCollectionScriptDto,
    getDeleteCollectionScriptDto,
    getModifyCollectionScriptDtos,
    getAddColumnScriptDtos,
    getDeleteColumnScriptDtos,
    getModifyColumnScriptDtos,
};
