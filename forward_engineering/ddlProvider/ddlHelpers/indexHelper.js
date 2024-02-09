module.exports = ({_, wrapInQuotes}) => {
    const getIndexType = (indexType) => {
        return indexType ? ` ${_.toUpper(indexType)}` : '';
    };

    /**
     * @param indxKey {Array<Object> | undefined}
     * @param indxConditionalFunction {string | undefined}
     * @return {string}
     * */
    const getIndexKeys = ({
                              indxKey,
                              indxConditionalFunction,
                          }) => {
        if (indxConditionalFunction) {
            return `\n(\n\t${indxConditionalFunction}\n)\n\t`;
        }
        if (_.isArray(indxKey) && !_.isEmpty(indxKey)) {
            const indexedColumnsClause = _.map(
                indxKey,
                ({
                     name,
                     type
                 }) => `${wrapInQuotes(name)} ${_.toUpper(type)}`
            )
                .join(',\n\t');
            return `\n(\n\t${indexedColumnsClause}\n)\n\t`;
        }
        return '';
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
                                 indxConditionalFunction,
                             }) => {
        let options = `${logging_clause ? ` ${_.toUpper(logging_clause)}` : ''}` +
            `${tablespace ? ` TABLESPACE ${tablespace}` : ''}` +
            `${index_compression ? ` ${index_compression}` : ''}`

        if (index_properties) {
            options = ` ${index_properties}`;
        } else if (index_attributes) {
            options = ` ${index_attributes}`;
        }
        const isKeysEmpty = _.isEmpty(indxKey) && _.isEmpty(indxConditionalFunction);

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
