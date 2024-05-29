const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const extractZip = (zipPath, destination) =>
	new Promise((resolve, reject) => {
		try {
			const zip = new AdmZip(zipPath);

			if (!zip) {
				return reject(
					new Error('Link to zip file is broken or system has no permissions to ' + zipPath + ' folder'),
				);
			}

			const zipEntries = zip.getEntries();

			if (Object.keys(zipEntries).length === 0) {
				return reject(new Error('Zip file is empty'));
			}

			zip.extractAllTo(destination, true);

			return resolve(destination);
		} catch (error) {
			reject(error);
		}
	});

const replaceSqlNetOraDirectoryPath = (sqlNetOraPath, walletLocation) => {
	if (!fs.existsSync(sqlNetOraPath)) {
		return;
	}
	const walletLocationRegExp = /DIRECTORY\=\".+?\"/i;
	let sqlNetContent = fs.readFileSync(sqlNetOraPath).toString();

	if (!walletLocationRegExp.test(sqlNetContent)) {
		return;
	}

	sqlNetContent = sqlNetContent.replace(walletLocationRegExp, `DIRECTORY="${walletLocation}"`);

	fs.writeFileSync(sqlNetOraPath, sqlNetContent);
};

const getHashByFile = filePath =>
	new Promise((resolve, reject) => {
		const getHash = content => {
			const hash = crypto.createHash('md5');
			const data = hash.update(content, 'utf-8');

			return data.digest('hex');
		};

		const fileStream = fs.createReadStream(filePath);

		let rContents = '';
		fileStream.on('data', chunk => {
			rContents += chunk;
		});
		fileStream.on('error', err => {
			reject(err);
		});

		fileStream.on('end', function () {
			resolve(getHash(rContents));
		});
	});

const extractWallet = async ({ walletFile, tempFolder, name }) => {
	if (!fs.existsSync(walletFile)) {
		return;
	}

	const walletHash = await getHashByFile(walletFile);

	const extractedPath = path.join(tempFolder, name + '_' + walletHash);

	if (fs.existsSync(extractedPath)) {
		return extractedPath;
	}

	await extractZip(walletFile, extractedPath);

	const sqlNetOra = path.join(extractedPath, 'sqlnet.ora');

	replaceSqlNetOraDirectoryPath(sqlNetOra, extractedPath);

	return extractedPath;
};

module.exports = extractWallet;
