const fs = require('fs');
const path = require('path');
const parseTns = require('../parseTns');

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

const assertTnsConfigDir = configDir => {
	const tnsNamesOraFile = getTnsNamesOraFile(configDir);

	if (!tnsNamesOraFile || !fs.existsSync(tnsNamesOraFile)) {
		throw new Error(
			`Cannot find ${TNS_NAMES_FILE} in "${configDir}". Select the wallet directory or the ${TNS_NAMES_FILE} file.`,
		);
	}
};

const parseTnsNamesOra = filePath => {
	const content = fs.readFileSync(filePath).toString();
	const result = parseTns(content);
	return result;
};

module.exports = {
	TNS_NAMES_FILE,
	resolveTnsConfigDir,
	assertTnsConfigDir,
	getTnsNamesOraFile,
	parseTnsNamesOra,
};
