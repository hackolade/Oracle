const _ = require('lodash');
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
const {
	getAddViewScriptDto,
	getDeleteViewScriptDto,
	getModifyViewScriptDtos,
} = require('./alterScriptHelpers/alterViewHelper');
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

const sortCollectionsByRelationships = (collections, relationships) => {
	const collectionToChildren = new Map(); // Map of collection IDs to their children
	const collectionParentCount = new Map(); // Track how many parents each collection has

	// Initialize maps
	for (const collection of collections) {
		collectionToChildren.set(collection.role.id, []);
		collectionParentCount.set(collection.role.id, 0);
	}

	for (const relationship of relationships) {
		const parent = relationship.role.parentCollection;
		const child = relationship.role.childCollection;
		if (collectionToChildren.has(parent)) {
			collectionToChildren.get(parent).push(child);
		}
		collectionParentCount.set(child, (collectionParentCount.get(child) || 0) + 1);
	}

	// Find collections with no parents
	const queue = collections
		.filter(collection => collectionParentCount.get(collection.role.id) === 0)
		.map(collection => collection.role.id);

	const sortedIds = [];

	// Sort collections
	while (queue.length > 0) {
		const current = queue.shift();
		sortedIds.push(current);

		for (const child of collectionToChildren.get(current) || []) {
			collectionParentCount.set(child, collectionParentCount.get(child) - 1);
			if (collectionParentCount.get(child) <= 0) {
				queue.push(child);
			}
		}
	}

	// Add any unvisited collection
	for (const collection of collections) {
		if (!sortedIds.includes(collection.role.id)) {
			sortedIds.unshift(collection.role.id);
		}
	}

	// Map back to collection objects in sorted order
	const idToCollection = Object.fromEntries(collections.map(c => [c.role.id, c]));
	return sortedIds.map(id => idToCollection[id]);
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
	inlineDeltaRelationships = [],
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

	const createCollectionsScriptDtos = sortCollectionsByRelationships(
		createScriptsData.filter(collection => collection.compMod?.created),
		inlineDeltaRelationships,
	).map(
		getAddCollectionScriptDto({
			app,
			dbVersion,
			modelDefinitions,
			internalDefinitions,
			externalDefinitions,
			scriptFormat,
			inlineDeltaRelationships,
		}),
	);
	const deleteCollectionScriptDtos = deleteScriptsData
		.filter(collection => collection.compMod?.deleted)
		.map(getDeleteCollectionScriptDto(app, scriptFormat));
	const modifyCollectionScriptDtos = modifyScriptsData.flatMap(
		getModifyCollectionScriptDtos({ app, dbVersion, scriptFormat }),
	);
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
		...addColumnScriptDtos,
		...deleteColumnScriptDtos,
		...modifyColumnScriptDtos,
		...modifyCollectionScriptDtos,
	].filter(Boolean);
};

/**
 * @param collection {Object}
 * @param app {App}
 * @param dbVersion {string}
 * @param scriptFormat {string}
 * @return {{ restViewScripts: AlterScriptDto[], renameViewScripts: AlterScriptDto[]}}
 * */
