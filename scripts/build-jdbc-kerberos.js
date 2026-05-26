#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIB_DIR = path.join(ROOT, 'jdbc', 'lib');
const SRC = path.join(ROOT, 'jdbc', 'java', 'KerberosJdbcBridge.java');
const OUT_JAR = path.join(LIB_DIR, 'kerberos-jdbc-bridge.jar');
const CLASSES_DIR = path.join(LIB_DIR, 'classes');

const OJDBC_VERSION = process.env.OJDBC_VERSION || '23.4.0.24.05';
const OJDBC_URL = `https://repo1.maven.org/maven2/com/oracle/database/jdbc/ojdbc11/${OJDBC_VERSION}/ojdbc11-${OJDBC_VERSION}.jar`;
const JSON_URL = 'https://repo1.maven.org/maven2/org/json/json/20240303/json-20240303.jar';

const strict = process.argv.includes('--strict') || process.env.npm_lifecycle_event === 'package';

const log = message => console.log(`[jdbc-kerberos] ${message}`);
const warn = message => console.warn(`[jdbc-kerberos] ${message}`);

const download = (url, dest) =>
	new Promise((resolve, reject) => {
		const file = fs.createWriteStream(dest);

		const request = urlString => {
			https
				.get(urlString, response => {
					if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
						response.resume();
						request(response.headers.location);
						return;
					}

					if (response.statusCode !== 200) {
						reject(new Error(`Download failed (${response.statusCode}): ${urlString}`));
						response.resume();
						return;
					}

					response.pipe(file);
					file.on('finish', () => file.close(() => resolve(dest)));
				})
				.on('error', reject);
		};

		request(url);
	});

const ensureJar = async (url, dest, label) => {
	if (fs.existsSync(dest)) {
		return;
	}

	fs.mkdirSync(LIB_DIR, { recursive: true });
	log(`Downloading ${label}...`);
	await download(url, dest);
};

const getJavaMajorVersion = javaExecutable => {
	const result = spawnSync(javaExecutable, ['-version'], { encoding: 'utf8' });
	const output = `${result.stdout || ''}${result.stderr || ''}`;
	const match = output.match(/version "(\d+)/);
	return match ? Number(match[1]) : 0;
};

const resolveJavac = () => {
	const candidates = [
		process.env.JAVA_COMPILER,
		process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin', 'javac'),
		'/opt/homebrew/opt/openjdk@21/bin/javac',
		'/usr/local/opt/openjdk@21/bin/javac',
		'/opt/homebrew/opt/openjdk@17/bin/javac',
		'/usr/local/opt/openjdk@17/bin/javac',
		'javac',
	].filter(Boolean);

	for (const candidate of candidates) {
		if (candidate !== 'javac' && !fs.existsSync(candidate)) {
			continue;
		}

		const check = spawnSync(candidate, ['-version'], { encoding: 'utf8' });
		if (check.status !== 0 && check.error) {
			continue;
		}

		const javaBin = candidate.replace(/javac$/i, 'java');
		const major = getJavaMajorVersion(fs.existsSync(javaBin) ? javaBin : candidate.replace('javac', 'java'));
		if (major >= 25) {
			continue;
		}

		if (major >= 11 || major === 0) {
			return candidate;
		}
	}

	return null;
};

const resolveJarTool = javac => {
	const jarCandidate = javac.replace(/javac$/i, 'jar');
	if (fs.existsSync(jarCandidate)) {
		return jarCandidate;
	}

	const jarOnPath = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['jar'], { encoding: 'utf8' });
	if (jarOnPath.status === 0 && jarOnPath.stdout.trim()) {
		return jarOnPath.stdout.trim().split(/\r?\n/)[0];
	}

	return 'jar';
};

const run = (command, args, options = {}) => {
	const result = spawnSync(command, args, { stdio: 'inherit', ...options });
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(' ')} failed (exit ${result.status ?? 'unknown'})`);
	}
};

const compileBridge = javac => {
	const ojdbc = path.join(LIB_DIR, 'ojdbc11.jar');
	const json = path.join(LIB_DIR, 'json.jar');
	const classpath = [ojdbc, json].join(path.delimiter);

	log(`Compiling KerberosJdbcBridge with ${javac}...`);
	fs.rmSync(CLASSES_DIR, { recursive: true, force: true });
	fs.mkdirSync(CLASSES_DIR, { recursive: true });

	run(javac, ['-cp', classpath, '-d', CLASSES_DIR, SRC]);

	const jarTool = resolveJarTool(javac);
	run(jarTool, ['cf', OUT_JAR, '-C', CLASSES_DIR, '.']);

	log(`Built ${OUT_JAR}`);
};

const main = async () => {
	const ojdbcJar = path.join(LIB_DIR, 'ojdbc11.jar');
	const jsonJar = path.join(LIB_DIR, 'json.jar');

	try {
		await ensureJar(OJDBC_URL, ojdbcJar, 'ojdbc11.jar');
		await ensureJar(JSON_URL, jsonJar, 'json.jar');
	} catch (error) {
		const message = `Failed to download JDBC runtime JARs: ${error.message}`;
		if (strict) {
			console.error(message);
			process.exit(1);
		}
		warn(`${message} (re-run: npm run build:jdbc)`);
		return;
	}

	const javac = resolveJavac();
	if (!javac) {
		const message =
			'Java 11–21 (javac) not found — skipped Kerberos bridge compile. ' +
			'Install JDK 21, then run: npm run build:jdbc';
		if (strict) {
			console.error(message);
			process.exit(1);
		}
		warn(message);
		return;
	}

	try {
		compileBridge(javac);
	} catch (error) {
		const message = `Kerberos JDBC bridge build failed: ${error.message}`;
		if (strict) {
			console.error(message);
			process.exit(1);
		}
		warn(`${message} (re-run: npm run build:jdbc)`);
	}
};

main().catch(error => {
	console.error(error);
	process.exit(strict ? 1 : 0);
});
