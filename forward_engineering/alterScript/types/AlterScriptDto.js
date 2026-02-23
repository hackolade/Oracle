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
		const cleanScript = script?.trim();
		if (!cleanScript) {
			return undefined;
		}
		return {
			isActivated,
			isDropScript,
			script: cleanScript,
		};
	}
}

module.exports = {
	AlterScriptDto,
};
