const _ = require('lodash');
const { AlterScriptDto, SCRIPT_TYPE } = require('../../types/AlterScriptDto');
const { assignTemplates } = require('../../../utils/assignTemplates');
const templates = require('../../../ddlProvider/templates');
const {
	wrapInQuotes,
	getSchemaOfAlterCollection,
	getFullCollectionName,
	prepareNameForScriptFormat,
	isObjectInDeltaModelActivated,
	isParentContainerActivated,
} = require('../../../utils/general');

/**
 * @param {object} params
 * @property {string} [scriptFormat]
 * @property {AlterCollectionDto} collection
 * @return {AlterScriptDto[]}
 * */
const getModifyNonNullColumnsScriptDtos = ({ scriptFormat, collection }) => {
	const prepareName = prepareNameForScriptFormat(scriptFormat);
	const collectionSchema = getSchemaOfAlterCollection(collection);
	const fullTableName = getFullCollectionName(scriptFormat)(collectionSchema);
	const isCollectionActivated =
		isParentContainerActivated(collection) !== false && isObjectInDeltaModelActivated(collection) !== false;

	const currentRequiredColumnNames = collection.required || [];
	const previousRequiredColumnNames = collection.role.required || [];

	const addNotNullConstraintsScript = _.toPairs(collection.properties)
		.flatMap(([name, jsonSchema]) => {
			const oldName = jsonSchema.compMod.oldField.name;

			const newConstraintName = jsonSchema.notNullConstraintName || '';
			const oldConstraintName = collection.role.properties[oldName]?.notNullConstraintName || '';
			const isNameChanged = newConstraintName !== oldConstraintName;

			const isOldRequired = previousRequiredColumnNames.includes(oldName);
			const isNewRequired = currentRequiredColumnNames.includes(name);
			const isActivated = isCollectionActivated && jsonSchema.isActivated !== false;

			const scriptParams = {
				tableName: fullTableName,
				columnName: prepareName(name),
			};

			const scripts = [];

			if (isOldRequired && (!isNewRequired || isNameChanged)) {
				scripts.push(
					AlterScriptDto.getInstance(
						assignTemplates(templates.alterNullableConstraint, scriptParams),
						isActivated,
						false,
						SCRIPT_TYPE.alterEntity,
					),
				);
			}

			if (isNewRequired && (!isOldRequired || isNameChanged)) {
				const template = newConstraintName
					? templates.alterNamedNotNullConstraint
					: templates.alterNotNullConstraint;
				scripts.push(
					AlterScriptDto.getInstance(
						assignTemplates(template, { ...scriptParams, constraintName: prepareName(newConstraintName) }),
						isActivated,
						false,
						SCRIPT_TYPE.alterEntity,
					),
				);
			}

			return scripts;
		})
		.filter(Boolean);

	return addNotNullConstraintsScript;
};

/**
 * Column-level named NOT NULL constraints are emitted inline on the column definition.
 * @returns {Array<{ statement: string, isActivated: boolean }>}
 */
const getNotNullConstraints = () => {
	return [];
};

module.exports = {
	getModifyNonNullColumnsScriptDtos,
	getNotNullConstraints,
};
