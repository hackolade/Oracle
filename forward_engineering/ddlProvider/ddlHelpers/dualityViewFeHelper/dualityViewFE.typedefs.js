
/**
 * @typedef {Record<string, {
 *     GUID: string,
 * }>} RelatedSchemaProperties
 * */

/**
 * @typedef {Object} RelatedSchema
 * @property {RelatedSchemaProperties} properties
 * @property {string} bucketName
 * @property {string | undefined} code
 * @property {string | undefined} collectionName
 * */

/**
 * @typedef {Record<string, RelatedSchema>} DualityViewRelatedSchemas
 * */

/**
 * @typedef {Object} TagsClause
 * @property {string | undefined} check
 * @property {boolean | undefined} etag
 * @property {string | undefined} delete
 * @property {string | undefined} update
 * @property {string | undefined} insert
 * */

/**
 * @typedef {Object} RegularDualityViewField
 * @property {string} ref
 * @property {string} refId
 * @property {Array<string> | undefined} refIdPath
 * @property {'collectionReference' | undefined} refType
 * @property {string | undefined} code
 * @property {string | undefined} referencedColumnName
 * @property {TagsClause | undefined} columnTagsClause
 * */

/**
 * @typedef {Object} JoinSubquery
 * @property {string} name
 * @property {string | undefined} code
 * @property {'joinSubquery'} type
 * @property {Array<string>} joinedCollectionRefIdPath
 * @property {'object' | 'array'} subtype
 * @property {string | undefined} childTableAlias
 * @property {TagsClause | undefined} tableTagsClause
 * @property {DualityViewJsonSchemaProperties | undefined} properties
 * @property {{
 *     properties: DualityViewJsonSchemaProperties,
 * } | undefined} items
 * @property {string | undefined} whereClause
 * @property {boolean | undefined} unnestSubquery
 * @property {string | undefined} sqlJsonFunction
 * */

/**
 * @typedef {Object} DualityView
 * @property {string | undefined} code
 * @property {string} name
 * @property {string} schemaName
 * @property {string} tableName
 * @property {string | undefined} rootTableAlias
 * @property {string | undefined} orReplace
 * @property {TagsClause | undefined} tableTagsClause
 * */

/**
 * @typedef {RegularDualityViewField | JoinSubquery} DualityViewPropertyJsonSchema
 * */

/**
 * @typedef {Record<string, DualityViewPropertyJsonSchema>} DualityViewJsonSchemaProperties
 * */

/**
 * @typedef {Object} DualityViewJsonSchema
 * @property {string} viewOn
 * @property {boolean} duality
 * @property {string | undefined} editionable
 * @property {string | undefined} force
 * @property {string | undefined} rootTableAlias
 * @property {string} tableName
 * @property {DualityViewJsonSchemaProperties} properties
 * */

/**
 * @typedef {{
 *     view: DualityView,
 *     jsonSchema: DualityViewJsonSchema,
 *     relatedSchemas: DualityViewRelatedSchemas
 * }} CreateDualityViewDto
 * */
