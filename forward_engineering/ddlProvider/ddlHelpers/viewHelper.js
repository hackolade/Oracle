module.exports = ({ _, wrapInQuotes }) => {
    const getViewType = ({
        editioning,
        editionable
    }) => {
        return `${editionable ? ' EDITIONABLE' : ''}${editioning ? ' EDITIONING' : ''}`;
    };

    const getKeyWithAlias = key => {
        if (!key) {
            return '';
        }

        if (key.alias) {
            return `${wrapInQuotes(key.name)} as ${wrapInQuotes(key.alias)}`;
        } else {
            return wrapInQuotes(key.name);
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

                let tableName = wrapInQuotes(key.tableName);

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
            }
        );
    };

    return {
        getViewType, getViewData,
    };
};
