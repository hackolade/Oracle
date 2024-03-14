class AlterIndexKeyDto {
	/**
	 * @type {string}
	 */
	type;

	/**
	 * @type {string}
	 */
	keyId;
}

class AlterIndexDto {
	/**
	 * @type {string}
	 */
	id;

	/**
	 * @type {string}
	 */
	indxName;

	/**
	 * @type {boolean}
	 */
	isActivated;

	/**
	 * @type {boolean}
	 */
	ifNotExist;

	/**
	 * @type {string | undefined}
	 */
	indxType;

	/**
	 * @type {[AlterIndexKeyDto] | undefined}
	 */
	indxKey;

	/**
	 * @type {string | undefined}
	 */
	column_expression;

	/**
	 * @type {string | undefined}
	 */
	tablespace;

	/**
	 * @type {string | undefined}
	 */
	index_properties;

	/**
	 * @type {string | undefined}
	 */
	index_attributes;

	/**
	 * @type {string | undefined}
	 */
	index_compression;

	/**
	 * @type {string | undefined}
	 */
	logging_clause;

	/**
	 * @type {string | undefined}
	 */
	indxComments;
}

module.exports = {
	AlterIndexDto,
	AlterIndexKeyDto,
};
