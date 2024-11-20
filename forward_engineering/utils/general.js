/*
 * Copyright © 2016-2021 by IntegrIT S.A. dba Hackolade.  All rights reserved.
 *
 * The copyright to the computer software herein is the property of IntegrIT S.A.
 * The software may be used and/or copied only with the written permission of
 * IntegrIT S.A. or in accordance with the terms and conditions stipulated in
 * the agreement/contract under which the software has been supplied.
 */

const _ = require('lodash');

module.exports = _ => {
	const getDbName = containerData => {
		return _.get(containerData, '[0].code') || _.get(containerData, '[0].name', '');
	};

	const getEntityName = entityData => {
		return (entityData && (entityData.code || entityData.collectionName)) || '';
	};

	const getViewName = view => {
		return (view && (view.code || view.name)) || '';
	};

	const getBucketName = bucket => {
		return (bucket && (bucket.code || bucket.name)) || '';
	};

	const getDbData = containerData => {
		const dbData = _.get(containerData, '[0]', {});
		return {
			...dbData,
			name: getDbName(containerData),
		};
	};

	const getViewOn = viewData => _.get(viewData, '[0].viewOn');

	const isRecursiveRelationship = foreignTableId => item =>
		item.primaryTableId === foreignTableId && item.primaryTableId !== item.foreignTableId;

	const rejectRecursiveRelationships = foreignTableToRelationshipData => {
		return Object.keys(foreignTableToRelationshipData).reduce((result, foreignTableId) => {
			const foreignRelatedTables = foreignTableToRelationshipData[foreignTableId].filter(table => {
				const primaryRelatedTables = foreignTableToRelationshipData[table.primaryTableId];

				if (!Array.isArray(primaryRelatedTables)) {
					return true;
				}

				return !primaryRelatedTables.some(isRecursiveRelationship(foreignTableId));
			});

			if (_.isEmpty(foreignRelatedTables)) {
				return result;
			}

			return {
				...result,
				[foreignTableId]: foreignRelatedTables,
			};
		}, {});
	};

	const filterRecursiveRelationships = foreignTableToRelationshipData => {
		return Object.keys(foreignTableToRelationshipData).reduce((result, foreignTableId) => {
			const foreignRelatedTables = foreignTableToRelationshipData[foreignTableId].filter(item => {
				const primaryRelatedTables = foreignTableToRelationshipData[item.primaryTableId];

				if (!Array.isArray(primaryRelatedTables)) {
					return false;
				}

				return primaryRelatedTables.some(isRecursiveRelationship(foreignTableId));
			});

			return result.concat(foreignRelatedTables);
		}, []);
	};

	const tab = (text, tab = '\t') => {
		return text
			.split('\n')
			.map(line => tab + line)
			.join('\n');
	};

	const hasType = (types, type) => {
		return Object.keys(types).map(_.toLower).includes(_.toLower(type));
	};

	const clean = obj =>
		Object.entries(obj)
			.filter(([name, value]) => !_.isNil(value))
			.reduce(
				(result, [name, value]) => ({
					...result,
					[name]: value,
				}),
				{},
			);

	const checkAllKeysActivated = keys => {
		return keys.every(key => _.get(key, 'isActivated', true));
	};

	const checkAllKeysDeactivated = keys => {
		return keys.length ? keys.every(key => !_.get(key, 'isActivated', true)) : false;
	};

	const divideIntoActivatedAndDeactivated = (items, mapFunction) => {
		const activatedItems = items.filter(item => _.get(item, 'isActivated', true)).map(mapFunction);
		const deactivatedItems = items.filter(item => !_.get(item, 'isActivated', true)).map(mapFunction);

		return { activatedItems, deactivatedItems };
	};

	const commentIfDeactivated = (statement, { isActivated, isPartOfLine, inlineComment = '--' }) => {
		if (isActivated !== false) {
			return statement;
		}
		if (isPartOfLine) {
			return '/* ' + statement + ' */';
		} else if (statement.includes('\n')) {
			return '/*\n' + statement + ' */\n';
		}

		return inlineComment + ' ' + statement;
	};

	const wrap = (str, start = "'", end = "'") => {
		const firstChar = str[0];
		const lastChar = str[str.length - 1];

		if (lastChar === start && firstChar === end) {
			return str;
		}

		return `${start}${str}${end}`;
	};

	const wrapInQuotes = name => `"${name}"`;

	const wrapInSingleQuotes = name => `'${name}'`;

	const prepareNameForScriptFormat = scriptFormat => name => {
		return scriptFormat === 'nonquotedIdentifier' ? name : wrapInQuotes(name);
	};

	const getNamePrefixedWithSchemaNameForScriptFormat = scriptFormat => (name, schemaName) => {
		if (schemaName) {
			return `${prepareNameForScriptFormat(scriptFormat)(schemaName)}.${prepareNameForScriptFormat(scriptFormat)(name)}`;
		}

		return prepareNameForScriptFormat(scriptFormat)(name);
	};

	const checkFieldPropertiesChanged = (compMod, propertiesToCheck) => {
		return propertiesToCheck.some(prop => compMod?.oldField[prop] !== compMod?.newField[prop]);
	};

	const columnMapToString = ({ name }) => wrapInQuotes(name);

	const getColumnsList = (columns, isAllColumnsDeactivated, isParentActivated, mapColumn = columnMapToString) => {
		const dividedColumns = divideIntoActivatedAndDeactivated(columns, mapColumn);
		const deactivatedColumnsAsString = dividedColumns?.deactivatedItems?.length
			? commentIfDeactivated(dividedColumns.deactivatedItems.join(', '), {
					isActivated: false,
					isPartOfLine: true,
				})
			: '';

		return !isAllColumnsDeactivated && isParentActivated
			? ' (' + dividedColumns.activatedItems.join(', ') + deactivatedColumnsAsString + ')'
			: ' (' + columns.map(mapColumn).join(', ') + ')';
	};

	/**
	 * @param str {string}
	 * @return {string}
	 * */
	const escapeSingleQuote = str => {
		return str.replaceAll("'", "''");
	};

	const wrapComment = comment => wrapInSingleQuotes(escapeSingleQuote(comment));

	const getGroupItemsByCompMode = ({ newItems = [], oldItems = [] }) => {
		const addedItems = newItems.filter(newItem => !oldItems.some(item => item.id === newItem.id));
		const removedItems = [];
		const modifiedItems = [];

		oldItems.forEach(oldItem => {
			const newItem = newItems.find(item => item.id === oldItem.id);

			if (!newItem) {
				removedItems.push(oldItem);
			} else if (!_.isEqual(newItem, oldItem)) {
				modifiedItems.push(newItem);
			}
		});

		return {
			added: addedItems,
			removed: removedItems,
			modified: modifiedItems,
		};
	};

	return {
		getDbName,
		getBucketName,
		getDbData,
		getEntityName,
		getViewName,
		getViewOn,
		rejectRecursiveRelationships,
		filterRecursiveRelationships,
		tab,
		hasType,
		clean,
		checkAllKeysActivated,
		checkAllKeysDeactivated,
		divideIntoActivatedAndDeactivated,
		commentIfDeactivated,
		wrap,
		wrapComment,
		wrapInQuotes,
		wrapInSingleQuotes,
		getNamePrefixedWithSchemaNameForScriptFormat,
		checkFieldPropertiesChanged,
		getColumnsList,
		escapeSingleQuote,
		getGroupItemsByCompMode,
		prepareNameForScriptFormat,
	};
};
