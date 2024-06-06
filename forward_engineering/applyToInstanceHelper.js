const oracleHelper = require('../reverse_engineering/helpers/oracleHelper');
const _ = require('lodash');

const applyToInstance = async (connectionInfo, logger, app) => {
	const async = app.require('async');

	oracleHelper.setDependencies({ lodash: _ });
	oracleHelper.logEnvironment(logger);
	await oracleHelper.connect(connectionInfo, message => {
		logger.log('info', message, 'Connection');
	});

	const queries = connectionInfo.script
		.split('\n\n')
		.filter(Boolean)
		.map(query => _.trim(_.trim(_.trim(query), '/'), ';'));
	let i = 0;
	let error;

	await async.mapSeries(queries, async query => {
		try {
			if (query.endsWith('END')) {
				query += ';';
			}

			const message = 'Query: ' + query.split('\n').shift().substr(0, 150);
			logger.progress({ message });
			logger.log('info', { message }, 'Apply to instance');
			await oracleHelper.execute(query);
		} catch (err) {
			const tableExistsError = err.errorNum === 955;
			const userExistsError = err.errorNum === 1920;
			if (tableExistsError || userExistsError) {
				return;
			}
			error = err;
			logger.progress({ message: '[color:red]Not executed...' });
			logger.log('error', { message: err.message, stack: err.stack, query }, 'Error applying to instance');
		}
	});

	if (error) {
		throw new Error('Not all statements executed successfully.\nPlease, see HackoladeFE.log for more details.');
	}
};

module.exports = { applyToInstance };
