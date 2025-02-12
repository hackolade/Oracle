const _ = require('lodash');
const { DbVersion } = require('../../enums/DbVersion');
const { getColumnDefault } = require('../ddlHelpers/columnDefinitionHelpers/getColumnDefault');

/**
 * @param dbVersion {string} DB version in "21&i" format
 * @return {boolean}
 * */
const shouldUseClobForJsonColumns = dbVersion => {
	const dbVersionAsNumber = Number.parseInt(dbVersion, 10);
	return dbVersionAsNumber < DbVersion.JSON_TYPE_SINCE;
};

module.exports = ({ assignTemplates, templates, commentIfDeactivated, wrapComment, prepareName }) => {
	const { getOptionsString } = require('./constraintHelper')({ prepareName });

	const getColumnComments = (tableName, columnDefinitions) => {
		return _.chain(columnDefinitions)
			.filter('comment')
			.map(columnData => {
				const comment = assignTemplates(templates.comment, {
					object: 'COLUMN',
					objectName: `${tableName}.${prepareName(columnData.name)}`,
					comment: wrapComment(columnData.comment),
				});

				return commentIfDeactivated(comment, columnData);
			})
			.join('\n')
			.value();
	};

	const getColumnConstraints = ({ nullable, unique, primaryKey, primaryKeyOptions, uniqueKeyOptions }) => {
		const { constraintString, statement } = getOptionsString(
			getOptions({ primaryKey, unique, primaryKeyOptions, uniqueKeyOptions }),
		);
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
	};

	const replaceTypeByVersion = (type, version) => {
		if (type === 'JSON' && shouldUseClobForJsonColumns(version)) {
			return 'CLOB';
		}
		return type;
	};

	const getColumnEncrypt = ({ encryption }) => {
		if (_.isPlainObject(encryption) && !_.isEmpty(_.omit(encryption, 'id'))) {
			const { ENCRYPTION_ALGORITHM, INTEGRITY_ALGORITHM, noSalt } = encryption;
			const encryptionAlgorithm = ENCRYPTION_ALGORITHM ? ` USING '${ENCRYPTION_ALGORITHM}'` : '';
			const integrityAlgorithm = INTEGRITY_ALGORITHM ? ` '${INTEGRITY_ALGORITHM}'` : '';
			const salt = noSalt ? ' NO SALT' : '';

			return ` ENCRYPT${encryptionAlgorithm}${integrityAlgorithm}${salt}`;
		}
		return '';
	};

	return {
		getColumnComments,
		getColumnConstraints,
		replaceTypeByVersion,
		getColumnDefault,
		getColumnEncrypt,
	};
};
