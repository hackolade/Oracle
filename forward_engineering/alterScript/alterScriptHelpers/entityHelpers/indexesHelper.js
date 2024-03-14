const { AlterScriptDto } = require('../../types/AlterScriptDto.js');
const { AlterCollectionDto } = require('../../types/AlterCollectionDto');
const { AlterIndexDto } = require('../../types/AlterIndexDto');
const { getFullPropertyName, wrapInQuotes } = require('../../../utils/general.js')();

/**
 * @typedef {{
 *     oldIndex: AlterIndexDto,
 *     newIndex: AlterIndexDto,
 * }} ModifiedIndexDto
 * */

/**
 * @callback GetAlterScriptDtosFunction
 * @param {{ collection: AlterCollectionDto }} args
 * @returns Array<AlterScriptDto>
 */

/**
 * @callback GetAlterScriptDtoFunction
 * @param {{ index: AlterIndexDto, collection: AlterCollectionDto }} args
 * @returns AlterScriptDto
 */

/**
 * @callback GetAlterScriptDtoFunctionForModifiedIndex
 * @param {{ modifiedIndex: ModifiedIndexDto, collection: AlterCollectionDto }} args
 * @returns AlterScriptDto
 */

const alterIndexRebuildProperties = ['index_compression', 'tablespace', 'logging_clause'];
const dropAndRecreateIndexProperties = [
	'indxType',
	'indxKey',
	'column_expression',
	'index_properties',
	'index_attributes',
];

/**
 * @param {{oldIndex: AlterIndexDto, newIndex: AlterIndexDto}} param0
 * @returns {boolean}
 */
const shouldDropAndRecreateIndex =
	({ _ }) =>
	({ oldIndex, newIndex }) => {
		return dropAndRecreateIndexProperties.some(property => !_.isEqual(oldIndex[property], newIndex[property]));
	};

/**
 * @param {{oldIndex: AlterIndexDto, newIndex: AlterIndexDto}} param0
 * @returns {boolean}
 */
const shouldAlterIndexRebuild = ({ oldIndex, newIndex }) => {
	return alterIndexRebuildProperties.some(property => oldIndex[property] !== newIndex[property]);
};

/**
 * @param {{oldIndex: AlterIndexDto, newIndex: AlterIndexDto}} param0
 * @returns {boolean}
 */
const areOldIndexDtoAndNewIndexDtoDescribingSameDatabaseIndex = ({ oldIndex, newIndex }) => {
	return oldIndex.id === newIndex.id || oldIndex.indxName === newIndex.indxName;
};

/**
 * @returns {GetAlterScriptDtosFunction}
 */
const getDeletedIndexesScriptDtos =
	({ _, ddlProvider }) =>
	({ collection }) => {
		const newIndexes = collection?.role?.compMod?.Indxs?.new || [];
		const oldIndexes = collection?.role?.compMod?.Indxs?.old || [];

		const deletedIndexes = oldIndexes.filter(oldIndex => {
			const correspondingNewIndex = newIndexes.find(newIndex =>
				areOldIndexDtoAndNewIndexDtoDescribingSameDatabaseIndex({
					oldIndex,
					newIndex,
				}),
			);
			return !Boolean(correspondingNewIndex);
		});

		return deletedIndexes.map(index => getDeleteIndexScriptDto({ ddlProvider })({ index, collection }));
	};

/**
 * @returns {GetAlterScriptDtoFunction}
 */
const getDeleteIndexScriptDto =
	({ ddlProvider }) =>
	({ index, collection }) => {
		const name = getFullPropertyName({
			propertyName: index.indxName,
			tableName: collection?.role?.compMod?.collectionName?.old,
			schemaName: collection?.role?.compMod?.bucketProperties?.name,
		});
		const script = ddlProvider.dropIndex({ name });

		return AlterScriptDto.getInstance([script], index.isActivated, true);
	};

/**
 * @returns {GetAlterScriptDtosFunction}
 */
const getAddedIndexesScriptDtos =
	({ _, ddlProvider }) =>
	({ collection }) => {
		const newIndexes = collection?.role?.compMod?.Indxs?.new || [];
		const oldIndexes = collection?.role?.compMod?.Indxs?.old || [];

		const addedIndexes = newIndexes.filter(newIndex => {
			const correspondingOldIndex = oldIndexes.find(oldIndex =>
				areOldIndexDtoAndNewIndexDtoDescribingSameDatabaseIndex({
					oldIndex,
					newIndex,
				}),
			);
			return !Boolean(correspondingOldIndex);
		});

		return addedIndexes.map(index => getAddIndexScriptDto({ ddlProvider })({ index, collection }));
	};

