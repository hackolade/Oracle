module.exports = ({
    _,
    wrap,
    assignTemplates,
    templates,
    commentIfDeactivated,
    wrapComment,
    wrapInQuotes
}) => {

    const getColumnComments = (tableName, columnDefinitions) => {
        return _.chain(columnDefinitions)
            .filter('comment')
            .map(columnData => {
                const comment = assignTemplates(templates.comment, {
                    object: 'COLUMN',
                    objectName: `${tableName}.${wrapInQuotes(columnData.name)}`,
                    comment: wrapComment(columnData.comment),
                });

                return commentIfDeactivated(comment, columnData);
            })
            .join('\n')
            .value();
    };

    const getColumnConstraints = ({nullable, unique, primaryKey, primaryKeyOptions, uniqueKeyOptions}) => {
        const getOptionsString = ({
            constraintName,
            deferClause,
			rely,
			validate,
			indexClause,
			exceptionClause,
        }) => ({
            constraintString: `${constraintName ? ` CONSTRAINT ${wrapInQuotes(_.trim(constraintName))}` : ''}`, 
            statement: `${deferClause ? ` ${deferClause}` : ''}${rely ? ` ${rely}` : ''}${indexClause ? ` ${indexClause}` : ''}${validate ? ` ${validate}` : ''}${exceptionClause ? ` ${exceptionClause}` : ''}`
        });
        const {constraintString, statement} = getOptionsString(getOptions({ primaryKey, unique, primaryKeyOptions, uniqueKeyOptions })); 
        const primaryKeyString = primaryKey ? ` PRIMARY KEY` : '';
        const uniqueKeyString = unique ? ` UNIQUE` : '';
        const nullableString = nullable ? '' : ' NOT NULL';
        return `${nullableString}${constraintString}${primaryKeyString}${uniqueKeyString}${statement}`;
    };

    const getOptions = ({ primaryKey, unique, primaryKeyOptions, uniqueKeyOptions }) => {
        if (primaryKey) {
            return primaryKeyOptions || {};
        } else if (unique) {
            return uniqueKeyOptions || {};
        } else {
            return {};
        }
    }

    const replaceTypeByVersion = (type, version) => {
        if (type === 'JSON' && version !== '21c') {
            return 'CLOB';
        }
        return type;
    };

    const getColumnDefault = ({default: defaultValue, identity}) => {
        if (!_.isEmpty(identity) && identity.generated) {
            const getGenerated = ({generated, generatedOnNull}) => {
                if (generated === 'BY DEFAULT') {
                    return ` ${generated} ${generatedOnNull ? ' ON NULL' : ''}`;
                } else {
                    return ` ALWAYS`;
                }
            };

            const getOptions = ({identityStart, identityIncrement, numberToCache}) => {
                const startWith = identityStart ? ` START WITH ${identityStart}` : '';
                const incrementBy = identityIncrement ? ` INCREMENT BY ${identityIncrement}` : '';
                const cache = numberToCache ? ` CACHE ${numberToCache}` : ' NOCACHE';
                return `${startWith}${incrementBy}${cache}`;
            };

            return ` GENERATED${getGenerated(identity)} AS IDENTITY (${_.trim(getOptions(identity))})`;
        } else if (defaultValue) {
            return ` DEFAULT ${defaultValue}`;
        }
        return '';
    };

    const getColumnEncrypt = ({encryption}) => {
        if (_.isPlainObject(encryption) && !_.isEmpty(_.omit(encryption, 'id'))) {
            const {
                ENCRYPTION_ALGORITHM,
                INTEGRITY_ALGORITHM,
                noSalt,
            } = encryption;
            return ` ENCRYPT${ENCRYPTION_ALGORITHM ? ` USING '${ENCRYPTION_ALGORITHM}'` : ''}${INTEGRITY_ALGORITHM ? ` '${INTEGRITY_ALGORITHM}'` : ''}${noSalt ? ' NO SALT' : ''}`;
        }
        return '';
    };

    const addByteLength = (type, length, lengthSemantics) => {
        return ` ${type}(${length} ${_.toUpper(lengthSemantics)})`;
    }

    const addLength = (type, length) => {
        return ` ${type}(${length})`;
    };

    const addScalePrecision = (type, precision, scale) => {
        if (_.isNumber(scale)) {
            return ` ${type}(${precision ? precision : '*'},${scale})`;
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
        return ` TIMESTAMP${_.isNumber(fractSecPrecision) ? `(${fractSecPrecision})` : ''}${withTimeZone ? ` WITH${localTimeZone ? ' LOCAL' : ''} TIME ZONE` : ''}`;;
    };

    const intervalYear = (yearPrecision) => {
        return ` INTERVAL YEAR${_.isNumber(yearPrecision) ? `(${yearPrecision})` : ''} TO MONTH`;
    };

    const intervalDay = (dayPrecision, fractSecPrecision) => {
        return ` INTERVAL DAY${_.isNumber(dayPrecision) ? `(${dayPrecision})` : ''} TO SECOND${_.isNumber(fractSecPrecision) ? `(${fractSecPrecision})` : ''}`;
    };

    const canHaveByte = type => ['CHAR', 'VARCHAR2'].includes(type);
    const canHaveLength = type => ['CHAR', 'VARCHAR2', 'NCHAR', 'NVARCHAR2', 'RAW', 'UROWID'].includes(type);
    const canHavePrecision = type => ['NUMBER', 'FLOAT'].includes(type);
    const canHaveScale = type => type === 'NUMBER';
    const isIntervalYear = type => type === 'INTERVAL YEAR';
    const isIntervalDay = type => type === 'INTERVAL DAY';
    const isTimezone = type => type === 'TIMESTAMP';

    const decorateType = (type, columnDefinition) => {
        switch(true) {
            case (columnDefinition.lengthSemantics && canHaveByte(type) && canHaveLength(type) && _.isNumber(columnDefinition.length)):
                return addByteLength(type, columnDefinition.length, columnDefinition.lengthSemantics);
            case (canHaveLength(type) && _.isNumber(columnDefinition.length)):
                return addLength(type, columnDefinition.length);
            case (canHavePrecision(type) && canHaveScale(type)):
                return addScalePrecision(type, columnDefinition.precision, columnDefinition.scale);
            case (canHavePrecision(type) && _.isNumber(columnDefinition.precision)):
                return addPrecision(type, columnDefinition.precision);
            case (isTimezone(type)):
                return timestamp(columnDefinition.fractSecPrecision ,columnDefinition.withTimeZone, columnDefinition.localTimeZone);
            case (isIntervalYear(type)):
                return intervalYear(columnDefinition.yearPrecision);
            case (isIntervalDay(type)):
                return intervalDay(columnDefinition.dayPrecision, columnDefinition.fractSecPrecision);
            default:
                return ` ${type}`;
        }
    }; 

    return {
        getColumnComments,
        getColumnConstraints,
        replaceTypeByVersion,
        getColumnDefault,
        getColumnEncrypt,
        decorateType,
    };
};
