const _ = require('lodash');
const { AlterScriptDto, SCRIPT_TYPE } = require('../../types/AlterScriptDto');
const {
	AlterCollectionDto,
	AlterCollectionColumnDto,
	AlterCollectionRoleCompModUniqueKeyDto,
	AlterCollectionColumnKeyOptionDto,
	AlterCollectionRoleCompModUniqueKey,
} = require('../../types/AlterCollectionDto');
const { UniqueKeyTransitionDto, KeyScriptModificationDto, AlterKeyDto } = require('../../types/AlterKeyDto');
const {
	getFullCollectionName,
	getSchemaOfAlterCollection,
	getEntityName,
	wrapInQuotes,
	prepareNameForScriptFormat,
	isParentContainerActivated,
	isObjectInDeltaModelActivated,
} = require('../../../utils/general');
const { sortModifyKeyConstraints } = require('./sortModifyKeyConstraints');
const { assignTemplates } = require('../../../utils/assignTemplates');
const templates = require('../../../ddlProvider/templates');
const { extractKeyConstraintOptions } = require('./extractKeyConstraintOptions');

const amountOfColumnsInRegularUniqueKey = 1;

const isCompositeEqualsToRegular = (compositeKeys, regularOptions) => {
	return compositeKeys.some(compositeUK => {
		if (compositeUK.compositeUniqueKey.length !== amountOfColumnsInRegularUniqueKey) {
			return false;
		}
		const oldCompositeUniqueKeyAsRegularUniqueKeyOptions = extractKeyConstraintOptions(compositeUK);

		return _.isEqual(oldCompositeUniqueKeyAsRegularUniqueKeyOptions, regularOptions);
	});
};

const checkIsUniqueKeyRegular = columnJsonSchema => {
	return Boolean(columnJsonSchema?.unique) && !columnJsonSchema?.compositeUniqueKey;
};

/**
 * @param {AlterCollectionDto} collection
 * @return {UniqueKeyTransitionDto}
 * */
const wasCompositeUniqueKeyChangedInTransitionFromCompositeToRegular = collection => {
	/**
	 * @type {AlterCollectionRoleCompModUniqueKey}
	 * */
	const uniqueDto = collection?.role?.compMod?.uniqueKey || {};
	/**
	 * @type {AlterCollectionRoleCompModUniqueKeyDto[]}
	 * */
	const oldUniqueKeys = uniqueDto.old || [];
	const idsOfColumns = oldUniqueKeys.flatMap(unique => unique.compositeUniqueKey.map(dto => dto.keyId));
	if (idsOfColumns.length !== amountOfColumnsInRegularUniqueKey) {
		// We return false, because it wouldn't count as transition between regular UniqueKey and composite UniqueKey
		// if composite UniqueKey did not constraint exactly 1 column
		return UniqueKeyTransitionDto.noTransition();
	}
	const idOfUniqueKeyColumn = idsOfColumns[0];
	const newColumnJsonSchema = Object.values(collection.properties || {}).find(
		columnJsonSchema => columnJsonSchema.GUID === idOfUniqueKeyColumn,
	);
	if (!newColumnJsonSchema) {
		return UniqueKeyTransitionDto.noTransition();
	}
	const isNewColumnARegularUniqueKey = checkIsUniqueKeyRegular(newColumnJsonSchema);
	if (!isNewColumnARegularUniqueKey) {
		return UniqueKeyTransitionDto.noTransition();
	}
	const constraintOptions = extractKeyConstraintOptions(newColumnJsonSchema.uniqueKeyOptions);
	const areOptionsEqual = isCompositeEqualsToRegular(oldUniqueKeys, constraintOptions);

	return UniqueKeyTransitionDto.transition(!areOptionsEqual);
};

/**
 * @param {AlterCollectionDto} collection
 * @return {UniqueKeyTransitionDto}
 * */
