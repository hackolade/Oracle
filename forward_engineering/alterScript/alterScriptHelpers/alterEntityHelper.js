const { AlterScriptDto } = require('../types/AlterScriptDto');
const { getUpdateTypesScriptDtos } = require('./columnHelpers/alterTypeHelper');
const { getRenameColumnScriptDtos } = require('./columnHelpers/renameColumnHelper');
const { getModifyIndexesScriptDtos, getAddedIndexesScriptDtos } = require('./entityHelpers/indexesHelper');
const _ = require('lodash');

/**
 * @return {(collection: AlterCollectionDto) => AlterScriptDto | undefined}
 * */
const getAddCollectionScriptDto =
	({ app, dbVersion, modelDefinitions, internalDefinitions, externalDefinitions, scriptFormat }) =>
	collection => {
		const { getEntityName } = require('../../utils/general')(_);
		const { createColumnDefinitionBySchema } = require('./createColumnDefinition')(app);
		const ddlProvider = require('../../ddlProvider/ddlProvider')(
			null,
			{ dbVersion, targetScriptOptions: { keyword: scriptFormat } },
			app,
		);
		const { getDefinitionByReference } = app.require('@hackolade/ddl-fe-utils');

		const schemaName = collection.compMod.keyspaceName;
		const schemaData = { schemaName, dbVersion };
		const jsonSchema = { ...collection, ...(_.omit(collection?.role, 'properties') || {}) };
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
		const hydratedTable = ddlProvider.hydrateTable({ tableData, entityData: [jsonSchema], jsonSchema });

		const indexesOnNewlyCreatedColumnsScripts = getNewlyCreatedIndexesScripts({
			_,
			ddlProvider,
			collection,
			dbVersion,
		}).flatMap(({ scripts }) => scripts.map(({ script }) => script));
		const script = ddlProvider.createTable(hydratedTable, jsonSchema.isActivated);
		return AlterScriptDto.getInstance([script, ...indexesOnNewlyCreatedColumnsScripts], true, false);
	};

/**
 * @return {(collection: AlterCollectionDto) => AlterScriptDto | undefined}
 * */
const getDeleteCollectionScriptDto = (app, scriptFormat) => collection => {
	const { getEntityName, getNamePrefixedWithSchemaNameForScriptFormat } = require('../../utils/general')(_);

	const jsonData = { ...collection, ...(_.omit(collection?.role, 'properties') || {}) };
	const tableName = getEntityName(jsonData);
	const schemaName = collection.compMod.keyspaceName;
	const fullName = getNamePrefixedWithSchemaNameForScriptFormat(scriptFormat)(tableName, schemaName);

	const script = `DROP TABLE ${fullName};`;
	return AlterScriptDto.getInstance([script], true, true);
};

/**
 * @return {(collection: AlterCollectionDto) => AlterScriptDto[]}
 * */
const getModifyCollectionScriptDtos =
	({ app, dbVersion, scriptFormat }) =>
	collection => {
		const ddlProvider = require('../../ddlProvider/ddlProvider')(
			null,
			{ dbVersion, targetScriptOptions: { keyword: scriptFormat } },
			app,
		);

		const modifyIndexesScriptDtos = getModifyIndexesScriptDtos({ _, ddlProvider, scriptFormat })({ collection });
		return [...modifyIndexesScriptDtos].filter(Boolean);
	};

/**
 * @return {(collection: Object) => AlterScriptDto[]}
 * */
const getAddColumnScriptDtos =
	({ app, dbVersion, modelDefinitions, internalDefinitions, externalDefinitions, scriptFormat }) =>
	collection => {
		const { getEntityName, getNamePrefixedWithSchemaNameForScriptFormat } = require('../../utils/general')(_);
		const { createColumnDefinitionBySchema } = require('./createColumnDefinition')(app);
		const ddlProvider = require('../../ddlProvider/ddlProvider')(
			null,
			{ dbVersion, targetScriptOptions: { keyword: scriptFormat } },
			app,
		);
		const { getDefinitionByReference } = app.require('@hackolade/ddl-fe-utils');

		const collectionSchema = { ...collection, ...(_.omit(collection?.role, 'properties') || {}) };
		const tableName = getEntityName(collectionSchema);
		const schemaName = collectionSchema.compMod?.keyspaceName;
		const fullName = getNamePrefixedWithSchemaNameForScriptFormat(scriptFormat)(tableName, schemaName);
		const schemaData = { schemaName, dbVersion };

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

		const indexesOnNewlyCreatedColumns = getNewlyCreatedIndexesScripts({ _, ddlProvider, collection });
		return scripts.concat(indexesOnNewlyCreatedColumns).filter(Boolean);
	};

/**
 *
 * @return {AlterScriptDto[]}
 * */
const getNewlyCreatedIndexesScripts = ({ _, ddlProvider, collection }) => {
	const newIndexes = collection?.role?.Indxs || [];
	const properties = { ...collection?.properties, ...collection?.role?.properties };
	const propertiesIds = Object.values(properties).map(({ GUID }) => GUID);

	if (newIndexes.length === 0 || propertiesIds.length === 0) {
		return [];
	}

	const doAnyIndexUseNewlyCreatedColumn = newIndexes.some(({ indxKey }) =>
		indxKey.find(({ keyId }) => propertiesIds.includes(keyId)),
	);

	if (!doAnyIndexUseNewlyCreatedColumn) {
		return [];
	}

	return getAddedIndexesScriptDtos({ _, ddlProvider })({ collection });
};

/**
 * @return {(collection: Object) => AlterScriptDto[]}
 * */
const getDeleteColumnScriptDtos = (app, scriptFormat) => collection => {
	const { getEntityName, getNamePrefixedWithSchemaNameForScriptFormat, prepareNameForScriptFormat } =
		require('../../utils/general')(_);
	const collectionSchema = { ...collection, ...(_.omit(collection?.role, 'properties') || {}) };
	const tableName = getEntityName(collectionSchema);
	const schemaName = collectionSchema.compMod?.keyspaceName;
	const fullName = getNamePrefixedWithSchemaNameForScriptFormat(scriptFormat)(tableName, schemaName);

	return _.toPairs(collection.properties)
		.filter(([name, jsonSchema]) => !jsonSchema.compMod)
		.map(([name]) => `ALTER TABLE ${fullName} DROP COLUMN ${prepareNameForScriptFormat(scriptFormat)(name)};`)
		.map(script => AlterScriptDto.getInstance([script], true, true))
		.filter(Boolean);
};

/**
 * @return {(collection: Object) => AlterScriptDto[]}
 * */
const getModifyColumnScriptDtos = (app, dbVersion, scriptFormat) => collection => {
	const ddlProvider = require('../../ddlProvider/ddlProvider')(
		null,
		{ dbVersion, targetScriptOptions: { keyword: scriptFormat } },
		app,
	);

	const renameColumnScriptDtos = getRenameColumnScriptDtos(_, ddlProvider, scriptFormat)(collection);
	const updateTypeScriptDtos = getUpdateTypesScriptDtos(_, ddlProvider, scriptFormat)(collection);

	return [...renameColumnScriptDtos, ...updateTypeScriptDtos].filter(Boolean);
};

module.exports = {
	getAddCollectionScriptDto,
	getDeleteCollectionScriptDto,
	getModifyCollectionScriptDtos,
	getAddColumnScriptDtos,
	getDeleteColumnScriptDtos,
	getModifyColumnScriptDtos,
};
