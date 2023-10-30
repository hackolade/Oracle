const {
    getAddContainerScriptDto,
    getDeleteContainerScriptDto,
} = require('./alterScriptHelpers/alterContainerHelper');
const {
    getAddCollectionScriptDto,
    getDeleteCollectionScriptDto,
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
} = require('./alterScriptHelpers/alterViewHelper');
const {AlterScriptDto, ModificationScript} = require("./types/AlterScriptDto");
const {App, CoreData} = require("../types/coreApplicationTypes");
const {InternalDefinitions, ModelDefinitions, ExternalDefinitions} = require("../types/coreApplicationDataTypes");


/**
 * @param dto {{
 *     collection: Object,
 *     app: App,
 * }}
 * @return {AlterScriptDto[]}
 * */
const getAlterContainersScriptDtos = ({collection, app}) => {
    const addedContainers = collection.properties?.containers?.properties?.added?.items;
    const deletedContainers = collection.properties?.containers?.properties?.deleted?.items;

    const addContainersScriptDtos = []
        .concat(addedContainers)
        .filter(Boolean)
        .map(container => getAddContainerScriptDto(app)(Object.keys(container.properties)[0]));
    const deleteContainersScriptDtos = []
        .concat(deletedContainers)
        .filter(Boolean)
        .map(container => getDeleteContainerScriptDto(app)(Object.keys(container.properties)[0]));

    return [
        ...addContainersScriptDtos,
        ...deleteContainersScriptDtos,
    ].filter(Boolean);
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
const getAlterCollectionsScriptDtos = ({
                                           collection,
                                           app,
                                           dbVersion,
                                           modelDefinitions,
                                           internalDefinitions,
                                           externalDefinitions,
                                       }) => {
    const createCollectionsScriptDtos = []
        .concat(collection.properties?.entities?.properties?.added?.items)
        .filter(Boolean)
        .map(item => Object.values(item.properties)[0])
        .filter(collection => collection.compMod?.created)
        .map(getAddCollectionScriptDto({app, dbVersion, modelDefinitions, internalDefinitions, externalDefinitions}));
    const deleteCollectionScriptDtos = []
        .concat(collection.properties?.entities?.properties?.deleted?.items)
        .filter(Boolean)
        .map(item => Object.values(item.properties)[0])
        .filter(collection => collection.compMod?.deleted)
        .map(getDeleteCollectionScriptDto(app));
    const addColumnScriptDtos = []
        .concat(collection.properties?.entities?.properties?.added?.items)
        .filter(Boolean)
        .map(item => Object.values(item.properties)[0])
        .filter(collection => !collection.compMod)
        .flatMap(getAddColumnScriptDtos({app, dbVersion, modelDefinitions, internalDefinitions, externalDefinitions}));
    const deleteColumnScriptDtos = []
        .concat(collection.properties?.entities?.properties?.deleted?.items)
        .filter(Boolean)
        .map(item => Object.values(item.properties)[0])
        .filter(collection => !collection.compMod)
        .flatMap(getDeleteColumnScriptDtos(app));
    const modifyColumnScriptDtos = []
        .concat(collection.properties?.entities?.properties?.modified?.items)
        .filter(Boolean)
        .map(item => Object.values(item.properties)[0])
        .filter(collection => !collection.compMod)
        .flatMap(getModifyColumnScriptDtos(app, dbVersion));

    return [
        ...createCollectionsScriptDtos,
        ...deleteCollectionScriptDtos,
        ...addColumnScriptDtos,
        ...deleteColumnScriptDtos,
        ...modifyColumnScriptDtos,
    ].filter(Boolean);
};

/**
 * @param collection {Object}
 * @param app {App}
 * @param dbVersion {string}
 * @return {AlterScriptDto[]}
 * */
const getAlterViewScriptDtos = (collection, app, dbVersion) => {
    const createViewsScriptDtos = []
        .concat(collection.properties?.views?.properties?.added?.items)
        .filter(Boolean)
        .map(item => Object.values(item.properties)[0])
        .map(view => ({...view, ...(view.role || {})}))
        .filter(view => view.compMod?.created && view.selectStatement)
        .map(getAddViewScriptDto(app));

    const deleteViewsScriptDtos = []
        .concat(collection.properties?.views?.properties?.deleted?.items)
        .filter(Boolean)
        .map(item => Object.values(item.properties)[0])
        .map(view => ({...view, ...(view.role || {})}))
        .map(getDeleteViewScriptDto(app));

    return [
        ...deleteViewsScriptDtos,
        ...createViewsScriptDtos,
    ].filter(Boolean);
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
                                            }) => {
    const createUdtScriptDtos = []
        .concat(collection.properties?.modelDefinitions?.properties?.added?.items)
        .filter(Boolean)
        .map(item => Object.values(item.properties)[0])
        .map(item => ({...item, ...(app.require('lodash').omit(item.role, 'properties') || {})}))
        .filter(item => item.compMod?.created)
        .map(getCreateUdtScriptDto({app, dbVersion, modelDefinitions, internalDefinitions, externalDefinitions}));
    const deleteUdtScriptDtos = []
        .concat(collection.properties?.modelDefinitions?.properties?.deleted?.items)
        .filter(Boolean)
        .map(item => Object.values(item.properties)[0])
        .map(item => ({...item, ...(app.require('lodash').omit(item.role, 'properties') || {})}))
        .filter(collection => collection.compMod?.deleted)
        .map(getDeleteUdtScriptDto(app));
    const addColumnScriptDtos = []
        .concat(collection.properties?.modelDefinitions?.properties?.added?.items)
        .filter(Boolean)
        .map(item => Object.values(item.properties)[0])
        .filter(item => !item.compMod)
        .map(item => ({...item, ...(app.require('lodash').omit(item.role, 'properties') || {})}))
        .filter(item => item.childType === 'object_udt')
        .flatMap(
            getAddColumnToTypeScriptDtos({app, dbVersion, modelDefinitions, internalDefinitions, externalDefinitions}),
        );
    const deleteColumnScriptDtos = []
        .concat(collection.properties?.modelDefinitions?.properties?.deleted?.items)
        .filter(Boolean)
        .map(item => Object.values(item.properties)[0])
        .filter(item => !item.compMod)
        .map(item => ({...item, ...(app.require('lodash').omit(item.role, 'properties') || {})}))
        .filter(item => item.childType === 'object_udt')
        .flatMap(getDeleteColumnFromTypeScriptDtos(app));

    const modifyColumnScriptDtos = []
        .concat(collection.properties?.modelDefinitions?.properties?.modified?.items)
        .filter(Boolean)
        .map(item => Object.values(item.properties)[0])
        .filter(item => !item.compMod)
        .map(item => ({...item, ...(app.require('lodash').omit(item.role, 'properties') || {})}))
        .filter(item => item.childType === 'object_udt')
        .flatMap(getModifyColumnOfTypeScriptDtos(app));

    return [
        ...deleteUdtScriptDtos,
        ...createUdtScriptDtos,
        ...addColumnScriptDtos,
        ...deleteColumnScriptDtos,
        ...modifyColumnScriptDtos,
    ].filter(Boolean);
};

