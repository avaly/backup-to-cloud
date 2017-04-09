const path = require('path');

const Scanner = require('./Scanner');
const config = require('./config');
const utils = require('./utils');

const TAR = config.tar;

class Archiver {
	compress(dir) {
		const tempFile = utils.tempFile('backup-');
		utils.debug(`Archiver.compress: ${dir} to ${tempFile}`);

		const files = Scanner.findFiles(dir).map(
			(file) => file.replace(dir + path.sep, '')
		);
		const args = [
			'cf',
			tempFile,
		].concat(files);

		return utils.execPromise(TAR, args, dir)
			.then(() => tempFile);
	}

	decompress(archive, dir) {
		utils.debug(`Archiver.decompress: ${archive} to ${dir}`);
		utils.mkdir(dir);

		const args = [
			'xf',
			archive,
			'-C',
			dir
		];

		return utils.execPromise(TAR, args);
	}
}

module.exports = new Archiver();
