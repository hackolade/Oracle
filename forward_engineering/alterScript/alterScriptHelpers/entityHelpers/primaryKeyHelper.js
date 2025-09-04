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
	wrapInQuotes,
	prepareNameForScriptFormat,
} = require('../../../utils/general');
const { areConstraintOptionsEqual } = require('./areConstraintOptionsEqual');
const { sortModifyKeyConstraints } = require('./sortModifyKeyConstraints');

const amountOfColumnsInRegularPk = 1;

/**
 * @param {AlterCollectionColumnKeyOptionDto} optionHolder
 * @return {Partial<AlterCollectionColumnKeyOptionDto>}
 * */
const extractOptionsForComparisonWithRegularPkOptions = optionHolder => {
	return {
		constraintName: optionHolder.constraintName,
		deferClause: optionHolder.deferClause,
		rely: optionHolder.rely,
		validate: optionHolder.validate,
		indexClause: optionHolder.indexClause,
		exceptionClause: optionHolder.exceptionClause,
	};
};

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

/**
 * @param {object} params
 * @property {string} [scriptFormat]
 * @property {AlterCollectionDto} collection
 * @return {Array<KeyScriptModificationDto>}
 * */
const getModifyCompositePkScriptDtos = ({ scriptFormat, collection }) => {
	const addCompositePkScriptDtos = getAddCompositePkScriptDtos({ scriptFormat, collection });

	return addCompositePkScriptDtos.filter(Boolean);
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
const wasFieldChangedToBeARegularPk = (columnJsonSchema, collection) => {
	const oldName = columnJsonSchema.compMod.oldField.name;
	const oldColumnJsonSchema = collection.role.properties[oldName];

	const isRegularPrimaryKey = columnJsonSchema.primaryKey && !columnJsonSchema.compositePrimaryKey;
	const wasTheFieldAnyPrimaryKey = Boolean(oldColumnJsonSchema?.primaryKey);

	return isRegularPrimaryKey && !wasTheFieldAnyPrimaryKey;
};

/**
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @return {Array<Partial<AlterCollectionColumnKeyOptionDto>>}
 * */
const getCustomPropertiesOfRegularPkForComparisonWithRegularPkOptions = columnJsonSchema => {
	/**
	 * @type {Array<AlterCollectionColumnKeyOptionDto>}
	 * */
	const constraintOptions = columnJsonSchema.primaryKeyOptions ?? {};
	return extractOptionsForComparisonWithRegularPkOptions(constraintOptions);
};

/**
 * @param {AlterCollectionRoleCompModPKDto} compositePk
 * @return {Array<Partial<AlterCollectionColumnKeyOptionDto>>}
 * */
const getCustomPropertiesOfCompositePkForComparisonWithRegularPkOptions = compositePk => {
	const optionsForComparison = extractOptionsForComparisonWithRegularPkOptions(compositePk);
	return [optionsForComparison].filter(o => Object.values(o).some(Boolean));
};

/**
 * @param {AlterCollectionColumnDto} columnJsonSchema
 * @param {AlterCollectionDto} collection
 * @return {PrimaryKeyTransitionDto}
 * */
const wasRegularPkChangedInTransitionFromCompositeToRegular = (columnJsonSchema, collection) => {
	const oldName = columnJsonSchema.compMod.oldField.name;
	const oldColumnJsonSchema = collection.role.properties[oldName];

	const isRegularPrimaryKey = columnJsonSchema.primaryKey && !columnJsonSchema.compositePrimaryKey;
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
		const constraintOptions = getCustomPropertiesOfRegularPkForComparisonWithRegularPkOptions(columnJsonSchema);
		const areOptionsEqual = oldPrimaryKeys.some(oldCompositePk => {
			if (oldCompositePk.compositePrimaryKey.length !== amountOfColumnsInRegularPk) {
				return false;
			}
			const oldCompositePkAsRegularPkOptions =
				getCustomPropertiesOfCompositePkForComparisonWithRegularPkOptions(oldCompositePk);

			return areConstraintOptionsEqual(oldCompositePkAsRegularPkOptions, constraintOptions);
		});
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

	const isRegularPrimaryKey = columnJsonSchema.primaryKey && !columnJsonSchema.compositePrimaryKey;
	const wasTheFieldARegularPrimaryKey = oldJsonSchema?.primaryKey && !oldJsonSchema?.compositePrimaryKey;

	if (isRegularPrimaryKey && !wasTheFieldARegularPrimaryKey) {
		return true;
	}

	const constraintOptions = getCustomPropertiesOfRegularPkForComparisonWithRegularPkOptions(columnJsonSchema);
	const oldConstraintOptions = getCustomPropertiesOfRegularPkForComparisonWithRegularPkOptions(oldJsonSchema);

	return !areConstraintOptionsEqual(oldConstraintOptions, constraintOptions);
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
			if (wasFieldChangedToBeARegularPk(jsonSchema, collection)) {
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
 * @param {object} params
 * @property {string} [scriptFormat]
 * @property {AlterCollectionDto} collection
 * @return {Array<KeyScriptModificationDto>}
 * */
const getModifyPkScriptDtos = ({ scriptFormat, collection }) => {
	const addPkScriptDtos = getAddPkScriptDtos({ scriptFormat, collection });

	return addPkScriptDtos.filter(Boolean);
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
