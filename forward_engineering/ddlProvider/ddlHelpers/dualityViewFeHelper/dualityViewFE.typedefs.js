
/**
 * @typedef {Record<string, {
 *     GUID: string,
 * }>} RelatedSchemaProperty
 * */

/**
 * @typedef {Object} RelatedSchema
 * @property {Array<RelatedSchemaProperty>} properties
 * */

/**
 * @typedef {Record<string, RelatedSchema>} RelatedSchemas
 * */

/**
 * @typedef {Object} RegularDualityViewField
 * @property {string} ref
 * @property {string} refId
 * @property {Array<string> | undefined} refIdPath
 * @property {'collectionReference' | undefined} refType
 * @property {string | undefined} code
 * @property {string | undefined} referencedColumnName
 * */

/**
 * @typedef {Object} JoinSubquery
 * @property {'joinSubquery'} type
 * @property {Array<string>} joinedCollectionRefIdPath
 *
 * */

/**
 * @typedef {Object} DualityView
 * @property {string} viewOn
 * @property {boolean} duality
 * @property {string | undefined} code
 * @property {string} name
 * @property {string} schemaName
 * @property {string | undefined} force
 * @property {string | undefined} orReplace
 * @property {string | undefined} editionable
 * */

/**
 * @typedef {{
 *     view: DualityView,
 *     jsonSchema: Object,
 *     relatedSchemas: RelatedSchemas
 * }} CreateDualityViewDto
 * */
