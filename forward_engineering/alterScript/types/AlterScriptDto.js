class AlterScriptDto {
	/**
	 * @type {boolean | undefined}
	 * */
	isActivated;

	/**
	 * @type {boolean}
	 * */
	isDropScript;

	/**
	 * @type {string}
	 * */
	script;

	/**
	 * @param {string} script
	 * @param {boolean} isActivated
	 * @param {boolean} isDropScripts
	 * @return {AlterScriptDto | undefined}
	 * */
	static getInstance(script, isActivated, isDropScript) {
		if (!script?.trim()) {
			return undefined;
		}
		return {
			isActivated,
			isDropScript,
			scripts: script.trim(),
		};
	}
}

module.exports = {
	AlterScriptDto,
};
