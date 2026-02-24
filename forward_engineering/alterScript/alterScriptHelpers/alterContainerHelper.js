const { prepareNameForScriptFormat, getId } = require('../../utils/general');
const { AlterScriptDto, SCRIPT_TYPE } = require('../types/AlterScriptDto');

/**
 * @return {(containerName: string) => AlterScriptDto | undefined}
 * */
const getAddContainerScriptDto = (app, scriptFormat) => (containerName, jsonSchema) => {
	const ddlContainerName = prepareNameForScriptFormat(scriptFormat)(containerName);

	const createContainerStatement = `CREATE USER ${ddlContainerName} NO AUTHENTICATION;`;
	return AlterScriptDto.getInstance(
		createContainerStatement,
		true,
		false,
		SCRIPT_TYPE.createContainer,
		getId(jsonSchema),
	);
};

/**
 * @return {(containerName: string) => AlterScriptDto | undefined}
 * */
const getDeleteContainerScriptDto = (app, scriptFormat) => (containerName, jsonSchema) => {
	const ddlContainerName = prepareNameForScriptFormat(scriptFormat)(containerName);

	const dropContainerStatement = `DROP USER ${ddlContainerName};`;
	return AlterScriptDto.getInstance(dropContainerStatement, true, true, SCRIPT_TYPE.dropContainer, getId(jsonSchema));
};

module.exports = {
	getAddContainerScriptDto,
	getDeleteContainerScriptDto,
};