const wasCompositeUniqueKeyChangedInTransitionFromRegularToComposite = collection => {
	/**
	 * @type {AlterCollectionRoleCompModUniqueKey}
	 * */
	const uniqueDto = collection?.role?.compMod?.uniqueKey || {};
	/**
	 * @type {AlterCollectionRoleCompModUniqueKeyDto[]}
	 * */
	const newUniqueKeys = uniqueDto.new || [];
	const idsOfColumns = newUniqueKeys.flatMap(unique => unique.compositeUniqueKey?.map(dto => dto.keyId));
	if (idsOfColumns.length !== amountOfColumnsInRegularUniqueKey) {
		// We return false, because it wouldn't count as transition between regular UniqueKey and composite UniqueKey
		// if composite UniqueKey does not constraint exactly 1 column
		return UniqueKeyTransitionDto.noTransition();
	}
	const idOfUniqueKeyColumn = idsOfColumns[0];
	const oldColumnJsonSchema = Object.values(collection.role.properties).find(
		columnJsonSchema => columnJsonSchema.GUID === idOfUniqueKeyColumn,
	);
	if (!oldColumnJsonSchema) {
		return UniqueKeyTransitionDto.noTransition();
	}
	const isOldColumnARegularUniqueKey = checkIsUniqueKeyRegular(oldColumnJsonSchema);
	if (!isOldColumnARegularUniqueKey) {
		return UniqueKeyTransitionDto.noTransition();
	}
	const constraintOptions = extractKeyConstraintOptions(oldColumnJsonSchema.uniqueKeyOptions);
	const areOptionsEqual = isCompositeEqualsToRegular(newUniqueKeys, constraintOptions);

	return UniqueKeyTransitionDto.transition(!areOptionsEqual);
};

/**
 * @param {AlterCollectionRoleCompModUniqueKeyDto} uniqueKey
 * @param {AlterCollectionDto} entity
 * @return {AlterKeyDto}
 * */
const getCreateCompositeUniqueKeyDDLProviderConfig = (uniqueKey, entity) => {
	const uniqueColumns = _.toPairs(entity.role.properties)
		.filter(([name, jsonSchema]) =>
			Boolean(uniqueKey.compositeUniqueKey?.find(keyDto => keyDto.keyId === jsonSchema.GUID)),
		)
		.map(([name, jsonSchema]) => ({
			name,
			isActivated: jsonSchema.isActivated,
		}));

	return {
		constraintName: uniqueKey.constraintName,
		keyType: 'UNIQUE',
		columns: uniqueColumns,
		deferClause: uniqueKey.deferClause,
		rely: uniqueKey.rely,
		validate: uniqueKey.validate,
		indexClause: uniqueKey.indexClause,
		exceptionClause: uniqueKey.exceptionClause,
	};
};

/**
 * @param {object} params
 * @property {string} scriptFormat
 * @property {AlterCollectionDto} collection
 * @return {Array<KeyScriptModificationDto>}
 * */
const getAddCompositeUniqueKeyScriptDtos = ({ scriptFormat, collection }) => {
	const prepareName = prepareNameForScriptFormat(scriptFormat);
	const { alterKeyConstraint } = require('../../../ddlProvider/ddlHelpers/constraintHelper')({ prepareName });

	/**
	 * @type {AlterCollectionRoleCompModUniqueKey}
	 * */
	const uniqueDto = collection?.role?.compMod?.uniqueKey || {};
	const newUniqueKeys = uniqueDto.new || [];
	const oldUniqueKeys = uniqueDto.old || [];
	if (newUniqueKeys.length === 0 && oldUniqueKeys.length === 0) {
		return [];
	}
	const transitionToCompositeDto = wasCompositeUniqueKeyChangedInTransitionFromRegularToComposite(collection);
	if (transitionToCompositeDto.didTransitionHappen && !transitionToCompositeDto.wasUniqueKeyChangedInTransition) {
		return [];
	}
	if (newUniqueKeys.length === oldUniqueKeys.length) {
		const areKeyArraysEqual = _(oldUniqueKeys).differenceWith(newUniqueKeys, _.isEqual).isEmpty();
		if (areKeyArraysEqual) {
			return [];
		}
	}

	const collectionSchema = getSchemaOfAlterCollection(collection);
	const fullTableName = getFullCollectionName(scriptFormat)(collectionSchema);

	return newUniqueKeys
		.map(newUniqueKey => {
			const ddlConfig = getCreateCompositeUniqueKeyDDLProviderConfig(newUniqueKey, collection);
			const statementDto = alterKeyConstraint(fullTableName, collection.isActivated, ddlConfig);

			return new KeyScriptModificationDto(statementDto.statement, fullTableName, false, statementDto.isActivated);
		})
		.filter(scriptDto => Boolean(scriptDto.script));
};

