const oracleDB = require('oracledb');
const extractWallet = require('./extractWallet');
const path = require('path');
const fs = require('fs');
const parseTns = require('./parseTns');
const { getSchemaSequences } = require('./getSchemaSequences');
const _ = require('lodash');

const noConnectionError = { message: 'Connection error' };

let connection;
let useSshTunnel;

const parseProxyOptions = (proxyString = '') => {
	const result = proxyString.match(/http:\/\/(?:.*?:.*?@)?(.*?):(\d+)/i);

	if (!result) {
		return {};
	}

	return {
		httpsProxy: result[1],
		httpsProxyPort: result[2],
	};
};

const getTnsNamesOraFile = configDir => {
	const tnsNamesOraFile = [
		configDir,
		process.env.TNS_ADMIN,
		path.join(process.env.ORACLE_HOME || '', 'network', 'admin'),
		path.join(process.env.LD_LIBRARY_PATH || '', 'network', 'admin'),
	].reduce((filePath, configFolder) => {
		if (filePath) {
			return filePath;
		}

		let file = path.join(configFolder, 'tnsnames.ora');

		if (fs.existsSync(file)) {
			return file;
		} else {
			return filePath;
		}
	}, '');

	return tnsNamesOraFile;
};

const parseTnsNamesOra = filePath => {
	const content = fs.readFileSync(filePath).toString();
	const result = parseTns(content);
	return result;
};

const getConnectionStringByTnsNames = (configDir, serviceName, proxy, logger) => {
	const filePath = getTnsNamesOraFile(configDir);

	if (!fs.existsSync(filePath)) {
		return serviceName;
	}

	logger({ message: 'Found tnsnames.ora file: ' + filePath });

	const tnsData = parseTnsNamesOra(filePath);

	logger({ message: 'tnsnames.ora successfully parsed' });
	const tnsServicesNames = Object.keys(tnsData);

	if (!tnsData[serviceName] && tnsServicesNames.length === 0) {
		logger({ message: `Cannot find '${serviceName}' in tnsnames.ora and no fallback found` });
		return serviceName;
	}

	const [firstTnsServiceName] = tnsServicesNames;
	const tnsService = tnsData[serviceName] || tnsData[firstTnsServiceName];
	if (!tnsData[serviceName]) {
		logger({
			message: `Connect using first TNS service ${firstTnsServiceName}' from ${path.join(configDir, 'tnsnames.ora')}.`,
		});
	}

	const address = tnsService?.data?.description?.address;
	const service = tnsService?.data?.description?.connect_data?.service_name;
	const sid = tnsService?.data?.description?.connect_data?.sid;

	logger({ message: 'tnsnames.ora', address, service });

	return getConnectionDescription(
		_.omitBy(
			{
				...address,
				...proxy,
				protocol: address?.protocol || 'tcps',
				service: service || serviceName,
				sid: sid,
			},
			_.isUndefined,
		),
		logger,
	);
};

const combine = (val, str) => (val ? str : '');

const getConnectionDescription = ({ protocol, host, port, sid, service, httpsProxy, httpsProxyPort }, logger) => {
	const connectionString = `(DESCRIPTION=
		(ADDRESS=
			(PROTOCOL=${protocol || 'tcp'})
			(HOST=${host})
			(PORT=${port}))
			${combine(httpsProxy, `(HTTPS_PROXY=${httpsProxy})`)}
			${combine(httpsProxyPort, `(HTTPS_PROXY_PORT=${httpsProxyPort})`)}
		(CONNECT_DATA=
					${combine(sid, `(SID=${sid})`)}
					${combine(service, `(SERVICE_NAME=${service})`)}
		)
	)`;
	logger({ message: 'connectionString', connectionString });
	return connectionString;
};

