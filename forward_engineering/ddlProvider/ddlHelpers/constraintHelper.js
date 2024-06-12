const _ = require('lodash');

module.exports = ({ wrapInQuotes, _ }) => {
	const getOptionsString = ({ constraintName, deferClause, rely, validate, indexClause, exceptionClause }) => ({
		constraintString: `${constraintName ? ` CONSTRAINT ${wrapInQuotes(_.trim(constraintName))}` : ''}`,
		statement: `${deferClause ? ` ${deferClause}` : ''}${rely ? ` ${rely}` : ''}${
			indexClause ? ` ${indexClause}` : ''
		}${validate ? ` ${validate}` : ''}${exceptionClause ? ` ${exceptionClause}` : ''}`,
	});

	return {
		getOptionsString,
	};
};
