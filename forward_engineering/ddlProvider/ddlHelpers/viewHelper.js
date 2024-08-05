module.exports = ({ _, prepareName }) => {
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

	const getViewData = keys => {
		if (!Array.isArray(keys)) {
			return { tables: [], columns: [] };
		}

		return keys.reduce(
			(result, key) => {
				if (!key.tableName) {
					result.columns.push(getKeyWithAlias(key));

					return result;
				}

				const tableName = `${prepareName(key.dbName)}.${prepareName(key.tableName)}`;

				if (!result.tables.includes(tableName)) {
					result.tables.push(tableName);
				}

				result.columns.push({
					statement: `${tableName}.${getKeyWithAlias(key)}`,
					isActivated: key.isActivated,
				});

				return result;
			},
			{
				tables: [],
				columns: [],
			},
		);
	};

	return {
		getViewType,
		getViewData,
	};
};
