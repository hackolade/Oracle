module.exports = {
	createSchema: 'CREATE USER${ifNotExists} ${schemaName}${annotations} NO AUTHENTICATION',

	comment: '\nCOMMENT ON ${object} ${objectName} IS ${comment};\n',

	createTable: 'CREATE${tableType} TABLE${ifNotExists} ${name}${tableProps}${options}',

	createTableProps:
		'${columnDefinitions}${keyConstraints}${checkConstraints}${foreignKeyConstraints}${notNullConstraints}',

	columnDefinition: '${name}${type}${default}${encrypt}${constraints}${annotations}',

	createKeyConstraint: '${constraintName}${keyType}${columns}${options}',

	createForeignKeyConstraint:
		'${name} FOREIGN KEY (${foreignKey}) REFERENCES ${primaryTable} (${primaryKey})${onDelete}',

	checkConstraint: '${name}CHECK (${expression})',

	createForeignKey:
		'ALTER TABLE ${foreignTable} ADD CONSTRAINT ${name} FOREIGN KEY (${foreignKey}) REFERENCES ${primaryTable} (${primaryKey})${onDelete};',

	createIndex: 'CREATE${indexType} INDEX${ifNotExists}${name} ON ${tableName}${keys}${options}${annotations};\n',

	dropIndex: 'DROP INDEX ${name};',

	alterIndexRename: 'ALTER INDEX ${oldName} RENAME TO ${newName};',

	alterIndexRebuild: 'ALTER INDEX ${name} REBUILD ${options};',

	createView:
		'CREATE${orReplace}${force}${viewType}${materialized} VIEW${ifNotExists} ${name} ${sharing}${viewProperties}${annotations}\n\tAS ${selectStatement}',

	viewSelectStatement: 'SELECT ${keys}\n\tFROM ${tableName}',

	createObjectType: 'CREATE OR REPLACE TYPE ${name} AS OBJECT \n(\n\t${properties}\n);\n',

	objectTypeColumnDefinition: '${name} ${type}',

	createCollectionType:
		'CREATE OR REPLACE TYPE ${name} IS ${collectionType}${size} OF (${datatype})${notPersistable};\n',

	ifNotExists:
		"DECLARE\nBEGIN\n\tEXECUTE IMMEDIATE '${statement}';\n\tEXCEPTION WHEN OTHERS THEN\n\t\tIF SQLCODE = -${errorCode} THEN NULL; ELSE RAISE; END IF;\nEND;\n/\n",

	createSynonym: 'CREATE${orReplace}${editionable}${public} SYNONYM ${name}\n\tFOR ${objectName};\n',

	renameColumn: 'ALTER TABLE ${tableName} RENAME COLUMN ${oldColumnName} TO ${newColumnName};',

	createSequence: 'CREATE SEQUENCE${ifNotExists} ${name}${sharing}' + '${options}',

	dropSequence: 'DROP SEQUENCE${ifExists} ${name};\n',

	// works for tables, views, sequences, synonyms, and private user-owned objects
	// Note: can't have full path, prefixed with schema name. Only works on objects in your current schema.
	renameEntity: 'RENAME ${name} TO ${newName};\n',

	renameTable: 'ALTER TABLE ${tableName} RENAME TO ${newName};\n',

	alterSequence: 'ALTER SEQUENCE${ifExists} ${name}' + '${options};\n',

	dualityView: {
		createJsonRelationalDualityViewHeading:
			'CREATE${orReplaceStatement}${forceStatement}${editionableStatement} JSON RELATIONAL DUALITY VIEW ${viewName}${annotations} AS',

		sql: {
			tableTagsStatement:
				'WITH${checkStatement}${etagStatement}${insertStatement}${updateStatement}${deleteStatement}',

			columnTagsStatement: 'WITH${checkStatement}${etagStatement}${updateStatement}',

			fromTableStatement: 'FROM ${tableName}${tableAlias}${tableTagsStatement}${whereClauseStatement}',
		},
	},

	alterSession: 'ALTER SESSION SET CURRENT_SCHEMA=${schemaName};\n',

	alterColumn: 'ALTER TABLE ${tableName} MODIFY (${columnName}${dataType});',

	addCheckConstraint: 'ALTER TABLE ${tableName} ADD CONSTRAINT ${constraintName} CHECK (${expression});',

	dropConstraint: 'ALTER TABLE ${tableName} DROP CONSTRAINT ${constraintName};',

	addPkConstraint: 'ALTER TABLE ${tableName} ADD ${constraintStatement};',

	notNullConstraint: 'CONSTRAINT ${constraintName} CHECK (${columnName} IS NOT NULL)',

	alterNotNullConstraint: 'ALTER TABLE ${tableName} MODIFY ${columnName} NOT NULL;',

	alterNamedNotNullConstraint: 'ALTER TABLE ${tableName} MODIFY ${columnName} CONSTRAINT ${constraintName} NOT NULL;',

	alterNullableConstraint: 'ALTER TABLE ${tableName} MODIFY ${columnName} NULL;',

	updateColumnDefaultValue: 'ALTER TABLE ${tableName} MODIFY ${columnName}${defaultValue};',

	dropPrimaryKey: 'ALTER TABLE ${tableName} DROP PRIMARY KEY;',

	dropUniqueKey:
		"SELECT 'ALTER TABLE ${fullTableName} DROP CONSTRAINT ' || uc.constraint_name || ';' AS sql_stmt\nFROM user_constraints uc\nJOIN user_cons_columns ucc ON uc.constraint_name = ucc.constraint_name\nWHERE uc.table_name = '${tableName}' AND uc.constraint_type = 'U' AND ucc.column_name = '${tableColumn}';",
};
