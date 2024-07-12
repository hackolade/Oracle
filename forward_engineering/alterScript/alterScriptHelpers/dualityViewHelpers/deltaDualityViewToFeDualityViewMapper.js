const { DualityViewPropertiesType } = require('../../../enums/DualityViewPropertiesType');

/**
 * @return {(view: DeltaDualityView) => DualityView}
 * */
const mapToFeView = _ => view => {
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
	};
};

/**
 * @return {(
 *     code: string,
 *     property: DeltaDualityViewRoleRegularField,
 *     collectionRefsDefinitionsMap: DeltaDualityViewCompModCollectionRefsDefinitionsMap,
 * ) => RegularDualityViewField}
 * */
const mapRegularField = _ => (code, property, collectionRefsDefinitionsMap) => {
	/**
	 * @type {DeltaDualityViewCompModCollectionRefsDefinitionsMapValue}
	 */
	const refDefinition = collectionRefsDefinitionsMap?.[property.refId];
	const columnDefinition = refDefinition?.definition || {};
	const columnName = columnDefinition.code || columnDefinition.name || '';

	return {
		code,
		ref: property.ref,
		refId: property.refId,
		refIdPath: [property.refId, property.ref],
		refType: DualityViewPropertiesType.COLLECTION_REFERENCE,
		columnTagsClause: property.columnTagsClause,
		referencedColumnName: columnName,
	};
};

/**
 * @param code {string}
 * @param subquery {DeltaDualityViewRoleJoinSubquery}
 * @param collectionRefsDefinitionsMap {DeltaDualityViewCompModCollectionRefsDefinitionsMap}
 * */
const assertSubqueryIsValid = (code, subquery, collectionRefsDefinitionsMap) => {
	if (!collectionRefsDefinitionsMap[subquery.GUID]) {
		let namePartOfErrorMessage = code || subquery.title;
		if (namePartOfErrorMessage) {
			namePartOfErrorMessage = `<u>${namePartOfErrorMessage}</u>`;
		} else {
			namePartOfErrorMessage = 'a';
		}
		throw new Error(
			`Could not find referenced collection for ${namePartOfErrorMessage} subquery. Check if all the subqueries have the "child table" property set`,
		);
	}
};

/**
 * @return {(
 *     code: string,
 *     subquery: DeltaDualityViewRoleJoinSubquery,
 *     collectionRefsDefinitionsMap: DeltaDualityViewCompModCollectionRefsDefinitionsMap,
 * ) => JoinSubquery}
 * */
const mapSubquery = _ => (code, subquery, collectionRefsDefinitionsMap) => {
	assertSubqueryIsValid(code, subquery, collectionRefsDefinitionsMap);

	/**
	 * @type {JoinSubquery}
	 * */
	const result = {
		code,
		type: subquery.type,
		name: subquery.title,
		subtype: subquery.subtype,
		sqlJsonFunction: subquery.sqlJsonFunction,
		whereClause: subquery.whereClause,
		joinedCollectionRefIdPath: [subquery.GUID],
		childTableAlias: subquery.childTableAlias,
		tableTagsClause: subquery.tableTagsClause,
		// subtype-specific stuff
		items: undefined,
		properties: undefined,
		unnestSubquery: undefined,
	};
	if (subquery.subtype === 'array') {
		const childProperties = _.get(subquery, 'items.properties', {});
		result.items = {
			properties: recursivelyParseProperties(_)(childProperties, collectionRefsDefinitionsMap),
		};
	} else if (subquery.subtype === 'object') {
		result.unnestSubquery = subquery.unnestSubquery;
		const childProperties = _.get(subquery, 'properties', {});
		result.properties = recursivelyParseProperties(_)(childProperties, collectionRefsDefinitionsMap);
	}

	return result;
};

/**
 * @return {(
 *  properties: DeltaDualityViewProperties,
 *  collectionRefsDefinitionsMap: DeltaDualityViewCompModCollectionRefsDefinitionsMap
 * ) => DualityViewJsonSchemaProperties}
 * */
const recursivelyParseProperties = _ => (properties, collectionRefsDefinitionsMap) => {
	/**
	 * @type {Array<[string, DeltaDualityViewRoleProperty]>}
	 * */
	const arrayOfCodesAndJsonSchemas = _.toPairs(properties);

	const arrayOfCodesAndFeJsonSchemas = arrayOfCodesAndJsonSchemas.map(([code, jsonSchema]) => {
		if (jsonSchema.type === DualityViewPropertiesType.JOIN_SUBQUERY_TYPE) {
			const mappedJsonSchema = mapSubquery(_)(code, jsonSchema, collectionRefsDefinitionsMap);
			return [code, mappedJsonSchema];
		}
		const mappedJsonSchema = mapRegularField(_)(code, jsonSchema, collectionRefsDefinitionsMap);
		return [code, mappedJsonSchema];
	});

	return _.fromPairs(arrayOfCodesAndFeJsonSchemas);
};

/**
 * @return {(view: DeltaDualityView) => DualityViewJsonSchemaProperties}
 * */
const parseProperties = _ => view => {
	const properties = _.get(view, 'role.properties', {});
	const collectionRefsDefinitionsMap = _.get(view, 'role.compMod.collectionData.collectionRefsDefinitionsMap', {});
	return recursivelyParseProperties(_)(properties, collectionRefsDefinitionsMap);
};

/**
 * @return {(view: DeltaDualityView) => DualityViewJsonSchema}
 * */
const mapToFeJsonSchema = _ => view => {
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
	};
};

/**
 * @return {(view: DeltaDualityView) => DualityViewRelatedSchemas}
 * */
const mapToFeRelatedSchemas = _ => view => {
	/**
	 * @type {DeltaDualityViewCompModCollectionRefsDefinitionsMap}
	 * */
	const collectionRefsDefinitionsMap = _.get(view, 'role.compMod.collectionData.collectionRefsDefinitionsMap', {});

	/**
	 * @type {Array<[ refId, DeltaDualityViewCompModCollectionRefsDefinitionsMapValue ]>}
	 * */
	const arrayOfRefIdsAndCollections = _.toPairs(collectionRefsDefinitionsMap);

	/**
	 * @type {Array<[ refId, RelatedSchema ]>}
	 * */
	const arrayOfRefIdsAndFeCollections = arrayOfRefIdsAndCollections.map(([refId, collection]) => {
		const bucketName = _.get(collection, 'bucket[0].name', '');
		/**
		 * @type {DeltaDualityViewCompModEntityData}
		 * */
		const collectionData = _.get(collection, 'collection[0]', '');
		const definition = collection.definition || {};

		/**
		 * @type {RelatedSchemaProperties}
		 * */
		const properties = {
			[definition.code || definition.name]: {
				GUID: collection.definitionId,
			},
		};
		/**
		 * @type {RelatedSchema}
		 * */
		const feCollection = {
			properties,
			bucketName,
			code: collectionData.code,
			collectionName: collectionData.collectionName,
		};
		return [refId, feCollection];
	});

	return _.fromPairs(arrayOfRefIdsAndFeCollections);
};

/**
 * @return {(view: DeltaDualityView) => CreateDualityViewDto}
 * */
const mapDeltaDualityViewToFeDualityView = _ => view => {
	const feView = mapToFeView(_)(view);
	const feJsonSchema = mapToFeJsonSchema(_)(view);
	const feRelatedSchemas = mapToFeRelatedSchemas(_)(view);

	return {
		view: feView,
		jsonSchema: feJsonSchema,
		relatedSchemas: feRelatedSchemas,
	};
};

module.exports = {
	mapDeltaDualityViewToFeDualityView,
};
