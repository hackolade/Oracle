const { getAddContainerScriptDto, getDeleteContainerScriptDto } = require('./alterScriptHelpers/alterContainerHelper');
const {
	getAddCollectionScriptDto,
	getDeleteCollectionScriptDto,
	getModifyCollectionScriptDtos,
	getAddColumnScriptDtos,
	getDeleteColumnScriptDtos,
	getModifyColumnScriptDtos,
} = require('./alterScriptHelpers/alterEntityHelper');
const {
	getDeleteUdtScriptDto,
	getCreateUdtScriptDto,
	getAddColumnToTypeScriptDtos,
	getDeleteColumnFromTypeScriptDtos,
	getModifyColumnOfTypeScriptDtos,
} = require('./alterScriptHelpers/alterUdtHelper');
const { getAddViewScriptDto, getDeleteViewScriptDto } = require('./alterScriptHelpers/alterViewHelper');
const {
	getModifyForeignKeyScriptDtos,
	getDeleteForeignKeyScriptDtos,
	getAddForeignKeyScriptDtos,
} = require('./alterScriptHelpers/alterRelationshipsHelper');
const { AlterScriptDto, ModificationScript } = require('./types/AlterScriptDto');
const { App, CoreData } = require('../types/coreApplicationTypes');
const { InternalDefinitions, ModelDefinitions, ExternalDefinitions } = require('../types/coreApplicationDataTypes');
const {
	getModifyContainerSequencesScriptDtos,
	getDeleteContainerSequencesScriptDtos,
	getAddContainerSequencesScriptDtos,
} = require('./alterScriptHelpers/containerHelpers/alterSequenceHelper');
const _ = require('lodash');

/**
 * @param dto {{
 *     collection: Object,
 *     app: App,
 *	   scriptFormat: string,
 * }}
 * @return {AlterScriptDto[]}
 * */
const getAlterContainersScriptDtos = ({ collection, app, scriptFormat }) => {
	const addedContainers = collection.properties?.containers?.properties?.added?.items;
	const deletedContainers = collection.properties?.containers?.properties?.deleted?.items;

	const addContainersScriptDtos = []
		.concat(addedContainers)
		.filter(Boolean)
		.map(container => getAddContainerScriptDto(app, scriptFormat)(Object.keys(container.properties)[0]));
	const deleteContainersScriptDtos = []
		.concat(deletedContainers)
		.filter(Boolean)
		.map(container => getDeleteContainerScriptDto(app, scriptFormat)(Object.keys(container.properties)[0]));

	return [...addContainersScriptDtos, ...deleteContainersScriptDtos].filter(Boolean);
};

/**
 * @param dto {{
 *     collection: Object,
 *     app: App,
 *     dbVersion: string,
 *     modelDefinitions: ModelDefinitions,
 *     internalDefinitions: InternalDefinitions,
 *     externalDefinitions: ExternalDefinitions,
 *     scriptFormat: string,
 * }}
 * @return {AlterScriptDto[]}
 * */
const getAlterCollectionsScriptDtos = ({
	collection,
	app,
	dbVersion,
	modelDefinitions,
	internalDefinitions,
	externalDefinitions,
	scriptFormat,
}) => {
	const createScriptsData = []
		.concat(collection.properties?.entities?.properties?.added?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0]);

	const deleteScriptsData = []
		.concat(collection.properties?.entities?.properties?.deleted?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0]);

	const modifyScriptsData = []
		.concat(collection.properties?.entities?.properties?.modified?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0]);

	const createCollectionsScriptDtos = createScriptsData
		.filter(collection => collection.compMod?.created)
		.map(
			getAddCollectionScriptDto({
				app,
				dbVersion,
				modelDefinitions,
				internalDefinitions,
				externalDefinitions,
				scriptFormat,
			}),
		);
	const deleteCollectionScriptDtos = deleteScriptsData
		.filter(collection => collection.compMod?.deleted)
		.map(getDeleteCollectionScriptDto(app, scriptFormat));
	const modifyCollectionScriptDtos = modifyScriptsData
		.filter(collection => collection.compMod?.modified)
		.flatMap(getModifyCollectionScriptDtos({ app, dbVersion, scriptFormat }));
	const addColumnScriptDtos = createScriptsData
		.filter(item => !item?.compMod?.created)
		.flatMap(
			getAddColumnScriptDtos({
				app,
				dbVersion,
				modelDefinitions,
				internalDefinitions,
				externalDefinitions,
				scriptFormat,
			}),
		);
	const deleteColumnScriptDtos = deleteScriptsData
		.filter(item => !item?.compMod?.deleted)
		.flatMap(getDeleteColumnScriptDtos(app, scriptFormat));
	const modifyColumnScriptDtos = modifyScriptsData.flatMap(getModifyColumnScriptDtos(app, dbVersion, scriptFormat));

	return [
		...createCollectionsScriptDtos,
		...deleteCollectionScriptDtos,
		...modifyCollectionScriptDtos,
		...addColumnScriptDtos,
		...deleteColumnScriptDtos,
		...modifyColumnScriptDtos,
	].filter(Boolean);
};

