const _ = require('lodash');

module.exports = clean => {
	const mapProperties = (jsonSchema, iteratee) => {
		return Object.entries(jsonSchema.properties).map(iteratee);
	};

	const isUniqueKey = column => {
		if (column.compositeUniqueKey) {
			return false;
		} else if (!column.unique) {
			return false;
		} else {
			return true;
		}
	};

	const isInlineUnique = column => {
		return isUniqueKey(column) && !column.uniqueKeyOptions?.constraintName;
	};

	const isPrimaryKey = column => {
		if (column.compositeUniqueKey) {
			return false;
		} else if (column.compositePrimaryKey) {
			return false;
		} else if (!column.primaryKey) {
			return false;
		} else {
			return true;
		}
	};

	const isInlinePrimaryKey = column => {
		return isPrimaryKey(column) && !column.primaryKeyOptions?.constraintName;
	};

	const hydrateUniqueOptions = (options, columnName, isActivated) =>
		clean({
			keyType: 'UNIQUE',
			name: options.constraintName,
			columns: [
				{
					name: columnName,
					isActivated: isActivated,
				},
			],
			...options,
		});

	const hydratePrimaryKeyOptions = (options, columnName, isActivated) =>
		clean({
			keyType: 'PRIMARY KEY',
			name: options.constraintName,
			columns: [
				{
					name: columnName,
					isActivated: isActivated,
				},
			],
			...options,
		});

	const findName = (keyId, properties) => {
		return Object.keys(properties).find(name => properties[name].GUID === keyId);
	};

	const checkIfActivated = (keyId, properties) => {
		return _.get(
			Object.values(properties).find(prop => prop.GUID === keyId),
			'isActivated',
			true,
		);
	};

	const getKeys = (keys, jsonSchema) => {
		return _.map(keys, key => {
			return {
				name: findName(key.keyId, jsonSchema.properties),
				isActivated: checkIfActivated(key.keyId, jsonSchema.properties),
			};
		});
	};

	const getCompositePrimaryKeys = jsonSchema => {
		if (!Array.isArray(jsonSchema.primaryKey)) {
			return [];
		}

		return jsonSchema.primaryKey
			.filter(primaryKey => !_.isEmpty(primaryKey.compositePrimaryKey))
			.map(primaryKey => ({
				...hydratePrimaryKeyOptions(primaryKey, null, null),
				columns: getKeys(primaryKey.compositePrimaryKey, jsonSchema),
			}));
	};

	const getCompositeUniqueKeys = jsonSchema => {
		if (!Array.isArray(jsonSchema.uniqueKey)) {
			return [];
		}

		return jsonSchema.uniqueKey
			.filter(uniqueKey => !_.isEmpty(uniqueKey.compositeUniqueKey))
			.map(uniqueKey => ({
				...hydrateUniqueOptions(uniqueKey, null, null),
				columns: getKeys(uniqueKey.compositeUniqueKey, jsonSchema),
			}));
	};

	const getTableKeyConstraints = jsonSchema => {
		if (!jsonSchema.properties) {
			return [];
		}

		const uniqueConstraints = mapProperties(jsonSchema, ([name, columnSchema]) => {
			if (!isUniqueKey(columnSchema) || isInlineUnique(columnSchema)) {
				return;
			} else {
				return hydrateUniqueOptions(columnSchema.uniqueKeyOptions, name, columnSchema.isActivated);
			}
		}).filter(Boolean);

		const primaryKeyConstraints = mapProperties(jsonSchema, ([name, columnSchema]) => {
			if (!isPrimaryKey(columnSchema) || isInlinePrimaryKey(columnSchema)) {
				return;
			} else {
				return hydratePrimaryKeyOptions(columnSchema.primaryKeyOptions, name, columnSchema.isActivated);
			}
		}).filter(Boolean);

		return [
			...primaryKeyConstraints,
			...getCompositePrimaryKeys(jsonSchema),
			...uniqueConstraints,
			...getCompositeUniqueKeys(jsonSchema),
		];
	};

	/**
	 * @param {{ jsonSchema: JsonSchema }}
	 * @returns {ConstraintDto[]}
	 */
	const getCompositeKeyConstraints = ({ jsonSchema }) => {
		const compositePrimaryKeys = getCompositePrimaryKeys(jsonSchema);
		const compositeUniqueKeys = getCompositeUniqueKeys(jsonSchema);

		return [...compositePrimaryKeys, ...compositeUniqueKeys];
	};

	/**
	 * @param {{ columnDefinition: ColumnDefinition }}
	 * @returns {ConstraintDto | undefined}
	 */
	const getPrimaryKeyConstraint = ({ columnDefinition }) => {
		if (!isPrimaryKey(columnDefinition)) {
			return;
		}

		return hydratePrimaryKeyOptions(
			_.get(columnDefinition, 'primaryKeyOptions.[0]', {}),
			'',
			columnDefinition.isActivated,
		);
	};

	/**
	 * @param {{ columnDefinition: ColumnDefinition }}
	 * @returns {ConstraintDto | undefined}
	 */
	const getUniqueKeyConstraint = ({ columnDefinition }) => {
		if (!isUniqueKey(columnDefinition)) {
			return;
		}

		return hydrateUniqueOptions(
			_.get(columnDefinition, 'uniqueKeyOptions.[0]', {}),
			'',
			columnDefinition.isActivated,
		);
	};

	/**
	 * @param {{ columnDefinition: ColumnDefinition; jsonSchema: JsonSchema }}
	 * @returns {ConstraintDto[]}
	 */
	const getColumnConstraints = ({ columnDefinition, jsonSchema }) => {
		const primaryKeyConstraint = getPrimaryKeyConstraint({ columnDefinition, jsonSchema });
		const uniqueKeyConstraint = getUniqueKeyConstraint({ columnDefinition, jsonSchema });

		return [primaryKeyConstraint, uniqueKeyConstraint].filter(Boolean);
	};

	return {
		getTableKeyConstraints,
		isInlineUnique,
		isInlinePrimaryKey,
		getKeys,
		getCompositeKeyConstraints,
		getColumnConstraints,
	};
};
