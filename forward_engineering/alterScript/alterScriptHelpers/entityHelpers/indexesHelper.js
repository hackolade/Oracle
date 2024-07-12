const { AlterScriptDto } = require('../../types/AlterScriptDto.js');
const { AlterCollectionDto } = require('../../types/AlterCollectionDto');
const { AlterIndexDto } = require('../../types/AlterIndexDto');
const { wrapInQuotes } = require('../../../utils/general.js')();

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
 * @param {{index: AlterIndexDto, collection: AlterCollectionDto}} param0
 * @returns {AlterIndexDto}
 */
const addNameToIndexKey = ({ index, collection }) => {
	if (!index?.indxKey?.length) {
		return index;
	}

	return {
		...index,
		indxKey: index.indxKey.map(key => {
			if (!key?.keyId) {
				return key;
			}
			const collectionProperties = Object.entries(
				collection?.role?.properties || collection?.properties || {},
			).map(([name, value]) => ({ ...value, name }));
			const oldProperties = (collection?.role?.compMod?.oldProperties || []).map(property => ({
				...property,
				GUID: property.id,
			}));
			const properties = collectionProperties.length > 0 ? collectionProperties : oldProperties;
			const property = properties.find(property => property?.GUID === key?.keyId);

			if (!property) {
				return key;
			}

			if (!property?.compMod?.newField) {
				return {
					...key,
					name: property.name,
				};
			}

			return {
				...key,
				name: property?.compMod?.newField?.name || null,
			};
		}),
	};
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
			return !correspondingNewIndex;
		});

		return deletedIndexes.map(index => getDeleteIndexScriptDto({ ddlProvider })({ index, collection }));
	};

/**
 * @returns {GetAlterScriptDtoFunction}
 */
const getDeleteIndexScriptDto =
	({ ddlProvider }) =>
	({ index }) => {
		const name = wrapInQuotes(index.indxName);
		const script = ddlProvider.dropIndex({ name });

		return AlterScriptDto.getInstance([script], index.isActivated, true);
	};

/**
 * @returns {GetAlterScriptDtosFunction}
 */
const getAddedIndexesScriptDtos =
	({ _, ddlProvider }) =>
	({ collection }) => {
		const newIndexes = collection?.role?.Indxs || [];
		const oldIndexes = collection?.role?.compMod?.Indxs?.old || [];

		const addedIndexes = newIndexes.filter(newIndex => {
			const correspondingOldIndex = oldIndexes.find(oldIndex =>
				areOldIndexDtoAndNewIndexDtoDescribingSameDatabaseIndex({
					oldIndex,
					newIndex,
				}),
			);
			return !correspondingOldIndex;
		});

		return addedIndexes.map(index => getAddIndexScriptDto({ ddlProvider })({ index, collection }));
	};

/**
 * @returns {GetAlterScriptDtoFunction}
 */
const getAddIndexScriptDto =
	({ ddlProvider }) =>
	({ index, collection }) => {
		const indexWithAddedKeyNames = addNameToIndexKey({ index, collection });
		const tableName = collection?.role?.compMod?.collectionName?.new || collection?.role?.name;
		const script = ddlProvider.createIndex(tableName, {
			...indexWithAddedKeyNames,
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
		const oldName = wrapInQuotes(oldIndex.indxName);
		const newName = wrapInQuotes(newIndex.indxName);

		let alterScriptDtos = [];

		if (shouldDropAndRecreateIndex({ _ })({ oldIndex, newIndex })) {
			const dropIndexDto = AlterScriptDto.getInstance(
				[ddlProvider.dropIndex({ name: oldName })],
				newIndex.isActivated,
				true,
			);
			const newIndexWithAddedKeyNames = addNameToIndexKey({ index: newIndex, collection });
			const createIndexDto = AlterScriptDto.getInstance(
				[
					ddlProvider.createIndex(collection?.role?.compMod?.collectionName?.new, {
						...newIndexWithAddedKeyNames,
						schemaName: collection?.role?.compMod?.bucketProperties?.name,
					}),
				],
				newIndex.isActivated,
				false,
			);
			alterScriptDtos.push(dropIndexDto, createIndexDto);

			return alterScriptDtos;
		}

		const shouldRenameIndex = oldIndex.indxName !== newIndex.indxName;
		if (shouldRenameIndex) {
			const alterIndexDto = AlterScriptDto.getInstance(
				[ddlProvider.alterIndexRename({ oldName, newName })],
				newIndex.isActivated,
				false,
			);
			alterScriptDtos.push(alterIndexDto);
		}

		if (shouldAlterIndexRebuild({ oldIndex, newIndex })) {
			const alterIndexRebuildDto = AlterScriptDto.getInstance(
				[ddlProvider.alterIndexRebuild({ name: newName, indexData: newIndex })],
				newIndex.isActivated,
				false,
			);
			alterScriptDtos.push(alterIndexRebuildDto);
		}

		return alterScriptDtos;
	};

/**
 * @returns {GetAlterScriptDtosFunction}
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
	getAddedIndexesScriptDtos,
};
