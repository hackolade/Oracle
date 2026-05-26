let pluginTnsAdmin;

const setPluginTnsAdmin = configDir => {
	pluginTnsAdmin = configDir;
	process.env.TNS_ADMIN = configDir;
};

const clearPluginTnsAdmin = () => {
	if (pluginTnsAdmin && process.env.TNS_ADMIN === pluginTnsAdmin) {
		delete process.env.TNS_ADMIN;
	}

	pluginTnsAdmin = null;
};

module.exports = {
	setPluginTnsAdmin,
	clearPluginTnsAdmin,
};
