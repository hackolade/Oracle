const fs = require('fs');
const path = require('path');

const WALLET_FILES = ['ewallet.pem', 'cwallet.sso', 'ewallet.p12'];
const MTLS_PORT = '1522';

const hasWalletFiles = configDir =>
	configDir && fs.existsSync(configDir) && WALLET_FILES.some(file => fs.existsSync(path.join(configDir, file)));

const hasAutoLoginWallet = configDir => configDir && fs.existsSync(path.join(configDir, 'cwallet.sso'));

const isMutualTlsEnabled = mutualTLS => mutualTLS === true || mutualTLS === 'true';

const isMtlsPort = port => String(port) === MTLS_PORT;

const connectStringUsesMtlsPort = connectString => /\(PORT\s*=\s*1522\)/i.test(connectString);

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

module.exports = {
	WALLET_FILES,
	MTLS_PORT,
	hasWalletFiles,
	isMutualTlsEnabled,
	isMtlsPort,
	connectStringUsesMtlsPort,
	assertTnsMtlsRequirements,
};