const getDropCompositeUniqueKeyScriptDtos = ({ scriptFormat, collection }) => {
	const uniqueDto = collection?.role?.compMod?.uniqueKey || {};
	const newUniqueKeys = uniqueDto.new || [];
	const oldUniqueKeys = uniqueDto.old || [];
	if (newUniqueKeys.length === 0 && oldUniqueKeys.length === 0) {
		return [];
	}
	const transitionToCompositeDto = wasCompositeUniqueKeyChangedInTransitionFromCompositeToRegular(collection);
	if (transitionToCompositeDto.didTransitionHappen && !transitionToCompositeDto.wasUniqueKeyChangedInTransition) {
		return [];
	}
	if (newUniqueKeys.length === oldUniqueKeys.length) {
		const areKeyArraysEqual = _(oldUniqueKeys).differenceWith(newUniqueKeys, _.isEqual).isEmpty();
		if (areKeyArraysEqual) {
			return [];
		}
	}

	const prepareName = prepareNameForScriptFormat(scriptFormat);
	const { dropKeyConstraint } = require('../../../ddlProvider/ddlHelpers/constraintHelper')({ prepareName });

	const collectionSchema = getSchemaOfAlterCollection(collection);
	const fullTableName = getFullCollectionName(scriptFormat)(collectionSchema);

	const isContainerActivated = isParentContainerActivated(collection);
	const isCollectionActivated = isContainerActivated && isObjectInDeltaModelActivated(collection);

	return oldUniqueKeys
		.map(oldUniqueKey => {
			const script = dropKeyConstraint(fullTableName, oldUniqueKey.constraintName);
			return new KeyScriptModificationDto(script, fullTableName, true, isCollectionActivated);
		})
		.filter(scriptDto => Boolean(scriptDto.script));
};

/**
 * @param {object} params
 * @property {string} scriptFormat
 * @property {AlterCollectionDto} collection
 * @return {Array<KeyScriptModificationDto>}
 * */
const getModifyCompositeUniqueKeyScriptDtos = ({ scriptFormat, collection }) => {
	const dropCompositeUniqueKeyScriptDtos = getDropCompositeUniqueKeyScriptDtos({ scriptFormat, collection });
	const addCompositeUniqueKeyScriptDtos = getAddCompositeUniqueKeyScriptDtos({ scriptFormat, collection });

	return [...dropCompositeUniqueKeyScriptDtos, ...addCompositeUniqueKeyScriptDtos].filter(Boolean);
};

/**
 * @param {string} columnName
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @return {AlterKeyDto}
 * */
const getCreateRegularUniqueKeyDDLProviderConfig = (columnName, columnJsonSchema) => {
	const uniqueColumns = [
		{
			name: columnName,
			isActivated: columnJsonSchema.isActivated,
		},
	];

	return {
		constraintName: columnJsonSchema.uniqueKeyOptions?.constraintName,
		keyType: 'UNIQUE',
		columns: uniqueColumns,
		include: columnJsonSchema.uniqueKeyOptions?.includeColumns,
		deferClause: columnJsonSchema.uniqueKeyOptions?.deferClause,
		rely: columnJsonSchema.uniqueKeyOptions?.rely,
		validate: columnJsonSchema.uniqueKeyOptions?.validate,
		indexClause: columnJsonSchema.uniqueKeyOptions?.indexClause,
		exceptionClause: columnJsonSchema.uniqueKeyOptions?.exceptionClause,
	};
};

