const { AlterScriptDto } = require('../../types/AlterScriptDto');
const { wrapComment, getNamePrefixedWithSchemaNameForScriptFormat } = require('../../../utils/general');
const { assignTemplates } = require('../../../utils/assignTemplates');
const templates = require('../../../ddlProvider/templates');

/**
 * @param {string} objectName
 * @param {string} comment
 * @param {boolean} isMaterializedView
 * @return {string}
 * */
const updateViewComment = (objectName, comment, isMaterializedView) => {
	const object = isMaterializedView ? 'MATERIALIZED VIEW' : 'TABLE';
	const templateConfig = { object, objectName, comment };

	return assignTemplates(templates.comment, templateConfig);
};

/**
 * @param {object} params
 * @property {string} [scriptFormat]
 * @property {AlterCollectionDto} view
 * @return {AlterScriptDto | undefined}
 * */
const getUpdatedCommentScriptDto = ({ scriptFormat, view }) => {
	const description = view?.role?.compMod?.description || {};

	if (description.new === description.old) {
		return;
	}

	const schemaName = view.compMod?.keyspaceName;
	const fullViewName = getNamePrefixedWithSchemaNameForScriptFormat(scriptFormat)(view.code || view.name, schemaName);
	const wrappedComment = description.new ? wrapComment(description.new) : 'NULL';
	const script = updateViewComment(fullViewName, wrappedComment, view.materialized);

	return AlterScriptDto.getInstance([script], true, false);
};

/**
 * @param {object} params
 * @property {string} [scriptFormat]
 * @property {AlterCollectionDto} view
 * @return {AlterScriptDto[]}
 * */
const getModifyViewCommentsScriptDtos = ({ scriptFormat, view }) => {
	const updatedCommentScript = getUpdatedCommentScriptDto({ scriptFormat, view });

	return [updatedCommentScript].filter(Boolean);
};

module.exports = {
	getModifyViewCommentsScriptDtos,
};