const getSshConnectionString = async (data, sshService, logger) => {
	let connectionData = {
		protocol: '',
		host: '',
		port: '',
		service: '',
	};

	if (['Wallet', 'TNS'].includes(data.connectionMethod)) {
		const filePath = getTnsNamesOraFile(data.configDir);

		if (!fs.existsSync(filePath)) {
			throw new Error(
				'Cannot find tnsnames.ora file. Please, specify tnsnames folder or use Base connection method.',
			);
		}

		logger({ message: 'Found tnsnames.ora file: ' + filePath });

		const tnsData = parseTnsNamesOra(filePath);

		if (!tnsData[data.serviceName]) {
			throw new Error('Cannot find "' + data.serviceName + '" in tnsnames.ora');
		}

		const address = tnsData[data.serviceName]?.data?.description?.address;
		const service = tnsData[data.serviceName]?.data?.description?.connect_data?.service_name;
		const sid = tnsData[data.serviceName]?.data?.description?.connect_data?.sid;

		logger({ message: 'tnsnames.ora', address, service });

		connectionData.protocol = address?.protocol;
		connectionData.host = address?.host;
		connectionData.port = address?.port;
		connectionData.service = service || data.serviceName;
		connectionData.sid = sid;
	} else {
		connectionData.host = data.host;
		connectionData.port = data.port;
		connectionData.service = data.serviceName;
		connectionData.sid = data.sid;
	}

	const { options } = await sshService.openTunnel({
		sshAuthMethod: data.sshConfig.ssh_method === 'privateKey' ? 'IDENTITY_FILE' : 'USER_PASSWORD',
		sshTunnelHostname: data.sshConfig.ssh_host,
		sshTunnelPort: data.sshConfig.ssh_port,
		sshTunnelUsername: data.sshConfig.ssh_user,
		sshTunnelPassword: data.sshConfig.ssh_password,
		sshTunnelIdentityFile: data.sshConfig.ssh_key_file,
		sshTunnelPassphrase: data.sshConfig.ssh_key_passphrase,
		host: connectionData.host,
		port: connectionData.port,
	});

	return getConnectionDescription(
		{
			...connectionData,
			host: options.host,
			port: options.port.toString(),
		},
		logger,
	);
};

const connect = async (
	{
		walletFile,
		walletPassword,
		tempFolder,
		name,
		connectionMethod,
		TNSpath,
		host,
		port,
		userName,
		userPassword,
		serviceName,
		clientPath,
		clientType,
		queryRequestTimeout,
		authMethod,
		options,
		sid,
		ssh,
		ssh_user,
		ssh_host,
		ssh_port,
		ssh_method,
		ssh_key_file,
		ssh_key_passphrase,
		ssh_password,
		authRole,
		mode,
	},
	sshService,
	logger,
) => {
	if (connection) {
		return connection;
	}

	const MODES = {
		thin: 'thin',
		thick: 'thick',
	};
	let configDir;
	let libDir;
	let credentials = {};
	let proxy = '';

	if (connectionMethod === 'Wallet') {
		configDir = await extractWallet({ walletFile, tempFolder, name });
		process.env.TNS_ADMIN = configDir;
	}

	if (connectionMethod === 'TNS') {
		configDir = TNSpath;
	}

	if (clientType === 'InstantClient') {
		libDir = clientPath;
	}

	if (options?.proxy) {
		proxy = parseProxyOptions(options?.proxy);
	}

	if (mode !== MODES.thin) {
		oracleDB.initOracleClient({ libDir, configDir });
	}

	let connectString = '';

	if (['Wallet', 'TNS'].includes(connectionMethod)) {
		connectString = getConnectionStringByTnsNames(configDir, serviceName, proxy, logger);
	} else {
		connectString = getConnectionDescription(
			{
				host,
				port,
				sid,
				service: serviceName,
			},
			logger,
		);
	}

	if (ssh) {
		useSshTunnel = true;
		connectString = await getSshConnectionString(
			{
				host,
				port,
				configDir,
				serviceName,
				sid,
				connectionMethod,
				sshConfig: {
					ssh_user,
					ssh_host,
					ssh_port,
					ssh_method,
					ssh_key_file,
					ssh_password,
					ssh_key_passphrase,
				},
			},
			sshService,
			logger,
		);
	}

	if (authMethod === 'OS') {
		credentials.externalAuth = true;
	} else if (authMethod === 'Kerberos') {
		credentials.username = userName;
		credentials.password = userPassword;
		credentials.externalAuth = true;
	} else {
		credentials.username = userName;
		credentials.password = userPassword;
	}

	return authByCredentials({
		connectString,
		username: userName,
		password: userPassword,
		queryRequestTimeout,
		authRole,
		walletLocation: configDir,
		walletPassword,
	});
};

