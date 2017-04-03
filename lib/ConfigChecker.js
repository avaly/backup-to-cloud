const assert = require('assert');

const config = require('./config');
const utils = require('./utils');

class ConfigChecker {
	check() {
		return this.variables()
			.then(this.aws)
			.then(this.gpg);
	}

	variables() {
		return new Promise((resolve) => {
			const vars = [
				'aws',
				'dbSQLite',
				'encryptionPassphrase',
				'gpg',
				'maxSessionSize',
				'scanInterval',
				'sources',
				's3bucket'
			];
			vars.forEach((name) => {
				assert.ok(config[name], `\`${name}\` must be defined in config`);
			});
			resolve();
		});
	}

	aws() {
		return utils.execPromise(config.aws, ['--version']);
	}

	gpg() {
		return utils.execPromise(config.gpg, ['--version']);
	}
}

module.exports = ConfigChecker;
