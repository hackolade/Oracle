module.exports = ({ _, wrapInQuotes }) => {
    const getIndexType = (indexType) => {
        return indexType ? ` ${_.toUpper(indexType)}` : '';
    };

    const getIndexKeys = ({
        indxKey,
        column_expression,
    }) => {
        if (_.isArray(indxKey) && !_.isEmpty(indxKey)) {
            return `\n(\n\t${_.map(indxKey, ({name, type}) => `${wrapInQuotes(name)} ${_.toUpper(type)}`).join(',\n\t')}\n)\n\t`;
        }
        return _.isEmpty(column_expression) ? '' : `(${_.map(column_expression, expr => expr.value)})`;
    };

    const getIndexOptions = ({
        indxDescription,
        comments,
        tablespace,
        index_properties,
        index_attributes,
        index_compression,
        logging_clause,
        indxKey,
        column_expression,
    }) => {
        let options = `${logging_clause ? ` ${_.toUpper(logging_clause)}` : ''}` +
        `${tablespace ? ` TABLESPACE ${tablespace}` : ''}` + 
        `${index_compression ? ` ${index_compression}` : ''}`

        if (index_properties) {
            options =  ` ${index_properties}`;
        } else if (index_attributes) {
            options =  ` ${index_attributes}`;
        }
        const isKeysEmpty = _.isEmpty(indxKey) && _.isEmpty(column_expression);

        if (!isKeysEmpty) {
            return _.trim(options);
        }

        return options;
    };

    const getIndexName = name => name ? ` ${wrapInQuotes(name)}` : '';

    return {
        getIndexType, getIndexKeys, getIndexOptions, getIndexName
    };
};
