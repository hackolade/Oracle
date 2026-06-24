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
	 * Builds the LOCAL/GLOBAL partition clause for CREATE INDEX.
	 * Partition options are emitted before other index attributes per Oracle CREATE INDEX syntax.
	 *
	 * @param {Pick<IndexDto, 'indxPartitionScope' | 'indxPartitionClause'>} param0
	 * @param {'local' | 'global' | '' | undefined} [param0.indxPartitionScope]
	 * @param {string | undefined} [param0.indxPartitionClause] Clause appended after LOCAL or GLOBAL (e.g. `STORE IN (...)` or `PARTITION BY RANGE (...)`).
	 * @returns {string} ` LOCAL`, ` LOCAL <clause>`, ` GLOBAL <clause>`, or an empty string.
	 */
	const getIndexPartitionOptions = ({ indxPartitionScope, indxPartitionClause }) => {
		const scope = _.toLower(_.trim(indxPartitionScope));
		const clause = _.trim(indxPartitionClause);

		if (!scope) {
			return '';
		}

		if (scope === 'local') {
			return clause ? ` LOCAL ${clause}` : ' LOCAL';
		}

		if (scope === 'global') {
			if (!clause) {
				return '';
			}

			return ` GLOBAL ${clause}`;
		}

		return '';
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

	/**
	 * Builds index options for CREATE INDEX and ALTER INDEX ... REBUILD statements.
	 * Partition options precede logging, tablespace, compression, and free-form index properties.
	 *
	 * @param {IndexDto} param0
	 * @returns {string}
	 */
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
		indxPartitionScope,
		indxPartitionClause,
	}) => {
		const partitionOptions = getIndexPartitionOptions({ indxPartitionScope, indxPartitionClause });
		const loggingClause = logging_clause ? ` ${_.toUpper(logging_clause)}` : '';
		const tableSpacePart = tablespace ? ` TABLESPACE ${tablespace}` : '';
		const indexCompression = index_compression ? ` ${index_compression}` : '';

		let options = `${partitionOptions}${loggingClause}${tableSpacePart}${indexCompression}`;

		if (index_properties) {
			options = `${partitionOptions} ${normalizeLineEndings(index_properties)}`;
		} else if (index_attributes) {
			options = `${partitionOptions} ${normalizeLineEndings(index_attributes)}`;
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