const disconnect = async sshService => {
	if (!connection) {
		return Promise.reject(noConnectionError);
	}

	if (useSshTunnel) {
		useSshTunnel = false;
		await sshService.closeConsumer();
	}

	return new Promise((resolve, reject) => {
		connection.close(err => {
			connection = null;
			if (err) {
				return reject(err);
			}
			resolve();
		});
	});
};

const authByCredentials = ({
	connectString,
	username,
	password,
	queryRequestTimeout,
	authRole,
	walletPassword,
	walletLocation,
}) => {
	return new Promise((resolve, reject) => {
		const connectionConfig = {
			username,
			password,
			connectString,
			privilege: authRole === 'default' ? undefined : oracleDB[authRole],
			walletLocation,
			walletPassword,
		};
		oracleDB.getConnection(connectionConfig, (err, conn) => {
			if (err) {
				connection = null;
				return reject(err);
			}
			try {
				conn.callTimeout = Number(queryRequestTimeout || 0);
				connection = conn;
				resolve();
			} catch (err) {
				reject(err);
			}
		});
	});
};

const getSchemaNames = async ({ includeSystemCollection, schemaName }, logger) => {
	const selectStatement = 'SELECT USERNAME FROM ALL_USERS';
	let query;
	let stmt = '';
	if (schemaName) {
		stmt = `USERNAME = '${schemaName}'`;
	}
	if (includeSystemCollection) {
		query = `${selectStatement}${stmt ? ` WHERE ${stmt}` : ''}`;
	} else {
		query = `${selectStatement} WHERE ORACLE_MAINTAINED = 'N'${stmt ? ` AND ${stmt}` : ''}`;
	}
	return await execute(query).catch(e => {
		logger.info({ message: 'Cannot retrieve schema names' });
		logger.error(e);
		return [];
	});
};

const pairToObj = pairs =>
	_.reduce(pairs, (obj, pair) => ({ ...obj, [pair[0]]: [...(obj[pair[0]] || []), pair[1]] }), {});

const selectEntities = (selectStatement, includeSystemCollection, schemaName) => {
	let stmt = '';
	if (schemaName) {
		stmt = `T.OWNER = '${schemaName}'`;
	}
	if (includeSystemCollection) {
		return execute(`${selectStatement}${stmt ? ` WHERE ${stmt}` : ''}`);
	} else {
		return execute(
			`${selectStatement} INNER JOIN ALL_USERS U ON T.OWNER = U.USERNAME WHERE U.ORACLE_MAINTAINED = 'N'${
				stmt ? ` AND ${stmt}` : ''
			}`,
		);
	}
};

const tableNamesByUser = ({ includeSystemCollection, schemaName }) =>
	selectEntities(`SELECT T.OWNER, T.TABLE_NAME FROM ALL_TABLES T`, includeSystemCollection, schemaName);
const externalTableNamesByUser = ({ includeSystemCollection, schemaName }) =>
	selectEntities(`SELECT T.OWNER, T.TABLE_NAME FROM ALL_EXTERNAL_TABLES T`, includeSystemCollection, schemaName);
const viewNamesByUser = ({ includeSystemCollection, schemaName }) =>
	selectEntities(`SELECT T.OWNER, T.VIEW_NAME || \' (v)\' FROM ALL_VIEWS T`, includeSystemCollection, schemaName);
const materializedViewNamesByUser = ({ includeSystemCollection, schemaName }) =>
	selectEntities(`SELECT T.OWNER, T.MVIEW_NAME || \' (v)\' FROM ALL_MVIEWS T`, includeSystemCollection, schemaName);

