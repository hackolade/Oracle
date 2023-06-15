module.exports = {
	createSchema: 'CREATE USER ${schemaName} NO AUTHENTICATION',

	comment: '\nCOMMENT ON ${object} ${objectName} IS ${comment};\n',

	createTable:
		'CREATE${tableType} TABLE ${name}\
        ${tableProps}\
        \n${options}',

	createTableProps: '${columnDefinitions}${keyConstraints}${checkConstraints}${foreignKeyConstraints}',

	columnDefinition: '${name}${type}${default}${encrypt}${constraints}',

	createKeyConstraint: '${constraintName}${keyType}${columns}${options}',

	createForeignKeyConstraint:
		'${name} FOREIGN KEY (${foreignKey}) REFERENCES ${primaryTable} (${primaryKey})${onDelete}',

	checkConstraint: '${name}CHECK (${expression})',

	createForeignKey:
		'ALTER TABLE ${foreignTable} ADD CONSTRAINT ${name} FOREIGN KEY (${foreignKey}) REFERENCES ${primaryTable} (${primaryKey})${onDelete};',

	createIndex: 'CREATE${indexType} INDEX ${name} ON ${tableName}${keys}${options};\n',

	createView:
		'CREATE${orReplace}${force}${viewType}${materialized} VIEW ${name} ${sharing}${viewProperties}\n\tAS ${selectStatement}',

	viewSelectStatement: 'SELECT ${keys}\n\tFROM ${tableName}',

	createObjectType: 'CREATE OR REPLACE TYPE ${name} AS OBJECT \n(\n\t${properties}\n);\n',

	objectTypeColumnDefinition: '${name} ${type}',

	createCollectionType:
		'CREATE OR REPLACE TYPE ${name} IS ${collectionType}${size} OF (${datatype})${notPersistable};\n',

	ifNotExists:
		"DECLARE\nBEGIN\n\tEXECUTE IMMEDIATE '${statement}';\n\tEXCEPTION WHEN OTHERS THEN\n\t\tIF SQLCODE = -${errorCode} THEN NULL; ELSE RAISE; END IF;\nEND;\n/\n",

	createSynonym: 'CREATE${orReplace}${editionable}${public} SYNONYM ${name}\n\tFOR ${objectName};\n',
};
