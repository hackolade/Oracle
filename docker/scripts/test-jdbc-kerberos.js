#!/usr/bin/env node
/**
 * Test Kerberos via JDBC bridge (same path as Hackolade plugin).
 * Usage: node docker/scripts/test-jdbc-kerberos.js
 */
'use strict';

const path = require('path');
const jdbcKerberosHelper = require('../../reverse_engineering/helpers/jdbcKerberosHelper');

const PLUGIN_PATH = path.resolve(__dirname, '../..');
const CONNECT_STRING =
	process.env.CONNECT_STRING ||
	'(DESCRIPTION=(ADDRESS=(PROTOCOL=tcp)(HOST=oracle-db.hackolade.local)(PORT=1521))(CONNECT_DATA=(SERVICE_NAME=FREEPDB1)))';

const log = msg => console.log(JSON.stringify(msg, null, 2));

const main = async () => {
	await jdbcKerberosHelper.connect({
		pluginPath: PLUGIN_PATH,
		connectString: CONNECT_STRING,
		userName: process.env.KRB_USER || 'hackolade_krb',
		logger: log,
	});

	const rows = await jdbcKerberosHelper.execute('SELECT 1 AS ok FROM DUAL');
	console.log('SUCCESS:', rows);

	await jdbcKerberosHelper.disconnect();
};

main().catch(err => {
	console.error('FAILED:', err.message);
	process.exit(1);
});