/**
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @param {AlterCollectionDto} collection
 * @return {boolean}
 * */
const wasFieldChangedToBeARegularUniqueKey = (columnJsonSchema, collection) => {
	const oldName = columnJsonSchema.compMod.oldField.name;
	const oldColumnJsonSchema = collection.role.properties[oldName];

	const isRegularUniqueKey = checkIsUniqueKeyRegular(columnJsonSchema);
	const wasTheFieldAnyUniqueKey = oldColumnJsonSchema?.unique || oldColumnJsonSchema.compositeUniqueKey;

	return isRegularUniqueKey && !wasTheFieldAnyUniqueKey;
};

/**
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @param {AlterCollectionDto} collection
 * @return {UniqueKeyTransitionDto}
 * */
const wasRegularUniqueKeyChangedInTransitionFromCompositeToRegular = (columnJsonSchema, collection) => {
	const oldName = columnJsonSchema.compMod.oldField.name;
	const oldColumnJsonSchema = collection.role.properties[oldName];

	const isRegularUniqueKey = checkIsUniqueKeyRegular(columnJsonSchema);
	const wasTheFieldAnyUniqueKey = oldColumnJsonSchema?.unique || oldColumnJsonSchema.compositeUniqueKey;

	if (!(isRegularUniqueKey && wasTheFieldAnyUniqueKey)) {
		return UniqueKeyTransitionDto.noTransition();
	}

	/**
	 * @type {AlterCollectionRoleCompModUniqueKey}
	 * */
	const uniqueDto = collection?.role?.compMod?.uniqueKey || {};
	const newUniqueKeys = uniqueDto.new || [];
	/**
	 * @type {AlterCollectionRoleCompModUniqueKeyDto[]}
	 * */
	const oldUniqueKeys = uniqueDto.old || [];
	const wasTheFieldACompositeUniqueKey = oldUniqueKeys.some(compUniqueKey =>
		compUniqueKey.compositeUniqueKey.some(unique => unique.keyId === oldColumnJsonSchema.GUID),
	);
	const isTheFieldACompositeUniqueKey = newUniqueKeys.some(compUniqueKey =>
		compUniqueKey.compositeUniqueKey.some(unique => unique.keyId === columnJsonSchema.GUID),
	);

	const wasCompositeUniqueKeyRemoved = wasTheFieldACompositeUniqueKey && !isTheFieldACompositeUniqueKey;

	if (isRegularUniqueKey && wasCompositeUniqueKeyRemoved) {
		// return compare custom properties and amount of columns.
		// If there was a transition and amount of composite UniqueKey columns is not equal
		// to amount of regular unique columns, we must recreate UniqueKey
		const constraintOptions = extractKeyConstraintOptions(columnJsonSchema.uniqueKeyOptions);
		const areOptionsEqual = isCompositeEqualsToRegular(oldUniqueKeys, constraintOptions);
		return UniqueKeyTransitionDto.transition(!areOptionsEqual);
	}

	return UniqueKeyTransitionDto.noTransition();
};

/**
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @param {AlterCollectionDto} collection
 * @return {UniqueKeyTransitionDto}
 * */
