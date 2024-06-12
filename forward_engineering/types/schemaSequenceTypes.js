class Sequence {
	/**
	 *@type {string | undefined}
	 */
	cache;

	/**
	 *@type {number | undefined}
	 */
	cacheValue;

	/**
	 * @type {string | undefined}
	 */
	cycle;

	/**
	 * @type {boolean}
	 */
	ifNotExist;

	/**
	 * @type {number | undefined}
	 */
	increment;

	/**
	 * @type {number | undefined}
	 */
	maxValue;

	/**
	 * @type {number | undefined}
	 */
	minValue;

	/**
	 * @type {string}
	 */
	sequenceName;

	/**
	 * @type {number | undefined}
	 */
	start;

	/**
	 * @type {string | undefined}
	 */
	sharing;

	/**
	 * @type {string | undefined}
	 */
	order;

	/**
	 * @type {string | undefined}
	 */
	keep;

	/**
	 * @type {string | undefined}
	 */
	scale;

	/**
	 * @type {string | undefined}
	 */
	scaleExtend;

	/**
	 * @type {string | undefined}
	 */
	shard;

	/**
	 * @type {string | undefined}
	 */
	shardExtend;

	/**
	 * @type {string | undefined}
	 */
	type;
}

class SequenceDto {
	/**
	 * @type {string}
	 */
	sharing;

	/**
	 * @type {string}
	 */
	ddlScript;

	/**
	 * @type {string}
	 */
	sequenceName;

	/**
	 * @type {number}
	 */
	minValue;

	/**
	 * @type {number}
	 */
	maxValue;

	/**
	 * @type {number}
	 */
	increment;

	/**
	 * @type {string}
	 */
	cycle;

	/**
	 * @type {string}
	 */
	order;

	/**
	 * @type {number}
	 */
	cacheValue;

	/**
	 * @type {string}
	 */
	scale;

	/**
	 * @type {string}
	 */
	extend;

	/**
	 * @type {string}
	 */
	shard;

	/**
	 * @type {string}
	 */
	type;

	/**
	 * @type {string}
	 */
	keep;
}

module.exports = {
	Sequence,
	SequenceDto,
};
