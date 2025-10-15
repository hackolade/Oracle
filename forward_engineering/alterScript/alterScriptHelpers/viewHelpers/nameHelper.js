const { AlterScriptDto } = require('../../types/AlterScriptDto');
const { AlterCollectionDto } = require('../../types/AlterCollectionDto');
const { assignTemplates } = require('../../../utils/assignTemplates');
const { prepareNameForScriptFormat } = require('../../../utils/general');
const templates = require('../../../ddlProvider/templates');

/**
 * @param {object} params
 * @property {string} params.scriptFormat
 * @property {AlterCollectionDto} params.entity
 * @return {AlterScriptDto}
 */
const getRenameEntityScriptDto = ({ scriptFormat, entity }) => {
	const entityName = entity?.role?.compMod?.name;

	if (!entityName) {
		return undefined;
	}

	const { old: name, new: newName } = entityName;

	if (!newName || newName === name) {
		return undefined;
	}

	const renameScript = assignTemplates(templates.renameEntity, {
		name: prepareNameForScriptFormat(scriptFormat)(name),
		newName: prepareNameForScriptFormat(scriptFormat)(newName),
	});

	return AlterScriptDto.getInstance([renameScript], true, false);
};

/**
 * @param {object} params
 * @param {string} params.scriptFormat
 * @param {AlterCollectionDto} params.entity
 * @return {Array<AlterScriptDto>}
 * */
const getModifyEntityNameScriptDtos = ({ scriptFormat, entity }) => {
	const renameEntityScript = getRenameEntityScriptDto({ scriptFormat, entity });

	return [renameEntityScript].filter(Boolean);
};

module.exports = {
	getModifyEntityNameScriptDtos,
};
