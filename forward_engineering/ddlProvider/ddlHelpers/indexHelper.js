/**
 * @import { IndexDto } from '../../types'
 */

const _ = require('lodash');
const { normalizeLineEndings } = require('../../utils/general');

module.exports = ({ prepareName, getNamePrefixedWithSchemaName }) => {
	const getIndexType = indexType => {
		return indexType ? ` ${_.toUpper(indexType)}` : '';
	};

	/**
	 *
	 * @param param0
	 * @param {IndexDto} param0.index
	 * @returns {string}
	 */
	const getIndexName = ({ index }) => {
		if (!index.indxName) {
			return '';
		}

		// `index.indxSchema` - is custom schema name from cross schema indexes, specified manually by user
		// `index.schemaName` - is schema name where the actually table created
		const schemaName = index.indxSchema || index.schemaName;
		return ` ${getNamePrefixedWithSchemaName(index.indxName, schemaName)}`;
	};

	/**
	 * @param indxKey {Array<Object> | undefined}
	 * @param column_expression {string | undefined}
	 * @return {string}
	 * */
	const getIndexKeys = ({ indxKey, column_expression }) => {
		const columnExpression = _.trim(column_expression);

		if (columnExpression) {
			return `\n(\n\t${columnExpression}\n)\n\t`;
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