const wasRegularUniqueKeyChangedInTransitionFromRegularToComposite = (columnJsonSchema, collection) => {
	const oldName = columnJsonSchema.compMod.oldField.name;
	const oldColumnJsonSchema = collection.role.properties[oldName];

	const wasRegularUniqueKey = checkIsUniqueKeyRegular(oldColumnJsonSchema);
	const isCompositeUniqueKey = Boolean(columnJsonSchema?.compositeUniqueKey);

	if (!(wasRegularUniqueKey && isCompositeUniqueKey)) {
		return UniqueKeyTransitionDto.noTransition();
	}

	/**
	 * @type {AlterCollectionRoleCompModUniqueKey}
	 * */
	const uniqueDto = collection?.role?.compMod?.uniqueKey || {};
	const newUniqueKeys = uniqueDto.new || [];
	/**
	 * @type {AlterCollectionRoleCompModUniqueKeyDto[]}
	 * */
	const oldUniqueKeys = uniqueDto.old || [];
	const wasTheFieldACompositeUniqueKey = oldUniqueKeys.some(compUniqueKey =>
		compUniqueKey.compositeUniqueKey.some(unique => unique.keyId === oldColumnJsonSchema.GUID),
	);
	const isTheFieldACompositeUniqueKey = newUniqueKeys.some(compUniqueKey =>
		compUniqueKey.compositeUniqueKey.some(unique => unique.keyId === columnJsonSchema.GUID),
	);

	const wasCompositeUniqueKeyAdded = isTheFieldACompositeUniqueKey && !wasTheFieldACompositeUniqueKey;

	if (wasRegularUniqueKey && wasCompositeUniqueKeyAdded) {
		// return compare custom properties and amount of columns.
		// If there was a transition and amount of composite UniqueKey columns is not equal
		// to amount of regular unique columns, we must recreate UniqueKey
		const constraintOptions = extractKeyConstraintOptions(oldColumnJsonSchema.uniqueKeyOptions);
		const areOptionsEqual = isCompositeEqualsToRegular(newUniqueKeys, constraintOptions);

		return UniqueKeyTransitionDto.transition(!areOptionsEqual);
	}

	return UniqueKeyTransitionDto.noTransition();
};

/**
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @param {AlterCollectionDto} collection
 * @return {boolean}
 * */
const isFieldNoLongerARegularUniqueKey = (columnJsonSchema, collection) => {
	const oldName = columnJsonSchema.compMod.oldField.name;

	const oldJsonSchema = collection.role.properties[oldName];
	const wasTheFieldARegularUniqueKey = checkIsUniqueKeyRegular(oldJsonSchema);

	const isNotAnyUniqueKey = !columnJsonSchema.unique && !columnJsonSchema.compositeUniqueKey;
	return wasTheFieldARegularUniqueKey && isNotAnyUniqueKey;
};

/**
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @param {AlterCollectionDto} collection
 * @return {boolean}
 * */
const wasRegularUniqueKeyModified = (columnJsonSchema, collection) => {
	const oldName = columnJsonSchema.compMod.oldField.name;
	const oldJsonSchema = collection.role.properties[oldName] || {};

	const isRegularUniqueKey = columnJsonSchema.unique && !columnJsonSchema.compositeUniqueKey;
	const wasTheFieldARegularUniqueKey = oldJsonSchema?.unique && !oldJsonSchema?.compositeUniqueKey;

	if (!(isRegularUniqueKey && wasTheFieldARegularUniqueKey)) {
		return false;
	}

	const constraintOptions = extractKeyConstraintOptions(columnJsonSchema.uniqueKeyOptions);
	const oldConstraintOptions = extractKeyConstraintOptions(oldJsonSchema.uniqueKeyOptions);

	return !_.isEqual(oldConstraintOptions, constraintOptions);
};

/**
 * @param {object} params
 * @property {string} scriptFormat
 * @property {AlterCollectionDto} collection
 * @return {Array<KeyScriptModificationDto>}
 * */
const getAddUniqueKeyScriptDtos = ({ scriptFormat, collection }) => {
	const prepareName = prepareNameForScriptFormat(scriptFormat);
	const { alterKeyConstraint } = require('../../../ddlProvider/ddlHelpers/constraintHelper')({ prepareName });

	const collectionSchema = getSchemaOfAlterCollection(collection);
	const fullTableName = getFullCollectionName(scriptFormat)(collectionSchema);

	return _.toPairs(collection.properties)
		.filter(([name, jsonSchema]) => {
			if (wasFieldChangedToBeARegularUniqueKey(jsonSchema, collection)) {
				return true;
			}
			const transitionToRegularDto = wasRegularUniqueKeyChangedInTransitionFromCompositeToRegular(
				jsonSchema,
				collection,
			);
			if (transitionToRegularDto.didTransitionHappen) {
				return transitionToRegularDto.wasUniqueKeyChangedInTransition;
			}
			return wasRegularUniqueKeyModified(jsonSchema, collection);
		})
		.map(([name, jsonSchema]) => {
			const ddlConfig = getCreateRegularUniqueKeyDDLProviderConfig(name, jsonSchema);
			const statementDto = alterKeyConstraint(fullTableName, collection.isActivated, ddlConfig);
			return new KeyScriptModificationDto(statementDto.statement, fullTableName, false, statementDto.isActivated);
		})
		.filter(scriptDto => Boolean(scriptDto.script));
};

