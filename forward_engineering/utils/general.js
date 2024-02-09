/*
 * Copyright © 2016-2021 by IntegrIT S.A. dba Hackolade.  All rights reserved.
 *
 * The copyright to the computer software herein is the property of IntegrIT S.A.
 * The software may be used and/or copied only with the written permission of
 * IntegrIT S.A. or in accordance with the terms and conditions stipulated in
 * the agreement/contract under which the software has been supplied.
 */

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
		return Object.assign({}, _.get(containerData, '[0]', {}), { name: getDbName(containerData) });
	};

	const getViewOn = viewData => _.get(viewData, '[0].viewOn');

	const rejectRecursiveRelationships = foreignTableToRelationshipData => {
		return Object.keys(foreignTableToRelationshipData).reduce((result, foreignTableId) => {
			const tables = foreignTableToRelationshipData[foreignTableId].filter(item => {
				const tables = foreignTableToRelationshipData[item.primaryTableId];

				if (!Array.isArray(tables)) {
					return true;
				}

				return !tables.some(
					item => item.primaryTableId === foreignTableId && item.primaryTableId !== item.foreignTableId,
				);
			});

			if (_.isEmpty(tables)) {
				return result;
			}

			return Object.assign({}, result, {
				[foreignTableId]: tables,
			});
		}, {});
	};

	const filterRecursiveRelationships = foreignTableToRelationshipData => {
		return Object.keys(foreignTableToRelationshipData).reduce((result, foreignTableId) => {
			const tables = foreignTableToRelationshipData[foreignTableId].filter(item => {
				const tables = foreignTableToRelationshipData[item.primaryTableId];

				if (!Array.isArray(tables)) {
					return false;
				}

				return tables.some(
					item => item.primaryTableId === foreignTableId && item.primaryTableId !== item.foreignTableId,
				);
			});

			return result.concat(tables);
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
		} else {
			return inlineComment + ' ' + statement;
		}
	};

	const wrap = (str, start = "'", end = "'") => {
		const firstChar = str[0];
		const lastChar = str[str.length - 1];

		if (lastChar === start && firstChar === end) {
			return str;
		} else {
			return `${start}${str}${end}`;
		}
	};

	const wrapInQuotes = name => `"${name}"`;

	const wrapComment = comment => `'${comment}'`;

	const getNamePrefixedWithSchemaName = (name, schemaName) => {
		if (schemaName) {
			return `${wrapInQuotes(schemaName)}.${wrapInQuotes(name)}`;
		}

		return wrapInQuotes(name);
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
		getNamePrefixedWithSchemaName,
		checkFieldPropertiesChanged,
		getColumnsList,
		escapeSingleQuote,
	};
};
