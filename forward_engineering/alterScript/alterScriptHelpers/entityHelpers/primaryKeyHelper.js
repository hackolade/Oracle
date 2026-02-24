const _ = require('lodash');
const { AlterScriptDto } = require('../../types/AlterScriptDto');
const {
	AlterCollectionDto,
	AlterCollectionColumnDto,
	AlterCollectionRoleCompModPKDto,
	AlterCollectionColumnKeyOptionDto,
	AlterCollectionRoleCompModPrimaryKey,
} = require('../../types/AlterCollectionDto');
const { PrimaryKeyTransitionDto, KeyScriptModificationDto, AlterKeyDto } = require('../../types/AlterKeyDto');
const {
	getFullCollectionName,
	getSchemaOfAlterCollection,
	getEntityName,
	prepareNameForScriptFormat,
	isParentContainerActivated,
	isObjectInDeltaModelActivated,
} = require('../../../utils/general');
const { sortModifyKeyConstraints } = require('./sortModifyKeyConstraints');
const templates = require('../../../ddlProvider/templates');
const { assignTemplates } = require('../../../utils/assignTemplates');
const { extractKeyConstraintOptions } = require('./extractKeyConstraintOptions');

const amountOfColumnsInRegularPk = 1;

/**
 * @param {AlterCollectionRoleCompModPKDto} primaryKey
 * @param {AlterCollectionDto} entity
 * @return {AlterKeyDto}
 * */
const getCreateCompositePKDDLProviderConfig = (primaryKey, entity) => {
	const columns = _.toPairs(entity.role.properties)
		.filter(([name, jsonSchema]) =>
			Boolean(primaryKey.compositePrimaryKey?.find(keyDto => keyDto.keyId === jsonSchema.GUID)),
		)
		.map(([name, jsonSchema]) => ({
			name,
			isActivated: jsonSchema.isActivated,
		}));

	return {
		constraintName: primaryKey.constraintName,
		keyType: 'PRIMARY KEY',
		columns,
	};
};

const isCompositeEqualsToRegular = (compositeKeys, regularOptions) => {
	return compositeKeys.some(compositePk => {
		if (compositePk.compositePrimaryKey?.length !== amountOfColumnsInRegularPk) {
			return false;
		}
		const compositePkAsRegularPkOptions = extractKeyConstraintOptions(compositePk);

		return _.isEqual(compositePkAsRegularPkOptions, regularOptions);
	});
};

const checkIsPrimaryKeyRegular = columnJsonSchema => {
	return Boolean(columnJsonSchema?.primaryKey) && !columnJsonSchema?.compositePrimaryKey;
};

const wasCompositePkChangedInTransitionFromCompositeToRegular = collection => {
	/**
	 * @type {AlterCollectionRoleCompModPrimaryKey}
	 * */
	const pkDto = collection?.role?.compMod?.primaryKey || {};
	/**
	 * @type {AlterCollectionRoleCompModPKDto[]}
	 * */
	const oldPrimaryKeys = pkDto.old || [];
	const idsOfColumns = oldPrimaryKeys.flatMap(pk => pk.compositePrimaryKey?.map(dto => dto.keyId) || []);

	if (idsOfColumns.length !== amountOfColumnsInRegularPk) {
		// We return false, because it wouldn't count as transition between regular PK and composite PK
		// if composite PK did not constraint exactly 1 column
		return PrimaryKeyTransitionDto.noTransition();
	}

	const idOfPkColumn = idsOfColumns[0];
	const newColumnJsonSchema = Object.values(collection.properties).find(
		columnJsonSchema => columnJsonSchema.GUID === idOfPkColumn,
	);

	if (!newColumnJsonSchema) {
		return PrimaryKeyTransitionDto.noTransition();
	}

	const isNewColumnARegularPrimaryKey = checkIsPrimaryKeyRegular(newColumnJsonSchema);

	if (!isNewColumnARegularPrimaryKey) {
		return PrimaryKeyTransitionDto.noTransition();
	}

	const constraintOptions = extractKeyConstraintOptions(newColumnJsonSchema.primaryKeyOptions);
	const areOptionsEqual = isCompositeEqualsToRegular(oldPrimaryKeys, constraintOptions);

	return PrimaryKeyTransitionDto.transition(!areOptionsEqual);
};