const getEntitiesNames = async (connectionInfo, logger) => {
	const materializedViews = await materializedViewNamesByUser(connectionInfo).catch(e => {
		logger.info({ message: 'Cannot retrieve materialized views' });
		logger.error(e);

		return [];
	});

	logger.info({ materializedViews });

	const materializedViewsNames = materializedViews.map(nameArray => _.join(nameArray, '.').slice(0, -' (v)'.length));

	const tables = await tableNamesByUser(connectionInfo)
		.then(tables => {
			return _.reject(tables, tableNameArray => materializedViewsNames.includes(_.join(tableNameArray, '.')));
		})
		.catch(e => {
			logger.info({ message: 'Cannot retrieve tables' });
			logger.error(e);
			return [];
		});

	logger.info({ tables });

	const externalTables = await externalTableNamesByUser(connectionInfo).catch(e => {
		logger.info({ message: 'Cannot retrieve external tables' });
		logger.error(e);

		return [];
	});

	logger.info({ externalTables });

	const views = await viewNamesByUser(connectionInfo).catch(e => {
		logger.info({ message: 'Cannot retrieve views' });
		logger.error(e);

		return [];
	});

	logger.info({ views });

	const entities = pairToObj([...tables, ...externalTables, ...views, ...materializedViews]);

	return Object.keys(entities).reduce(
		(arr, user) => [
			...arr,
			{
				dbName: user,
				dbCollections: entities[user],
				isEmpty: !entities[user].length,
			},
		],
		[],
	);
};

const execute = (command, options = {}, binds = []) => {
	if (!connection) {
		return Promise.reject(noConnectionError);
	}
	return new Promise((resolve, reject) => {
		connection.execute(command, binds, options, (err, result) => {
			if (err) {
				return reject(err);
			}
			resolve(result.rows);
		});
	});
};

const getDbVersion = async logger => {
	const versions = ['12c', '18c', '19c', '21c', '23ai'];
	const defaultVersion = '21c';

	try {
		const versionTable = await execute(
			"SELECT VERSION FROM PRODUCT_COMPONENT_VERSION WHERE product LIKE 'Oracle Database%'",
		);

		logger.log('info', versionTable, 'DB Version');

		const majorVersion = versionTable?.[0]?.[0]?.split('.').shift();

		if (!majorVersion) {
			return defaultVersion;
		}

		const currentVersion = versions.find(version => version.startsWith(majorVersion));

		return currentVersion || defaultVersion;
	} catch (e) {
		logger.log('error', { message: e.message, stack: e.stack }, 'Error of getting DB Version');
		return defaultVersion;
	}
};

const isView = name => name.slice(-4) === ' (v)';
const splitEntityNames = names => {
	const namesByCategory = _.partition(names, isView);

	return { views: namesByCategory[0].map(name => name.slice(0, -4)), tables: namesByCategory[1] };
};

const setSQLTerminator = () => {
	return execute(`BEGIN
		DBMS_METADATA.SET_TRANSFORM_PARAM(DBMS_METADATA.SESSION_TRANSFORM,'SQLTERMINATOR', TRUE);
	END;`);
};

