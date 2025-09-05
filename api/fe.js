const { generateScript } = require('../forward_engineering/api/generateScript');
const { generateViewScript } = require('../forward_engineering/api/generateViewScript');
const { generateContainerScript } = require('../forward_engineering/api/generateContainerScript');
const { getDatabases } = require('../forward_engineering/api/getDatabases');
const { applyToInstance } = require('../forward_engineering/api/applyToInstance');
const { testConnection } = require('../forward_engineering/api/testConnection');
const { isDropInStatements } = require('../forward_engineering/api/isDropInStatements');

module.exports = {
	generateScript,
	generateViewScript,
	generateContainerScript,
	getDatabases,
	applyToInstance,
	testConnection,
	isDropInStatements,
};
