const { AlterScriptDto } = require('../../types/AlterScriptDto');
const { AlterCollectionDto } = require('../../types/AlterCollectionDto');
const { assignTemplates } = require('../../../utils/assignTemplates');
const {
	prepareNameForScriptFormat,
	getSchemaOfAlterCollection,
	getNamePrefixedWithSchemaNameForScriptFormat,
} = require('../../../utils/general');
const templates = require('../../../ddlProvider/templates');

/**
 * @param {object} params
 * @property {string} params.scriptFormat
 * @property {AlterCollectionDto} params.collection
 * @return {AlterScriptDto}
 */
const getRenameCollectionScriptDto = ({ scriptFormat, collection }) => {
	const collectionName = collection?.role?.compMod?.collectionName;

	if (!collectionName) {
		return undefined;
	}

	const { old: name, new: newName } = collectionName;

	if (!newName || newName === name) {
		return undefined;
	}

	const collectionSchema = getSchemaOfAlterCollection(collection);
	const bucketName = collectionSchema.compMod?.keyspaceName;

	const fullTableName = getNamePrefixedWithSchemaNameForScriptFormat(scriptFormat)(name, bucketName);

	const script = assignTemplates(templates.renameTable, {
		tableName: fullTableName,
		newName: prepareNameForScriptFormat(scriptFormat)(newName),
	});

	return AlterScriptDto.getInstance(script, true, false);
};

/**
 * @param {object} params
 * @param {string} params.scriptFormat
 * @param {AlterCollectionDto} params.collection
 * @return {Array<AlterScriptDto>}
 * */
const getModifyCollectionNameScriptDtos = ({ scriptFormat, collection }) => {
	const renameEntityScript = getRenameCollectionScriptDto({ scriptFormat, collection });

	return [renameEntityScript];
};

module.exports = {
	getModifyCollectionNameScriptDtos,
};