/**
 * @param dto {AlterScriptDto}
 * @return {AlterScriptDto | undefined}
 */
const prettifyAlterScriptDto = (dto) => {
    if (!dto) {
        return undefined;
    }
    /**
     * @type {Array<ModificationScript>}
     * */
    const nonEmptyScriptModificationDtos = dto.scripts
        .map((scriptDto) => ({
            ...scriptDto,
            script: (scriptDto.script || '').trim()
        }))
        .filter((scriptDto) => Boolean(scriptDto.script));
    if (!nonEmptyScriptModificationDtos.length) {
        return undefined;
    }
    return {
        ...dto,
        scripts: nonEmptyScriptModificationDtos
    }
}

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

    const modelDefinitions = JSON.parse(data.modelDefinitions);
    const internalDefinitions = JSON.parse(data.internalDefinitions);
    const externalDefinitions = JSON.parse(data.externalDefinitions);
    const dbVersion = data.modelData[0]?.dbVersion;
    const containersScriptDtos = getAlterContainersScriptDtos({collection, app});
    const collectionsScriptDtos = getAlterCollectionsScriptDtos({
        collection,
        app,
        dbVersion,
        modelDefinitions,
        internalDefinitions,
        externalDefinitions,
    });
    const viewScriptDtos = getAlterViewScriptDtos(collection, app, dbVersion);
    const modelDefinitionsScriptDtos = getAlterModelDefinitionsScriptDtos({
        collection,
        app,
        dbVersion,
        modelDefinitions,
        internalDefinitions,
        externalDefinitions,
    });

    return [
        ...containersScriptDtos,
        ...modelDefinitionsScriptDtos,
        ...collectionsScriptDtos,
        ...viewScriptDtos,
    ]
        .filter(Boolean)
        .map((dto) => prettifyAlterScriptDto(dto))
        .filter(Boolean);
};

module.exports = {
    getAlterScriptDtos,
};