const wasCompositePkChangedInTransitionFromRegularToComposite = collection => {
	/**
	 * @type {AlterCollectionRoleCompModPrimaryKey}
	 * */
	const pkDto = collection?.role?.compMod?.primaryKey || {};
	/**
	 * @type {AlterCollectionRoleCompModPKDto[]}
	 * */
	const newPrimaryKeys = pkDto.new || [];
	const idsOfColumns = newPrimaryKeys.flatMap(pk => pk.compositePrimaryKey?.map(dto => dto.keyId) || []);

	if (idsOfColumns.length !== amountOfColumnsInRegularPk) {
		// We return false, because it wouldn't count as transition between regular PK and composite PK
		// if composite PK does not constraint exactly 1 column
		return PrimaryKeyTransitionDto.noTransition();
	}

	const idOfPkColumn = idsOfColumns[0];
	const oldColumnJsonSchema = Object.values(collection.role.properties).find(
		columnJsonSchema => columnJsonSchema.GUID === idOfPkColumn,
	);

	if (!oldColumnJsonSchema) {
		return PrimaryKeyTransitionDto.noTransition();
	}

	const isOldColumnARegularPrimaryKey = checkIsPrimaryKeyRegular(oldColumnJsonSchema);

	if (!isOldColumnARegularPrimaryKey) {
		return PrimaryKeyTransitionDto.noTransition();
	}

	const constraintOptions = extractKeyConstraintOptions(oldColumnJsonSchema.primaryKeyOptions);
	const areOptionsEqual = isCompositeEqualsToRegular(newPrimaryKeys, constraintOptions);

	return PrimaryKeyTransitionDto.transition(!areOptionsEqual);
};

/**
 * @param {AlterCollectionDto} collection
 * @return {Array<KeyScriptModificationDto>}
 * */
const getAddCompositePkScriptDtos = ({ scriptFormat, collection }) => {
	const prepareName = prepareNameForScriptFormat(scriptFormat);
	const { alterKeyConstraint } = require('../../../ddlProvider/ddlHelpers/constraintHelper')({ prepareName });

	/**
	 * @type {AlterCollectionRoleCompModPrimaryKey}
	 * */
	const pkDto = collection?.role?.compMod?.primaryKey || {};
	const newPrimaryKeys = pkDto.new || [];
	const oldPrimaryKeys = pkDto.old || [];
	if (newPrimaryKeys.length === 0 && oldPrimaryKeys.length === 0) {
		return [];
	}

	const transitionToCompositeDto = wasCompositePkChangedInTransitionFromRegularToComposite(collection);
	if (transitionToCompositeDto.didTransitionHappen && !transitionToCompositeDto.wasPkChangedInTransition) {
		return [];
	}

	if (newPrimaryKeys.length === oldPrimaryKeys.length) {
		const areKeyArraysEqual = _(oldPrimaryKeys).differenceWith(newPrimaryKeys, _.isEqual).isEmpty();
		if (areKeyArraysEqual) {
			return [];
		}
	}

	const collectionSchema = getSchemaOfAlterCollection(collection);
	const fullTableName = getFullCollectionName(scriptFormat)(collectionSchema);

	return newPrimaryKeys
		.map(newPk => {
			const ddlConfig = getCreateCompositePKDDLProviderConfig(newPk, collection);
			const statementDto = alterKeyConstraint(fullTableName, collection.isActivated, ddlConfig);

			return new KeyScriptModificationDto(statementDto.statement, fullTableName, false, statementDto.isActivated);
		})
		.filter(scriptDto => Boolean(scriptDto.script));
};

const getDropCompositePkScriptDtos = ({ scriptFormat, collection }) => {
	const pkDto = collection?.role?.compMod?.primaryKey || {};
	const newPrimaryKeys = pkDto.new || [];
	const oldPrimaryKeys = pkDto.old || [];
	if (newPrimaryKeys.length === 0 && oldPrimaryKeys.length === 0) {
		return [];
	}
	const transitionToCompositeDto = wasCompositePkChangedInTransitionFromCompositeToRegular(collection);
	if (transitionToCompositeDto.didTransitionHappen && !transitionToCompositeDto.wasPkChangedInTransition) {
		return [];
	}
	if (newPrimaryKeys.length === oldPrimaryKeys.length) {
		const areKeyArraysEqual = _(oldPrimaryKeys).differenceWith(newPrimaryKeys, _.isEqual).isEmpty();
		if (areKeyArraysEqual) {
			return [];
		}
	}

	const collectionSchema = getSchemaOfAlterCollection(collection);
	const fullTableName = getFullCollectionName(scriptFormat)(collectionSchema);

	const isContainerActivated = isParentContainerActivated(collection);
	const isCollectionActivated = isContainerActivated && isObjectInDeltaModelActivated(collection);

	return oldPrimaryKeys
		.map(oldPk => {
			const script = assignTemplates(templates.dropPrimaryKey, { tableName: fullTableName });
			return new KeyScriptModificationDto(script, fullTableName, true, isCollectionActivated);
		})
		.filter(scriptDto => Boolean(scriptDto.script));
};

