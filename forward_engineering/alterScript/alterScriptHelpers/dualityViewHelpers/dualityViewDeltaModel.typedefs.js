/**
 * @typedef {Object} DeltaDualityViewTagsClause
 * @property {string} id
 * @property {string | undefined} check
 * @property {boolean | undefined} etag
 * @property {string | undefined} delete
 * @property {string | undefined} update
 * @property {string | undefined} insert
 * */

/**
 * @typedef {Object} DeltaDualityViewRoleJoinSubqueryCommonProps
 * @property {"joinSubquery"} type
 * @property {string | undefined} title
 * @property {boolean} isActivated
 * @property {string | undefined} sqlJsonFunction
 * @property {string[] | undefined} joinedCollectionRefIdPath
 * @property {string | undefined} childTableAlias
 * @property {string | undefined} whereClause
 * @property {DeltaDualityViewTagsClause | undefined} tableTagsClause
 * @property {string} GUID
 * */

/**
 * @typedef {Object} DeltaDualityViewRoleArrayJoinSubqueryArrayItem
 * @property {"object"} type
 * @property {boolean} isActivated
 * @property {boolean} unique
 * @property {"object"} subtype
 * @property {Array<string>} compositeKey
 * @property {boolean} compositePartitionKey
 * @property {boolean} compositePrimaryKey
 * @property {boolean} compositeUniqueKey
 * @property {string} GUID
 * @property {DeltaDualityViewProperties} properties
 * */

/**
 * @typedef {DeltaDualityViewRoleJoinSubqueryCommonProps} DeltaDualityViewRoleArrayJoinSubquery
 * @property {"array"} subtype
 * @property {Array<DeltaDualityViewRoleArrayJoinSubqueryArrayItem>} items
 * */

/**
 * @typedef {DeltaDualityViewRoleJoinSubqueryCommonProps} DeltaDualityViewRoleObjectJoinSubquery
 * @property {"object"} subtype
 * @property {DeltaDualityViewProperties} properties
 * @property {boolean | undefined} unnestSubquery
 * */

/**
 * @typedef {DeltaDualityViewRoleObjectJoinSubquery | DeltaDualityViewRoleArrayJoinSubquery} DeltaDualityViewRoleJoinSubquery
 * */

/**
 * @typedef {Object} DeltaDualityViewRoleRegularField
 * @property {string} refId
 * @property {string} ref
 * @property {boolean} isActivated
 * */

/**
 * @typedef {
 *  DeltaDualityViewRoleRegularField | DeltaDualityViewRoleJoinSubquery
 * } DeltaDualityViewRoleProperty
 * */

/**
 * @typedef {Record<string, DeltaDualityViewRoleProperty>} DeltaDualityViewProperties
 * */

/**
 * @typedef {Object} DeltaDualityViewRole
 * @property {string} id
 * @property {"object"} type
 * @property {string} name
 * @property {string} code
 * @property {boolean} isActivated
 * @property {string} pipeline
 * @property {string} viewOn
 * @property {string} bucketId
 * @property {{
 *  validationErrors: {
 *      name: boolean,
 *      code: boolean,
 *      duality: boolean,
 *  },
 * }} hackoladeMeta
 * @property {boolean} duality
 * @property {boolean | undefined} or_replace
 * @property {string | undefined} force
 * @property {string | undefined} editionable
 * @property {string | undefined} rootTableAlias
 * @property {DeltaDualityViewTagsClause | undefined} tableTagsClause
 * @property {boolean} duality
 * @property {"view"} roleType
 * @property {Object} patternProperties
 * @property {DeltaDualityViewProperties} properties
 * @property {DeltaDualityViewCompMod} compMod
 * */

/**
 * @typedef {Object} DeltaDualityViewCompModEntityData
 * @property {string} collectionName
 * @property {boolean} isActivated
 * @property {string} bucketId
 * @property {boolean} additionalProperties
 * @property {boolean} temporary
 * @property {string} temporaryType
 * @property {boolean} sharded
 * @property {boolean} duplicated
 * @property {boolean} immutable
 * */

/**
 * @typedef {Object} DeltaDualityViewCompModBucket
 * @param {string} name
 * @param {boolean} isActivated
 * */

/**
 * @typedef {Object} DeltaDualityViewCompModCollectionRefsDefinition
 * @property {string} name
 * @property {boolean} isActivated
 * @property {string} childType
 * @property {string} mode
 * @property {number | undefined} length
 * @property {string} subtype
 * @property {boolean} compositePrimaryKey
 * @property {boolean} primaryKey
 * @property {boolean} compositeUniqueKey
 * @property {boolean} unique
 * @property {string} foreignCollection
 * @property {Array<string>} foreignField
 * @property {string} relationshipType
 * */

/**
 * @typedef {Object} DeltaDualityViewCompModCollectionRefsDefinitionsMapValue
 * // It has other elements after the bucket data. Those are useless to us
 * @property {[DeltaDualityViewCompModBucket,]} bucket
 * // It has other elements after the entity data. Those are useless to us
 * @property {[DeltaDualityViewCompModEntityData,]} collection
 * @property {string} definitionId
 * @property {string} name
 * @property {DeltaDualityViewCompModCollectionRefsDefinition} definition
 * */

/**
 * @typedef {Record<string, DeltaDualityViewCompModCollectionRefsDefinitionsMapValue>} DeltaDualityViewCompModCollectionRefsDefinitionsMap
 * */

/**
 * @typedef {Object} DeltaDualityViewCompModCollectionData
 * @property {Object} relatedSchemas
 * @property {Object} relatedContainers
 * // It has other elements after the entity data. Those are useless to us
 * @property {[DeltaDualityViewCompModEntityData,]} entityData
 * @property {DeltaDualityViewCompModCollectionRefsDefinitionsMap} collectionRefsDefinitionsMap
 * */

/**
 * @typedef {Object} DeltaDualityViewCompMod
 * @property {string} keyspaceName
 * @property {DeltaDualityViewCompModBucket} bucketProperties
 * @property {boolean} created
 * @property {boolean} deleted
 * @property {boolean} modified
 * @property {DeltaDualityViewCompModCollectionData} collectionData
 * */

/**
 * @typedef {Object} DeltaDualityView
 * @property {"object_udt"} type
 * @property {boolean} isActivated
 * @property {boolean} unique
 * @property {Array<string>} compositeKey
 * @property {boolean} compositePartitionKey
 * @property {boolean} compositePrimaryKey
 * @property {boolean} compositeUniqueKey
 * @property {DeltaDualityViewRole} role
 * */
