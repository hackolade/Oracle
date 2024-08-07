const { checkFieldPropertiesChanged } = require('../../utils/general')();
const templates = require('../../ddlProvider/templates');
const { AlterScriptDto } = require('../types/AlterScriptDto');
const _ = require('lodash');

/**
 * @return {(jsonSchema: Object) => AlterScriptDto |  undefined}
 * */
const getCreateUdtScriptDto =
	({ app, dbVersion, modelDefinitions, internalDefinitions, externalDefinitions, scriptFormat }) =>
	jsonSchema => {
		const { createColumnDefinitionBySchema } = require('./createColumnDefinition')(app);
		const ddlProvider = require('../../ddlProvider/ddlProvider')(
			null,
			{ dbVersion, targetScriptOptions: { keyword: scriptFormat } },
			app,
		);
		const { getDefinitionByReference } = app.require('@hackolade/ddl-fe-utils');

		const schemaData = { dbVersion };

		const columnDefinitions = _.toPairs(jsonSchema.properties || {}).map(([name, column]) => {
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

		const updatedUdt = createColumnDefinitionBySchema({
			name: jsonSchema.code || jsonSchema.name,
			jsonSchema: jsonSchema,
			parentJsonSchema: { required: [] },
			definitionJsonSchema: {},
			ddlProvider,
			schemaData,
		});

		const udt = { ...updatedUdt, properties: columnDefinitions };
		const script = ddlProvider.createUdt(udt);
		return AlterScriptDto.getInstance([script], true, false);
	};

/**
 * @return {(udt: Object) => AlterScriptDto | undefined}
 * */
const getDeleteUdtScriptDto = (app, scriptFormat) => udt => {
	const { prepareNameForScriptFormat } = require('../../utils/general')(_);

	const ddlUdtName = prepareNameForScriptFormat(scriptFormat)(udt.code || udt.name);
	const dropUdtScript = `DROP TYPE ${ddlUdtName};`;
	return AlterScriptDto.getInstance([dropUdtScript], true, true);
};

/**
 * @return {(udt: Object) => AlterScriptDto[]}
 * */
const getAddColumnToTypeScriptDtos =
	({ app, dbVersion, modelDefinitions, internalDefinitions, externalDefinitions, scriptFormat }) =>
	udt => {
		const { createColumnDefinitionBySchema } = require('./createColumnDefinition')(app);
		const { prepareNameForScriptFormat } = require('../../utils/general')(_);
		const ddlProvider = require('../../ddlProvider/ddlProvider')(
			null,
			{ dbVersion, targetScriptOptions: { keyword: scriptFormat } },
			app,
		);
		const { getDefinitionByReference } = app.require('@hackolade/ddl-fe-utils');

		const fullName = prepareNameForScriptFormat(scriptFormat)(udt.code || udt.name);
		const schemaData = { dbVersion };

		return _.toPairs(udt.properties)
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
					parentJsonSchema: { required: [] },
					ddlProvider,
					schemaData,
					definitionJsonSchema,
				});
			})
			.map(data => ddlProvider.convertColumnDefinition(data, templates.objectTypeColumnDefinition))
			.map(script => `ALTER TYPE ${fullName} ADD ATTRIBUTE ${script};`)
			.map(script => AlterScriptDto.getInstance([script], true, false));
	};

/**
 * @return {(udt: Object) => AlterScriptDto[]}
 * */
const getDeleteColumnFromTypeScriptDtos = (app, scriptFormat) => udt => {
	const { prepareNameForScriptFormat } = require('../../utils/general')(_);

	const fullName = prepareNameForScriptFormat(scriptFormat)(udt.code || udt.name);

	return _.toPairs(udt.properties)
		.filter(([name, jsonSchema]) => !jsonSchema.compMod)
		.map(([name]) => `ALTER TYPE ${fullName} DROP ATTRIBUTE ${prepareNameForScriptFormat(scriptFormat)(name)};`)
		.map(script => AlterScriptDto.getInstance([script], true, true));
};

/**
 * @return {(udt: Object) => AlterScriptDto[]}
 * */
const getModifyColumnOfTypeScriptDtos = (app, scriptFormat) => udt => {
	const { prepareNameForScriptFormat } = require('../../utils/general')(_);

	const fullName = prepareNameForScriptFormat(scriptFormat)(udt.code || udt.name);

	/**
	 * @type {AlterScriptDto[]}
	 * */
	const renameColumnScripts = _.values(udt.properties)
		.filter(jsonSchema => checkFieldPropertiesChanged(jsonSchema.compMod, ['name']))
		.flatMap(jsonSchema => {
			const oldDdlName = prepareNameForScriptFormat(scriptFormat)(jsonSchema.compMod.oldField.name);
			const dropAttributeScript = `ALTER TYPE ${fullName} DROP ATTRIBUTE ${oldDdlName};`;

			const newDdlName = prepareNameForScriptFormat(scriptFormat)(jsonSchema.compMod.newField.name);
			const createAttributeScript = `ALTER TYPE ${fullName} ADD ATTRIBUTE ${newDdlName};`;

			return [
				AlterScriptDto.getInstance([dropAttributeScript], true, true),
				AlterScriptDto.getInstance([createAttributeScript], true, false),
			];
		});

	/**
	 * @type {AlterScriptDto[]}
	 * */
	const changeTypeScripts = _.toPairs(udt.properties)
		.filter(([name, jsonSchema]) => checkFieldPropertiesChanged(jsonSchema.compMod, ['type', 'mode']))
		.map(([name, jsonSchema]) => {
			const ddlAttributeName = prepareNameForScriptFormat(scriptFormat)(name);
			const ddlType = _.toUpper(jsonSchema.compMod.newField.mode || jsonSchema.compMod.newField.type);
			const script = `ALTER TYPE ${fullName} MODIFY ATTRIBUTE ${ddlAttributeName} ${ddlType};`;
			return AlterScriptDto.getInstance([script], true, false);
		});

	return [...renameColumnScripts, ...changeTypeScripts];
};

module.exports = {
	getCreateUdtScriptDto,
	getDeleteUdtScriptDto,
	getAddColumnToTypeScriptDtos,
	getDeleteColumnFromTypeScriptDtos,
	getModifyColumnOfTypeScriptDtos,
};
