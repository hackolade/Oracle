const _ = require('lodash');
const { escapeSingleQuote, normalizeLineEndings } = require('../../utils/general');

module.exports = ({ prepareName, getNamePrefixedWithSchemaName }) => {
	const getIndexType = indexType => {
		return indexType ? ` ${_.toUpper(indexType)}` : '';
	};

	const getIndexName = ({ index }) => {
		return index.indxName ? ` ${getNamePrefixedWithSchemaName(index.indxName, index.schemaName)}` : '';
	};

	/**
	 * @param indxKey {Array<Object> | undefined}
	 * @param column_expression {string | undefined}
	 * @return {string}
	 * */
	const getIndexKeys = ({ indxKey, column_expression }) => {
		if (column_expression) {
			const ddlColumnExpression = escapeSingleQuote(column_expression);
			return `\n(\n\t${ddlColumnExpression}\n)\n\t`;
		}
		if (_.isArray(indxKey) && !_.isEmpty(indxKey)) {
			const indexedColumnsClause = _.map(
				indxKey,
				({ name, type }) => `${prepareName(name)} ${_.toUpper(type)}`,
			).join(',\n\t');
			return `\n(\n\t${indexedColumnsClause}\n)\n\t`;
		}
		return '';
	};

	const getIndexOptions = ({
		indxDescription,
		comments,
		tablespace,
		index_properties,
		index_attributes,
		index_compression,
		logging_clause,
		indxKey,
		column_expression,
	}) => {
		const loggingClause = logging_clause ? ` ${_.toUpper(logging_clause)}` : '';
		const tableSpacePart = tablespace ? ` TABLESPACE ${tablespace}` : '';
		const indexCompression = index_compression ? ` ${index_compression}` : '';

		let options = `${loggingClause}${tableSpacePart}${indexCompression}`;

		if (index_properties) {
			options = ` ${normalizeLineEndings(index_properties)}`;
		} else if (index_attributes) {
			options = ` ${normalizeLineEndings(index_attributes)}`;
		}
		const isKeysEmpty = _.isEmpty(indxKey) && _.isEmpty(column_expression);

		if (!isKeysEmpty) {
			return _.trim(options);
		}

		return options;
	};

	return {
		getIndexName,
		getIndexType,
		getIndexKeys,
		getIndexOptions,
	};
};
