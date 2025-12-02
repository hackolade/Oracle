const _ = require('lodash');
const templates = require('../templates');
const { checkAllKeysDeactivated, getColumnsList } = require('../../utils/general');
const { assignTemplates } = require('../../utils/assignTemplates');
const { AlterKeyDto } = require('../../alterScript/types/AlterKeyDto');

module.exports = ({ prepareName }) => {
	/**
	 * @param {Partial<AlterCollectionColumnKeyOptionDto>} params
	 * @returns {{ constraintString: string; statement: string; }}
	 */
	const getOptionsString = ({ constraintName, deferClause, rely, validate, indexClause, exceptionClause }) => {
		const constraintString = constraintName ? `CONSTRAINT ${prepareName(_.trim(constraintName))} ` : '';
		const statement = [deferClause, rely, indexClause, validate, exceptionClause].filter(Boolean).join(' ');

		return {
			constraintString,
			statement: statement && ` ${statement}`,
		};
	};

	/**
	 * @param {Record<string, string>} templates
	 * @param {boolean} isParentActivated
	 * @returns {(keyData: AlterKeyDto) => ({ statement: string; isActivated: boolean; })}
	 */
	const createKeyConstraint = (templates, isParentActivated) => keyData => {
		const isAllColumnsDeactivated = checkAllKeysDeactivated(keyData.columns);
		const columns = getColumnsList(keyData.columns, isAllColumnsDeactivated, isParentActivated, ({ name }) =>
			prepareName(name),
		);
		const { constraintString, statement } = getOptionsString(keyData);

		return {
			statement: assignTemplates(templates.createKeyConstraint, {
				constraintName: constraintString,
				options: statement,
				keyType: keyData.keyType,
				columns,
			}),
			isActivated: !isAllColumnsDeactivated,
		};
	};

	/**
	 * @param {string} tableName
	 * @param {boolean} isParentActivated
	 * @param {AlterKeyDto} keyData
	 *
	 * @return {{ statement: string; isActivated: boolean }}
	 * */
	const alterKeyConstraint = (tableName, isParentActivated, keyData) => {
		const constraintStatementDto = createKeyConstraint(templates, isParentActivated)(keyData);
		return {
			statement: assignTemplates(templates.addPkConstraint, {
				constraintStatement: (constraintStatementDto.statement || '').trim(),
				tableName,
			}),
			isActivated: constraintStatementDto.isActivated,
		};
	};

	/**
	 * @param tableName {string}
	 * @param constraintName {string}
	 * */
	const dropKeyConstraint = (tableName, constraintName) => {
		const templatesConfig = {
			tableName,
			constraintName: prepareName(_.trim(constraintName)),
		};
		return assignTemplates(templates.dropConstraint, templatesConfig);
	};

	return {
		getOptionsString,
		alterKeyConstraint,
		createKeyConstraint,
		dropKeyConstraint,
	};
};
