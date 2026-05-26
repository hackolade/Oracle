const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const KERBEROS_CC_BASENAME = 'krb5cc_hackolade';

let bridgeProcess;
let bridgeReader;
let pendingRequests = new Map();
let requestSeq = 0;

const getDefaultKrb5Cc = () => path.join(process.env.HOME || '/tmp', '.hackolade', KERBEROS_CC_BASENAME);

const getDefaultKrb5Conf = () => {
	if (process.env.KRB5_CONFIG && fs.existsSync(process.env.KRB5_CONFIG)) {
		return process.env.KRB5_CONFIG;
	}
	if (fs.existsSync('/etc/krb5.conf')) {
		return '/etc/krb5.conf';
	}
	return '';
};

const resolveJdbcLibDir = pluginPath => path.join(pluginPath || path.join(__dirname, '..', '..'), 'jdbc', 'lib');

const getJavaMajorVersion = javaExecutable => {
	try {
		const { execFileSync } = require('child_process');
		const output = execFileSync(javaExecutable, ['-version'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		const match = `${output}`.match(/version "(\d+)/);
		return match ? Number(match[1]) : 0;
	} catch {
		return 0;
	}
};

const resolveJavaExecutable = javaPath => {
	const candidates = [
		javaPath,
		process.env.JAVA_HOME &&
			path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'),
		'/opt/homebrew/opt/openjdk@21/bin/java',
		'/usr/local/opt/openjdk@21/bin/java',
		'/opt/homebrew/opt/openjdk@17/bin/java',
		'/usr/local/opt/openjdk@17/bin/java',
		'/opt/homebrew/opt/openjdk/bin/java',
		'/usr/local/opt/openjdk/bin/java',
		'/usr/bin/java',
	].filter(Boolean);

	for (const candidate of candidates) {
		if (!fs.existsSync(candidate)) {
			continue;
		}

		const major = getJavaMajorVersion(candidate);
		if (major >= 25) {
			continue;
		}

		return candidate;
	}

	throw new Error(
		'Kerberos (JDBC) requires Java 11–21 (JDK 25 breaks Oracle Kerberos). ' +
			'Install: brew install openjdk@21 and set Java path to /opt/homebrew/opt/openjdk@21/bin/java',
	);
};

const assertJdbcRuntime = pluginPath => {
	const libDir = resolveJdbcLibDir(pluginPath);
	const required = ['ojdbc11.jar', 'json.jar', 'kerberos-jdbc-bridge.jar'];
	const missing = required.filter(file => !fs.existsSync(path.join(libDir, file)));

	if (missing.length) {
		throw new Error(
			`Kerberos (JDBC) runtime missing: ${missing.join(', ')} in ${libDir}. ` +
				'Run: chmod +x jdbc/build.sh && ./jdbc/build.sh from the Oracle plugin directory.',
		);
	}

	return libDir;
};

const parseConnectEndpoint = connectString => {
	const host = connectString.match(/HOST\s*=\s*([^)]+)/i)?.[1]?.trim();
	const port = connectString.match(/PORT\s*=\s*(\d+)/i)?.[1]?.trim();
	const serviceName = connectString.match(/SERVICE_NAME\s*=\s*([^)]+)/i)?.[1]?.trim();

	if (!host || !port || !serviceName) {
		throw new Error(`Unable to parse HOST/PORT/SERVICE_NAME from connect string: ${connectString}`);
	}

	return { host, port: Number(port), serviceName };
};

const startBridge = async (pluginPath, javaPath, logger) => {
	if (bridgeProcess) {
		return;
	}

	const libDir = assertJdbcRuntime(pluginPath);
	const javaExecutable = resolveJavaExecutable(javaPath);
	const classpath = [
		path.join(libDir, 'ojdbc11.jar'),
		path.join(libDir, 'json.jar'),
		path.join(libDir, 'kerberos-jdbc-bridge.jar'),
	].join(process.platform === 'win32' ? ';' : ':');

	logger?.({
		message: 'Starting Kerberos JDBC bridge',
		java: javaExecutable,
		libDir,
	});

	bridgeProcess = spawn(javaExecutable, ['-cp', classpath, 'KerberosJdbcBridge'], {
		stdio: ['pipe', 'pipe', 'pipe'],
		env: { ...process.env },
	});

	bridgeReader = readline.createInterface({ input: bridgeProcess.stdout });

	bridgeReader.on('line', line => {
		let response;
		try {
			response = JSON.parse(line);
		} catch (error) {
			return;
		}

		if (response.id === undefined) {
			return;
		}

		const pending = pendingRequests.get(response.id);
		if (!pending) {
			return;
		}

		pendingRequests.delete(response.id);
		if (response.ok) {
			pending.resolve(response);
		} else {
			pending.reject(new Error(response.error || 'JDBC bridge error'));
		}
	});

	bridgeProcess.stderr.on('data', chunk => {
		logger?.({ message: 'JDBC bridge stderr', stderr: String(chunk) });
	});

	bridgeProcess.on('exit', code => {
		bridgeProcess = null;
		bridgeReader = null;
		for (const [, pending] of pendingRequests) {
			pending.reject(new Error(`JDBC bridge exited with code ${code}`));
		}
		pendingRequests.clear();
	});

	await new Promise((resolve, reject) => {
		const onLine = line => {
			try {
				const msg = JSON.parse(line);
				if (msg.ok && msg.message === 'ready') {
					bridgeReader.off('line', onLine);
					resolve();
				}
			} catch {
				// ignore
			}
		};
		bridgeReader.on('line', onLine);
		bridgeProcess.on('error', reject);
		setTimeout(() => reject(new Error('JDBC bridge start timeout')), 30000);
	});
};

const request = payload =>
	new Promise((resolve, reject) => {
		if (!bridgeProcess) {
			return reject(new Error('JDBC bridge is not running'));
		}

		const id = ++requestSeq;
		pendingRequests.set(id, { resolve, reject });
		bridgeProcess.stdin.write(`${JSON.stringify({ ...payload, id })}\n`);
	});

const connect = async ({ pluginPath, javaPath, connectString, krb5Cc, krb5Conf, userName, logger }) => {
	await startBridge(pluginPath, javaPath, logger);

	const endpoint = parseConnectEndpoint(connectString);
	const ccFile = krb5Cc || getDefaultKrb5Cc();
	const confFile = krb5Conf || getDefaultKrb5Conf();

	if (!fs.existsSync(ccFile)) {
		throw new Error(
			`Kerberos ticket cache not found at ${ccFile}. Run docker/scripts/mac-kinit.sh or kinit -c ${ccFile} <principal@REALM>`,
		);
	}

	const response = await request({
		cmd: 'connect',
		host: endpoint.host,
		port: endpoint.port,
		serviceName: endpoint.serviceName,
		krb5Cc: ccFile,
		krb5Conf: confFile,
		user: userName || '',
	});

	logger?.({
		message: 'Kerberos JDBC connected',
		url: response.url,
		krb5Cc: ccFile,
		krb5Conf: confFile,
	});

	return { type: 'jdbc' };
};

const execute = async (sql, options = {}) => {
	const response = await request({
		cmd: 'execute',
		sql,
		maxRows: options.maxRows || 0,
	});

	return response.rows || [];
};

const disconnect = async () => {
	if (!bridgeProcess) {
		return;
	}

	try {
		await request({ cmd: 'close' });
	} catch {
		// ignore close errors
	}

	bridgeProcess.stdin.end();
	bridgeProcess.kill();
	bridgeProcess = null;
	bridgeReader = null;
};

module.exports = {
	connect,
	execute,
	disconnect,
	getDefaultKrb5Cc,
	getDefaultKrb5Conf,
	parseConnectEndpoint,
};
