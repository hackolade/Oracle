/**
 * @return {(view: DeltaDualityView) => DualityView}
 * */
const mapToFeView = (_) => (view) => {
    const { getEntityName, getBucketName } = require('../../../utils/general')(_);

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
 * @param view {DeltaDualityView}
 * @return {DualityViewJsonSchema}
 * */
const mapToFeJsonSchema = (view) => {
    return {

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
    const feJsonSchema = mapToFeJsonSchema(view);
    const feRelatedSchemas = mapToFeRelatedSchemas(view);

    return {
        view: feView,
        jsonSchema: feJsonSchema,
        relatedSchemas: feRelatedSchemas,
    }
}
