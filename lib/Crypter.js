const fs = require('fs');
const path = require('path');

const config = require('./config');
const utils = require('./utils');

const GPG = config.gpg;

class Crypter {
	encrypt(file) {
		const tempFile = utils.tempFile('backup-');
		utils.debug(`Crypter.encrypt: ${file} to ${tempFile}`);

		const args = [
			'--batch',
			'--symmetric',
			'--passphrase',
			config.encryptionPassphrase,
			'--output',
			tempFile,
			file,
		];

		return utils.execPromise(GPG, args).then(() => {
			const stat = fs.statSync(tempFile);
			return {
				path: tempFile,
				size: stat.size,
			};
		});
	}

	decrypt(fileInput, fileOutput) {
		utils.debug(`Crypter.decrypt: ${fileInput} to ${fileOutput}`);

		utils.mkdir(path.dirname(fileOutput));

		const args = [
			'--output',
			fileOutput,
			'--batch',
			'--decrypt',
			'--yes',
			'--quiet',
			'--passphrase',
			config.encryptionPassphrase,
			fileInput,
		];

		return utils.execPromise(GPG, args);
	}
}

module.exports = new Crypter();
