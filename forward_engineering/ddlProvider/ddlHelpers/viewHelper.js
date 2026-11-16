const _ = require('lodash');
const { commentIfDeactivated } = require('../../utils/general');

module.exports = ({ prepareName }) => {
	const getViewType = ({ editioning, editionable }) => {
		return `${editionable ? ' EDITIONABLE' : ''}${editioning ? ' EDITIONING' : ''}`;
	};

	const getKeyWithAlias = key => {
		if (!key) {
			return '';
		}

		if (key.alias) {
			return `${prepareName(key.name)} as ${prepareName(key.alias)}`;
		} else {
			return prepareName(key.name);
		}
	};

	const getViewData = ({ keys, isViewActivated }) => {
		if (!Array.isArray(keys)) {
			return { tables: [], columns: [] };
		}

		let hasActiveColumns = false;

		const { columns, tables } = keys.reduce(
			(result, key) => {
				// Keys without a tableName are plain columns that don't reference any table/view column.
				// They exist for documentation purposes only and can't take part in the SELECT statement.
				if (!key.tableName) {
					return result;
				}

				let tableName = `${prepareName(key.dbName)}.${prepareName(key.tableName)}`;

				const addedTable = result.tables.find(t => t.statement === tableName);
				if (addedTable) {
					addedTable.isActivated = addedTable.isActivated || key.isActivated;
				} else {
					result.tables.push({
						statement: tableName,
						isActivated: key.isActivated,
					});
				}

				result.columns.push({
					statement: `${tableName}.${getKeyWithAlias(key)}`,
					isActivated: key.isActivated,
				});

				if (key.isActivated && !hasActiveColumns) {
					hasActiveColumns = true;
				}

				return result;
			},
			{
				tables: [],
				columns: [],
			},
		);

		const join = items =>
			items
				.map(
					// Do not comment the column or table when (!isViewActivated || !hasActiveColumns) because the whole view will be commented out
					item =>
						commentIfDeactivated(item.statement, {
							isActivated: !isViewActivated || !hasActiveColumns || item.isActivated,
						}),
				)
				.join(',\n\t\t');

		return {
			hasActiveColumns,
			columnsAsString: join(columns),
			tablesAsString: join(tables),
		};
	};

	return {
		getViewType,
		getViewData,
	};
};