/**
 * @param {object} params
 * @property {string} [scriptFormat]
 * @property {AlterCollectionDto} collection
 * @return {Array<KeyScriptModificationDto>}
 * */
const getModifyCompositePkScriptDtos = ({ scriptFormat, collection }) => {
	const dropCompositePkScriptDtos = getDropCompositePkScriptDtos({ scriptFormat, collection });
	const addCompositePkScriptDtos = getAddCompositePkScriptDtos({ scriptFormat, collection });

	return [...dropCompositePkScriptDtos, ...addCompositePkScriptDtos].filter(Boolean);
};

/**
 * @param {string} columnName
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @return {AlterKeyDto}
 * */
const getCreateRegularPKDDLProviderConfig = (columnName, columnJsonSchema) => {
	const columns = [
		{
			name: columnName,
			isActivated: columnJsonSchema.isActivated,
		},
	];

	return {
		constraintName: columnJsonSchema.primaryKeyOptions?.constraintName,
		keyType: 'PRIMARY KEY',
		columns: columns,
		deferClause: columnJsonSchema.primaryKeyOptions?.deferClause,
		rely: columnJsonSchema.primaryKeyOptions?.rely,
		validate: columnJsonSchema.primaryKeyOptions?.validate,
		indexClause: columnJsonSchema.primaryKeyOptions?.indexClause,
		exceptionClause: columnJsonSchema.primaryKeyOptions?.exceptionClause,
	};
};

/**
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @param {AlterCollectionDto} collection
 * @return {boolean}
 * */
const isFieldChangedToRegularPk = (columnJsonSchema, collection) => {
	const oldName = columnJsonSchema.compMod.oldField.name;
	const oldJsonSchema = collection.role.properties[oldName];

	const isRegularPrimaryKey = checkIsPrimaryKeyRegular(columnJsonSchema);
	const wasTheFieldRegularPrimaryKey = Boolean(oldJsonSchema?.primaryKey);

	return isRegularPrimaryKey && !wasTheFieldRegularPrimaryKey;
};

/**
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @param {AlterCollectionDto} collection
 * @return {boolean}
 * */
const isFieldNoLongerARegularPk = (columnJsonSchema, collection) => {
	const oldName = columnJsonSchema.compMod.oldField.name;

	const oldJsonSchema = collection.role.properties[oldName];
	const wasTheFieldARegularPrimaryKey = checkIsPrimaryKeyRegular(oldJsonSchema);

	const isNotAnyPrimaryKey = !columnJsonSchema.primaryKey && !columnJsonSchema.compositePrimaryKey;
	return wasTheFieldARegularPrimaryKey && isNotAnyPrimaryKey;
};

/**
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @param {AlterCollectionDto} collection
 * @return {PrimaryKeyTransitionDto}
 * */
