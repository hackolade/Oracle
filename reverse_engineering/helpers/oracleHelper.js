const _ = require('lodash');
const dns = require('dns');
const dnsPromises = dns.promises;
const fs = require('fs');
const net = require('net');
const path = require('path');
const oracleDB = require('oracledb');
const extractWallet = require('./extractWallet');
const fixSqlNetOraWalletPath = require('./extractWallet').fixSqlNetOraWalletPath;
const parseTns = require('./parseTns');
const { getSchemaSequences } = require('./getSchemaSequences');
const { getSchemaSynonyms } = require('./getSchemaSynonyms');
const jdbcKerberosHelper = require('./jdbcKerberosHelper');

const noConnectionError = { message: 'Connection error' };

let connection;
let useSshTunnel;
let pluginTnsAdmin;
let thickOracleClientInitialized = false;

const setPluginTnsAdmin = configDir => {
	pluginTnsAdmin = configDir;
	process.env.TNS_ADMIN = configDir;
};

const clearPluginTnsAdmin = () => {
	if (pluginTnsAdmin && process.env.TNS_ADMIN === pluginTnsAdmin) {
		delete process.env.TNS_ADMIN;
	}

	pluginTnsAdmin = null;
};

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

const TNS_NAMES_FILE = 'tnsnames.ora';

const resolveTnsConfigDir = tnsPath => {
	if (!tnsPath) {
		return tnsPath;
	}

	const normalizedPath = path.normalize(String(tnsPath).trim());

	if (!fs.existsSync(normalizedPath)) {
		return normalizedPath;
	}

	if (fs.statSync(normalizedPath).isDirectory()) {
		return normalizedPath;
	}

	if (path.basename(normalizedPath).toLowerCase() === TNS_NAMES_FILE) {
		return path.dirname(normalizedPath);
	}

	throw new Error(`Invalid TNS path "${normalizedPath}". Select the wallet directory or the ${TNS_NAMES_FILE} file.`);
};

const assertTnsConfigDir = configDir => {
	const tnsNamesOraFile = getTnsNamesOraFile(configDir);

	if (!tnsNamesOraFile || !fs.existsSync(tnsNamesOraFile)) {
		throw new Error(
			`Cannot find ${TNS_NAMES_FILE} in "${configDir}". Select the wallet directory or the ${TNS_NAMES_FILE} file.`,
		);
	}
};

