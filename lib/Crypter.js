const fs = require('fs');

const config = require('./config');
const utils = require('./utils');

const GPG = config.gpg;

class Crypter {
	encrypt(file) {
		const tempFile = utils.tempFile('backup-');
		utils.debug(`Crypter.encrypt: ${file} to ${tempFile}`);

		const args = [
			'--symmetric',
			'--passphrase',
			`"${config.encryptionPassphrase}"`,
			'--output',
			`"${tempFile}"`,
			`"${file}"`
		];

		return utils.execPromise(GPG, args)
			.then(() => {
				const stat = fs.statSync(tempFile);
				return {
					path: tempFile,
					size: stat.size
				};
			});
	}

	decrypt(fileInput, fileOutput) {
		utils.debug(`Crypter.decrypt: ${fileInput} to ${fileOutput}`);

		const outputArgs = fileOutput ? [
			'--output',
			`"${fileOutput}"`,
		] : [];
		const args = [
			'--decrypt',
			'--yes',
			'--quiet',
			'--passphrase',
			`"${config.encryptionPassphrase}"`,
		].concat(outputArgs).concat([
			`"${fileInput}"`
		]);

		return utils.execPromise(GPG, args);
	}
}

module.exports = Crypter;
