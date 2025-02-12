const _ = require('lodash');

const addByteLength = (type, length, lengthSemantics) => {
	return ` ${type}(${length} ${_.toUpper(lengthSemantics)})`;
};

const addLength = (type, length) => {
	return ` ${type}(${length})`;
};

const addScalePrecision = (type, precision, scale) => {
	if (_.isNumber(scale)) {
		return ` ${type}(${precision || '*'},${scale})`;
	} else if (_.isNumber(precision)) {
		return ` ${type}(${precision})`;
	} else {
		return ` ${type}`;
	}
};

const addPrecision = (type, precision) => {
	if (_.isNumber(precision)) {
		return ` ${type}(${precision})`;
	}
	return ` ${type}`;
};

const timestamp = (fractSecPrecision, withTimeZone, localTimeZone) => {
	const fractSecPrecisionPart = _.isNumber(fractSecPrecision) ? `(${fractSecPrecision})` : '';
	const localPart = localTimeZone ? ' LOCAL' : '';
	const timeZonePart = withTimeZone ? ` WITH${localPart} TIME ZONE` : '';

	return ` TIMESTAMP${fractSecPrecisionPart}${timeZonePart}`;
};

const intervalYear = yearPrecision => {
	const yearPrecisionPart = _.isNumber(yearPrecision) ? `(${yearPrecision})` : '';
	return ` INTERVAL YEAR${yearPrecisionPart} TO MONTH`;
};

const intervalDay = (dayPrecision, fractSecPrecision) => {
	const dayPrecisionPart = _.isNumber(dayPrecision) ? `(${dayPrecision})` : '';
	const fractSecPrecisionPart = _.isNumber(fractSecPrecision) ? `(${fractSecPrecision})` : '';

	return ` INTERVAL DAY${dayPrecisionPart} TO SECOND${fractSecPrecisionPart}`;
};

const decorateVector = (type, dimensionNumber, subtype) => {
	const dimensionFormat = {
		'vector<int8>': 'int8',
		'vector<float32>': 'float32',
		'vector<float64>': 'float64',
	}[subtype];
	const dimension = dimensionNumber || '*';
	const format = _.toUpper(dimensionFormat || '*');
	return ` ${type}(${dimension}, ${format})`;
};

const decorateJson = (type, subtype) => {
	if (!['object', 'array'].includes(subtype)) {
		return ' ' + type;
	}

	return ' ' + type + '(' + _.toUpper(subtype) + ')';
};

const canHaveByte = type => ['CHAR', 'VARCHAR2'].includes(type);
const canHaveLength = type => ['CHAR', 'VARCHAR2', 'NCHAR', 'NVARCHAR2', 'RAW', 'UROWID'].includes(type);
const canHavePrecision = type => ['NUMBER', 'FLOAT'].includes(type);
const canHaveScale = type => type === 'NUMBER';
const isIntervalYear = type => type === 'INTERVAL YEAR';
const isIntervalDay = type => type === 'INTERVAL DAY';
const isTimezone = type => type === 'TIMESTAMP';
const canDecorateVector = (type, dimension, subtype) => type === 'VECTOR' && (dimension || subtype);
const isJson = type => type === 'JSON';

const decorateType = (type, columnDefinition) => {
	const {
		lengthSemantics,
		length,
		precision,
		scale,
		fractSecPrecision,
		withTimeZone,
		localTimeZone,
		yearPrecision,
		dayPrecision,
		isUDTRef,
		schemaName,
		dimension,
		subtype,
	} = columnDefinition;

	if (lengthSemantics && canHaveByte(type) && canHaveLength(type) && _.isNumber(length)) {
		return addByteLength(type, length, lengthSemantics);
	}
	if (canHaveLength(type) && _.isNumber(length)) {
		return addLength(type, length);
	}
	if (canHavePrecision(type) && canHaveScale(type)) {
		return addScalePrecision(type, precision, scale);
	}
	if (canHavePrecision(type) && _.isNumber(precision)) {
		return addPrecision(type, precision);
	}
	if (isTimezone(type)) {
		return timestamp(fractSecPrecision, withTimeZone, localTimeZone);
	}
	if (isIntervalYear(type)) {
		return intervalYear(yearPrecision);
	}
	if (isIntervalDay(type)) {
		return intervalDay(dayPrecision, fractSecPrecision);
	}
	if (isUDTRef && schemaName) {
		return ` "${schemaName}"."${type}"`;
	}
	if (canDecorateVector(type, dimension, subtype)) {
		return decorateVector(type, dimension, subtype);
	}

	if (isJson(type)) {
		return decorateJson(type, subtype);
	}

	return ` ${type}`;
};

module.exports = {
	decorateType,
};
