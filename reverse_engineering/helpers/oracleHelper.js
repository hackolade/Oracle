const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const oracleDB = require('oracledb');
const extractWallet = require('./extractWallet');
const parseTns = require('./parseTns');
const { getSchemaSequences } = require('./getSchemaSequences');
const { getSchemaSynonyms } = require('./getSchemaSynonyms');

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
	} else {
		logger({
			message: `Connect using TNS service ${serviceName}' from ${path.join(configDir, 'tnsnames.ora')}.`,
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

const selectEntitiesWithFallback = async ({
	dbaSelectStatement,
	allSelectStatement,
	includeSystemCollection,
	schemaName,
	entityType,
	logger,
}) => {
	try {
		let stmt = '';
		if (schemaName) {
			stmt = `T.OWNER = '${schemaName}'`;
		}
		if (includeSystemCollection) {
			const result = await execute(dbaSelectStatement + (stmt ? ' WHERE ' + stmt : ''));
			logger.info({ message: `Successfully retrieved ${entityType} using DBA_* tables` });
			return result;
		} else {
			const result = await execute(
				`${dbaSelectStatement} WHERE T.OWNER NOT IN ('SYS', 'SYSTEM', 'DBSNMP', 'SYSMAN', 'OUTLN', 'MGMT_VIEW', 'FLOWS_FILES', 'MDSYS', 'ORDSYS', 'EXFSYS', 'WMSYS', 'APPQOSSYS', 'APEX_030200', 'APEX_PUBLIC_USER', 'SPATIAL_CSW_ADMIN_USR', 'SPATIAL_WFS_ADMIN_USR', 'XS$NULL', 'ORACLE_OCM', 'XDB', 'ANONYMOUS', 'CTXSYS', 'ORDDATA', 'SI_INFORMTN_SCHEMA', 'DVF', 'DVSYS', 'DBSFWUSER', 'FLOWS_040100', 'APEX_040100', 'DIP', 'OWBSYS_AUDIT', 'OWBSYS', 'SYSDG', 'SYSBACKUP', 'SYSKM', 'LBACSYS', 'GSMADMIN_INTERNAL', 'MDDATA', 'SYSRAC', 'GGSYS', 'WKPROXY', 'WK_TEST', 'WKUSER', 'REMOTE_SCHEDULER_AGENT', 'SYS$UMF', 'GSMCATUSER', 'GSMUSER', 'SYSRMAN', 'EJBCA_USER', 'AUDSYS', 'SSOXDSDB', 'PDBADMIN', 'ORDS_PUBLIC_USER', 'ORDS_METADATA')${
					stmt ? ` AND ${stmt}` : ''
				}`,
			);
			logger.info({ message: `Successfully retrieved ${entityType} using DBA_* tables` });
			return result;
		}
	} catch (e) {
		logger.info({
			message: `Failed to access DBA_* tables for ${entityType}, falling back to ALL_* tables: ${e.message}`,
		});
		return selectEntities(allSelectStatement, includeSystemCollection, schemaName);
	}
};

const tableNamesByUser = ({ includeSystemCollection, schemaName }, logger) =>
	selectEntitiesWithFallback({
		dbaSelectStatement: `SELECT T.OWNER, T.TABLE_NAME FROM DBA_TABLES T`,
		allSelectStatement: `SELECT T.OWNER, T.TABLE_NAME FROM ALL_TABLES T`,
		includeSystemCollection,
		schemaName,
		entityType: 'tables',
		logger,
	});
const externalTableNamesByUser = ({ includeSystemCollection, schemaName }, logger) =>
	selectEntitiesWithFallback({
		dbaSelectStatement: `SELECT T.OWNER, T.TABLE_NAME FROM DBA_EXTERNAL_TABLES T`,
		allSelectStatement: `SELECT T.OWNER, T.TABLE_NAME FROM ALL_EXTERNAL_TABLES T`,
		includeSystemCollection,
		schemaName,
		entityType: 'external tables',
		logger,
	});
const viewNamesByUser = ({ includeSystemCollection, schemaName }, logger) =>
	selectEntitiesWithFallback({
		dbaSelectStatement: `SELECT T.OWNER, T.VIEW_NAME || ' (v)' FROM DBA_VIEWS T`,
		allSelectStatement: `SELECT T.OWNER, T.VIEW_NAME || ' (v)' FROM ALL_VIEWS T`,
		includeSystemCollection,
		schemaName,
		entityType: 'views',
		logger,
	});
const materializedViewNamesByUser = ({ includeSystemCollection, schemaName }, logger) =>
	selectEntitiesWithFallback({
		dbaSelectStatement: `SELECT T.OWNER, T.MVIEW_NAME || ' (v)' FROM DBA_MVIEWS T`,
		allSelectStatement: `SELECT T.OWNER, T.MVIEW_NAME || ' (v)' FROM ALL_MVIEWS T`,
		includeSystemCollection,
		schemaName,
		entityType: 'materialized views',
		logger,
	});

const getEntitiesNames = async (connectionInfo, logger) => {
	const materializedViews = await materializedViewNamesByUser(connectionInfo, logger).catch(e => {
		logger.info({ message: 'Cannot retrieve materialized views' });
		logger.error(e);

		return [];
	});

	logger.info({ materializedViews });

	const materializedViewsNames = materializedViews.map(nameArray => _.join(nameArray, '.').slice(0, -' (v)'.length));

	const tables = await tableNamesByUser(connectionInfo, logger)
		.then(tables => {
			return _.reject(tables, tableNameArray => materializedViewsNames.includes(_.join(tableNameArray, '.')));
		})
		.catch(e => {
			logger.info({ message: 'Cannot retrieve tables' });
			logger.error(e);
			return [];
		});

	logger.info({ tables });

	const externalTables = await externalTableNamesByUser(connectionInfo, logger).catch(e => {
		logger.info({ message: 'Cannot retrieve external tables' });
		logger.error(e);

		return [];
	});

	logger.info({ externalTables });

	const views = await viewNamesByUser(connectionInfo, logger).catch(e => {
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

/**
 * Generates table DDL using individual DBMS_METADATA calls with DBA_* tables access.
 *
 * This function serves as a fallback mechanism when the primary getDDL function fails
 * to retrieve data from ALL_* tables. It directly uses DBA_* tables which require
 * elevated privileges such as SELECT_CATALOG_ROLE.
 *
 * @param {string} tableName - The name of the table to generate DDL for
 * @param {string} schema - The Oracle schema name containing the table
 * @param {object} logger - Logger instance for tracking progress and errors
 * @returns {Promise<{ddl: string, jsonColumns: Array, countOfRecords: number}>} Promise that resolves to table DDL information
 */
const generateDDLFromDataDictionary = async (tableName, schema, logger) => {
	try {
		logger.log('info', { tableName, schema }, 'Generating DDL using individual DBMS_METADATA calls');

		const tableDDLResult = await execute(
			`SELECT DBMS_METADATA.GET_DDL('TABLE', '${tableName}', '${schema}') FROM DUAL`,
		);
		const tableDDL = tableDDLResult[0] ? await tableDDLResult[0][0].getData() : '';

		// Get indexes (excluding constraint-backed indexes and system indexes)
		const indexesResult = await execute(`
			SELECT INDEX_NAME 
			FROM DBA_INDEXES 
			WHERE TABLE_OWNER = '${schema}' AND TABLE_NAME = '${tableName}'
				AND INDEX_NAME NOT IN (
					SELECT CONSTRAINT_NAME 
					FROM DBA_CONSTRAINTS 
					WHERE OWNER = '${schema}' AND TABLE_NAME = '${tableName}' AND CONSTRAINT_NAME IS NOT NULL
				)
				AND INDEX_NAME NOT LIKE 'SYS_%'
				AND INDEX_NAME NOT LIKE 'BIN$%'
				AND OWNER NOT IN ('SYS', 'SYSTEM', 'CTXSYS', 'MDSYS', 'XDB')
		`);

		const indexDDLs = [];
		for (const [indexName] of indexesResult) {
			try {
				const indexDDLResult = await execute(
					`SELECT DBMS_METADATA.GET_DDL('INDEX', '${indexName}', '${schema}') FROM DUAL`,
				);
				if (indexDDLResult[0]?.[0]) {
					const indexDDL = await indexDDLResult[0][0].getData();
					indexDDLs.push(indexDDL);
				}
			} catch (e) {
				logger.log(
					'info',
					{ message: `Cannot get DDL for index ${indexName}: ${e.message}` },
					'DDL Generation',
				);
			}
		}

		const tableComment = await execute(`
			SELECT COMMENTS 
			FROM DBA_TAB_COMMENTS 
			WHERE OWNER = '${schema}' AND TABLE_NAME = '${tableName}' AND COMMENTS IS NOT NULL
		`);

		const columnComments = await execute(`
			SELECT COLUMN_NAME, COMMENTS 
			FROM DBA_COL_COMMENTS 
			WHERE OWNER = '${schema}' AND TABLE_NAME = '${tableName}' AND COMMENTS IS NOT NULL
		`);

		let commentsSQL = '';
		if (tableComment.length > 0) {
			commentsSQL += `COMMENT ON TABLE ${escapeName(schema)}.${escapeName(tableName)} IS ${escapeComment(tableComment[0][0])};`;
		}
		if (columnComments.length > 0) {
			const columnCommentsSQL = columnComments
				.map(
					([columnName, comment]) =>
						`COMMENT ON COLUMN ${escapeName(schema)}.${escapeName(tableName)}.${escapeName(columnName)} IS ${escapeComment(comment)};`,
				)
				.join('\n');
			commentsSQL += commentsSQL ? `\n${columnCommentsSQL}` : columnCommentsSQL;
		}

		return {
			ddl: `${tableDDL}${indexDDLs.join('\n')}\n${commentsSQL}`,
			jsonColumns: [],
			countOfRecords: 0,
		};
	} catch (err) {
		logger.log(
			'error',
			{
				message: 'Cannot generate DDL using DBMS_METADATA calls: ' + tableName,
				error: { message: err.message, stack: err.stack, err: _.omit(err, ['message', 'stack']) },
			},
			`Generating DDL using DBMS_METADATA for "${schema}"."${tableName}"`,
		);
		return {
			ddl: '',
			jsonColumns: [],
			countOfRecords: 0,
		};
	}
};

/**
 * Retrieves DDL (Data Definition Language) scripts for a table with automatic fallback capability.
 *
 * This function implements a two-tier approach for retrieving comprehensive table DDL:
 * 1. First attempts to use ALL_* tables (ALL_TABLES, ALL_INDEXES, ALL_CONSTRAINTS, etc.) for most users
 * 2. Falls back to DBA_* tables (via generateDDLFromDataDictionary) if ALL_* approach fails or returns null data
 *
 * @param {string} tableName - The name of the table to retrieve DDL for
 * @param {string} schema - The Oracle schema name containing the table
 * @param {object} logger - Logger instance for tracking progress and errors
 * @returns {Promise<{ddl: string, jsonColumns: Array, countOfRecords: number}>} Promise that resolves to table DDL information
 */
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
		if (!row) {
			logger.log(
				'info',
				{ message: 'DBMS_METADATA returned null data, using individual DBMS_METADATA calls fallback' },
				`Getting DDL from "${schema}"."${tableName}"`,
			);
			return await generateDDLFromDataDictionary(tableName, schema, logger);
		}

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

/**
 * Generates view DDL using individual DBMS_METADATA calls with DBA_* tables access.
 *
 * This function serves as a fallback mechanism when the primary getViewDDL function fails
 * to retrieve data from ALL_* tables. It directly uses DBA_* tables which require
 * elevated privileges such as SELECT_CATALOG_ROLE.
 *
 * @param {string} viewName - The name of the view or materialized view to generate DDL for
 * @param {string} schema - The Oracle schema name containing the view
 * @param {object} logger - Logger instance for tracking progress and errors
 * @returns {Promise<string>} Promise that resolves to the view DDL script
 */
const generateViewDDLFromDataDictionary = async (viewName, schema, logger) => {
	try {
		logger.log('info', { viewName, schema }, 'Generating view DDL using individual DBMS_METADATA calls');

		const isMaterializedView = await checkEntityMaterializedView(viewName, { useDbaViews: true });

		if (!isMaterializedView) {
			// Regular view
			const viewDDLResult = await execute(
				`SELECT DBMS_METADATA.GET_DDL('VIEW', '${viewName}', '${schema}') FROM DUAL`,
			);
			const viewDDL = viewDDLResult[0] ? await viewDDLResult[0][0].getData() : '';
			return viewDDL;
		}

		const mvDDLResult = await execute(
			`SELECT DBMS_METADATA.GET_DDL('MATERIALIZED_VIEW', '${viewName}', '${schema}') FROM DUAL`,
		);
		const mvDDL = mvDDLResult[0] ? await mvDDLResult[0][0].getData() : '';

		const indexesResult = await execute(`
				SELECT INDEX_NAME 
				FROM DBA_INDEXES 
				WHERE TABLE_OWNER = '${schema}' AND TABLE_NAME = '${viewName}'
					AND INDEX_NAME NOT IN (
						SELECT CONSTRAINT_NAME 
						FROM DBA_CONSTRAINTS 
						WHERE OWNER = '${schema}' AND TABLE_NAME = '${viewName}' AND CONSTRAINT_NAME IS NOT NULL
					)
					AND INDEX_NAME NOT LIKE 'SYS_%'
					AND INDEX_NAME NOT LIKE 'BIN$%'
					AND OWNER NOT IN ('SYS', 'SYSTEM', 'CTXSYS', 'MDSYS', 'XDB')
			`);

		const indexDDLs = [];
		for (const [indexName] of indexesResult) {
			try {
				const indexDDLResult = await execute(
					`SELECT DBMS_METADATA.GET_DDL('INDEX', '${indexName}', '${schema}') FROM DUAL`,
				);
				if (indexDDLResult[0]?.[0]) {
					const indexDDL = await indexDDLResult[0][0].getData();
					indexDDLs.push(indexDDL);
				}
			} catch (e) {
				logger.log(
					'info',
					{ message: `Cannot get DDL for index ${indexName}: ${e.message}` },
					'View DDL Generation',
				);
			}
		}

		return mvDDL + (indexDDLs.length > 0 ? `\n${indexDDLs.join('\n')}` : '');
	} catch (err) {
		logger.log(
			'error',
			{
				message: 'Cannot generate view DDL using DBMS_METADATA calls: ' + viewName,
				error: { message: err.message, stack: err.stack, err: _.omit(err, ['message', 'stack']) },
			},
			`Generating view DDL using DBMS_METADATA for "${schema}"."${viewName}"`,
		);
		return '';
	}
};

/**
 * Retrieves DDL (Data Definition Language) scripts for views and materialized views with automatic fallback capability.
 *
 * This function implements a two-tier approach for retrieving comprehensive view DDL:
 * 1. First attempts to use ALL_* tables (ALL_VIEWS, ALL_MVIEWS, ALL_INDEXES) for most users
 * 2. Falls back to DBA_* tables (via generateViewDDLFromDataDictionary) if ALL_* approach fails or returns null data
 *
 * The function handles both:
 * - Regular views: Uses DBMS_METADATA.GET_DDL('VIEW', ...) from ALL_VIEWS
 * - Materialized views: Uses DBMS_METADATA.GET_DDL('MATERIALIZED_VIEW', ...) from ALL_MVIEWS with associated indexes
 *
 * @param {string} viewName - The name of the view or materialized view to retrieve DDL for
 * @param {string} schema - The Oracle schema name containing the view
 * @param {object} logger - Logger instance for tracking progress and errors
 * @returns {Promise<string>} Promise that resolves to the view DDL script
 */
const getViewDDL = async (viewName, schema, logger) => {
	try {
		const isMaterializedView = await checkEntityMaterializedView(viewName, { useDbaViews: false });

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

		const firstResult = _.first(_.first(queryResult));
		if (!firstResult) {
			logger.log(
				'info',
				{ message: 'DBMS_METADATA returned null data for view, using individual DBMS_METADATA calls fallback' },
				`Getting DDL for view "${schema}"."${viewName}"`,
			);
			return await generateViewDDLFromDataDictionary(viewName, schema, logger);
		}

		const viewDDL = await firstResult.getData();

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

const checkEntityMaterializedView = async (name, options = {}) => {
	const { useDbaViews = false } = options;
	await setSQLTerminator();
	const viewType = useDbaViews ? 'DBA_MVIEWS' : 'ALL_MVIEWS';
	try {
		const queryResult = await execute(`SELECT * FROM ${viewType} WHERE MVIEW_NAME = '${name}'`);
		return !_.isEmpty(queryResult);
	} catch {
		return false;
	}
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
	getSchemaSynonyms: getSchemaSynonyms({ execute }),
	getSchemaSequences: getSchemaSequences({ execute }),
};
