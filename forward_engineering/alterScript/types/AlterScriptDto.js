class ModificationScript {
	/**
	 * @type {string}
	 * */
	script;

	/**
	 * @type {boolean}
	 * */
	isDropScript;
}

class AlterScriptDto {
	/**
	 * @type {boolean | undefined}
	 * */
	isActivated;

	/**
	 * @type {Array<ModificationScript>}
	 * */
	scripts;

	/**
	 * @param {Array<string>} scripts
	 * @param {boolean} isActivated
	 * @param {boolean} isDropScripts
	 * @return {Array<AlterScriptDto>}
	 * */
	static getInstances(scripts, isActivated, isDropScripts) {
		return (scripts || []).filter(Boolean).map(script => ({
			isActivated,
			scripts: [
				{
					isDropScript: isDropScripts,
					script,
				},
			],
		}));
	}

	/**
	 * @param {Array<string>} scripts
	 * @param {boolean} isActivated
	 * @param {boolean} isDropScripts
	 * @return {AlterScriptDto | undefined}
	 * */
	static getInstance(scripts, isActivated, isDropScripts) {
		if (!scripts?.filter(Boolean)?.length) {
			return undefined;
		}
		return {
			isActivated,
			scripts: scripts.filter(Boolean).map(script => ({
				isDropScript: isDropScripts,
				script,
			})),
		};
	}

	/**
	 * @param {string | undefined} dropScript
	 * @param {string | undefined} createScript
	 * @param {boolean} isActivated
	 * @return {AlterScriptDto | undefined}
	 * */
	static getDropAndRecreateInstance(dropScript, createScript, isActivated) {
		/**
		 * @type {ModificationScript[]}
		 * */
		const scriptModificationDtos = [];
		if (dropScript) {
			scriptModificationDtos.push({
				isDropScript: true,
				script: dropScript,
			});
		}
		if (createScript) {
			scriptModificationDtos.push({
				isDropScript: false,
				script: createScript,
			});
		}
		if (!scriptModificationDtos?.length) {
			return undefined;
		}
		return {
			isActivated,
			scripts: scriptModificationDtos,
		};
	}
}

module.exports = {
	ModificationScript,
	AlterScriptDto,
};