/**
 * @returns {GetAlterScriptDtoFunction}
 */
const getAddIndexScriptDto =
	({ ddlProvider }) =>
	({ index, collection }) => {
		const tableName = collection?.role?.compMod?.collectionName?.new;
		const script = ddlProvider.createIndex(tableName, {
			...index,
			schemaName: collection?.role?.compMod?.bucketProperties?.name,
		});

		return AlterScriptDto.getInstance([script], index.isActivated, false);
	};

/**
 * @returns {GetAlterScriptDtosFunction}
 */
const getModifiedIndexesScriptDtos =
	({ _, ddlProvider }) =>
	({ collection }) => {
		const newIndexes = collection?.role?.compMod?.Indxs?.new || [];
		const oldIndexes = collection?.role?.compMod?.Indxs?.old || [];

		const modifiedIndexes = newIndexes
			.map(newIndex => {
				const correspondingOldIndex = oldIndexes.find(oldIndex =>
					areOldIndexDtoAndNewIndexDtoDescribingSameDatabaseIndex({
						oldIndex,
						newIndex,
					}),
				);
				if (correspondingOldIndex) {
					return {
						newIndex,
						oldIndex: correspondingOldIndex,
					};
				}
				return undefined;
			})
			.filter(Boolean);

		return modifiedIndexes.flatMap(modifiedIndex =>
			getModifyIndexScriptDto({ _, ddlProvider })({ modifiedIndex, collection }),
		);
	};

/**
 * @returns {GetAlterScriptDtoFunctionForModifiedIndex}
 */
const getModifyIndexScriptDto =
	({ _, ddlProvider }) =>
	({ modifiedIndex: { oldIndex, newIndex }, collection }) => {
		const oldName = getFullPropertyName({
			propertyName: oldIndex.indxName,
			tableName: collection?.role?.compMod?.collectionName?.old,
			schemaName: collection?.role?.compMod?.bucketProperties?.name,
		});
		const name = getFullPropertyName({
			propertyName: newIndex.indxName,
			tableName: collection?.role?.compMod?.collectionName?.old,
			schemaName: collection?.role?.compMod?.bucketProperties?.name,
		});

		let alterScriptDtos = [];

		if (shouldDropAndRecreateIndex({ _ })({ oldIndex, newIndex })) {
			const dropIndexDto = AlterScriptDto.getInstance(
				[ddlProvider.dropIndex({ name: oldName })],
				newIndex.isActivated,
				true,
			);
			const createIndexDto = AlterScriptDto.getInstance(
				[
					ddlProvider.createIndex(collection?.role?.compMod?.collectionName?.new, {
						...newIndex,
						schemaName: collection?.role?.compMod?.bucketProperties?.name,
					}),
				],
				newIndex.isActivated,
				false,
			);
			alterScriptDtos.push(dropIndexDto, createIndexDto);

			return alterScriptDtos;
		}

		if (shouldAlterIndexRebuild({ oldIndex, newIndex })) {
			const alterIndexRebuildDto = AlterScriptDto.getInstance(
				[ddlProvider.alterIndexRebuild({ name, indexData: newIndex })],
				newIndex.isActivated,
				false,
			);
			alterScriptDtos.push(alterIndexRebuildDto);
		}

		const shouldRenameIndex = oldIndex.indxName !== newIndex.indxName;
		if (shouldRenameIndex) {
			const alterIndexDto = AlterScriptDto.getInstance(
				[ddlProvider.alterIndexRename({ oldName, newName: wrapInQuotes(newIndex.indxName) })],
				newIndex.isActivated,
				false,
			);
			alterScriptDtos.push(alterIndexDto);
		}

		return alterScriptDtos;
	};

/**
 * @return {(collection: Object) => AlterScriptDto[]}
 * */
const getModifyIndexesScriptDtos =
	({ _, ddlProvider }) =>
	({ collection }) => {
		const removedIndexScriptDtos = getDeletedIndexesScriptDtos({ _, ddlProvider })({ collection });
		const addedIndexScriptDtos = getAddedIndexesScriptDtos({ _, ddlProvider })({ collection });
		const modifiedIndexScriptDtos = getModifiedIndexesScriptDtos({ _, ddlProvider })({ collection });

		return [...removedIndexScriptDtos, ...addedIndexScriptDtos, ...modifiedIndexScriptDtos].filter(Boolean);
	};

module.exports = {
	getModifyIndexesScriptDtos,
};
