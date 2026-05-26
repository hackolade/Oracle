const _ = require('lodash');
const { normalizeTnsAlias } = require('./tns/tnsConnectString');

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

	if (authMethod === AUTH_METHOD_KERBEROS) {
		const trimmedUserName = normalizeTnsAlias(userName);
		const proxyUserName =
			trimmedUserName && !trimmedUserName.startsWith('[') ? `[${trimmedUserName}]` : trimmedUserName;

		return _.omitBy(
			{
				externalAuth: true,
				username: proxyUserName || undefined,
			},
			_.isUndefined,
		);
	}

	return { username: userName, password: userPassword };
};

const logAuthMethodNotes = (authMethod, userPassword, logger) => {
	if (authMethod === AUTH_METHOD_KERBEROS && userPassword) {
		logger({
			message:
				'Password is not sent for Kerberos external authentication (oracledb uses the OS Kerberos ticket).',
		});
	}
};

module.exports = {
	normalizeAuthMethod,
	assertExternalAuthMode,
	buildConnectionAuthParams,
	logAuthMethodNotes,
};
