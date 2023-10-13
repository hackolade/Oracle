module.exports = ({ _, getColumnsList, checkAllKeysDeactivated, commentIfDeactivated, wrapInQuotes, assignTemplates }) => {
    const { getOptionsString } = require('./constraintHelper')({ _, wrapInQuotes });

    const getTableType = (
        {
            duplicated,
            external,
            immutable,
            sharded,
            temporary,
            temporaryType,
            blockchain_table_clauses,
        }
    ) => {
        const blockchain = !_.isEmpty(blockchain_table_clauses);
        switch(true) {
            case temporary:
                return ` ${_.toUpper(temporaryType)} TEMPORARY`;
            case sharded:
                return ' SHARDED';
            case duplicated:
                return ' DUPLICATED';
            case immutable:
                return ' IMMUTABLE';
            case blockchain:
                return `${blockchain_table_clauses.immutable ? ' IMMUTABLE' : ''} BLOCKCHAIN`;
            default:
                return '';
        }
    };
    const getTableOptions = tableData => {
        const wrap = value => (value ? `${value}\n` : '');

        const statements = [
            { key: 'blockchain_table_clauses', getValue: getBlockChainClause(tableData?.tableProperties) },
            { key: 'storage', getValue: getStorage(tableData?.tableProperties) },
            { key: 'external_table_clause', getValue: getExternalTableClause },
            { key: 'partitioning', getValue: getPartitioning },
            { key: 'selectStatement', getValue: getBasicValue('AS') },
            { key: 'tableProperties', getValue: value => value }
        ]
            .map(config => tableData[config.key] ? wrap(config.getValue(tableData[config.key], tableData)) : '')
            .filter(Boolean)
            .join('');

        return _.trim(statements) ? ` ${_.trim(statements)}` : '';
    };

    const getBlockChainClause = (textTableProperties) => ({
        blockchain_table_retention_clause,
        blockchain_row_retention_clause,
        blockchain_hash_and_data_format_clause,
    }) => {
        const hasBlockchainPropertiesInTextProperties = _.includes(textTableProperties, blockchain_table_retention_clause)
            || _.includes(textTableProperties, blockchain_row_retention_clause)
            || _.includes(textTableProperties, blockchain_hash_and_data_format_clause)

        if (hasBlockchainPropertiesInTextProperties) {
            return '';
        }

        return _.trim(` ${blockchain_table_retention_clause || ''}` +
            ` ${blockchain_row_retention_clause || ''}` + 
            ` ${blockchain_hash_and_data_format_clause || ''}`);
    };

    const getStorage = (textTableProperties) => ({
        organization,
        tablespace,
        logging,
    }) => {
        if (_.includes(textTableProperties, 'TABLESPACE')) {
            return '';
        }

        if (organization === 'external') {
            return 'ORGANIZATION EXTERNAL';
        }
        return `ORGANIZATION ${_.toUpper(organization) || 'HEAP'}` + 
            `${tablespace ? ` TABLESPACE ${wrapInQuotes(tablespace)}` : ''}` + 
            ` ${logging ? 'LOGGING' : 'NOLOGGING'}`;
    }

    const getExternalTableClause = (value) => {
        if (!value?.access_driver_type) {
            return '';
        }
        const { 
            access_driver_type, 
            default_directory, 
            access_parameter_type, 
            opaque_format_spec,
            clob_subquery,
            reject_limit,
            project_column,
            location,
        } = value;
        const locationList = `(${_.map(location, ({location_directory, location_specifier}) => 
            (`${location_directory ? `${location_directory}:` : ''}` + 
                `'${location_specifier}'`)).join(', ')})`;
        const accessParamType = access_parameter_type === 'NONE' ? '' : 
            `ACCESS PARAMETERS ${clob_subquery ? `USING CLOB ${clob_subquery}` : opaque_format_spec}`;
        const externalData = `${default_directory && !_.isEmpty(default_directory) ? ` DEFAULT DIRECTORY ${default_directory}` : ''}` + 
            accessParamType + `${location && !_.isEmpty(location) ? ` LOCATION ${locationList}` : ''}`;
        return ` (TYPE ${_.toUpper(access_driver_type)} ${externalData})` +
            ` REJECT LIMIT ${reject_limit || 'UNLIMITED'} `;
    };

    const getPartitioning = (value, { isActivated }) => {
        if (value?.partitionBy) {
            const expression = getPartitionKeys(value, isActivated);
            const partitionClause = getPartitionClause(value, isActivated);

            return `PARTITION BY ${_.toUpper(_.startsWith(value.partitionBy, 'composite') ? _.last(value.partitionBy.split(' ')) : value.partitionBy)} ${expression}${partitionClause}`;
        }

        return '';
    };

    const getPartitionKeys = (value, isParentActivated) => {
        const isAllColumnsDeactivated = checkAllKeysDeactivated(value.partitionKey);
        if (_.isEmpty(value.partitionKey)) {
            return '';
        }
        return getColumnsList(value.partitionKey, isAllColumnsDeactivated, isParentActivated);
    };

    const getPartitionClause = (value, isActivated) => {
        switch(value.partitionBy) {
            case 'range':
                const isIntervalSet = value.interval || value.customInterval
                const interval = value.interval ? `\nINTERVAL (${value.interval})` : `\nINTERVAL (${value.customInterval})`

                return `${isIntervalSet ? interval : ''}` + 
                    getTablespaceList(value.store_in_tablespaces) +
                    partitionsToString(value.range_partitions, 'range_partition_clause');
			case 'list':
                return `${value.automatic ? ` AUTOMATIC` : ''}` + 
                    getTablespaceList(value.store_in_tablespaces) +
                    partitionsToString(value.list_partitions, 'list_partition_clause');
			case 'hash':
                return getHashPartition(value);
            case 'reference':
                return `${value.constraint ? ` (${value.constraint})` : ''}` + 
                    partitionsToString(value.reference_partition_descs, 'reference_partition_desc');
			case 'system':
                if (value.system_partitioning_quantity) {
                    return ` PARTITIONS ${value.system_partitioning_quantity}`;
                }
                return partitionsToString(value.system_partition_descs, 'system_partition_desc');
			case 'composite range': {
                const subpartition = getSubpartition(value, isActivated);
                return `${value.interval ? ` INTERVAL (${value.interval})` : ''}` + 
                    getTablespaceList(value.store_in_tablespaces) +
                    subpartition +
                    partitionsToString(value.range_subpartition_descs, 'range_subpartition_desc');
            } 
            case 'composite list': {
                const subpartition = getSubpartition(value, isActivated);
                return getTablespaceList(value.store_in_tablespaces, 'AUTOMATIC') +
                    subpartition +
                    partitionsToString(value.list_subpartition_descs, 'list_subpartition_description');
            }
			case 'composite hash': {
                const subpartition = getSubpartition(value, isActivated);
                const hashPartition = getHashPartition(value);
                return `${subpartition}${hashPartition}`;
            }
            default:
                return '';
        }
    };

    const partitionsToString = (partitions, key) => {
        if (partitions && _.isArray(partitions) && !_.isEmpty(partitions)) {
            return `\n(\n\t${(key ? _.map(partitions, p => p[key]) : partitions).join(',\n\t')}\n)\n`;
        }
        return '';
    };

    const getSubpartition = ({subpartitionType, partitionKey}, isParentActivated) => {
        if (subpartitionType) {
            const isAllColumnsDeactivated = checkAllKeysDeactivated(partitionKey);
            return ` SUBPARTITION BY ${_.toUpper(subpartitionType)} ${getColumnsList(partitionKey, isAllColumnsDeactivated, isParentActivated)}`;
        }
        return '';
    };

    const getTablespaceList = (store_in_tablespaces, word, key='store_in_tablespace') => !_.isEmpty(store_in_tablespaces) ? `${word ? ` ${word}`: ''} STORE IN (${_.map(store_in_tablespaces, val => val[key]).join(', ')})` : '';

    const getHashPartition = ({
        hash_partition_quantity, 
        store_in_tablespaces, 
        overflow_store_in_tablespaces,
        individual_hash_partitions,
    }) => {
        if (hash_partition_quantity) {
            return ` PARTITIONS ${hash_partition_quantity}` + 
                getTablespaceList(store_in_tablespaces) +
                getTablespaceList(overflow_store_in_tablespaces, 'OVERFLOW', 'overflow_store_in_tablespace');
            }
        return partitionsToString(individual_hash_partitions, 'individual_hash_partition');
    };

    const getBasicValue = prefix => value => {
        if (value) {
            return `${prefix} ${value}`;
        }
    };

    const generateConstraintsString = (dividedConstraints, isParentActivated) => {
        const deactivatedItemsAsString = commentIfDeactivated(
            (dividedConstraints?.deactivatedItems || []).join(',\n\t'),
            {
                isActivated: !isParentActivated,
                isPartOfLine: true,
            }
        );
        const activatedConstraints = dividedConstraints?.activatedItems?.length
            ? ',\n\t' + dividedConstraints.activatedItems.join(',\n\t')
            : '';

        const deactivatedConstraints = dividedConstraints?.deactivatedItems?.length
            ? '\n\t' + deactivatedItemsAsString
            : '';

        return activatedConstraints + deactivatedConstraints;
    };

    const foreignKeysToString = keys => {
        if (Array.isArray(keys)) {
            const activatedKeys = keys
                .filter(key => _.get(key, 'isActivated', true))
                .map(key => wrapInQuotes(_.trim(key.name)));
            const deactivatedKeys = keys
                .filter(key => !_.get(key, 'isActivated', true))
                .map(key => wrapInQuotes(_.trim(key.name)));
            const deactivatedKeysAsString = deactivatedKeys.length
                ? commentIfDeactivated(deactivatedKeys, { isActivated: false, isPartOfLine: true })
                : '';

            return activatedKeys.join(', ') + deactivatedKeysAsString;
        }
        return keys;
    };

    const foreignActiveKeysToString = keys => {
        return keys.map(key => _.trim(key.name)).join(', ');
    };

    const createKeyConstraint = (templates, isParentActivated) => keyData => {
        const isAllColumnsDeactivated = checkAllKeysDeactivated(keyData.columns);
        const columns = getColumnsList(keyData.columns, isAllColumnsDeactivated, isParentActivated);
        const options = getOptionsString(keyData).statement;
        
        return {
            statement: assignTemplates(templates.createKeyConstraint, {
                constraintName: keyData.constraintName ? `CONSTRAINT ${wrapInQuotes(keyData.constraintName)} ` : '',
                keyType: keyData.keyType,
                columns,
                options,
            }),
            isActivated: !isAllColumnsDeactivated,
        };
    };

    const customPropertiesForForeignKey = relationship => {
		const foreignOnDelete = _.get(relationship, 'relationshipOnDelete', '');
		return { foreignOnDelete };
	};

    return {
        getTableOptions,
        getTableType,
        generateConstraintsString,
        foreignKeysToString,
        foreignActiveKeysToString,
        createKeyConstraint,
        customPropertiesForForeignKey,
    };
};