const wasRegularPkChangedInTransitionFromCompositeToRegular = (columnJsonSchema, collection) => {
	const oldName = columnJsonSchema.compMod.oldField.name;
	const oldColumnJsonSchema = collection.role.properties[oldName];

	const isRegularPrimaryKey = checkIsPrimaryKeyRegular(columnJsonSchema);
	const wasTheFieldAnyPrimaryKey = Boolean(oldColumnJsonSchema?.primaryKey);

	if (!(isRegularPrimaryKey && wasTheFieldAnyPrimaryKey)) {
		return PrimaryKeyTransitionDto.noTransition();
	}

	/**
	 * @type {AlterCollectionRoleCompModPrimaryKey}
	 * */
	const pkDto = collection?.role?.compMod?.primaryKey || {};
	const newPrimaryKeys = pkDto.new || [];
	/**
	 * @type {AlterCollectionRoleCompModPKDto[]}
	 * */
	const oldPrimaryKeys = pkDto.old || [];
	const wasTheFieldACompositePrimaryKey = oldPrimaryKeys.some(compPk =>
		compPk.compositePrimaryKey.some(pk => pk.keyId === oldColumnJsonSchema.GUID),
	);
	const isTheFieldACompositePrimaryKey = newPrimaryKeys.some(compPk =>
		compPk.compositePrimaryKey.some(pk => pk.keyId === columnJsonSchema.GUID),
	);

	const wasCompositePkRemoved = wasTheFieldACompositePrimaryKey && !isTheFieldACompositePrimaryKey;

	if (isRegularPrimaryKey && wasCompositePkRemoved) {
		// return compare custom properties and amount of columns.
		// If there was a transition and amount of composite PK columns is not equal
		// to amount of regular pk columns, we must recreate PK
		const constraintOptions = extractKeyConstraintOptions(columnJsonSchema.primaryKeyOptions);
		const areOptionsEqual = isCompositeEqualsToRegular(oldPrimaryKeys, constraintOptions);

		return PrimaryKeyTransitionDto.transition(!areOptionsEqual);
	}

	return PrimaryKeyTransitionDto.noTransition();
};

/**
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @param {AlterCollectionDto} collection
 * @return {PrimaryKeyTransitionDto}
 * */
const wasRegularPkChangedInTransitionFromRegularToComposite = (columnJsonSchema, collection) => {
	const oldName = columnJsonSchema.compMod.oldField.name;
	const oldColumnJsonSchema = collection.role.properties[oldName];

	const wasRegularPrimaryKey = checkIsPrimaryKeyRegular(oldColumnJsonSchema);
	const isTheFieldAnyPrimaryKey = Boolean(columnJsonSchema?.primaryKey);

	if (!(wasRegularPrimaryKey && isTheFieldAnyPrimaryKey)) {
		return PrimaryKeyTransitionDto.noTransition();
	}

	/**
	 * @type {AlterCollectionRoleCompModPrimaryKey}
	 * */
	const pkDto = collection?.role?.compMod?.primaryKey || {};
	const newPrimaryKeys = pkDto.new || [];
	/**
	 * @type {AlterCollectionRoleCompModPKDto[]}
	 * */
	const oldPrimaryKeys = pkDto.old || [];
	const wasTheFieldACompositePrimaryKey = oldPrimaryKeys.some(compPk =>
		compPk.compositePrimaryKey?.some(pk => pk.keyId === oldColumnJsonSchema.GUID),
	);
	const isTheFieldACompositePrimaryKey = newPrimaryKeys.some(compPk =>
		compPk.compositePrimaryKey?.some(pk => pk.keyId === columnJsonSchema.GUID),
	);

	const wasCompositePkAdded = isTheFieldACompositePrimaryKey && !wasTheFieldACompositePrimaryKey;

	if (wasRegularPrimaryKey && wasCompositePkAdded) {
		// return compare custom properties and amount of columns.
		// If there was a transition and amount of composite PK columns is not equal
		// to amount of regular pk columns, we must recreate PK
		const constraintOptions = extractKeyConstraintOptions(oldColumnJsonSchema.primaryKeyOptions);
		const areOptionsEqual = isCompositeEqualsToRegular(newPrimaryKeys, constraintOptions);

		return PrimaryKeyTransitionDto.transition(!areOptionsEqual);
	}

	return PrimaryKeyTransitionDto.noTransition();
};

/**
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @param {AlterCollectionDto} collection
 * @return {boolean}
 * */
const wasRegularPkModified = (columnJsonSchema, collection) => {
	const oldName = columnJsonSchema.compMod.oldField.name;
	const oldJsonSchema = collection.role.properties[oldName] || {};

	const isRegularPrimaryKey = checkIsPrimaryKeyRegular(columnJsonSchema);
	const wasTheFieldARegularPrimaryKey = checkIsPrimaryKeyRegular(oldJsonSchema);

	if (!(isRegularPrimaryKey && wasTheFieldARegularPrimaryKey)) {
		return false;
	}

	const constraintOptions = extractKeyConstraintOptions(columnJsonSchema.primaryKeyOptions);
	const oldConstraintOptions = extractKeyConstraintOptions(oldJsonSchema.primaryKeyOptions);

	return !_.isEqual(oldConstraintOptions, constraintOptions);
};