const getDDL = async (tableName, schema, logger) => {
	try {
		await setSQLTerminator();
		const queryResult = await execute(`
			SELECT JSON_OBJECT(
			'tableDDL' VALUE DBMS_METADATA.GET_DDL('TABLE', T.TABLE_NAME, T.OWNER),
			'countOfRecords' VALUE (SELECT COUNT(*) FROM ALL_TABLES WHERE TABLE_NAME='${tableName}'),
			'indexDDLs' VALUE (
				SELECT JSON_ARRAYAGG(DBMS_METADATA.GET_DDL('INDEX', INDEX_NAME, OWNER) RETURNING CLOB)
				FROM ALL_INDEXES
				WHERE TABLE_OWNER=T.OWNER
					AND TABLE_NAME=T.TABLE_NAME
					AND INDEX_NAME NOT IN (
						SELECT CONSTRAINT_NAME
						FROM ALL_CONSTRAINTS
						WHERE CONSTRAINT_TYPE='P'
						AND OWNER=T.OWNER
						AND TABLE_NAME=T.TABLE_NAME
					)
				),
			'jsonColumns' VALUE (
				SELECT JSON_ARRAYAGG(JSON_OBJECT('name' VALUE COLUMN_NAME, 'datatype' VALUE DATA_TYPE) RETURNING CLOB)
				FROM ALL_TAB_COLUMNS
				WHERE TABLE_NAME=T.TABLE_NAME
				AND OWNER=T.OWNER
				AND DATA_TYPE IN ('CLOB', 'BLOB', 'NVARCHAR2', 'JSON')
			),
			'tableComment' VALUE (
				SELECT COMMENTS
				FROM ALL_TAB_COMMENTS
				WHERE OWNER = T.OWNER AND TABLE_NAME = T.TABLE_NAME AND COMMENTS IS NOT NULL
			),
			'columnComments' VALUE (
				SELECT JSON_ARRAYAGG(JSON_OBJECT('name' VALUE COLUMN_NAME, 'comment' VALUE COMMENTS) RETURNING CLOB)
				FROM ALL_COL_COMMENTS
				WHERE OWNER = T.OWNER AND TABLE_NAME = T.TABLE_NAME  AND COMMENTS IS NOT NULL
			) RETURNING CLOB
			)
			FROM ALL_TABLES T
			WHERE T.OWNER='${schema}' AND T.TABLE_NAME='${tableName}'
		`);
		const row = await _.first(_.first(queryResult))?.getData();
		try {
			const queryObj = JSON.parse(row);
			logger.log('info', queryObj, `Getting DDL from "${schema}"."${tableName}"`);
			const tableComment = queryObj.tableComment
				? `COMMENT ON TABLE ${escapeName(schema)}.${escapeName(tableName)} IS ${escapeComment(queryObj.tableComment)};`
				: '';
			const columnComments = _.map(
				queryObj.columnComments,
				c =>
					`COMMENT ON COLUMN ${escapeName(schema)}.${escapeName(tableName)}.${escapeName(c.name)}  IS ${escapeComment(
						c.comment,
					)};`,
			);
			const ddl = `${queryObj.tableDDL}
				${_.join(queryObj.indexDDLs, '\n')}
				${tableComment}\n
				${_.join(columnComments, '\n')}`;
			return {
				ddl: ddl,
				jsonColumns: queryObj.jsonColumns,
				countOfRecords: queryObj.countOfRecords,
			};
		} catch (err) {
			logger.log(
				'error',
				{
					message: 'Cannot parse query result: \n\n' + row,
					error: { message: err.message, stack: err.stack, err: _.omit(err, ['message', 'stack']) },
				},
				`Getting DDL from "${schema}"."${tableName}"`,
			);
			return {
				ddl: '',
				jsonColumns: [],
				countOfRecords: 0,
			};
		}
	} catch (err) {
		if (err?.errorNum === 31603 && !(await checkUserHaveRequiredRole(logger))) {
			throw err;
		}

		logger.log(
			'error',
			{
				message: 'Cannot get DDL for table: ' + tableName,
				error: { message: err.message, stack: err.stack, err: _.omit(err, ['message', 'stack']) },
			},
			`Getting DDL from "${schema}"."${tableName}"`,
		);
		return {
			ddl: '',
			jsonColumns: [],
			countOfRecords: 0,
		};
	}
};

const readLobs = record => {
	return Object.keys(record).reduce(async (prev, key) => {
		const result = await prev;
		let value = record[key];

		if (value instanceof oracleDB.Lob) {
			value = await value.getData();
		}

		if (value instanceof Buffer) {
			value = value.toString();
		}

		result[key] = value;

		return result;
	}, Promise.resolve({}));
};

const readRecordsValues = async records => {
	return await records.reduce(async (prev, record) => {
		const result = await prev;

		const updatedRecord = await readLobs(record);

		return result.concat(updatedRecord);
	}, Promise.resolve([]));
};

const escapeName = name => {
	if (/[\s\da-z]/.test(name)) {
		return `"${name}"`;
	}
	return name;
};

const escapeComment = name => {
	return `'${name.replaceAll("'", "''")}'`;
};

const replaceNames = (names, records) => {
	return records.map(record => {
		return names.reduce((result, name) => {
			result[name] = record[name];
			return result;
		}, {});
	});
};

