module.exports = {
    character: {
        type: 'char',
    },
    'character varying': {
        type: 'varchar',
    },
    'char varying': {
        type: 'varchar',
    },
    'national char': {
        type: 'nchar',
    },
    'national character': {
        type: 'nchar',
    },
    'national char varying': {
        type: 'nvarchar2',
    },
    'national character varying': {
        type: 'nvarchar2',
    },
    'nchar varying': {
        type: 'nvarchar2',
    },
    tinyint: {
        type: 'number',
        precision: 5,
    },
    'small int': {
        type: 'number',
        precision: 5,
    },
    shortinteger: {
        type: 'number',
        precision: 5,
    },
    shortint: {
        type: 'number',
        precision: 5,
    },
    smallint: {
        type: 'number',
        precision: 5,
    },
    int: {
        type: 'number',
        precision: 10,
    },
    integer: {
        type: 'number',
        precision: 10,
    },
    shortdecimal: {
        type: 'number',
        precision: 5,
        scale: 0,
    },
    decimal: {
        type: 'number',
        precision: 5,
        scale: 0,
    },
    longinteger: {
        type: 'number',
        precision: 20,
    },
    bigint: {
        type: 'number',
        precision: 20,
    },
    int8: {
        type: 'number',
        precision: 20,
    },
    bit: {
        type: 'number',
        precision: 1,
    },
    real: {
        type: 'float',
        length: 23,
    },
    'double precision': {
        type: 'number',
    },
    'small money': {
        type: 'float',
        precision: 16,
        scale: 2,
    },
    money: {
        type: 'float',
        precision: 16,
        scale: 2,
    },
    'long varchar': {
        type: 'long',
    },
    text: {
        type: 'long',
    },
    ntext: {
        type: 'long',
    },
    uniqueidentifier: {
        type: 'char',
        length: 36,
    },
    uuid: {
        type: 'char',
        length: 36,
    },
    datetime: {
        type: 'date',
    },
    'small datetime': {
        type: 'date',
    },
    image: {
        type: 'long raw',
    },
    binary: {
        type: 'raw',
    },
    varbinary: {
        type: 'raw',
    },
    string: {
        type: 'nvarchar2'
    }
};
