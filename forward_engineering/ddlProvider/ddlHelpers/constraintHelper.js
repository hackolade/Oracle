const _ = require('lodash');

module.exports = ({ prepareName, _ }) => {
	const getOptionsString = ({ constraintName, deferClause, rely, validate, indexClause, exceptionClause }) => {
		const constraintString = constraintName ? ` CONSTRAINT ${prepareName(_.trim(constraintName))}` : '';
		const statement = [deferClause, rely, indexClause, validate, exceptionClause].filter(Boolean).join(' ');

		return {
			constraintString,
			statement: statement && ` ${statement}`,
		};
	};

	return {
		getOptionsString,
	};
};