const getDropUniqueKeyScriptDtos = ({ scriptFormat, collection }) => {
	const collectionSchema = getSchemaOfAlterCollection(collection);
	const tableName = getEntityName(collectionSchema);
	const fullTableName = getFullCollectionName(scriptFormat)(collectionSchema);

	const isContainerActivated = isParentContainerActivated(collection);
	const isCollectionActivated = isContainerActivated && isObjectInDeltaModelActivated(collection);

	return _.toPairs(collection.properties)
		.filter(([name, jsonSchema]) => {
			if (isFieldNoLongerARegularUniqueKey(jsonSchema, collection)) {
				return true;
			}
			const transitionToRegularDto = wasRegularUniqueKeyChangedInTransitionFromRegularToComposite(
				jsonSchema,
				collection,
			);
			if (transitionToRegularDto.didTransitionHappen) {
				return transitionToRegularDto.wasUniqueKeyChangedInTransition;
			}
			return wasRegularUniqueKeyModified(jsonSchema, collection);
		})
		.map(([name, jsonSchema]) => {
			const oldName = jsonSchema.compMod.oldField.name;
			const oldColumnJsonSchema = collection.role.properties[oldName];
			const constraintName = oldColumnJsonSchema?.uniqueKeyOptions?.constraintName;

			const script = constraintName
				? assignTemplates(templates.dropConstraint, {
						tableName: fullTableName,
						constraintName: prepareNameForScriptFormat(scriptFormat)(constraintName),
					})
				: assignTemplates(templates.dropUniqueKey, {
						tableName,
						fullTableName,
						tableColumn: name,
					});
			return new KeyScriptModificationDto(script, fullTableName, true, isCollectionActivated);
		})
		.filter(scriptDto => Boolean(scriptDto.script));
};

/**
 * @param {object} params
 * @property {string} scriptFormat
 * @property {AlterCollectionDto} collection
 * @return {Array<KeyScriptModificationDto>}
 * */
const getModifyUniqueKeyScriptDtos = ({ scriptFormat, collection }) => {
	const dropUniqueKeyScriptDtos = getDropUniqueKeyScriptDtos({ scriptFormat, collection });
	const addUniqueKeyScriptDtos = getAddUniqueKeyScriptDtos({ scriptFormat, collection });

	return [...dropUniqueKeyScriptDtos, ...addUniqueKeyScriptDtos].filter(Boolean);
};

/**
 * @param {AlterCollectionDto} collection
 * @param {string} dbVersion
 * @return {Array<AlterScriptDto>}
 * */
const getModifyUniqueKeyConstraintsScriptDtos = ({ scriptFormat, collection }) => {
	const modifyCompositeUniqueKeyScriptDtos = getModifyCompositeUniqueKeyScriptDtos({ scriptFormat, collection });
	const modifyUniqueKeyScriptDtos = getModifyUniqueKeyScriptDtos({ scriptFormat, collection });

	const allDtos = [...modifyCompositeUniqueKeyScriptDtos, ...modifyUniqueKeyScriptDtos].filter(Boolean);
	const sortedAllDtos = sortModifyKeyConstraints(allDtos);

	return sortedAllDtos.map(dto =>
		AlterScriptDto.getInstance(dto.script, dto.isActivated, dto.isDropScript, SCRIPT_TYPE.alterEntity),
	);
};

module.exports = {
	getModifyUniqueKeyConstraintsScriptDtos,
};
