const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const { getConnectionDescription } = require('../connectStringDescription');
const { getTnsNamesOraFile, parseTnsNamesOra } = require('./tnsConfig');

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

module.exports = {
	normalizeTnsAlias,
	getResolvedTnsService,
	syncConnectionEndpointFromTns,
	getConnectionStringByTnsNames,
};
