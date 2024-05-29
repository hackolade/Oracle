const { AlterScriptDto } = require('../types/AlterScriptDto');

/**
 * @return {(containerName: string) => AlterScriptDto | undefined}
 * */
const getAddContainerScriptDto = app => containerName => {
	const _ = app.require('lodash');
	const { wrapInQuotes } = require('../../utils/general')(_);
	const ddlContainerName = wrapInQuotes(containerName);

	const createContainerStatement = `CREATE USER ${ddlContainerName} NO AUTHENTICATION;`;
	return AlterScriptDto.getInstance([createContainerStatement], true, false);
};

/**
 * @return {(containerName: string) => AlterScriptDto | undefined}
 * */
const getDeleteContainerScriptDto = app => containerName => {
	const _ = app.require('lodash');
	const { wrapInQuotes } = require('../../utils/general')(_);
	const ddlContainerName = wrapInQuotes(containerName);

	const dropContainerStatement = `DROP USER ${ddlContainerName};`;
	return AlterScriptDto.getInstance([dropContainerStatement], true, true);
};

module.exports = {
	getAddContainerScriptDto,
	getDeleteContainerScriptDto,
};