/**
 * @param collection {Object}
 * @param app {App}
 * @param dbVersion {string}
 * @param scriptFormat {string}
 * @return {AlterScriptDto[]}
 * */
const getAlterViewScriptDtos = (collection, app, dbVersion, scriptFormat) => {
	const createViewsScriptDtos = []
		.concat(collection.properties?.views?.properties?.added?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0])
		.map(view => ({ ...view, ...(view.role || {}) }))
		.filter(view => view.compMod?.created)
		.map(getAddViewScriptDto(app, scriptFormat));

	const deleteViewsScriptDtos = []
		.concat(collection.properties?.views?.properties?.deleted?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0])
		.map(view => ({ ...view, ...(view.role || {}) }))
		.map(getDeleteViewScriptDto(app, scriptFormat));

	return [...deleteViewsScriptDtos, ...createViewsScriptDtos].filter(Boolean);
};

/**
 * @param dto {{
 *     collection: Object,
 *     app: App,
 *     dbVersion: string,
 *     modelDefinitions: ModelDefinitions,
 *     internalDefinitions: InternalDefinitions,
 *     externalDefinitions: ExternalDefinitions,
 * }}
 * @return {AlterScriptDto[]}
 * */
const getAlterModelDefinitionsScriptDtos = ({
	collection,
	app,
	dbVersion,
	modelDefinitions,
	internalDefinitions,
	externalDefinitions,
	scriptFormat,
}) => {
	const createUdtScriptDtos = []
		.concat(collection.properties?.modelDefinitions?.properties?.added?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0])
		.map(item => ({ ...item, ...(_.omit(item.role, 'properties') || {}) }))
		.filter(item => item.compMod?.created)
		.map(
			getCreateUdtScriptDto({
				app,
				dbVersion,
				modelDefinitions,
				internalDefinitions,
				externalDefinitions,
				scriptFormat,
			}),
		);
	const deleteUdtScriptDtos = []
		.concat(collection.properties?.modelDefinitions?.properties?.deleted?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0])
		.map(item => ({ ...item, ...(_.omit(item.role, 'properties') || {}) }))
		.filter(collection => collection.compMod?.deleted)
		.map(getDeleteUdtScriptDto(app, scriptFormat));
	const addColumnScriptDtos = []
		.concat(collection.properties?.modelDefinitions?.properties?.added?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0])
		.filter(item => !item.compMod)
		.map(item => ({ ...item, ...(_.omit(item.role, 'properties') || {}) }))
		.filter(item => item.childType === 'object_udt')
		.flatMap(
			getAddColumnToTypeScriptDtos({
				app,
				dbVersion,
				modelDefinitions,
				internalDefinitions,
				externalDefinitions,
				scriptFormat,
			}),
		);
	const deleteColumnScriptDtos = []
		.concat(collection.properties?.modelDefinitions?.properties?.deleted?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0])
		.filter(item => !item.compMod)
		.map(item => ({ ...item, ...(_.omit(item.role, 'properties') || {}) }))
		.filter(item => item.childType === 'object_udt')
		.flatMap(getDeleteColumnFromTypeScriptDtos(app, scriptFormat));

	const modifyColumnScriptDtos = []
		.concat(collection.properties?.modelDefinitions?.properties?.modified?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0])
		.filter(item => !item.compMod)
		.map(item => ({ ...item, ...(_.omit(item.role, 'properties') || {}) }))
		.filter(item => item.childType === 'object_udt')
		.flatMap(getModifyColumnOfTypeScriptDtos(app, scriptFormat));

	return [
		...deleteUdtScriptDtos,
		...createUdtScriptDtos,
		...addColumnScriptDtos,
		...deleteColumnScriptDtos,
		...modifyColumnScriptDtos,
	].filter(Boolean);
};

/**
 * @return Array<AlterScriptDto>
 * */