/**
 * @param {object} params
 * @property {string} [scriptFormat]
 * @property {AlterCollectionDto} collection
 * @return {Array<KeyScriptModificationDto>}
 * */
const getAddPkScriptDtos = ({ scriptFormat, collection }) => {
	const prepareName = prepareNameForScriptFormat(scriptFormat);
	const { alterKeyConstraint } = require('../../../ddlProvider/ddlHelpers/constraintHelper')({ prepareName });

	const collectionSchema = getSchemaOfAlterCollection(collection);
	const fullTableName = getFullCollectionName(scriptFormat)(collectionSchema);

	return _.toPairs(collection.properties)
		.filter(([name, jsonSchema]) => {
			if (isFieldChangedToRegularPk(jsonSchema, collection)) {
				return true;
			}
			const transitionToRegularDto = wasRegularPkChangedInTransitionFromCompositeToRegular(
				jsonSchema,
				collection,
			);
			if (transitionToRegularDto.didTransitionHappen) {
				return transitionToRegularDto.wasPkChangedInTransition;
			}
			return wasRegularPkModified(jsonSchema, collection);
		})
		.map(([name, jsonSchema]) => {
			const ddlConfig = getCreateRegularPKDDLProviderConfig(name, jsonSchema);
			const statementDto = alterKeyConstraint(fullTableName, collection.isActivated, ddlConfig);
			return new KeyScriptModificationDto(statementDto.statement, fullTableName, false, statementDto.isActivated);
		})
		.filter(scriptDto => Boolean(scriptDto.script));
};

/**
 * @param {AlterCollectionDto} collection
 * @return {Array<KeyScriptModificationDto>}
 * */
const getDropPkScriptDto = ({ scriptFormat, collection }) => {
	const collectionSchema = getSchemaOfAlterCollection(collection);
	const fullTableName = getFullCollectionName(scriptFormat)(collectionSchema);

	const isContainerActivated = isParentContainerActivated(collection);
	const isCollectionActivated = isContainerActivated && isObjectInDeltaModelActivated(collection);

	return _.toPairs(collection.properties)
		.filter(([name, jsonSchema]) => {
			if (isFieldNoLongerARegularPk(jsonSchema, collection)) {
				return true;
			}
			const transitionToRegularDto = wasRegularPkChangedInTransitionFromRegularToComposite(
				jsonSchema,
				collection,
			);
			if (transitionToRegularDto.didTransitionHappen) {
				return transitionToRegularDto.wasPkChangedInTransition;
			}
			return wasRegularPkModified(jsonSchema, collection);
		})
		.map(([name, jsonSchema]) => {
			const script = assignTemplates(templates.dropPrimaryKey, { tableName: fullTableName });
			return new KeyScriptModificationDto(script, fullTableName, true, isCollectionActivated);
		})
		.filter(scriptDto => Boolean(scriptDto.script));
};

/**
 * @param {object} params
 * @property {string} [scriptFormat]
 * @property {AlterCollectionDto} collection
 * @return {Array<KeyScriptModificationDto>}
 * */
const getModifyPkScriptDtos = ({ scriptFormat, collection }) => {
	const dropPkScriptDtos = getDropPkScriptDto({ scriptFormat, collection });
	const addPkScriptDtos = getAddPkScriptDtos({ scriptFormat, collection });

	return [...dropPkScriptDtos, ...addPkScriptDtos].filter(Boolean);
};

/**
 * @param {object} params
 * @property {string} [scriptFormat]
 * @property {AlterCollectionDto} collection
 * @return {Array<AlterScriptDto>}
 * */
const getModifyPkConstraintsScriptDtos = ({ scriptFormat, collection }) => {
	const modifyCompositePkScriptDtos = getModifyCompositePkScriptDtos({ scriptFormat, collection });
	const modifyPkScriptDtos = getModifyPkScriptDtos({ scriptFormat, collection });

	const allDtos = [...modifyCompositePkScriptDtos, ...modifyPkScriptDtos];
	const sortedAllDtos = sortModifyKeyConstraints(allDtos);

	return sortedAllDtos
		.map(dto => AlterScriptDto.getInstance([dto.script], dto.isActivated, dto.isDropScript))
		.filter(Boolean);
};

module.exports = {
	getModifyPkConstraintsScriptDtos,
};
