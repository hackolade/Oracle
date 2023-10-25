/**
 * @param view {DeltaDualityView}
 * @return {DualityView}
 * */
const mapToFeView = (view) => {
    const { role } = view;
    // return {
    //     code: role.code,
    //     tableName: ,
    //     name: role.name,
    //     tableTagsClause: role.tableTagsClause,
    //     schemaName: ,
    //     rootTableAlias: role.rootTableAlias,
    //     orReplace: role.or_replace,
    // }
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
 * @param {DeltaDualityView} view
 * @return {CreateDualityViewDto}
 * */
export const mapDeltaDualityViewToFeDualityView = (view) => {
    const feView = mapToFeView(view);
    const feJsonSchema = mapToFeJsonSchema(view);
    const feRelatedSchemas = mapToFeRelatedSchemas(view);
    return {
        view: feView,
        jsonSchema: feJsonSchema,
        relatedSchemas: feRelatedSchemas,
    }
}
