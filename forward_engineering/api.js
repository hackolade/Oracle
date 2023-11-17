const reApi = require('../reverse_engineering/api');
const applyToInstanceHelper = require('./applyToInstanceHelper');
const {doesContainerLevelAlterScriptContainDropStatements, doesEntityLevelAlterScriptContainDropStatements,
	buildContainerLevelAlterScript, buildEntityLevelAlterScript
} = require("./alterScript/alterScriptBuilder");

module.exports = {
	generateScript(data, logger, callback, app) {
		try {
			const script = buildEntityLevelAlterScript(data, app);
			callback(null, script);
		} catch (error) {
			logger.log('error', {message: error.message, stack: error.stack}, 'Oracle Forward-Engineering Error');

			callback({message: error.message, stack: error.stack});
		}
	},

	generateViewScript(data, logger, callback, app) {
		callback(new Error('Forward-Engineering of delta model on view level is not supported'));
	},

	generateContainerScript(data, logger, callback, app) {
		try {
			const script = buildContainerLevelAlterScript(data, app);
			callback(null, script);
		} catch (error) {
			logger.log('error', {message: error.message, stack: error.stack}, 'Oracle Forward-Engineering Error');

			callback({message: error.message, stack: error.stack});
		}
	},

	getDatabases(connectionInfo, logger, callback, app) {
		logger.progress({ message: 'Find all schemas' });
		reApi.getSchemaNames(connectionInfo, logger, callback, app);
	},

	applyToInstance(connectionInfo, logger, callback, app) {
		logger.clear();
		logger.log('info', connectionInfo, 'connectionInfo', connectionInfo.hiddenKeys);

		applyToInstanceHelper
			.applyToInstance(connectionInfo, logger, app)
			.then(result => {
				callback(null, result);
			})
			.catch(error => {
				const err = {
					message: error.message,
					stack: error.stack,
				};
				logger.log('error', err, 'Error when applying to instance');

				callback(err);
			});
	},

	testConnection(connectionInfo, logger, callback, app) {
		reApi.testConnection(connectionInfo, logger, callback, app);
	},

	isDropInStatements(data, logger, callback, app) {
		try {
			if (data.level === 'container') {
				const containsDropStatements = doesContainerLevelAlterScriptContainDropStatements(data, app);
				callback(null, containsDropStatements);
			} else {
				const containsDropStatements = doesEntityLevelAlterScriptContainDropStatements(data, app);
				callback(null, containsDropStatements);
			}
		} catch (e) {
			callback({message: e.message, stack: e.stack});
		}
	},
};
