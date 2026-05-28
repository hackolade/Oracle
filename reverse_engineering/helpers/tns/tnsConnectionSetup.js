const fs = require('fs');
const path = require('path');
const extractWallet = require('../extractWallet');
const { fixSqlNetOraWalletPath } = require('../extractWallet');
const { setPluginTnsAdmin } = require('./tnsAdmin');
const { resolveTnsConfigDir, assertTnsConfigDir, getTnsNamesOraFile } = require('./tnsConfig');
const {
	WALLET_FILES,
	MTLS_PORT,
	hasWalletFiles,
	isMutualTlsEnabled,
	isMtlsPort,
	connectStringUsesMtlsPort,
	assertTnsMtlsRequirements,
} = require('./tnsMtls');
const { syncConnectionEndpointFromTns, getConnectionStringByTnsNames } = require('./tnsConnectString');
const { getConnectionDescription } = require('../connectStringDescription');

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

const shouldUseWalletForConnect = ({ connectionMethod, useMutualTls, tnsServicePort, connectString }) =>
	connectionMethod === 'Wallet' ||
	(connectionMethod === 'TNS' &&
		useMutualTls &&
		(isMtlsPort(tnsServicePort) || connectStringUsesMtlsPort(connectString)));

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

module.exports = {
	trySyncTnsEndpointEarly,
	setupWalletConfigDir,
	applyTnsMutualTlsWallet,
	setupTnsConfigDir,
	resolveConnectionConfigDir,
	buildSessionConnectString,
	shouldUseWalletForConnect,
	logWalletConnectNotes,
	isMutualTlsEnabled,
};
