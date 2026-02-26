const _ = require('lodash');
const { AlterCollectionDto } = require('../../types/AlterCollectionDto');
const { AlterScriptDto, SCRIPT_TYPE } = require('../../types/AlterScriptDto');
const { wrapInQuotes, getSchemaOfAlterCollection, getFullCollectionName } = require('../../../utils/general');
const { assignTemplates } = require('../../../utils/assignTemplates');
const templates = require('../../../ddlProvider/templates');

/**
 * @typedef {{
 *     id: string,
 *     chkConstrName: string,
 *     constrExpression: string,
 * }} CheckConstraint
 *
 * @typedef {{
 *     old?: CheckConstraint,
 *     new?: CheckConstraint
 * }} CheckConstraintHistoryEntry
 * */

/**
 * @param {string} tableName
 * @param {string} constraintName
 * @return string
 * */
const dropConstraint = (tableName, constraintName) => {
	const templateConfig = {
		tableName,
		constraintName,
	};
	return assignTemplates(templates.dropConstraint, templateConfig);
};

/**
 * @param {AlterCollectionDto} collection
 * @return {Array<CheckConstraintHistoryEntry>}
 * */
const mapCheckConstraintNamesToChangeHistory = collection => {
	const checkConstraintHistory = collection?.compMod?.chkConstr;
	if (!checkConstraintHistory) {
		return [];
	}
	const newConstraints = checkConstraintHistory.new || [];
	const oldConstraints = checkConstraintHistory.old || [];
	const constrNames = _.chain([...newConstraints, ...oldConstraints])
		.map(constr => constr.chkConstrName)
		.uniq()
		.value();

	return constrNames.map(chkConstrName => {
		return {
			old: _.find(oldConstraints, { chkConstrName }),
			new: _.find(newConstraints, { chkConstrName }),
		};
	});
};

/**
 * @param {Array<CheckConstraintHistoryEntry>} constraintHistory
 * @param {string} fullTableName
 * @return {Array<AlterScriptDto>}
 * */
const getDropCheckConstraintScriptDtos = (constraintHistory, fullTableName) => {
	return constraintHistory
		.filter(historyEntry => historyEntry.old && !historyEntry.new)
		.map(historyEntry => {
			const wrappedConstraintName = wrapInQuotes(historyEntry.old.chkConstrName);
			const script = dropConstraint(fullTableName, wrappedConstraintName);
			return AlterScriptDto.getInstance(script, true, true, SCRIPT_TYPE.alterEntity);
		});
};

/**
 * @param tableName {string}
 * @param constraintName {string}
 * @param expression {expression}
 * @return string
 * */
const addCheckConstraint = (tableName, constraintName, expression) => {
	const templateConfig = {
		tableName,
		constraintName,
		expression,
	};
	return assignTemplates(templates.addCheckConstraint, templateConfig);
};

/**
 * @param {Array<CheckConstraintHistoryEntry>} constraintHistory
 * @param {string} fullTableName
 * @return {Array<AlterScriptDto>}
 * */
const getAddCheckConstraintScriptDtos = (constraintHistory, fullTableName) => {
	return constraintHistory
		.filter(historyEntry => historyEntry.new && !historyEntry.old)
		.map(historyEntry => {
			const { chkConstrName, constrExpression } = historyEntry.new;
			const script = addCheckConstraint(fullTableName, wrapInQuotes(chkConstrName), constrExpression);
			return AlterScriptDto.getInstance(script, true, false, SCRIPT_TYPE.alterEntity);
		});
};

/**
 * @param {Array<CheckConstraintHistoryEntry>} constraintHistory
 * @param {string} fullTableName
 * @return {Array<AlterScriptDto>}
 * */
const getUpdateCheckConstraintScriptDtos = (constraintHistory, fullTableName) => {
	return constraintHistory
		.filter(historyEntry => {
			if (historyEntry.old && historyEntry.new) {
				const oldExpression = historyEntry.old.constrExpression;
				const newExpression = historyEntry.new.constrExpression;
				return oldExpression !== newExpression;
			}
			return false;
		})
		.flatMap(historyEntry => {
			const { chkConstrName: oldConstrainName } = historyEntry.old;
			const dropConstraintScript = dropConstraint(fullTableName, wrapInQuotes(oldConstrainName));

			const { chkConstrName: newConstrainName, constrExpression: newConstraintExpression } = historyEntry.new;
			const addConstraintScript = addCheckConstraint(
				fullTableName,
				wrapInQuotes(newConstrainName),
				newConstraintExpression,
			);

			return [
				AlterScriptDto.getInstance(dropConstraintScript, true, true, SCRIPT_TYPE.alterEntity),
				AlterScriptDto.getInstance(addConstraintScript, true, false, SCRIPT_TYPE.alterEntity),
			];
		});
};

/**
 * @param {{ scriptFormat: string }}
 * @return {(collection: AlterCollectionDto) => Array<AlterScriptDto>}
 * */
const getModifyCheckConstraintScriptDtos =
	({ scriptFormat }) =>
	collection => {
		const collectionSchema = getSchemaOfAlterCollection(collection);
		const fullName = getFullCollectionName(scriptFormat)(collectionSchema);

		const constraintHistory = mapCheckConstraintNamesToChangeHistory(collection);

		const addCheckConstraintScripts = getAddCheckConstraintScriptDtos(constraintHistory, fullName);
		const dropCheckConstraintScripts = getDropCheckConstraintScriptDtos(constraintHistory, fullName);
		const updateCheckConstraintScripts = getUpdateCheckConstraintScriptDtos(constraintHistory, fullName);

		return [...addCheckConstraintScripts, ...dropCheckConstraintScripts, ...updateCheckConstraintScripts];
	};

module.exports = {
	getModifyCheckConstraintScriptDtos,
};
