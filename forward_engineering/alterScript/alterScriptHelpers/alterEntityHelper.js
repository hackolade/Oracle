const {AlterScriptDto} = require("../types/AlterScriptDto");
const {getUpdateTypesScriptDtos} = require("./columnHelpers/alterTypeHelper");
const {getRenameColumnScriptDtos} = require("./columnHelpers/renameColumnHelper");

/**
 * @return {(collection: AlterCollectionDto) => AlterScriptDto | undefined}
 * */
const getAddCollectionScriptDto =
	({ app, dbVersion, modelDefinitions, internalDefinitions, externalDefinitions }) =>
	collection => {
		const _ = app.require('lodash');
		const { getEntityName } = require('../../utils/general')(_);
		const { createColumnDefinitionBySchema } = require('./createColumnDefinition')(app);
		const ddlProvider = require('../../ddlProvider/ddlProvider')(null, null, app);
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

		const script = ddlProvider.createTable(hydratedTable, jsonSchema.isActivated);
		return AlterScriptDto.getInstance([script], true, false);
	};

/**
 * @return {(collection: AlterCollectionDto) => AlterScriptDto | undefined}
 * */
const getDeleteCollectionScriptDto = app => collection => {
	const _ = app.require('lodash');
	const { getEntityName, getNamePrefixedWithSchemaName } = require('../../utils/general')(_);

	const jsonData = { ...collection, ...(_.omit(collection?.role, 'properties') || {}) };
	const tableName = getEntityName(jsonData);
	const schemaName = collection.compMod.keyspaceName;
	const fullName = getNamePrefixedWithSchemaName(tableName, schemaName);

	const script = `DROP TABLE ${fullName};`;
	return AlterScriptDto.getInstance([script], true, true);
};

/**
 * @return {(collection: Object) => AlterScriptDto[]}
 * */
const getAddColumnScriptDtos =
	({ app, dbVersion, modelDefinitions, internalDefinitions, externalDefinitions }) =>
	collection => {
		const _ = app.require('lodash');
		const { getEntityName, getNamePrefixedWithSchemaName } = require('../../utils/general')(_);
		const { createColumnDefinitionBySchema } = require('./createColumnDefinition')(app);
		const ddlProvider = require('../../ddlProvider/ddlProvider')(null, null, app);
		const { getDefinitionByReference } = app.require('@hackolade/ddl-fe-utils');

		const collectionSchema = { ...collection, ...(_.omit(collection?.role, 'properties') || {}) };
		const tableName = getEntityName(collectionSchema);
		const schemaName = collectionSchema.compMod?.keyspaceName;
		const fullName = getNamePrefixedWithSchemaName(tableName, schemaName);
		const schemaData = { schemaName, dbVersion };

		return _.toPairs(collection.properties)
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
	};

/**
 * @return {(collection: Object) => AlterScriptDto[]}
 * */
const getDeleteColumnScriptDtos = app => collection => {
	const _ = app.require('lodash');
	const { getEntityName, getNamePrefixedWithSchemaName, wrapInQuotes } = require('../../utils/general')(_);
	const collectionSchema = { ...collection, ...(_.omit(collection?.role, 'properties') || {}) };
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
const getModifyColumnScriptDtos = app => collection => {
	const _ = app.require('lodash');
	const ddlProvider = require('../../ddlProvider/ddlProvider')(null, null, app);

	const renameColumnScriptDtos = getRenameColumnScriptDtos(_, ddlProvider)(collection);
	const updateTypeScriptDtos = getUpdateTypesScriptDtos(_, ddlProvider)(collection);

	return [
		...renameColumnScriptDtos,
		...updateTypeScriptDtos,
	].filter(Boolean);};

module.exports = {
	getAddCollectionScriptDto,
	getDeleteCollectionScriptDto,
	getAddColumnScriptDtos,
	getDeleteColumnScriptDtos,
	getModifyColumnScriptDtos,
};
