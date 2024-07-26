const defaultTypes = require('../configs/defaultTypes');
const descriptors = require('../configs/descriptors');
const templates = require('./templates');
const { DualityViewDdlCreatorFactory } = require('./ddlHelpers/dualityViewFeHelper/dualityViewDdlCreatorFactory');
const { DualityViewSyntaxType } = require('../enums/DualityViewSyntaxType');
const { DbVersion } = require('../enums/DbVersion');
const { AlterIndexDto } = require('../alterScript/types/AlterIndexDto.js');
const { Sequence } = require('../types/schemaSequenceTypes');
const _ = require('lodash');

/**
 * @param dbVersion {string} DB version in "21ai" format
 * @return {boolean}
 * */
const shouldUseTryCatchIfNotExistsWrapper = dbVersion => {
	const dbVersionAsNumber = Number.parseInt(dbVersion, 10);
	return dbVersionAsNumber < DbVersion.IF_NOT_EXISTS_SINCE;
};

module.exports = (baseProvider, options, app) => {
	const toArray = val => (_.isArray(val) ? val : [val]);

	const {
		tab,
		commentIfDeactivated,
		checkAllKeysDeactivated,
		divideIntoActivatedAndDeactivated,
		hasType,
		wrap,
		clean,
		getNamePrefixedWithSchemaNameForScriptFormat,
		wrapComment,
		getColumnsList,
		prepareNameForScriptFormat,
	} = require('../utils/general')(_);

	const prepareName = prepareNameForScriptFormat(options.targetScriptOptions.keyword);
	const getNamePrefixedWithSchemaName = getNamePrefixedWithSchemaNameForScriptFormat(
		options.targetScriptOptions.keyword,
	);

	const { assignTemplates } = require('../utils/assignTemplates')({ _ });

	const keyHelper = require('./ddlHelpers/keyHelper')(_, clean);

	const {
		getColumnComments,
		getColumnConstraints,
		replaceTypeByVersion,
		getColumnDefault,
		getColumnEncrypt,
		decorateType,
		canHaveIdentity,
	} = require('./ddlHelpers/columnDefinitionHelper.js')({
		_,
		wrap,
		assignTemplates,
		templates,
		commentIfDeactivated,
		wrapComment,
		prepareName,
	});

	const {
		getTableType,
		getTableOptions,
		generateConstraintsString,
		foreignKeysToString,
		foreignActiveKeysToString,
		createKeyConstraint,
		customPropertiesForForeignKey,
	} = require('./ddlHelpers/tableHelper')({
		_,
		checkAllKeysDeactivated,
		getColumnsList,
		commentIfDeactivated,
		prepareName,
		assignTemplates,
	});

	const { getUserDefinedType, isNotPlainType } = require('./ddlHelpers/udtHelper')({
		_,
		commentIfDeactivated,
		assignTemplates,
		templates,
		getNamePrefixedWithSchemaName,
	});

	const { getViewType, getViewData } = require('./ddlHelpers/viewHelper')({
		_,
		prepareName,
	});

	const { getIndexType, getIndexKeys, getIndexOptions, getIndexName } = require('./ddlHelpers/indexHelper')({
		_,
		prepareName,
	});

	const wrapIfNotExists = (statement, ifNotExist, errorCode = 955) => {
		if (ifNotExist) {
			const tabbedStatement = tab(tab(statement));
			const trimmedStatement = _.trim(tabbedStatement);
			const statementWithNoTrailingDelimiter = trimmedStatement.replace(/;$/, '');

			return assignTemplates(templates.ifNotExists, { statement: statementWithNoTrailingDelimiter, errorCode });
		}
		return statement + ';';
	};

	const { generateSynonymStatements } = require('./ddlHelpers/synonymHelper')({
		prepareName,
		templates,
		assignTemplates,
		getNamePrefixedWithSchemaName,
	});

	const { getSequencesScript, createSequenceScript, dropSequenceScript, alterSequenceScript } =
		require('./ddlHelpers/sequenceHelper')({
			_,
			templates,
			assignTemplates,
			getNamePrefixedWithSchemaName,
			wrapIfNotExists,
		});

	return {
		getDefaultType(type) {
			return defaultTypes[type];
		},

		getTypesDescriptors() {
			return descriptors;
		},

		hasType(type) {
			return hasType(descriptors, type);
		},

		hydrateSchema(containerData, data) {
			const dbVersion = _.get(data, 'modelData.0.dbVersion');
			return {
				schemaName: containerData.name,
				ifNotExist: containerData.ifNotExist,
				dbVersion,
				synonyms: data.synonyms,
				sequences: data.sequences,
			};
		},

		createSchema({ schemaName, ifNotExist, dbVersion, sequences }) {
			const usingTryCatchWrapper = shouldUseTryCatchIfNotExistsWrapper(dbVersion);
			const schemaStatement = assignTemplates(templates.createSchema, {
				schemaName: prepareName(schemaName),
				ifNotExists: !usingTryCatchWrapper && ifNotExist ? ' IF NOT EXISTS' : '',
			});
			const sequencesStatement = getSequencesScript({ schemaName, sequences, usingTryCatchWrapper });
			const schemaSequencesStatement = sequencesStatement ? '\n\n' + sequencesStatement : '';

			if (!usingTryCatchWrapper) {
				return schemaStatement + ';' + schemaSequencesStatement;
			}

			const wrappedSchemaStatement = wrapIfNotExists(schemaStatement, ifNotExist, 1920);

			return wrappedSchemaStatement + schemaSequencesStatement;
		},

		hydrateColumn({ columnDefinition, jsonSchema, schemaData, definitionJsonSchema = {} }) {
			const dbVersion = schemaData.dbVersion;
			const isUDTRef = !!jsonSchema.$ref;
			const type = isUDTRef ? columnDefinition.type : _.toUpper(jsonSchema.mode || jsonSchema.type);
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
				synonyms: schemaData?.synonyms?.filter(synonym => synonym.synonymEntityId === jsonSchema.GUID) || [],
				isUDTRef,
				dimension: jsonSchema.dimension,
				subtype: jsonSchema.subtype,
				...(canHaveIdentity(jsonSchema.mode) && { identity: jsonSchema.identity }),
			};
		},

		hydrateJsonSchemaColumn(jsonSchema, definitionJsonSchema) {
			if (!jsonSchema.$ref || _.isEmpty(definitionJsonSchema) || isNotPlainType(definitionJsonSchema)) {
				return jsonSchema;
			}

			jsonSchema = _.omit(jsonSchema, '$ref');
			return { ...definitionJsonSchema, ...jsonSchema };
		},

		convertColumnDefinition(columnDefinition, template = templates.columnDefinition) {
			const type = replaceTypeByVersion(columnDefinition.type, columnDefinition.dbVersion);

			return commentIfDeactivated(
				assignTemplates(template, {
					name: prepareName(columnDefinition.name),
					type: decorateType(type, columnDefinition),
					default: getColumnDefault(columnDefinition),
					encrypt: getColumnEncrypt(columnDefinition),
					constraints: getColumnConstraints(columnDefinition),
				}),
				{
					isActivated: columnDefinition.isActivated,
				},
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

		createCheckConstraint({ name, expression, comments, description }) {
			return assignTemplates(templates.checkConstraint, {
				name: name ? `CONSTRAINT ${prepareName(name)} ` : '',
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
			schemaData,
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
				name: name ? `CONSTRAINT ${prepareName(name)}` : '',
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
			schemaData,
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
				name: name ? prepareName(name) : '',
				foreignKey: isActivated ? foreignKeysToString(foreignKeys) : foreignActiveKeysToString(foreignKeys),
				primaryKey: isActivated ? foreignKeysToString(primaryKeys) : foreignActiveKeysToString(primaryKeys),
				onDelete: foreignOnDelete ? ` ON DELETE ${foreignOnDelete}` : '',
			});

			return {
				statement: _.trim(foreignKeyStatement) + '\n',
				isActivated,
			};
		},

		/**
		 * @param tableName {string}
		 * @param fkConstraintName {string}
		 * @return string
		 * */
		dropForeignKey(tableName, fkConstraintName) {
			const templateConfig = {
				tableName,
				fkConstraintName,
			};
			return assignTemplates(templates.dropForeignKey, templateConfig);
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
					'tableProperties',
				),
				synonyms:
					tableData?.schemaData?.synonyms?.filter(synonym => synonym.synonymEntityId === jsonSchema.GUID) ||
					[],
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
				synonyms,
			},
			isActivated,
		) {
			const tableName = getNamePrefixedWithSchemaName(name, schemaData.schemaName);
			const comment = description
				? assignTemplates(templates.comment, {
						object: 'TABLE',
						objectName: tableName,
						comment: wrapComment(description),
					})
				: '';

			const dividedKeysConstraints = divideIntoActivatedAndDeactivated(
				keyConstraints.map(createKeyConstraint(templates, isActivated)),
				key => key.statement,
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

			const synonymsStatements = generateSynonymStatements(synonyms, tableName, schemaData.schemaName);

			const commentStatements = comment || columnDescriptions ? '\n' + comment + columnDescriptions : '';

			const dbVersion = schemaData.dbVersion || '';
			const usingTryCatchWrapper = shouldUseTryCatchIfNotExistsWrapper(dbVersion);

			let createTableDdl = assignTemplates(templates.createTable, {
				name: tableName,
				ifNotExists: !usingTryCatchWrapper && ifNotExist ? ' IF NOT EXISTS' : '',
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
				}),
			});
			if (usingTryCatchWrapper) {
				createTableDdl = wrapIfNotExists(createTableDdl, ifNotExist);
			} else {
				createTableDdl += ';';
			}

			return commentIfDeactivated(createTableDdl + `${commentStatements}\n` + synonymsStatements, {
				isActivated,
			});
		},

		hydrateIndex(indexData, tableData, schemaData) {
			return { ...indexData, schemaName: schemaData.schemaName };
		},

		createIndex(tableName, index, dbData, isParentActivated = true) {
			const name = getIndexName(index.indxName);
			const indexType = getIndexType(index.indxType);
			const keys = getIndexKeys(index);
			const indexOptions = getIndexOptions(index);
			const dbVersion = options.dbVersion || '';
			const usingTryCatchWrapper = shouldUseTryCatchIfNotExistsWrapper(dbVersion);

			const shouldInsertIfNotExistsStatement = index.ifNotExist && !usingTryCatchWrapper;

			let statement = assignTemplates(templates.createIndex, {
				indexType,
				ifNotExists: shouldInsertIfNotExistsStatement ? ' IF NOT EXISTS' : '',
				name,
				keys,
				options: indexOptions,
				tableName: getNamePrefixedWithSchemaName(tableName, index.schemaName),
			});

			if (index.ifNotExist && usingTryCatchWrapper) {
				statement = wrapIfNotExists(statement, true);
			}

			if (usingTryCatchWrapper) {
				return commentIfDeactivated(statement, {
					isActivated: index.isActivated,
				});
			}

			return commentIfDeactivated(statement, {
				isActivated: index.isActivated,
			});
		},

		/**
		 * @param {{name: string}} param0
		 */
		dropIndex({ name }) {
			return assignTemplates(templates.dropIndex, { name });
		},

		/**
		 * @param {{oldName: string, newName: string}} param0
		 */
		alterIndexRename({ oldName, newName }) {
			return assignTemplates(templates.alterIndexRename, { oldName, newName });
		},

		/**
		 * @param {{name: string, indexData: AlterIndexDto}} param0
		 */
		alterIndexRebuild({ name, indexData }) {
			const optionsStatement = getIndexOptions(indexData);

			return assignTemplates(templates.alterIndexRebuild, { name, options: optionsStatement });
		},

		hydrateViewColumn(data) {
			return {
				name: data.name,
				tableName: data.entityName,
				alias: data.alias,
				isActivated: data.isActivated,
				dbName: data.dbName,
			};
		},

		hydrateView({ viewData, entityData, jsonSchema }) {
			const detailsTab = entityData[0];

			return {
				name: viewData.name,
				keys: viewData.keys,
				orReplace: detailsTab.or_replace,
				editionable: detailsTab.editionable,
				editioning: detailsTab.editioning,
				force: detailsTab.force,
				selectStatement: detailsTab.selectStatement,
				tableName: viewData.tableName,
				schemaName: viewData.schemaData.schemaName,
				description: detailsTab.description,
				ifNotExist: detailsTab.ifNotExist,
				materialized: detailsTab.materialized,
				sharing: detailsTab.sharing,
				duality: detailsTab.duality,
				rootTableAlias: detailsTab.rootTableAlias,
				tableTagsClause: detailsTab.tableTagsClause,
				viewProperties: detailsTab.materialized ? detailsTab.mviewProperties : detailsTab.viewProperties,
				synonyms:
					viewData.schemaData?.synonyms?.filter(synonym => synonym.synonymEntityId === jsonSchema.GUID) || [],
				modelInfo: {
					dbVersion: _.get(viewData, 'schemaData.dbVersion'),
				},
			};
		},

		hydrateViewIndex(indexData, schemaData, viewData) {
			return { ...indexData, schemaName: schemaData.schemaName, materialized: _.first(viewData)?.materialized };
		},

		createViewIndex(viewName, index, dbData, isParentActivated) {
			const name = getIndexName(index.indxName);
			const indexType = getIndexType(index.indxType);
			const keys = getIndexKeys(index);
			const options = getIndexOptions(index, isParentActivated);

			if (!index.materialized) {
				return;
			}

			return commentIfDeactivated(
				assignTemplates(templates.createIndex, {
					indexType,
					name,
					keys,
					options,
					tableName: getNamePrefixedWithSchemaName(viewName, index.schemaName),
				}),
				{
					isActivated: index.isActivated,
				},
			);
		},

		createView(viewData, dbData, isActivated) {
			const viewName = getNamePrefixedWithSchemaName(viewData.name, viewData.schemaName);

			const { columns, tables } = getViewData(viewData.keys);
			const columnsAsString = columns.map(column => column.statement).join(',\n\t\t');

			const comment = viewData.description
				? '\n' +
					assignTemplates(templates.comment, {
						object: 'TABLE',
						objectName: viewName,
						comment: wrapComment(viewData.description),
					}) +
					'\n'
				: '\n';

			const selectStatement = _.trim(viewData.selectStatement)
				? _.trim(tab(viewData.selectStatement))
				: assignTemplates(templates.viewSelectStatement, {
						tableName: tables.join(', '),
						keys: columnsAsString,
					});

			const synonymsStatements = generateSynonymStatements(viewData.synonyms, viewName, viewData.schemaName);

			const dbVersion = _.get(viewData, 'modelInfo.dbVersion', '');
			const usingTryCatchWrapper = shouldUseTryCatchIfNotExistsWrapper(dbVersion);

			let createViewDdl = assignTemplates(templates.createView, {
				name: viewName,
				ifNotExists: !usingTryCatchWrapper && viewData.ifNotExist ? ' IF NOT EXISTS' : '',
				orReplace: viewData.orReplace && !viewData.materialized ? ' OR REPLACE' : '',
				force: viewData.force && !viewData.materialized ? ' FORCE' : '',
				materialized: viewData.materialized ? ' MATERIALIZED' : '',
				viewType: !viewData.materialized ? getViewType(viewData) : '',
				viewProperties: viewData.viewProperties ? ' \n' + tab(viewData.viewProperties) : '',
				sharing: viewData.sharing && !viewData.materialized ? ` SHARING=${viewData.sharing}` : '',
				selectStatement,
			});
			if (usingTryCatchWrapper) {
				createViewDdl = wrapIfNotExists(createViewDdl, viewData.ifNotExist);
			} else {
				createViewDdl += ';';
			}

			return commentIfDeactivated(createViewDdl + comment + synonymsStatements, { isActivated });
		},

		/**
		 * @return {string}
		 * */
		createDualityView({ jsonSchema, view, relatedSchemas }) {
			const ddlCreator = DualityViewDdlCreatorFactory.getCreatorInstance(DualityViewSyntaxType.SQL, {
				ddlTemplates: templates,
				assignTemplates,
				lodash: _,
				prepareName,
				getNamePrefixedWithSchemaName,
			});
			return ddlCreator.convertDualityViewToDdl({
				view,
				jsonSchema,
				relatedSchemas,
			});
		},

		createUdt(udt) {
			const synonymsStatements = generateSynonymStatements(
				udt.synonyms,
				getNamePrefixedWithSchemaName(udt.name, udt.schemaName),
				udt.schemaName,
			);

			return commentIfDeactivated(getUserDefinedType(udt, this.convertColumnDefinition) + synonymsStatements, {
				isActivated: udt.isActivated,
			});
		},

		commentIfDeactivated(statement, data, isPartOfLine) {
			return statement;
		},

		/**
		 * @param tableName {string}
		 * @param oldColumnName {string}
		 * @param newColumnName {string}
		 * @return string
		 * */
		renameColumn(tableName, oldColumnName, newColumnName) {
			return assignTemplates(templates.renameColumn, {
				tableName,
				oldColumnName,
				newColumnName,
			});
		},

		/**
		 * @param {{ schemaName: string, sequence: Sequence }}
		 * @returns {string}
		 */
		createSchemaSequence({ schemaName, sequence }) {
			const usingTryCatchWrapper = shouldUseTryCatchIfNotExistsWrapper(options?.dbVersion);

			return createSequenceScript({ schemaName, sequence, usingTryCatchWrapper });
		},

		/**
		 * @param {{ schemaName: string, sequence: Sequence }}
		 * @returns {string}
		 */
		dropSchemaSequence({ schemaName, sequence }) {
			const usingTryCatchWrapper = shouldUseTryCatchIfNotExistsWrapper(options?.dbVersion);

			return dropSequenceScript({ schemaName, sequence, usingTryCatchWrapper });
		},

		/**
		 * @param {{ schemaName: string, sequence: Sequence, oldSequence: Sequence }}
		 * @returns {string}
		 */
		alterSchemaSequence({ schemaName, sequence, oldSequence }) {
			const usingTryCatchWrapper = shouldUseTryCatchIfNotExistsWrapper(options?.dbVersion);

			return alterSequenceScript({ schemaName, sequence, oldSequence, usingTryCatchWrapper });
		},
	};
};