const getTnsNamesOraFile = configDir => {
	const resolvedConfigDir = resolveTnsConfigDir(configDir);
	const tnsNamesOraFile = [
		resolvedConfigDir,
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

const WALLET_FILES = ['ewallet.pem', 'cwallet.sso', 'ewallet.p12'];
const MTLS_PORT = '1522';

const hasWalletFiles = configDir =>
	configDir && fs.existsSync(configDir) && WALLET_FILES.some(file => fs.existsSync(path.join(configDir, file)));

const hasAutoLoginWallet = configDir => configDir && fs.existsSync(path.join(configDir, 'cwallet.sso'));

const isMutualTlsEnabled = mutualTLS => mutualTLS === true || mutualTLS === 'true';

const assertTnsMtlsRequirements = ({ configDir, tnsServicePort, useMutualTls, walletPassword, logger }) => {
	if (!useMutualTls) {
		if (isMtlsPort(tnsServicePort)) {
			logger({
				message: `TNS service uses port ${MTLS_PORT} without mutual TLS enabled. Connecting in legacy TNS mode (server TLS only, no wallet). Enable "Mutual TLS (mTLS)" if the database requires a client wallet.`,
			});
		}

		return;
	}

	if (!isMtlsPort(tnsServicePort)) {
		return;
	}

	if (!hasWalletFiles(configDir)) {
		throw new Error(
			`Mutual TLS requires wallet files (${WALLET_FILES.join(', ')}) in the TNS directory "${configDir}".`,
		);
	}

	if (!walletPassword && !hasAutoLoginWallet(configDir)) {
		throw new Error(
			`Mutual TLS requires a wallet password (OCI wallet zip password), unless the directory contains an auto-login wallet (cwallet.sso).`,
		);
	}

	if (!walletPassword && hasAutoLoginWallet(configDir)) {
		logger({
			message: 'Using auto-login wallet (cwallet.sso); wallet password not required.',
		});
	}
};

const isMtlsPort = port => String(port) === MTLS_PORT;

const connectStringUsesMtlsPort = connectString => /\(PORT\s*=\s*1522\)/i.test(connectString);

const normalizeTnsAlias = serviceName => (serviceName == null ? '' : String(serviceName).trim());

const getResolvedTnsService = (configDir, serviceName, logger) => {
	const tnsAlias = normalizeTnsAlias(serviceName);
	const filePath = getTnsNamesOraFile(configDir);

	if (!fs.existsSync(filePath)) {
		return null;
	}

	logger({ message: 'Found tnsnames.ora file: ' + filePath });

	const tnsData = parseTnsNamesOra(filePath);

	logger({ message: 'tnsnames.ora successfully parsed' });
	const tnsServicesNames = Object.keys(tnsData);

	if (tnsServicesNames.length === 0) {
		logger({ message: 'No TNS services found in tnsnames.ora' });
		return null;
	}

	const [firstTnsServiceName] = tnsServicesNames;
	const tnsService = (tnsAlias && tnsData[tnsAlias]) || tnsData[firstTnsServiceName];

	if (!tnsAlias) {
		logger({
			message: `No TNS alias provided. Using first TNS service ${firstTnsServiceName} from ${path.join(configDir, 'tnsnames.ora')}.`,
		});
	} else if (!tnsData[tnsAlias]) {
		logger({
			message: `TNS alias '${tnsAlias}' not found. Using first TNS service ${firstTnsServiceName} from ${path.join(configDir, 'tnsnames.ora')}.`,
		});
	} else {
		logger({
			message: `Connect using TNS service ${tnsAlias} from ${path.join(configDir, 'tnsnames.ora')}.`,
		});
	}

	const description = tnsService?.data?.description;
	const address = description?.address;
	const resolvedAlias = tnsAlias && tnsData[tnsAlias] ? tnsAlias : firstTnsServiceName;

	return {
		description,
		address,
		service: description?.connect_data?.service_name,
		sid: description?.connect_data?.sid,
		port: address?.port,
		resolvedAlias,
	};
};

const syncConnectionEndpointFromTns = (connectionInfo, configDir, serviceName, logger) => {
	const resolved = getResolvedTnsService(configDir, serviceName, logger);

	if (!resolved?.address?.host) {
		return resolved;
	}

	connectionInfo.host = resolved.address.host;
	connectionInfo.port = resolved.address.port;

	logger({
		message: 'Synced connection host/port from tnsnames.ora for connections list',
		host: connectionInfo.host,
		port: connectionInfo.port,
		tnsAlias: resolved.resolvedAlias,
	});

	return resolved;
};

const getConnectionStringByTnsNames = (configDir, serviceName, proxy, logger, useWallet = false) => {
	const resolved = getResolvedTnsService(configDir, serviceName, logger);

	if (!resolved) {
		return serviceName;
	}

	const { description, address, service, sid, port, resolvedAlias } = resolved;

	logger({ message: 'tnsnames.ora', address, service, port });

	if (useWallet) {
		logger({
			message: 'Using TNS alias with mTLS wallet',
			connectString: resolvedAlias,
		});
		return resolvedAlias;
	}

	return getConnectionDescription(
		_.omitBy(
			{
				...address,
				...proxy,
				protocol: address?.protocol || 'tcps',
				service: service || serviceName,
				sid,
				retryCount: description?.retry_count,
				retryDelay: description?.retry_delay,
				sslServerDnMatch: description?.security?.ssl_server_dn_match,
			},
			_.isUndefined,
		),
		logger,
	);
};

const combine = (val, str) => (val ? str : '');

const normalizeConnectString = connectString =>
	typeof connectString === 'string' ? connectString.replace(/\s+/g, '') : connectString;

const UNUSABLE_RESOLVED_HOSTS = new Set(['255.255.255.255', '0.0.0.0']);

const assertResolvableConnectHost = async (hostname, logger) => {
	if (!hostname || net.isIP(hostname)) {
		return;
	}

	let addresses;

	try {
		addresses = await dnsPromises.lookup(hostname, { all: true });
	} catch (error) {
		throw new Error(`Cannot resolve hostname "${hostname}": ${error.message}`);
	}

	const resolvedAddresses = addresses.map(entry => entry.address);

	logger({
		message: 'Resolved connection hostname for TCP connect',
		hostname,
		resolvedAddresses,
	});

	const unusableAddress = resolvedAddresses.find(address => UNUSABLE_RESOLVED_HOSTS.has(address));

	if (unusableAddress) {
		throw new Error(
			`Hostname "${hostname}" resolves to ${unusableAddress}. This often means an Azure VM is stopped or its public IP was deallocated. Start the VM or update the hostname, then try again.`,
		);
	}
};

const getConnectionDescription = (
	{ protocol, host, port, sid, service, httpsProxy, httpsProxyPort, retryCount, retryDelay, sslServerDnMatch },
	logger,
) => {
	const connectionString = normalizeConnectString(`(DESCRIPTION=
		${combine(retryCount, `(RETRY_COUNT=${retryCount})`)}
		${combine(retryDelay, `(RETRY_DELAY=${retryDelay})`)}
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
		${combine(sslServerDnMatch, `(SECURITY=(SSL_SERVER_DN_MATCH=${sslServerDnMatch}))`)}
	)`);
	logger({ message: 'connectString', connectString: connectionString });
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
		const resolved = getResolvedTnsService(data.configDir, data.serviceName, logger);

		if (!resolved) {
			throw new Error(
				'Cannot find tnsnames.ora file. Please, specify tnsnames folder or use Base connection method.',
			);
		}

		const { address, service, sid } = resolved;

		logger({ message: 'tnsnames.ora', address, service });

		connectionData.protocol = address?.protocol;
		connectionData.host = address?.host;
		connectionData.port = address?.port;
		connectionData.service = service || normalizeTnsAlias(data.serviceName);
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

const trySyncTnsEndpointEarly = (connectionInfo, { connectionMethod, TNSpath, serviceName }, logger) => {
	if (connectionMethod !== 'TNS' || !TNSpath) {
		return;
	}

	try {
		const tnsConfigDir = resolveTnsConfigDir(TNSpath);
		const tnsNamesOraFile = getTnsNamesOraFile(tnsConfigDir);

		if (tnsNamesOraFile && fs.existsSync(tnsNamesOraFile)) {
			syncConnectionEndpointFromTns(connectionInfo, tnsConfigDir, serviceName, logger);
		}
	} catch (error) {
		logger({ message: `Unable to sync host/port from tnsnames.ora: ${error.message}` });
	}
};

const assertBasicServiceName = (connectionMethod, serviceName) => {
	if (connectionMethod === 'Basic' && !normalizeTnsAlias(serviceName)) {
		throw new Error('Service name is required for Basic connection method.');
	}
};

const setupWalletConfigDir = async ({ walletFile, tempFolder, name }, connectionInfo, serviceName, logger) => {
	const configDir = await extractWallet({ walletFile, tempFolder, name });
	setPluginTnsAdmin(configDir);
	const resolvedTnsService = syncConnectionEndpointFromTns(connectionInfo, configDir, serviceName, logger);

	return { configDir, tnsServicePort: resolvedTnsService?.port };
};

const applyTnsMutualTlsWallet = (configDir, useMutualTls, tnsServicePort, logger) => {
	if (useMutualTls && !isMtlsPort(tnsServicePort)) {
		logger({
			message: `mTLS is enabled but TNS service uses port ${tnsServicePort ?? 'unknown'} (not ${MTLS_PORT}). Connecting without wallet.`,
		});
		return;
	}

	if (!useMutualTls || !isMtlsPort(tnsServicePort)) {
		return;
	}

	if (!hasWalletFiles(configDir)) {
		throw new Error(
			`Mutual TLS requires wallet files (${WALLET_FILES.join(', ')}) in the TNS directory "${configDir}".`,
		);
	}

	fixSqlNetOraWalletPath(path.join(configDir, 'sqlnet.ora'), configDir);
	setPluginTnsAdmin(configDir);
};

const setupTnsConfigDir = (TNSpath, connectionInfo, { serviceName, useMutualTls, walletPassword }, logger) => {
	const configDir = resolveTnsConfigDir(TNSpath);
	assertTnsConfigDir(configDir);

	const resolvedTnsService = syncConnectionEndpointFromTns(connectionInfo, configDir, serviceName, logger);
	const tnsServicePort = resolvedTnsService?.port;

	assertTnsMtlsRequirements({ configDir, tnsServicePort, useMutualTls, walletPassword, logger });
	applyTnsMutualTlsWallet(configDir, useMutualTls, tnsServicePort, logger);

	return { configDir, tnsServicePort };
};

const resolveConnectionConfigDir = async (
	connectionMethod,
	connectionInfo,
	{ walletFile, walletPassword, tempFolder, name, TNSpath, serviceName },
	useMutualTls,
	logger,
) => {
	if (connectionMethod === 'Wallet') {
		return setupWalletConfigDir({ walletFile, tempFolder, name }, connectionInfo, serviceName, logger);
	}

	if (connectionMethod === 'TNS') {
		return setupTnsConfigDir(TNSpath, connectionInfo, { serviceName, useMutualTls, walletPassword }, logger);
	}

	return { configDir: undefined, tnsServicePort: undefined };
};

const buildSessionConnectString = (
	{ connectionMethod, configDir, serviceName, proxy, useMutualTls, tnsServicePort, host, port, sid },
	logger,
) => {
	const useTnsWallet =
		connectionMethod === 'Wallet' || (connectionMethod === 'TNS' && useMutualTls && isMtlsPort(tnsServicePort));

	if (['Wallet', 'TNS'].includes(connectionMethod)) {
		return getConnectionStringByTnsNames(configDir, serviceName, proxy, logger, useTnsWallet);
	}

	return getConnectionDescription({ host, port, sid, service: serviceName }, logger);
};

const applySshTunnelIfNeeded = async (ssh, connectString, tunnelParams, sshService, logger) => {
	if (!ssh) {
		return connectString;
	}

	useSshTunnel = true;
	return getSshConnectionString(tunnelParams, sshService, logger);
};

const shouldUseWalletForConnect = ({ connectionMethod, useMutualTls, tnsServicePort, connectString }) =>
	connectionMethod === 'Wallet' ||
	(connectionMethod === 'TNS' &&
		useMutualTls &&
		(isMtlsPort(tnsServicePort) || connectStringUsesMtlsPort(connectString)));

const AUTH_METHOD_USERNAME_PASSWORD = 'Username / Password';
const AUTH_METHOD_OS = 'OS';
const AUTH_METHOD_KERBEROS = 'Kerberos';

const normalizeAuthMethod = authMethod => authMethod || AUTH_METHOD_USERNAME_PASSWORD;

const assertExternalAuthMode = (authMethod, mode) => {
	if (authMethod === AUTH_METHOD_USERNAME_PASSWORD) {
		return;
	}

	if (mode === 'thin') {
		throw new Error(
			`${authMethod} authentication requires Thick mode with Oracle Instant Client or Oracle Home configured for external authentication.`,
		);
	}
};

const buildConnectionAuthParams = (authMethod, userName, userPassword) => {
	if (authMethod === AUTH_METHOD_USERNAME_PASSWORD) {
		if (!normalizeTnsAlias(userName) || !userPassword) {
			throw new Error('User name and password are required for Username / Password authentication.');
		}

		return { username: userName, password: userPassword };
	}

	if (authMethod === AUTH_METHOD_OS) {
		return { externalAuth: true };
	}

	return { username: userName, password: userPassword };
};

const logAuthMethodNotes = (authMethod, userPassword, logger) => {
	if (authMethod === AUTH_METHOD_KERBEROS && userPassword) {
		logger({
			message:
				'Password is not sent for Kerberos JDBC authentication (identity comes from the Kerberos ticket cache).',
		});
	}
};

const connectViaJdbcKerberos = async (connectionInfo, sshService, logger) => {
	const {
		connectionMethod,
		host,
		port,
		serviceName,
		sid,
		options,
		ssh,
		ssh_user,
		ssh_host,
		ssh_port,
		ssh_method,
		ssh_key_file,
		ssh_key_passphrase,
		ssh_password,
		pluginPath,
		javaPath,
		krb5Cc,
		krb5Conf,
	} = connectionInfo;

	if (connectionMethod !== 'Basic') {
		throw new Error('Kerberos authentication (JDBC) supports Basic connection method only.');
	}

	assertBasicServiceName(connectionMethod, serviceName);

	const proxy = options?.proxy ? parseProxyOptions(options.proxy) : '';
	let connectString = buildSessionConnectString(
		{
			connectionMethod,
			configDir: undefined,
			serviceName,
			proxy,
			useMutualTls: false,
			tnsServicePort: undefined,
			host,
			port,
			sid,
		},
		logger,
	);

	connectString = await applySshTunnelIfNeeded(
		ssh,
		connectString,
		{
			host,
			port,
			configDir: undefined,
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

	const normalizedConnectString = normalizeConnectString(connectString);

	if (!ssh && host) {
		await assertResolvableConnectHost(host, logger);
	}

	logger({
		message: 'Oracle connectString (Kerberos JDBC)',
		connectString: normalizedConnectString,
		hostname: host,
		authTransport: 'jdbc',
	});

	const { userName } = connectionInfo;

	connection = await jdbcKerberosHelper.connect({
		pluginPath,
		javaPath,
		connectString: normalizedConnectString,
		krb5Cc,
		krb5Conf,
		userName: userName?.startsWith('[') ? undefined : userName,
		logger,
	});

	return connection;
};

const logWalletConnectNotes = ({ connectionMethod, useMutualTls, useWallet, walletPassword }, logger) => {
	if (connectionMethod === 'TNS' && useMutualTls && !useWallet) {
		logger({
			message:
				'Skipping walletLocation, walletPassword, and configDir for thin connect (TNS service does not use mTLS port 1522).',
		});
	}

	if (walletPassword && !useWallet) {
		logger({
			message:
				'A wallet password is stored in the connection profile but is not sent to Oracle (mTLS disabled, non-mTLS port, or non-wallet connection method).',
		});
	}
};

const connect = async (connectionInfo, sshService, logger) => {
	const {
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
		authMethod,
		mode,
		mutualTLS,
	} = connectionInfo;

	trySyncTnsEndpointEarly(connectionInfo, { connectionMethod, TNSpath, serviceName }, logger);

	if (connection) {
		logger({ message: 'Reusing existing Oracle connection' });
		return connection;
	}

	const resolvedAuthMethod = normalizeAuthMethod(authMethod);
	if (resolvedAuthMethod === AUTH_METHOD_KERBEROS) {
		return connectViaJdbcKerberos(connectionInfo, sshService, logger);
	}

	if (connectionMethod === 'Basic') {
		clearPluginTnsAdmin();
	}

	const useMutualTls = isMutualTlsEnabled(mutualTLS);
	assertBasicServiceName(connectionMethod, serviceName);

	const { configDir, tnsServicePort } = await resolveConnectionConfigDir(
		connectionMethod,
		connectionInfo,
		{ walletFile, walletPassword, tempFolder, name, TNSpath, serviceName },
		useMutualTls,
		logger,
	);

	const libDir = clientType === 'InstantClient' ? clientPath : undefined;
	const proxy = options?.proxy ? parseProxyOptions(options.proxy) : '';

	let thickConfigDir = configDir;
	if (mode !== 'thin') {
		if (!thickOracleClientInitialized) {
			try {
				oracleDB.initOracleClient({ libDir, configDir: thickConfigDir });
				thickOracleClientInitialized = true;
			} catch (err) {
				if (!/already been called/i.test(String(err.message))) {
					throw err;
				}
				thickOracleClientInitialized = true;
			}
		}

		if (thickConfigDir) {
			setPluginTnsAdmin(thickConfigDir);
		}
	}

	let connectString = buildSessionConnectString(
		{ connectionMethod, configDir, serviceName, proxy, useMutualTls, tnsServicePort, host, port, sid },
		logger,
	);

	connectString = await applySshTunnelIfNeeded(
		ssh,
		connectString,
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

	const useWallet = shouldUseWalletForConnect({
		connectionMethod,
		useMutualTls,
		tnsServicePort,
		connectString,
	});
	logWalletConnectNotes({ connectionMethod, useMutualTls, useWallet, walletPassword }, logger);

	assertExternalAuthMode(resolvedAuthMethod, mode);
	logAuthMethodNotes(resolvedAuthMethod, userPassword, logger);

	const normalizedConnectString = normalizeConnectString(connectString);
	const hostnameToResolve = connectionMethod === 'Basic' ? host : connectionInfo.host;

	if (!ssh && hostnameToResolve) {
		await assertResolvableConnectHost(hostnameToResolve, logger);
	}

	const sessionConfigDir = useWallet ? configDir : undefined;

	logger({
		message: 'Oracle connectString',
		connectString: normalizedConnectString,
		hostname: hostnameToResolve,
		useWallet,
		walletLocation: useWallet ? configDir : undefined,
		configDir: sessionConfigDir,
	});

	return authByCredentials({
		connectString: normalizedConnectString,
		...buildConnectionAuthParams(resolvedAuthMethod, userName, userPassword),
		queryRequestTimeout,
		authRole,
		configDir: sessionConfigDir,
		walletLocation: useWallet ? configDir : undefined,
		walletPassword: useWallet ? walletPassword : undefined,
	});
};

const disconnect = async sshService => {
	if (!connection) {
		clearPluginTnsAdmin();
		return;
	}

	if (useSshTunnel) {
		useSshTunnel = false;
		await sshService.closeConsumer();
	}

	if (connection.type === 'jdbc') {
		await jdbcKerberosHelper.disconnect();
		connection = null;
		clearPluginTnsAdmin();
		return;
	}

	return new Promise((resolve, reject) => {
		connection.close(err => {
			connection = null;
			clearPluginTnsAdmin();
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
	externalAuth,
	queryRequestTimeout,
	authRole,
	walletPassword,
	walletLocation,
	configDir,
}) => {
	return new Promise((resolve, reject) => {
		const connectionConfig = _.omitBy(
			{
				username,
				password,
				externalAuth,
				connectString,
				privilege: authRole === 'default' ? undefined : oracleDB[authRole],
				walletLocation,
				walletPassword,
				configDir,
			},
			_.isUndefined,
		);
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
	return execute(query);
};

const pairToObj = pairs => {
	return pairs.reduce((acc, pair) => {
		const [key, value] = pair;
		if (!acc[key]) {
			acc[key] = [];
		}
		acc[key].push(value);

		return acc;
	}, {});
};

/**
 * Logs an array with a limit to prevent excessive log output.
 * If the array exceeds the limit, only logs the first items and a summary message.
 *
 * @param {object} params
 * @param {Array} params.entities - The array to log
 * @param {string} params.entityType - The type of entities being logged (e.g., 'tables', 'views')
 * @param {object} params.logger - Logger instance
 * @param {number} [params.limit=1000] - Maximum number of items to log
 */
const logEntitiesWithLimit = ({ entities, entityType, logger, limit = 1000 }) => {
	if (entities.length <= limit) {
		logger.info({ [entityType]: entities });
	} else {
		const limitedArray = entities.slice(0, limit);
		logger.info({
			[entityType]: limitedArray,
			message: `Showing first ${limit} of ${entities.length} ${entityType}. ${entities.length - limit} additional ${entityType} not shown in log.`,
		});
	}
};

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

	logEntitiesWithLimit({ entities: materializedViews, entityType: 'materializedViews', logger });

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

	logEntitiesWithLimit({ entities: tables, entityType: 'tables', logger });

	const externalTables = await externalTableNamesByUser(connectionInfo, logger).catch(e => {
		logger.info({ message: 'Cannot retrieve external tables' });
		logger.error(e);

		return [];
	});

	logEntitiesWithLimit({ entities: externalTables, entityType: 'externalTables', logger });

	const views = await viewNamesByUser(connectionInfo, logger).catch(e => {
		logger.info({ message: 'Cannot retrieve views' });
		logger.error(e);

		return [];
	});

	logEntitiesWithLimit({ entities: views, entityType: 'views', logger });

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

	if (connection.type === 'jdbc') {
		if (binds?.length) {
			return Promise.reject(new Error('Kerberos JDBC bridge does not support bind parameters yet.'));
		}
		return jdbcKerberosHelper.execute(command, options);
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
	const versions = ['12c', '18c', '19c', '21c', '23ai', '26ai'];
	const fallbackDbVersion = '21c';

	try {
		const dbVersionResponse = await execute(
			"SELECT version_full FROM product_component_version WHERE product LIKE 'Oracle Database%'",
		);
		const dbVersion = dbVersionResponse?.[0]?.[0];
		logger.log('info', dbVersion, 'DB Version');
		const versionParts = dbVersion?.split('.');
		const majorVersion = versionParts?.[0];

		if (!majorVersion) {
			return fallbackDbVersion;
		}

		const minorVersion = versionParts?.[1];

		// For Oracle 23+, use the minor version to determine the target version
		// e.g., 23.26.1.0.0 -> 26ai or 23ai (fallback)
		if (majorVersion === '23' && minorVersion) {
			const targetVersion = `${minorVersion}ai`;
			if (versions.includes(targetVersion)) {
				return targetVersion;
			}

			return versions.includes('23ai') ? '23ai' : fallbackDbVersion;
		}

		const foundDbVersion = versions.find(version => version.startsWith(majorVersion));

		return foundDbVersion || fallbackDbVersion;
	} catch (e) {
		logger.log('error', { message: e.message, stack: e.stack }, 'Error of getting DB Version');
		return fallbackDbVersion;
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
