const getAddContainerScript = containerName => {
	return `CREATE USER "${containerName}" NO AUTHENTICATION;`;
};

const getDeleteContainerScript = containerName => {
	return `DROP USER "${containerName}";`;
};

module.exports = {
	getAddContainerScript,
	getDeleteContainerScript,
};
