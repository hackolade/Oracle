/**
 * @typedef {import("forward_engineering/types").KeyType} KeyType
 */
class KeyTransitionDto {
	/**
	 * @type {boolean}
	 * */
	didTransitionHappen;

	/**
	 * @return {KeyTransitionDto}
	 * */
	static noTransition() {
		return {
			didTransitionHappen: false,
		};
	}

	/**
	 * @return {KeyTransitionDto}
	 * */
	static transition() {
		return {
			didTransitionHappen: true,
		};
	}
}

class PrimaryKeyTransitionDto extends KeyTransitionDto {
	/**
	 * @type {boolean | undefined}
	 * */
	wasPkChangedInTransition;

	/**
	 * @param {boolean} wasPkChangedInTransition
	 * @return {PrimaryKeyTransitionDto}
	 * */
	static transition(wasPkChangedInTransition) {
		return {
			didTransitionHappen: true,
			wasPkChangedInTransition,
		};
	}
}

class UniqueKeyTransitionDto extends KeyTransitionDto {
	/**
	 * @type {boolean | undefined}
	 * */
	wasUniqueKeyChangedInTransition;

	/**
	 * @param {boolean} wasUniqueKeyChangedInTransition
	 * @return {UniqueKeyTransitionDto}
	 * */
	static transition(wasUniqueKeyChangedInTransition) {
		return {
			didTransitionHappen: true,
			wasUniqueKeyChangedInTransition,
		};
	}
}

class KeyScriptModificationDto {
	/**
	 * @type {string}
	 * */
	script;

	/**
	 * @type {boolean}
	 * */
	isDropScript;

	/**
	 * @type {string}
	 * */
	fullTableName;

	/**
	 * @type {boolean}
	 * */
	isActivated;

	/**
	 * @param {string} fullTableName
	 * @param {string} script
	 * @param {boolean} isDropScript
	 * @param {boolean} isActivated
	 * */
	constructor(script, fullTableName, isDropScript, isActivated) {
		this.script = script;
		this.isDropScript = isDropScript;
		this.fullTableName = fullTableName;
		this.isActivated = isActivated;
	}
}

class AlterKeyDto {
	/**
	 * @type {string | undefined}
	 */
	constraintName;

	/**
	 * @type {KeyType}
	 */
	keyType;

	/**
	 * @type {Array<{ name: string; isActivated: boolean; }>}
	 */
	columns;
}

class AlterPrimaryKeyDto extends AlterKeyDto {
	/**
	 * @type {string | undefined}
	 */
	rely;

	/**
	 * @type {string | undefined}
	 */
	validate;

	/**
	 * @type {string | undefined}
	 */
	indexClause;

	/**
	 * @type {string | undefined}
	 */
	deferClause;

	/**
	 * @type {string | undefined}
	 */
	exceptionClause;
}

module.exports = {
	AlterPrimaryKeyDto,
	KeyScriptModificationDto,
	PrimaryKeyTransitionDto,
	UniqueKeyTransitionDto,
};
