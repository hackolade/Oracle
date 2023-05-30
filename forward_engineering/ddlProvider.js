const defaultTypes = require('./configs/defaultTypes');
const types = require('./configs/types');
const templates = require('./configs/templates');

module.exports = (baseProvider, options, app) => {
    const _ = app.require('lodash');

    const toArray = (val) => _.isArray(val) ? val : [val];
    
    const {
        tab,
        commentIfDeactivated,
        checkAllKeysDeactivated,
        divideIntoActivatedAndDeactivated,
        hasType,
        wrap,
        clean,
    } = require('./utils/general')(_);
    
    const { assignTemplates } = require('./utils/assignTemplates')({_});
    
    const {
        wrapInQuotes,
        getNamePrefixedWithSchemaName,
        wrapComment,
        getColumnsList,
    } = require('./helpers/general')({
        _,
        divideIntoActivatedAndDeactivated,
        commentIfDeactivated,
    });

    const keyHelper = require('./helpers/keyHelper')(_, clean);

    const { getColumnComments, getColumnConstraints, replaceTypeByVersion, getColumnDefault, getColumnEncrypt, decorateType } =
        require('./helpers/columnDefinitionHelper.js')({
            _,
            wrap,
            assignTemplates,
            templates,
            commentIfDeactivated,
            wrapInQuotes,
            wrapComment,
        });
    
    const { getTableType,
            getTableOptions,
            generateConstraintsString,
            foreignKeysToString,
            foreignActiveKeysToString,
            createKeyConstraint,
            customPropertiesForForeignKey
        } = require('./helpers/tableHelper')({
        _,
        checkAllKeysDeactivated,
        getColumnsList,
        commentIfDeactivated,
        wrapInQuotes,
        assignTemplates,
    });

    const { getUserDefinedType, isNotPlainType } = require('./helpers/udtHelper')({
        _,
        commentIfDeactivated,
        assignTemplates,
        templates,
        getNamePrefixedWithSchemaName,
        wrapInQuotes,
    });

    const { getViewType, getViewData } = require('./helpers/viewHelper')({
        _,
        wrapInQuotes,
    });

    const { getIndexType, getIndexKeys, getIndexOptions } = require('./helpers/indexHelper')({
        _,
        wrapInQuotes,
    });

    const wrapIfNotExists = (statement, ifNotExist, errorCode = 955) => {
        return ifNotExist ? assignTemplates(templates.ifNotExists, { statement: _.trim(tab(tab(statement))), errorCode }) : statement + ';';
    };
    
    return {
        getDefaultType(type) {
            return defaultTypes[type];
        },

        getTypesDescriptors() {
            return types;
        },

        hasType(type) {
            return hasType(types, type);
        },

        hydrateSchema(containerData, data) {
            const dbVersion = _.get(data, 'modelData.0.dbVersion');
            return {
                schemaName: containerData.name,
                ifNotExist: containerData.ifNotExist,
                dbVersion,
            };
        },

        createSchema({ schemaName, ifNotExist }) {
            const schemaStatement = wrapIfNotExists(assignTemplates(templates.createSchema, {
                schemaName: wrapInQuotes(schemaName),
            }), ifNotExist, 1920);
            return schemaStatement;
        },

        hydrateColumn({ columnDefinition, jsonSchema, schemaData, definitionJsonSchema = {} }) {
            const dbVersion = schemaData.dbVersion;
            const type = jsonSchema.$ref ? columnDefinition.type : _.toUpper(jsonSchema.mode || jsonSchema.type);
            return {
                name: columnDefinition.name,
                type,
                ofType: jsonSchema.ofType,
                notPersistable: jsonSchema.notPersistable,
                size: jsonSchema.size,
                primaryKey: keyHelper.isInlinePrimaryKey(jsonSchema),
                primaryKeyOptions: jsonSchema.primaryKeyOptions,
                unique: keyHelper.isInlineUnique(jsonSchema),
                uniqueKeyOptions: jsonSchema.uniqueKeyOptions,
                nullable: columnDefinition.nullable,
                default: columnDefinition.default,
                comment: jsonSchema.refDescription || jsonSchema.description || definitionJsonSchema.description,
                isActivated: columnDefinition.isActivated,
                scale: columnDefinition.scale,
                precision: columnDefinition.precision,
                length: columnDefinition.length,
                schemaName: schemaData.schemaName,
                checkConstraints: jsonSchema.checkConstraints,
                dbVersion,
                fractSecPrecision: jsonSchema.fractSecPrecision,
                withTimeZone: jsonSchema.withTimeZone,
                localTimeZone: jsonSchema.localTimeZone,
                yearPrecision: jsonSchema.yearPrecision,
                dayPrecision: jsonSchema.dayPrecision,
                lengthSemantics: jsonSchema.lengthSemantics,
                encryption: jsonSchema.encryption,
                identity: jsonSchema.identity,
            };
        },

        hydrateJsonSchemaColumn(jsonSchema, definitionJsonSchema) {
            if (!jsonSchema.$ref || _.isEmpty(definitionJsonSchema) || isNotPlainType(definitionJsonSchema)) {
                return jsonSchema;
            }

            jsonSchema = _.omit(jsonSchema, '$ref');
            return  { ...definitionJsonSchema, ...jsonSchema };
        },

        convertColumnDefinition(columnDefinition, template = templates.columnDefinition) {
            const type = replaceTypeByVersion(columnDefinition.type, columnDefinition.dbVersion);

            return commentIfDeactivated(
                assignTemplates(template, {
                    name: wrapInQuotes(columnDefinition.name),
                    type: decorateType(type, columnDefinition),
                    default: getColumnDefault(columnDefinition),
                    encrypt: getColumnEncrypt(columnDefinition),
                    constraints: getColumnConstraints(columnDefinition),
                }),
                {
                    isActivated: columnDefinition.isActivated,
                }
            ); 
        },

        hydrateCheckConstraint(checkConstraint) {
            return {
                name: checkConstraint.chkConstrName,
                expression: checkConstraint.constrExpression,
                comments: checkConstraint.constrComments,
                description: checkConstraint.constrDescription,
            };
        },

        createCheckConstraint({name, expression, comments, description }) {
            return assignTemplates(templates.checkConstraint, {
                name: name ? `CONSTRAINT ${wrapInQuotes(name)} ` : '',
                expression: _.trim(expression).replace(/^\(([\s\S]*)\)$/, '$1'),
            });
        },

        createForeignKeyConstraint(
            {
                name,
                foreignKey,
                primaryTable,
                primaryKey,
                primaryTableActivated,
                foreignTableActivated,
                foreignSchemaName,
                primarySchemaName,
                customProperties,
            },
            dbData,
            schemaData
        ) {
            const isAllPrimaryKeysDeactivated = checkAllKeysDeactivated(primaryKey);
            const isAllForeignKeysDeactivated = checkAllKeysDeactivated(foreignKey);
            const isActivated =
                !isAllPrimaryKeysDeactivated &&
                !isAllForeignKeysDeactivated &&
                primaryTableActivated &&
                foreignTableActivated;

            const foreignKeys = toArray(foreignKey);
            const primaryKeys = toArray(primaryKey);

            const { foreignOnDelete } = customPropertiesForForeignKey(customProperties);

            const foreignKeyStatement = assignTemplates(templates.createForeignKeyConstraint, {
                primaryTable: getNamePrefixedWithSchemaName(primaryTable, primarySchemaName || schemaData.schemaName),
                name: name ? `CONSTRAINT ${wrapInQuotes(name)}` : '',
                foreignKey: isActivated ? foreignKeysToString(foreignKeys) : foreignActiveKeysToString(foreignKeys),
                primaryKey: isActivated ? foreignKeysToString(primaryKeys) : foreignActiveKeysToString(primaryKeys),
                onDelete: foreignOnDelete ? ` ON DELETE ${foreignOnDelete}` : '',
            });

            return {
                statement: _.trim(foreignKeyStatement),
                isActivated,
            };
        },

        createForeignKey(
            {
                name,
                foreignTable,
                foreignKey,
                primaryTable,
                primaryKey,
                primaryTableActivated,
                foreignTableActivated,
                foreignSchemaName,
                primarySchemaName,
                customProperties,
            },
            dbData,
            schemaData
        ) {
            const isAllPrimaryKeysDeactivated = checkAllKeysDeactivated(primaryKey);
            const isAllForeignKeysDeactivated = checkAllKeysDeactivated(foreignKey);
            const isActivated =
                !isAllPrimaryKeysDeactivated &&
                !isAllForeignKeysDeactivated &&
                primaryTableActivated &&
                foreignTableActivated;

            const foreignKeys = toArray(foreignKey);
            const primaryKeys = toArray(primaryKey);

            const { foreignOnDelete } = customPropertiesForForeignKey(customProperties);

            const foreignKeyStatement = assignTemplates(templates.createForeignKey, {
                primaryTable: getNamePrefixedWithSchemaName(primaryTable, primarySchemaName || schemaData.schemaName),
                foreignTable: getNamePrefixedWithSchemaName(foreignTable, foreignSchemaName || schemaData.schemaName),
                name: name ? wrapInQuotes(name) : '',
                foreignKey: isActivated ? foreignKeysToString(foreignKeys) : foreignActiveKeysToString(foreignKeys),
                primaryKey: isActivated ? foreignKeysToString(primaryKeys) : foreignActiveKeysToString(primaryKeys),
                onDelete: foreignOnDelete ? ` ON DELETE ${foreignOnDelete}` : '',
            });

            return {
                statement: _.trim(foreignKeyStatement) + '\n',
                isActivated,
            };
        },

        hydrateTable({ tableData, entityData, jsonSchema }) {
            const detailsTab = entityData[0];
            const partitioning = _.first(detailsTab.partitioning) || {};
            const compositePartitionKey = keyHelper.getKeys(partitioning.compositePartitionKey, jsonSchema);

            return {
                ...tableData,
                keyConstraints: keyHelper.getTableKeyConstraints(jsonSchema),
                selectStatement: _.trim(detailsTab.selectStatement),
                partitioning: _.assign({}, partitioning, { compositePartitionKey }),
                ..._.pick(
                    detailsTab,
                    'blockchain_table_clauses',
                    'duplicated',
                    'external',
                    'external_table_clause',
                    'immutable',
                    'sharded',
                    'storage',
                    'temporary',
                    'temporaryType',
                    'description',
                    'ifNotExist',
                    'tableProperties'
                )
            };
        },

        createTable(
            {
                blockchain_table_clauses,
                checkConstraints,
                columnDefinitions,
                columns,
                duplicated,
                external,
                external_table_clause,
                foreignKeyConstraints,
                keyConstraints,
                immutable,
                name,
                partitioning,
                schemaData,
                selectStatement,
                sharded,
                storage,
                temporary,
                temporaryType,
                description,
                ifNotExist,
                tableProperties,
            },
            isActivated
        ) {
            const tableName = getNamePrefixedWithSchemaName(name, schemaData.schemaName);
            const comment = description ? assignTemplates(templates.comment, {
                object: 'TABLE',
                objectName: tableName,
                comment: wrapComment(description),
            }) : '';

            const dividedKeysConstraints = divideIntoActivatedAndDeactivated(
                keyConstraints.map(createKeyConstraint(templates, isActivated)),
                key => key.statement
            );
            const keyConstraintsString = generateConstraintsString(dividedKeysConstraints, isActivated);

            const dividedForeignKeys = divideIntoActivatedAndDeactivated(foreignKeyConstraints, key => key.statement);
            const foreignKeyConstraintsString = generateConstraintsString(dividedForeignKeys, isActivated);

            const columnDescriptions = getColumnComments(tableName, columnDefinitions);
            
            const tableProps = assignTemplates(templates.createTableProps, {
                columnDefinitions: _.join(columns, ',\n\t'),
                foreignKeyConstraints: foreignKeyConstraintsString,
                keyConstraints: keyConstraintsString,
                checkConstraints: !_.isEmpty(checkConstraints) ? ',\n\t' + _.join(checkConstraints, ',\n\t') : '',
            });

            const commentStatements = (comment || columnDescriptions) ? '\n' + comment + columnDescriptions : '';

            const tableStatement = commentIfDeactivated(
                wrapIfNotExists(
                    assignTemplates(templates.createTable, {
                        name: tableName,
                        tableProps: tableProps ? `\n(\n\t${tableProps}\n)` : '',
                        tableType: getTableType({
                            duplicated,
                            external,
                            immutable,
                            sharded,
                            temporary,
                            temporaryType,
                            blockchain_table_clauses,
                        }),
                        options: getTableOptions({
                            blockchain_table_clauses,
                            external_table_clause,
                            storage,
                            partitioning,
                            selectStatement,
                            tableProperties,
                        })
                    }),
                    ifNotExist,
                ) + commentStatements + '\n', {
                isActivated,
            });

            return tableStatement;
        },

        hydrateIndex(indexData, tableData, schemaData) {
            return { ...indexData, schemaName: schemaData.schemaName };
        },

        createIndex(tableName, index, dbData, isParentActivated = true) {
            const name = wrapInQuotes(index.indxName);
            const indexType = getIndexType(index.indxType);
            const keys = getIndexKeys(index);
            const options = _.trim(getIndexOptions(index, isParentActivated));

            return commentIfDeactivated(
                assignTemplates(templates.createIndex, {
                    indexType,
                    name,
                    keys,
                    options,
                    tableName: getNamePrefixedWithSchemaName(tableName, index.schemaName),
                }),
                {
                    isActivated: index.isActivated,
                }
            );
        },

        hydrateViewColumn(data) {
            return {
                name: data.name,
                tableName: data.entityName,
                alias: data.alias,
                isActivated: data.isActivated,
            };
        },

        hydrateView({ viewData, entityData }) {
            const detailsTab = entityData[0];

            return {
                name: viewData.name,
                keys: viewData.keys,
                orReplace: detailsTab.or_replace,
                editionable: detailsTab.editionable,
                editioning: detailsTab.editioning,
                force: detailsTab.force,
                selectStatement: detailsTab.selectStatement,
                schemaName: viewData.schemaData.schemaName,
                description: detailsTab.description,
                ifNotExist: detailsTab.ifNotExist,
                materialized: detailsTab.materialized,
            };
        },

        createView(viewData, dbData, isActivated) {
            const viewName = getNamePrefixedWithSchemaName(viewData.name, viewData.schemaName);
            
            const { columns, tables } = getViewData(viewData.keys);
            const columnsAsString = columns.map(column => column.statement).join(',\n\t\t');

            const comment = viewData.description ? '\n' + assignTemplates(templates.comment, {
                object: 'TABLE',
                objectName: viewName,
                comment: wrapComment(viewData.description),
            }) + '\n' : '\n';

            const selectStatement = _.trim(viewData.selectStatement)
                ? _.trim(tab(viewData.selectStatement))
                : assignTemplates(templates.viewSelectStatement, {
                      tableName: tables.join(', '),
                      keys: columnsAsString,
                  });

            return commentIfDeactivated(
                wrapIfNotExists(
                    assignTemplates(templates.createView, {
                        name: viewName,
                        orReplace: viewData.orReplace && !viewData.materialized ? ' OR REPLACE' : '',
                        force: viewData.force && !viewData.materialized ? ' FORCE' : '',
                        materialized: viewData.materialized ? ' MATERIALIZED' : '',
                        viewType: !viewData.materialized ? getViewType(viewData) : '',
                        selectStatement,
                    }), viewData.ifNotExist
                ) + comment,
                { isActivated }
            );
        },

        createUdt(udt) {
            return getUserDefinedType(udt, this.convertColumnDefinition);
        },

        commentIfDeactivated(statement, data, isPartOfLine) {
            return statement;
        },
    };
};
