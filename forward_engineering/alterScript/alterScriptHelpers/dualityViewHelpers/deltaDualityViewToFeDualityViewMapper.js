import {DualityViewPropertiesType} from "../../../enums/DualityViewPropertiesType";

/**
 * @return {(view: DeltaDualityView) => DualityView}
 * */
const mapToFeView = (_) => (view) => {
    const { getEntityName, getBucketName } = require('../../../utils/general')(_);

    /**
     * @type {DeltaDualityViewRole}
     * */
    const role = _.get(view, 'role', {});
    const bucketProperties = _.get(role, 'compMod.bucketProperties', {});
    const entityProperties = _.get(role, 'compMod.collectionData.entityData[0]', {});

    const tableName = getEntityName(entityProperties);
    const schemaName = getBucketName(bucketProperties);

    return {
        code: role.code,
        tableName,
        name: role.name,
        tableTagsClause: role.tableTagsClause,
        schemaName,
        rootTableAlias: role.rootTableAlias,
        orReplace: role.or_replace,
    }
}

/**
 * @return {(
 *     code: string,
 *     property: DeltaDualityViewRoleRegularField,
 *     collectionRefsDefinitionsMap: DeltaDualityViewCompModCollectionRefsDefinitionsMap,
 * ) => RegularDualityViewField}
 * */
const mapRegularField = (_) => (code, property, collectionRefsDefinitionsMap) => {
    /**
     * @type {DeltaDualityViewCompModCollectionRefsDefinitionsMapValue}
     */
    const refDefinition = (collectionRefsDefinitionsMap || {})[property.refId];
    const columnDefinition = refDefinition?.definition || {};
    const columnName = columnDefinition.code || columnDefinition.name || '';

    return {
        code,
        ref: property.ref,
        refId: property.refId,
        refIdPath: [property.refId, property.ref],
        refType: DualityViewPropertiesType.COLLECTION_REFERENCE,
        // TODO: this must not be undefined
        columnTagsClause: undefined,
        referencedColumnName: columnName,
    }
}

/**
 * @return {(view: DeltaDualityView) => DualityViewJsonSchemaProperties}
 * */
const parseProperties = (_) => (view) => {
    const properties = _.get(view, 'role.properties', {});
    const collectionRefsDefinitionsMap = _.get(view, 'role.compMod.collectionData.collectionRefsDefinitionsMap', {});
    /**
     * @type {Array<[string, DeltaDualityViewRoleProperty]>}
     * */
    const arrayOfCodesAndJsonSchemas = _.toPairs(properties);

    return arrayOfCodesAndJsonSchemas.map(([ code, jsonSchema ]) => {
        if (property.type === DualityViewPropertiesType.JOIN_SUBQUERY_TYPE) {
            return {};
        }
        return mapRegularField(_)(code, jsonSchema, collectionRefsDefinitionsMap);
    })
}

/**
 * @return {(view: DeltaDualityView) => DualityViewJsonSchema}
 * */
const mapToFeJsonSchema = (_) => (view) => {
    const { getEntityName } = require('../../../utils/general')(_);

    /**
     * @type {DeltaDualityViewRole}
     * */
    const role = _.get(view, 'role', {});
    const entityProperties = _.get(role, 'compMod.collectionData.entityData[0]', {});

    const tableName = getEntityName(entityProperties);
    const properties = parseProperties(_)(view);

    return {
        rootTableAlias: role.rootTableAlias,
        tableName,
        properties,
        duality: role.duality,
        editionable: role.editionable,
        force: role.force,
        viewOn: role.viewOn,
    }
}

/**
 * @param view {DeltaDualityView}
 * @return {DualityViewRelatedSchemas}
 * */
const mapToFeRelatedSchemas = (view) => {
    return {

    }
}

/**
 * @return {(view: DeltaDualityView) => CreateDualityViewDto}
 * */
export const mapDeltaDualityViewToFeDualityView = (_) => (view) => {
    const feView = mapToFeView(_)(view);
    const feJsonSchema = mapToFeJsonSchema(_)(view);
    const feRelatedSchemas = mapToFeRelatedSchemas(view);

    return {
        view: feView,
        jsonSchema: feJsonSchema,
        relatedSchemas: feRelatedSchemas,
    }
}
