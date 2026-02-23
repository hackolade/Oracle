const { AlterScriptDto } = require('../../types/AlterScriptDto');
const { AlterCollectionDto } = require('../../types/AlterCollectionDto');
const { assignTemplates } = require('../../../utils/assignTemplates');
const { wrapComment, getSchemaOfAlterCollection, getFullCollectionName } = require('../../../utils/general');
const templates = require('../../../ddlProvider/templates');

/**
 * @param {string} objectName
 * @param {string} comment
 * @return {string}
 * */
const updateTableComment = (objectName, comment) => {
	const templateConfig = {
		object: 'TABLE',
		objectName,
		comment,
	};
	return assignTemplates(templates.comment, templateConfig);
};

/**
 * @param {object} params
 * @property {string} [scriptFormat]
 * @property {AlterCollectionDto} collection
 * @return {AlterScriptDto}
 */
const getUpdatedCommentOnCollectionScriptDto = ({ scriptFormat, collection }) => {
	const descriptionInfo = collection?.role.compMod?.description;
	if (!descriptionInfo) {
		return undefined;
	}

	const { old: oldComment, new: newComment } = descriptionInfo;
	if (newComment === oldComment) {
		return undefined;
	}

	const collectionSchema = getSchemaOfAlterCollection(collection);
	const fullTableName = getFullCollectionName(scriptFormat)(collectionSchema);
	const comment = newComment ? wrapComment(newComment) : 'NULL';
	const script = updateTableComment(fullTableName, comment);

	return AlterScriptDto.getInstance(script, true, false);
};

/**
 * @param {object} params
 * @property {string} [scriptFormat]
 * @property {AlterCollectionDto} collection
 * @return {Array<AlterScriptDto>}
 * */
const getModifyEntityCommentsScriptDtos = ({ scriptFormat, collection }) => {
	const updatedCommentScript = getUpdatedCommentOnCollectionScriptDto({ scriptFormat, collection });

	return [updatedCommentScript].filter(Boolean);
};

module.exports = {
	getModifyEntityCommentsScriptDtos,
};
