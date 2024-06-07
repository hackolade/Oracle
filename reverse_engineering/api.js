'use strict';

const oracleHelper = require('./helpers/oracleHelper');
const logInfo = require('./helpers/logInfo');
const { setDependencies, dependencies } = require('./helpers/appDependencies');
let _;

module.exports = {
	async connect(connectionInfo, logger, callback, app) {
		const sshService = app.require('@hackolade/ssh-service');

		initDependencies(app);
		logInfo('Connect to instance', connectionInfo, logger);
		oracleHelper.logEnvironment(logger);
		try {
			await oracleHelper.connect(connectionInfo, sshService, message => {
				logger.log('info', message, 'Connection');
			});
			callback();
		} catch (err) {
			handleError(logger, err, callback);
			throw err;
		}
	},

	async disconnect(connectionInfo, logger, callback) {
		try {
			const sshService = app.require('@hackolade/ssh-service');
			await oracleHelper.disconnect(sshService);
			callback(null);
		} catch (err) {
			handleError(logger, err, callback);
		}
	},

	async testConnection(connectionInfo, logger, callback, app) {
		try {
			await this.connect(connectionInfo, logger, () => {}, app);
			callback(null);
		} catch (error) {
			logger.log('error', { message: error.message, stack: error.stack, error }, 'Test connection');
			callback({ message: error.message, stack: error.stack });
		}
	},

	async getSchemaNames(connectionInfo, logger, callback, app) {
		try {
			logInfo('Get schemas', connectionInfo, logger);
			await this.connect(connectionInfo, logger, () => {}, app);
			const schemas = await oracleHelper.getSchemaNames();
			logger.log('info', schemas, 'All schemas list', connectionInfo.hiddenKeys);
			return callback(null, schemas);
		} catch (error) {
			logger.log('error', { message: error.message, stack: error.stack, error }, 'Get schemas');
			return callback({ message: error.message, stack: error.stack });
		}
	},

	async getDbCollectionsNames(connectionInfo, logger, callback, app) {
		try {
			await this.connect(connectionInfo, logger, () => {}, app);
			const objects = await oracleHelper.getEntitiesNames(connectionInfo, {
				info: data => {
					logger.log('info', data, 'Retrieving table and view names');
				},
				error: e => {
					logger.log(
						'error',
						{ message: e.message, stack: e.stack, error: e },
						'Retrieving databases and tables information',
					);
				},
			});

			callback(null, objects);
		} catch (error) {
			logger.log(
				'error',
				{ message: error.message, stack: error.stack, error },
				'Retrieving databases and tables information',
			);
			callback({ message: error.message, stack: error.stack });
		}
	},

	async getDbCollectionsData(collectionsInfo, logger, callback, app) {
		try {
			const progress = ({ message, containerName = '', entityName = '' }) => {
				logger.log('info', { message, schema: containerName, table: entityName }, 'Retrieving schema');
				logger.progress({ message, containerName, entityName });
			};
			logger.log('info', collectionsInfo, 'Retrieving schema', collectionsInfo.hiddenKeys);
			initDependencies(app);
			progress({ message: 'Start reverse-engineering process', containerName: '', entityName: '' });
			const data = collectionsInfo.collectionData;
			const collections = data.collections;
			const dataBaseNames = data.dataBaseNames;
			const dbVersion = await oracleHelper.getDbVersion(logger);
			const synonyms = await oracleHelper.getDbSynonyms(logger);
			const packages = await dataBaseNames.reduce(async (packagesPromise, schema) => {
				const packages = await packagesPromise;
				const entities = oracleHelper.splitEntityNames(collections[schema]);
				const sequences = await oracleHelper.getSchemaSequences({ schema, logger });

				const tablesPackages = await entities.tables.reduce(async (next, table) => {
					const result = await next;

					progress({ message: `Start getting data from table`, containerName: schema, entityName: table });
					const { ddl, countOfRecords, jsonColumns } = await oracleHelper.getDDL(table, schema, logger);
					let documents = [];
					let jsonSchema = {};

					if (!_.isEmpty(jsonColumns)) {
						const quantity = getSampleDocSize(countOfRecords, collectionsInfo.recordSamplingSettings);

						progress({
							message: `Fetching columns for JSON schema inference: ${JSON.stringify(jsonColumns)}`,
							containerName: schema,
							entityName: table,
						});

						documents = await oracleHelper.selectRecords({
							tableName: table,
							limit: quantity,
							jsonColumns,
							schema,
						});
						jsonSchema = await oracleHelper.getJsonSchema(jsonColumns, documents);
					}

					progress({ message: `Data retrieved successfully`, containerName: schema, entityName: table });

					return result.concat({
						dbName: schema,
						collectionName: table,
						entityLevel: {},
						documents: documents,
						views: [],
						ddl: {
							script: ddl,
							type: 'oracle',
							takeAllDdlProperties: true,
						},
						emptyBucket: false,
						validation: {
							jsonSchema,
						},
						bucketInfo: {
							database: schema,
							synonyms: synonyms?.[schema] || [],
							sequences,
						},
					});
				}, Promise.resolve([]));

				const views = await entities.views.reduce(async (next, view) => {
					const result = await next;

					progress({ message: `Start getting data from view`, containerName: schema, entityName: view });
					const ddl = await oracleHelper.getViewDDL(view, schema, logger);

					progress({ message: `Data retrieved successfully`, containerName: schema, entityName: view });

					return result.concat({
						name: view,
						data: {},
						ddl: {
							script: ddl,
							type: 'oracle',
							takeAllDdlProperties: true,
						},
					});
				}, Promise.resolve([]));

				if (_.isEmpty(views)) {
					return [...packages, ...tablesPackages];
				}

				const viewPackage = {
					dbName: schema,
					entityLevel: {},
					views,
					emptyBucket: false,
					bucketInfo: {
						indexes: [],
						database: schema,
						synonyms: synonyms?.[schema] || [],
						sequences,
					},
				};
				return [...packages, ...tablesPackages, viewPackage];
			}, Promise.resolve([]));

			progress({ message: 'Start processing the retrieved data in the application ...' });

			callback(null, packages.filter(Boolean), { version: dbVersion });
		} catch (error) {
			if (error?.errorNum === 31603) {
				logger.log(
					'error',
					{
						message: 'Missing required role “SELECT_CATALOG_ROLE” to perform this operation',
						stack: error.stack,
						error,
					},
					'Reverse-engineering process failed',
				);
				return callback({
					message: 'Missing required role “SELECT_CATALOG_ROLE” to perform this operation',
					type: 'simpleError',
				});
			}

			logger.log(
				'error',
				{ message: error.message, stack: error.stack, error },
				'Reverse-engineering process failed',
			);
			callback({ message: error.message, stack: error.stack });
		}
	},
};

const handleError = (logger, error, cb) => {
	const message = _.isString(error) ? error : _.get(error, 'message', 'Reverse Engineering error');
	logger.log('error', { error }, 'Reverse Engineering error');

	cb(message);
};

const getSampleDocSize = (count, recordSamplingSettings) => {
	if (recordSamplingSettings.active === 'absolute') {
		return Number(recordSamplingSettings.absolute.value);
	}

	const limit = Math.ceil((count * recordSamplingSettings.relative.value) / 100);

	return Math.min(limit, recordSamplingSettings.maxValue);
};

const initDependencies = app => {
	setDependencies(app);
	_ = dependencies.lodash;
	oracleHelper.setDependencies(dependencies);
};
