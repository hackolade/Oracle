const { AlterScriptDto } = require('../types/AlterScriptDto');
const _ = require('lodash');
/**
 * @return {(containerName: string) => AlterScriptDto | undefined}
 * */
const getAddContainerScriptDto = (app, scriptFormat) => containerName => {
	const { prepareNameForScriptFormat } = require('../../utils/general')(_);
	const ddlContainerName = prepareNameForScriptFormat(scriptFormat)(containerName);

	const createContainerStatement = `CREATE USER ${ddlContainerName} NO AUTHENTICATION;`;
	return AlterScriptDto.getInstance([createContainerStatement], true, false);
};

/**
 * @return {(containerName: string) => AlterScriptDto | undefined}
 * */
const getDeleteContainerScriptDto = (app, scriptFormat) => containerName => {
	const { prepareNameForScriptFormat } = require('../../utils/general')(_);
	const ddlContainerName = prepareNameForScriptFormat(scriptFormat)(containerName);

	const dropContainerStatement = `DROP USER ${ddlContainerName};`;
	return AlterScriptDto.getInstance([dropContainerStatement], true, true);
};

module.exports = {
	getAddContainerScriptDto,
	getDeleteContainerScriptDto,
};
