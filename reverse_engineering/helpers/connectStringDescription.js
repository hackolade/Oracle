const combine = (val, str) => (val ? str : '');

const normalizeConnectString = connectString =>
	typeof connectString === 'string' ? connectString.replace(/\s+/g, '') : connectString;

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

module.exports = {
	normalizeConnectString,
	getConnectionDescription,
};
