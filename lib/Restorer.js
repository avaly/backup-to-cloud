const path = require('path');

const DB = require('../lib/DB.sqlite');
const Crypter = require('../lib/Crypter');
const config = require('./config');
const utils = require('./utils');

const AWS = config.aws;

class Restorer {
	start(remotePrefix, localPath) {
		this.remotePrefix = remotePrefix[0] === '/'
			? remotePrefix
			: '/' + remotePrefix;
		this.localPath = localPath;

		this.successCount = 0;
		this.failedCount = 0;
		this.failedFiles = [];

		utils.log(
			'Restorer.start:',
			`remotePrefix=${remotePrefix} localPath=${localPath}`
		);

		return this.fetchRemoteDB()
			.then(() => this.filter());
	}

	fetchRemoteDB() {
		const dbLocalFile = utils.tempFile('restore-db');
		const dbRemoteFile = path.basename(config.dbSQLite);
		const dbRemoteURL = `s3://${config.s3bucket}/${dbRemoteFile}`;
		const args = [
			's3',
			'cp',
			dbRemoteURL,
			dbLocalFile
		];

		utils.log(
			'Restorer: fetching remote DB...'
		);

		return utils.execPromise(AWS, args)
			.then((output) => {
				if (utils.TEST) {
					console.log(output);
				}
				this.data = new DB(dbLocalFile).getAll();
				console.log(this.data);
			});
	}

	filter() {
		this.restoreFiles = this.data.remotes
			.map((remote) => remote.path)
			.filter(
				(path) => utils.remoteFilePath(path).indexOf(this.remotePrefix) === 0
			);

		utils.log(
			`Restorer.filter: ${this.restoreFiles.length} matching files in DB`
		);

		return this.next();
	}

	next() {
		if (!this.restoreFiles.length) {
			return Promise.resolve('FINISHED');
		}

		this.currentFile = this.restoreFiles.shift();
		this.currentRemotePath = utils.remoteFilePath(this.currentFile);
		this.currentLocalPath = `${this.localPath}${this.currentRemotePath}`;

		utils.debug(
			`Restorer.next: ${this.successCount} success, ` +
			`${this.failedCount} failed, ${this.restoreFiles.length} left`
		);

		return this.download()
			.then(() => this.decrypt())
			.then(
				() => {
					this.successCount++;

					return this.next();
				},
				(err) => {
					utils.log(err);
					this.failedCount++;
					this.failedFiles.push(this.currentFile);

					return this.next();
				}
			);
	}

	download() {
		const remoteURL = `s3://${config.s3bucket}${this.currentRemotePath}`;
		utils.log(
			`Restorer.download: ${remoteURL} to ${this.currentLocalPath}`
		);

		if (utils.DRY_RUN) {
			return Promise.resolve();
		}

		const args = [
			's3',
			'cp',
			remoteURL,
			this.currentLocalPath
		];

		return utils.execPromise(AWS, args)
			.then((output) => {
				if (utils.TEST) {
					console.log(output);
				}
			});
	}

	decrypt() {
		if (utils.DRY_RUN) {
			return Promise.resolve();
		}

		return Crypter.decrypt(this.currentLocalPath, this.currentLocalPath);
	}

	finish() {
		utils.log(
			`Restorer.finish: ${this.successCount} restored, ${this.failedCount} failed`
		);
		if (this.failedCount) {
			utils.log('Failed to restore:');
			utils.log(this.failedFiles.join('\n'));
		}
		return Promise.resolve();
	}
}

module.exports = Restorer;