const getAlterRelationshipsScriptDtos = ({ collection, app, scriptFormat }) => {
	const ddlProvider = require('../ddlProvider/ddlProvider')(
		null,
		{ targetScriptOptions: { keyword: scriptFormat } },
		app,
	);

	const addedRelationships = []
		.concat(collection.properties?.relationships?.properties?.added?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0])
		.filter(relationship => relationship?.role?.compMod?.created);

	const deletedRelationships = []
		.concat(collection.properties?.relationships?.properties?.deleted?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0])
		.filter(relationship => relationship?.role?.compMod?.deleted);

	const modifiedRelationships = []
		.concat(collection.properties?.relationships?.properties?.modified?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0])
		.filter(relationship => relationship?.role?.compMod?.modified);

	const deleteFkScriptDtos = getDeleteForeignKeyScriptDtos(ddlProvider, _, scriptFormat)(deletedRelationships);
	const addFkScriptDtos = getAddForeignKeyScriptDtos(ddlProvider, _)(addedRelationships);
	const modifiedFkScriptDtos = getModifyForeignKeyScriptDtos(ddlProvider, _, scriptFormat)(modifiedRelationships);

	return [...deleteFkScriptDtos, ...addFkScriptDtos, ...modifiedFkScriptDtos].filter(Boolean);
};

/**
 * @param dto {AlterScriptDto}
 * @return {AlterScriptDto | undefined}
 */
const prettifyAlterScriptDto = dto => {
	if (!dto) {
		return undefined;
	}
	/**
	 * @type {Array<ModificationScript>}
	 * */
	const nonEmptyScriptModificationDtos = dto.scripts
		.map(scriptDto => ({
			...scriptDto,
			script: (scriptDto.script || '').trim(),
		}))
		.filter(scriptDto => Boolean(scriptDto.script));
	if (!nonEmptyScriptModificationDtos.length) {
		return undefined;
	}
	return {
		...dto,
		scripts: nonEmptyScriptModificationDtos,
	};
};

/**
 * @param {{
 * collection: Object,
 * app: App,
 * dbVersion: string,
 * }} dto
 * @return {AlterScriptDto[]}
 * */
const getAlterContainersSequencesScriptDtos = ({ collection, app, dbVersion }) => {
	const addedContainers = collection.properties?.containers?.properties?.added?.items;
	const deletedContainers = collection.properties?.containers?.properties?.deleted?.items;
	const modifiedContainers = collection.properties?.containers?.properties?.modified?.items;

	const addContainersSequencesScriptDtos = []
		.concat(addedContainers)
		.filter(Boolean)
		.map(container => Object.values(container.properties)[0])
		.flatMap(container => getAddContainerSequencesScriptDtos({ app })({ container, dbVersion }));
	const deleteContainersScriptDtos = []
		.concat(deletedContainers)
		.filter(Boolean)
		.map(container => Object.values(container.properties)[0])
		.flatMap(container => getDeleteContainerSequencesScriptDtos({ app })({ container, dbVersion }));
	const modifyContainersScriptDtos = []
		.concat(modifiedContainers)
		.filter(Boolean)
		.map(container => Object.values(container.properties)[0])
		.flatMap(container => getModifyContainerSequencesScriptDtos({ app })({ container, dbVersion }));

	return [...addContainersSequencesScriptDtos, ...deleteContainersScriptDtos, ...modifyContainersScriptDtos].filter(
		Boolean,
	);
};

/**
 * @param data {CoreData}
 * @param app {App}
 * @return {Array<AlterScriptDto>}
 * */
const getAlterScriptDtos = (data, app) => {
	const collection = JSON.parse(data.jsonSchema);
	if (!collection) {
		throw new Error(
			'"comparisonModelCollection" is not found. Alter script can be generated only from Delta model',
		);
	}

	const scriptFormat = data.options?.targetScriptOptions?.keyword;

	const modelDefinitions = JSON.parse(data.modelDefinitions);
	const internalDefinitions = JSON.parse(data.internalDefinitions);
	const externalDefinitions = JSON.parse(data.externalDefinitions);
	const dbVersion = data.modelData[0]?.dbVersion;
	const containersScriptDtos = getAlterContainersScriptDtos({ collection, app, scriptFormat });
	const collectionsScriptDtos = getAlterCollectionsScriptDtos({
		collection,
		app,
		dbVersion,
		modelDefinitions,
		internalDefinitions,
		externalDefinitions,
		scriptFormat,
	});
	const viewScriptDtos = getAlterViewScriptDtos(collection, app, dbVersion, scriptFormat);
	const modelDefinitionsScriptDtos = getAlterModelDefinitionsScriptDtos({
		collection,
		app,
		dbVersion,
		modelDefinitions,
		internalDefinitions,
		externalDefinitions,
		scriptFormat,
	});
	const relationshipScriptDtos = getAlterRelationshipsScriptDtos({ collection, app, scriptFormat });
	const containersSequencesScriptDtos = getAlterContainersSequencesScriptDtos({ collection, app, dbVersion });

	return [
		...containersScriptDtos,
		...containersSequencesScriptDtos,
		...modelDefinitionsScriptDtos,
		...collectionsScriptDtos,
		...viewScriptDtos,
		...relationshipScriptDtos,
	]
		.filter(Boolean)
		.map(dto => prettifyAlterScriptDto(dto))
		.filter(Boolean);
};

module.exports = {
	getAlterScriptDtos,
};
