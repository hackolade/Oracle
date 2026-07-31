const fs = require('fs');
const path = require('path');

const { copyFolderFiles, addReleaseFlag } = require('@hackolade/hck-esbuild-plugins-pack');
const esbuild = require('esbuild');
const { clean } = require('esbuild-plugin-clean');
const { copy } = require('esbuild-plugin-copy');

const { EXCLUDED_EXTENSIONS, EXCLUDED_FILES, DEFAULT_RELEASE_FOLDER_PATH } = require('./buildConstants');

const packageData = JSON.parse(fs.readFileSync('./package.json').toString());
const RELEASE_FOLDER_PATH = path.join(DEFAULT_RELEASE_FOLDER_PATH, `${packageData.name}-${packageData.version}`);

const writeArg = process.argv.find(arg => arg.startsWith('--write='));
const write = writeArg ? writeArg.slice('--write='.length) !== 'false' : true;

esbuild
	.build({
		entryPoints: [
			path.resolve(__dirname, 'forward_engineering', 'api.js'),
			path.resolve(__dirname, 'forward_engineering', 'ddlProvider.js'),
			path.resolve(__dirname, 'forward_engineering', 'dbtProvider.js'),
			path.resolve(__dirname, 'reverse_engineering', 'api.js'),
			path.resolve(__dirname, 'api', 'fe.js'),
		],
		bundle: true,
		keepNames: true,
		platform: 'node',
		target: 'node16',
		outdir: RELEASE_FOLDER_PATH,
		write,
		minify: true,
		logLevel: 'info',
		external: [
			'lodash',
			'@azure/app-configuration',
			'@azure/identity',
			'@azure/keyvault-secrets',
			'oci-common',
			'oci-objectstorage',
			'oci-secrets',
			'oracledb',
		],
		plugins: write
			? [
					clean({
						patterns: [DEFAULT_RELEASE_FOLDER_PATH],
					}),
					copy({
						assets: {
							from: [path.join('node_modules', 'lodash', '**', '*')],
							to: [path.join('node_modules', 'lodash')],
						},
					}),
					copy({
						assets: {
							from: [path.join('node_modules', 'oracledb', '**', '*')],
							to: [path.join('node_modules', 'oracledb')],
						},
					}),
					copyFolderFiles({
						fromPath: __dirname,
						targetFolderPath: RELEASE_FOLDER_PATH,
						excludedExtensions: EXCLUDED_EXTENSIONS,
						excludedFiles: EXCLUDED_FILES,
					}),
					addReleaseFlag(path.resolve(RELEASE_FOLDER_PATH, 'package.json')),
				]
			: [],
	})
	.catch(() => process.exit(1));
