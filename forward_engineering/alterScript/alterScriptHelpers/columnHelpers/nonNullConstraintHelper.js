const _ = require('lodash');
const { AlterScriptDto, SCRIPT_TYPE } = require('../../types/AlterScriptDto');
const { assignTemplates } = require('../../../utils/assignTemplates');
const templates = require('../../../ddlProvider/templates');
const {
	wrapInQuotes,
	getSchemaOfAlterCollection,
	getFullCollectionName,
	prepareNameForScriptFormat,
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

			const scriptParams = {
				tableName: fullTableName,
				columnName: prepareName(name),
			};

			const scripts = [];

			if (isOldRequired && (!isNewRequired || isNameChanged)) {
				const template = oldConstraintName ? templates.dropConstraint : templates.alterNullableConstraint;
				scripts.push(
					AlterScriptDto.getInstance(
						assignTemplates(template, { ...scriptParams, constraintName: prepareName(oldConstraintName) }),
						true,
						Boolean(templates.dropConstraint),
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
						true,
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

const createNotNullConstraintScript = ({ scriptFormat, constraintName, columnName }) => {
	const prepareName = prepareNameForScriptFormat(scriptFormat);
	return assignTemplates(templates.notNullConstraint, {
		constraintName: prepareName(constraintName),
		columnName: prepareName(columnName),
	});
};

/**
 * Get named NOT NULL constraints data
 * @param {object} jsonSchema
 * @param {string} scriptFormat
 * @returns {Array<{ statement: string, isActivated: boolean }>}
 */
const getNotNullConstraints = (jsonSchema, scriptFormat) => {
	return _.toPairs(jsonSchema.properties)
		.filter(
			([name, columnSchema]) => jsonSchema.required?.includes(name) && columnSchema.notNullConstraintName?.trim(),
		)
		.map(([name, columnSchema]) => ({
			statement: createNotNullConstraintScript({
				scriptFormat,
				constraintName: columnSchema.notNullConstraintName,
				columnName: name,
			}),
			isActivated: columnSchema.isActivated,
		}));
};

module.exports = {
	getModifyNonNullColumnsScriptDtos,
	getNotNullConstraints,
};
