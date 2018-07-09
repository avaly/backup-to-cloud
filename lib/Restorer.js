const path = require('path');

const Archiver = require('../lib/Archiver');
const DB = require('../lib/DB.sqlite');
const Crypter = require('../lib/Crypter');
const config = require('./config');
const utils = require('./utils');

const AWS = config.aws;

class Restorer {
	async start(remotePrefix, localPath) {
		this.remotePrefix = remotePrefix[0] === '/' ? remotePrefix : '/' + remotePrefix;
		this.localPath = localPath;

		this.successCount = 0;
		this.failedCount = 0;
		this.failedFiles = [];

		utils.log('Restorer.start:', `remotePrefix=${remotePrefix} localPath=${localPath}`);

		await this.fetchRemoteDB();

		return this.filter();
	}

	async fetchRemoteDB() {
		const dbLocalFile = utils.tempFile('restore-db');
		const dbRemoteFile = path.basename(config.dbSQLite);
		const dbRemoteURL = `s3://${config.s3bucket}/${dbRemoteFile}`;
		const args = ['s3', 'cp', dbRemoteURL, dbLocalFile];

		utils.log('Restorer: fetching remote DB...');

		const output = await utils.execPromise(AWS, args);
		if (utils.TEST) {
			console.log(output);
		}

		const db = new DB(dbLocalFile);
		await db.initialize();

		this.data = await db.getAll();

		await db.close();
	}

	filter() {
		this.restoreQueue = this.data.remotes.filter(
			remote => utils.remoteFilePath(remote.path).indexOf(this.remotePrefix) === 0,
		);

		utils.log(`Restorer.filter: ${this.restoreQueue.length} matching files in DB`);

		return this.next();
	}

	next() {
		if (!this.restoreQueue.length) {
			return Promise.resolve('FINISHED');
		}

		this.currentFile = this.restoreQueue.shift();
		this.currentRemotePath = utils.remoteFilePath(this.currentFile.path);
		this.currentLocalPath = `${this.localPath}${this.currentRemotePath}`;

		utils.debug(
			`Restorer.next: ${this.successCount} success, ` +
				`${this.failedCount} failed, ${this.restoreQueue.length} left`,
		);

		return this.download()
			.then(() => this.decrypt())
			.then(() => this.decompress())
			.then(
				() => {
					this.successCount++;

					return this.next();
				},
				err => {
					utils.log(err);
					this.failedCount++;
					this.failedFiles.push(this.currentFile);

					return this.next();
				},
			);
	}

	download() {
		const remoteURL = `s3://${config.s3bucket}${this.currentRemotePath}`;
		utils.log(`Restorer.download: ${remoteURL} to ${this.currentLocalPath}`);

		if (utils.DRY_RUN) {
			return Promise.resolve();
		}

		const args = ['s3', 'cp', remoteURL, this.currentLocalPath];

		return utils.execPromise(AWS, args).then(output => {
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

	decompress() {
		if (utils.DRY_RUN || this.currentFile.type !== DB.TYPES.ARCHIVE) {
			return Promise.resolve();
		}

		const dir = path.dirname(this.currentLocalPath);
		return Archiver.decompress(this.currentLocalPath, dir);
	}

	finish() {
		utils.log(`Restorer.finish: ${this.successCount} restored, ${this.failedCount} failed`);

		if (this.failedCount) {
			utils.log('Failed to restore:');
			utils.log(this.failedFiles.map(remote => remote.path).join('\n'));
		}

		return Promise.resolve();
	}
}

module.exports = Restorer;