const selectRecords = async ({ tableName, limit, jsonColumns, schema }) => {
	const names = _.map(jsonColumns, c => c.name);
	const records = await execute(
		`SELECT ${names.map(n => escapeName(n)).join(', ')} FROM ${escapeName(schema)}.${escapeName(
			tableName,
		)} FETCH NEXT ${limit} ROWS ONLY`,
		{
			outFormat: oracleDB.OBJECT,
		},
	);
	const result = await readRecordsValues(replaceNames(names, records));
	return result;
};

const getJsonType = (records, columnName) => {
	const jsonPrimitives = {
		number: 'number',
		boolean: 'boolean',
		string: 'string',
	};
	return records.reduce((type, record) => {
		if (type) {
			return type;
		}

		const result = record[columnName];

		if (Array.isArray(result)) {
			return 'array';
		}

		if (typeof result === 'object') {
			return result ? 'object' : 'null';
		}

		return jsonPrimitives[typeof result] ?? type;
	}, '');
};

const getJsonTypeName = type => {
	return `json${type.charAt(0).toUpperCase()}${type.slice(1)}`;
};

const getJsonSchema = async (jsonColumns, records) => {
	const types = {
		CLOB: { type: 'lobs', mode: 'clob' },
		BLOB: { type: 'lobs', mode: 'blob' },
		NVARCHAR2: { type: 'char', mode: 'nvarchar2' },
		JSON: { type: 'json' },
	};
	const properties = jsonColumns.reduce((properties, column) => {
		const columnName = column.name;
		const columnType = column.datatype;
		const schema = types[columnType];

		if (!schema) {
			return properties;
		}

		const subtype = getJsonType(records, columnName);

		if (!subtype) {
			return properties;
		}

		const type = getJsonTypeName(subtype);
		return {
			...properties,
			[columnName]: {
				...schema,
				subtype,
				childType: 'json',
				type,
			},
		};
	}, {});

	return { properties };
};

const getViewDDL = async (viewName, schema, logger) => {
	try {
		const isMaterializedView = await checkEntityMaterializedView(viewName);

		await setSQLTerminator();
		if (isMaterializedView) {
			logger.log('info', { viewName, schema }, `Is materialized view"`);

			const queryResult = await execute(
				`SELECT JSON_OBJECT(
					'viewDDL' VALUE DBMS_METADATA.GET_DDL('MATERIALIZED_VIEW', MV.MVIEW_NAME, MV.OWNER),
					'indexDDLs' VALUE (
						SELECT JSON_ARRAYAGG(DBMS_METADATA.GET_DDL('INDEX', INDEX_NAME, OWNER) RETURNING CLOB)
						FROM ALL_INDEXES
						WHERE TABLE_OWNER=MV.OWNER
							AND TABLE_NAME=MV.MVIEW_NAME
							AND INDEX_NAME NOT IN (
								SELECT CONSTRAINT_NAME
								FROM ALL_CONSTRAINTS
								WHERE CONSTRAINT_TYPE='P'
								AND OWNER=MV.OWNER
								AND TABLE_NAME=MV.MVIEW_NAME
							)
						)
					)
					FROM ALL_MVIEWS MV
					WHERE MV.OWNER='${schema}' AND MV.MVIEW_NAME='${viewName}'`,
			);
			const row = _.first(_.first(queryResult));
			const queryObj = JSON.parse(row);
			logger.log('info', { viewName, schema }, `Getting DDL from "${schema}"."${viewName}"`);

			return `${queryObj.viewDDL}\n${_.join(queryObj.indexDDLs, '\n')}`;
		}

		const queryResult = await execute(
			`SELECT DBMS_METADATA.GET_DDL('VIEW', VIEW_NAME, OWNER) FROM ALL_VIEWS WHERE VIEW_NAME='${viewName}'`,
		);

		const viewDDL = await _.first(_.first(queryResult)).getData();

		return viewDDL;
	} catch (err) {
		if (err?.errorNum === 31603 && !(await checkUserHaveRequiredRole(logger))) {
			throw err;
		}

		logger.log(
			'error',
			{
				message: 'Cannot get DDL for view: ' + viewName,
				error: { message: err.message, stack: err.stack, err: _.omit(err, ['message', 'stack']) },
			},
			'Getting DDL',
		);
		return '';
	}
};

