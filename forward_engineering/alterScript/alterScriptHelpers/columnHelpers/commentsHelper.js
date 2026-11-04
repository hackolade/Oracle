const { toPairs } = require('lodash');
const { AlterScriptDto, SCRIPT_TYPE } = require('../../types/AlterScriptDto');
const {
	getFullColumnName,
	wrapComment,
	getSchemaOfAlterCollection,
	getFullCollectionName,
	prepareNameForScriptFormat,
	isObjectInDeltaModelActivated,
	isParentContainerActivated,
} = require('../../../utils/general');
const { assignTemplates } = require('../../../utils/assignTemplates');
const templates = require('../../../ddlProvider/templates');

/**
 * @param {string} objectName
 * @param {string} comment
 * @return {string}
 * */
const updateColumnComment = (objectName, comment) => {
	const templateConfig = {
		object: 'COLUMN',
		objectName,
		comment,
	};

	return assignTemplates(templates.comment, templateConfig);
};

/**
 * @param {object} params
 * @property {string} [scriptFormat]
 * @property {AlterCollectionDto} collection
 * @return {AlterScriptDto[]}
 * */
const getUpdatedCommentOnColumnScriptDtos = ({ scriptFormat, collection }) => {
	const collectionSchema = getSchemaOfAlterCollection(collection);
	const fullTableName = getFullCollectionName(scriptFormat)(collectionSchema);
	const isCollectionActivated =
		isParentContainerActivated(collection) !== false && isObjectInDeltaModelActivated(collection) !== false;

	return toPairs(collection.properties)
		.filter(([name, jsonSchema]) => {
			const newComment = jsonSchema.description;
			const oldName = jsonSchema.compMod.oldField.name;
			const oldComment = collection.role.properties[oldName]?.description;

			return newComment !== oldComment;
		})
		.map(([name, jsonSchema]) => {
			const wrappedComment = jsonSchema.description ? wrapComment(jsonSchema.description) : 'NULL';
			const columnName = prepareNameForScriptFormat(scriptFormat)(name);
			const fullColumnName = `${fullTableName}.${columnName}`;

			const script = updateColumnComment(fullColumnName, wrappedComment);
			const isActivated = isCollectionActivated && jsonSchema.isActivated !== false;
			return AlterScriptDto.getInstance(script, isActivated, false, SCRIPT_TYPE.alterEntity);
		});
};

/**
 * @param {object} params
 * @property {string} [scriptFormat]
 * @property {AlterCollectionDto} collection
 * @return {AlterScriptDto[]}
 * */
const getModifiedCommentOnColumnScriptDtos = ({ scriptFormat, collection }) => {
	const updatedCommentScripts = getUpdatedCommentOnColumnScriptDtos({ scriptFormat, collection });

	return [...updatedCommentScripts];
};

module.exports = {
	getModifiedCommentOnColumnScriptDtos,
};