const getAlterViewScriptDtos = (collection, app, dbVersion, scriptFormat) => {
	const properties = collection.properties?.views?.properties;
	if (!properties) {
		return [];
	}

	const prepareDtos = mutationType => {
		if (!mutationType.items) {
			return [];
		}

		const normalize = value => {
			if (Array.isArray(value)) {
				return value.filter(Boolean);
			}
			return [value].filter(Boolean);
		};

		const extractItem = item => Object.values(item.properties)[0];
		const mergeRole = view => ({ ...view, ...view.role });

		const rawItems = normalize(mutationType.items);
		const extracted = rawItems.map(extractItem);

		return normalize(extracted).map(mergeRole);
	};

	const createViewsScriptDtos = prepareDtos(properties.added)
		.filter(view => view.compMod?.created)
		.map(getAddViewScriptDto(app, scriptFormat));

	const deleteViewsScriptDtos = prepareDtos(properties.deleted).map(getDeleteViewScriptDto(app, scriptFormat));

	const preparedModifyViewsScriptDtos = prepareDtos(properties.modified).reduce(
		(scripts, view) => {
			const { restViewScripts, renameViewScripts } = getModifyViewScriptDtos({ scriptFormat })(view);

			restViewScripts.length && scripts.restViewScripts.push(...restViewScripts);
			renameViewScripts.length && scripts.renameViewScripts.push(...renameViewScripts);

			return scripts;
		},
		{ restViewScripts: [], renameViewScripts: [] },
	);

	return {
		restViewScripts: [
			...deleteViewsScriptDtos,
			...createViewsScriptDtos,
			...preparedModifyViewsScriptDtos.restViewScripts,
		].filter(Boolean),
		renameViewScripts: preparedModifyViewsScriptDtos.renameViewScripts,
	};
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
const getAlterRelationshipsScriptDtos = ({ collection, app, scriptFormat, ignoreRelationshipIDs = [] }) => {
	const ddlProvider = require('../ddlProvider/ddlProvider')(
		null,
		{ targetScriptOptions: { keyword: scriptFormat } },
		app,
	);

	const addedRelationships = []
		.concat(collection.properties?.relationships?.properties?.added?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0])
		.filter(
			relationship =>
				relationship?.role?.compMod?.created && !ignoreRelationshipIDs.includes(relationship?.role?.id),
		);

	const deletedRelationships = []
		.concat(collection.properties?.relationships?.properties?.deleted?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0])
		.filter(
			relationship =>
				relationship?.role?.compMod?.deleted && !ignoreRelationshipIDs.includes(relationship?.role?.id),
		);

	const modifiedRelationships = []
		.concat(collection.properties?.relationships?.properties?.modified?.items)
		.filter(Boolean)
		.map(item => Object.values(item.properties)[0])
		.filter(
			relationship =>
				relationship?.role?.compMod?.modified && !ignoreRelationshipIDs.includes(relationship?.role?.id),
		);

	const deleteFkScriptDtos = getDeleteForeignKeyScriptDtos(ddlProvider, scriptFormat)(deletedRelationships);
	const addFkScriptDtos = getAddForeignKeyScriptDtos(ddlProvider)(addedRelationships);
	const modifiedFkScriptDtos = getModifyForeignKeyScriptDtos(ddlProvider, scriptFormat)(modifiedRelationships);

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

const getInlineRelationships = ({ collection, options }) => {
	if (options?.scriptGenerationOptions?.feActiveOptions?.foreignKeys !== 'inline') {
		return [];
	}

	const addedCollectionIDs = []
		.concat(collection.properties?.entities?.properties?.added?.items)
		.filter(item => item && Object.values(item.properties)?.[0]?.compMod?.created)
		.map(item => Object.values(item.properties)[0].role.id);

	const addedRelationships = []
		.concat(collection.properties?.relationships?.properties?.added?.items)
		.map(item => item && Object.values(item.properties)[0])
		.filter(r => r?.role?.compMod?.created && addedCollectionIDs.includes(r?.role?.childCollection));

	return addedRelationships;
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

	const inlineDeltaRelationships = getInlineRelationships({ collection, options: data.options });
	const ignoreRelationshipIDs = inlineDeltaRelationships.map(relationship => relationship.role.id);

	const containersScriptDtos = getAlterContainersScriptDtos({ collection, app, scriptFormat });

	const collectionsScriptDtos = getAlterCollectionsScriptDtos({
		collection,
		app,
		dbVersion,
		modelDefinitions,
		internalDefinitions,
		externalDefinitions,
		scriptFormat,
		inlineDeltaRelationships,
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

	const relationshipScriptDtos = getAlterRelationshipsScriptDtos({
		collection,
		app,
		scriptFormat,
		ignoreRelationshipIDs,
	});

	const containersSequencesScriptDtos = getAlterContainersSequencesScriptDtos({ collection, app, dbVersion });

	return [
		...containersScriptDtos,
		...containersSequencesScriptDtos,
		...modelDefinitionsScriptDtos,
		...viewScriptDtos.renameViewScripts,
		...collectionsScriptDtos,
		...viewScriptDtos.restViewScripts,
		...relationshipScriptDtos,
	]
		.filter(Boolean)
		.map(dto => prettifyAlterScriptDto(dto))
		.filter(Boolean);
};

module.exports = {
	getAlterScriptDtos,
};