const checkEntityMaterializedView = async name => {
	await setSQLTerminator();
	const queryResult = await execute(`SELECT * FROM ALL_MVIEWS WHERE MVIEW_NAME = '${name}'`);

	return !_.isEmpty(queryResult);
};

const checkUserHaveRequiredRole = async logger => {
	try {
		const userResult = await execute("SELECT sys_context('USERENV', 'CURRENT_USER') FROM dual");
		const username = _.first(_.first(userResult));
		const roles = (await execute(`SELECT GRANTED_ROLE FROM USER_ROLE_PRIVS WHERE USERNAME = '${username}'`))?.map(
			([role]) => role,
		);

		return roles.includes('SELECT_CATALOG_ROLE');
	} catch (error) {
		logger.log(
			'error',
			{
				message: 'Checking user privileges error',
				error: { message: error.message, stack: error.stack, err: _.omit(error, ['message', 'stack']) },
			},
			'Getting DDL',
		);

		return false;
	}
};

const logEnvironment = logger => {
	logger.log(
		'info',
		{
			TNS_ADMIN: process.env.TNS_ADMIN ?? '',
			ORACLE_HOME: process.env.ORACLE_HOME ?? '',
			LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH ?? '',
			ORACLE_BASE: process.env.ORACLE_BASE ?? '',
		},
		'Environment variables',
	);
};

const getDbSynonyms = async logger => {
	try {
		const queryResult = await execute(
			'SELECT OWNER, SYNONYM_NAME, TABLE_OWNER, TABLE_NAME, DB_LINK FROM ALL_SYNONYMS WHERE ORIGIN_CON_ID > 1',
		);

		if (_.isEmpty(queryResult)) {
			return [];
		}
		const synonyms = queryResult.map(([owner, synonymName, synonymSchemaName, synonymEntityId]) => {
			return {
				synonymSchemaName,
				synonymPublic: owner === 'PUBLIC',
				synonymName,
				synonymEntityId,
			};
		});
		logger.log('info', synonyms, 'Getting synonyms');
		const synonymsDDL = await getSynonymsDDL();
		const synonymsWithEditionable = synonyms.map(synonym => {
			const synonymDDL = synonymsDDL.find(({ name }) => name === synonym.synonymName);
			const isEditionable = !synonymDDL?.ddl?.toUpperCase().includes('NONEDITIONABLE');

			return { ...synonym, synonymEditionable: isEditionable ? 'EDITIONABLE' : 'NONEDITIONABLE' };
		});
		const groupedSynonyms = _.groupBy(synonymsWithEditionable, 'synonymSchemaName');

		return groupedSynonyms;
	} catch (err) {
		logger.log(
			'error',
			{
				message: 'Cannot get synonyms',
				error: { message: err.message, stack: err.stack, err: _.omit(err, ['message', 'stack']) },
			},
			'Getting synonyms',
		);
	}
};

const getSynonymsDDL = async () => {
	const queryResult = await execute(
		"SELECT SYNONYM_NAME, DBMS_METADATA.GET_DDL('SYNONYM', SYNONYM_NAME, OWNER) FROM ALL_SYNONYMS WHERE ORIGIN_CON_ID > 1",
	);
	const synonymsDDL = await Promise.all(
		queryResult.map(async ([synonymName, synonymDDL]) => {
			const synonymDDLString = await synonymDDL.getData();
			return { name: synonymName, ddl: synonymDDLString };
		}),
	);

	return synonymsDDL;
};

module.exports = {
	connect,
	disconnect,
	getEntitiesNames,
	getSchemaNames,
	splitEntityNames,
	getDDL,
	getJsonSchema,
	getViewDDL,
	getDbVersion,
	selectRecords,
	logEnvironment,
	execute,
	getDbSynonyms,
	getSchemaSequences: getSchemaSequences({ execute }),
};
