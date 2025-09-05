const applyToInstanceHelper = require('../applyToInstanceHelper');

function applyToInstance(connectionInfo, logger, callback, app) {
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
}

module.exports = {
	applyToInstance,
};
