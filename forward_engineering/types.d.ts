export type ColumnDefinition = {
	name: string;
	type: string;
	isActivated: boolean;
	length?: number;
	precision?: number;
	primaryKey?: boolean;
	scale?: number;
	timePrecision?: number;
	unique?: boolean;
	primaryKeyOptions?: Array<{ GUID: string; constraintName: string }>;
	uniqueKeyOptions?: Array<{ GUID: string; constraintName: string }>;
};

export type ConstraintDtoColumn = {
	name: string;
	isActivated: boolean;
};

export type KeyType = 'PRIMARY KEY' | 'UNIQUE';

export type ConstraintDto = {
	keyType: KeyType;
	name: string;
	columns: ConstraintDtoColumn[];
};

export type JsonSchema = Record<string, unknown>;

export type Annotation = {
	annotationName?: string;
	annotationValue?: string;
};

export type IndexKeyDto = {
	name?: string | null;
	type?: string;
	keyId?: string;
};

export type IndexDto = {
	id?: string;
	indxName?: string;
	isActivated?: boolean;
	ifNotExist?: boolean;
	indxSchema?: string; // cross schema name specified manually by user
	indxType?: string;
	schemaName?: string;
	indxKey: IndexKeyDto[];
	column_expression?: string;
	indxDescription?: string;
	comments?: string;
	tablespace?: string;
	index_properties?: string;
	index_attributes?: string;
	index_compression?: string;
	logging_clause?: string;
	indexAnnotations?: Annotation[];
	indxPartitionScope?: string;
	indxPartitionClause?: string;
	indxComments?: string;
};
