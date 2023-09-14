module.exports = ({ _, divideIntoActivatedAndDeactivated, commentIfDeactivated }) => {
    /**
     * @deprecated Use utils/general.js
     * */
    const wrapInQuotes = name => `"${name}"`;
    /**
     * @deprecated Use utils/general.js
     * */
    const wrapComment = comment => `'${comment}'`;


    /**
     * @deprecated Use utils/general.js
     * */
    const getNamePrefixedWithSchemaName = (name, schemaName) => {
        if (schemaName) {
            return `${wrapInQuotes(schemaName)}.${wrapInQuotes(name)}`;
        }

        return wrapInQuotes(name);
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

    return {
        wrapInQuotes,
        wrapComment,
        getNamePrefixedWithSchemaName,
        getColumnsList,
    };
};
