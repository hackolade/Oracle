const { getAlterScriptDtos } = require('./alterScriptFromDeltaHelper');
const { AlterScriptDto } = require('./types/AlterScriptDto');
const { commentIfDeactivated } = require('../utils/general');

/**
 * @return {(dtos: AlterScriptDto[], shouldApplyDropStatements: boolean) => string}
 * */
const joinAlterScriptDtosIntoScript = (dtos, shouldApplyDropStatements) => {
	return dtos.reduce((finalScript, dto) => {
		if (!dto) {
			return finalScript;
		}

		let script = dto.script;

		if (dto.isActivated === false) {
			script = commentIfDeactivated(script, {
				isActivated: false,
				isPartOfLine: false,
			});
		} else if (!shouldApplyDropStatements) {
			script = commentIfDeactivated(script, {
				isActivated: !dto.isDropScript,
				isPartOfLine: false,
			});
		}

		return `${finalScript}\n\n${script}`;
	}, '');
};

/**
 * @param data {CoreData}
 * @param app {App}
 * @return {string}
 * */
const buildEntityLevelAlterScript = (data, app) => {
	const alterScriptDtos = getAlterScriptDtos(data, app);
	const shouldApplyDropStatements = data.options?.additionalOptions?.some(
		option => option.id === 'applyDropStatements' && option.value,
	);

	return joinAlterScriptDtosIntoScript(alterScriptDtos, shouldApplyDropStatements);
};

/**
 * @param data {CoreData}
 * @param app {App}
 * @return { boolean}
 * */
const doesEntityLevelAlterScriptContainDropStatements = (data, app) => {
	const alterScriptDtos = getAlterScriptDtos(data, app);
	return alterScriptDtos.some(alterScriptDto => alterScriptDto?.isActivated && alterScriptDto.isDropScript);
};

const mapCoreDataForContainerLevelScripts = data => {
	return {
		...data,
		jsonSchema: data.collections[0],
		internalDefinitions: Object.values(data.internalDefinitions)[0],
	};
};

/**
 * @param data {CoreData}
 * @param app {App}
 * @return {string}
 * */
const buildContainerLevelAlterScript = (data, app) => {
	const preparedData = mapCoreDataForContainerLevelScripts(data);
	const alterScriptDtos = getAlterScriptDtos(preparedData, app);
	const shouldApplyDropStatements = preparedData.options?.additionalOptions?.some(
		option => option.id === 'applyDropStatements' && option.value,
	);

	return joinAlterScriptDtosIntoScript(alterScriptDtos, shouldApplyDropStatements);
};

/**
 * @param data {CoreData}
 * @param app {App}
 * @return { boolean}
 * */
const doesContainerLevelAlterScriptContainDropStatements = (data, app) => {
	const preparedData = mapCoreDataForContainerLevelScripts(data);
	const alterScriptDtos = getAlterScriptDtos(preparedData, app);
	return alterScriptDtos.some(alterScriptDto => alterScriptDto?.isActivated && alterScriptDto.isDropScript);
};

module.exports = {
	buildEntityLevelAlterScript,
	doesEntityLevelAlterScriptContainDropStatements,
	buildContainerLevelAlterScript,
	doesContainerLevelAlterScriptContainDropStatements,
};
