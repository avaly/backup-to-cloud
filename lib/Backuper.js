const fs = require('fs');
const path = require('path');

const Crypter = require('../lib/Crypter');
const DB = require('./DB.sqlite');
const config = require('./config');
const utils = require('./utils');

const S3_DELETE_IA_INTERVAL = 31 * 24 * 3600 * 1000;
const AWS = config.aws;

class Backuper {
	constructor(db) {
		this.db = db;
	}

	start() {
		this.sessionCount = 0;
		this.sessionFailed = 0;
		this.sessionSize = 0;
		this.counts = this.db.getCounts();
		this.skipFiles = [];

		utils.log(
			'Backuper.start:',
			`locals=${this.counts.locals} / remotes=${this.counts.remotes}`
		);

		return this.next();
	}

	finish() {
		utils.debug('Backuper.finish');
		if (!this.sessionCount) {
			return Promise.resolve();
		}

		this.db.close();
		const dbFile = this.db.file;
		const dbRemoteFile = '/' + path.basename(dbFile);
		return this.add({ path: dbFile }, dbRemoteFile, true);
	}

	getNextToAdd() {
		return this.db.getLocalForBackup(this.skipFiles);
	}

	getNextToRemove() {
		return this.db.getLocalForRemove(this.skipFiles);
	}

	next() {
		if (this.sessionSize >= config.maxSessionSize) {
			utils.debug(
				`Backuper.next sessionSize=${this.sessionSize} ` +
				`maxSessionSize=${config.maxSessionSize}`
			);
			return Promise.resolve('MAX_SESSION_SIZE');
		}
		if (this.sessionFailed >= config.maxSessionFailures) {
			utils.debug(
				`Backuper.next sessionFailed=${this.sessionFailed} ` +
				`maxSessionFailures=${config.maxSessionFailures}`
			);
			return Promise.resolve('MAX_SESSION_FAILED');
		}

		utils.debug(
			`Backuper.next sessionSize=${this.sessionSize} `
		);

		const nextFileToAdd = this.getNextToAdd();
		if (nextFileToAdd) {
			return this.add(nextFileToAdd)
				.then(this.next.bind(this));
		}

		const nextFileToRemove = this.getNextToRemove();
		if (nextFileToRemove) {
			return this.remove(nextFileToRemove)
				.then(this.next.bind(this));
		}

		utils.debug('Backuper.next NO_FILES_LEFT');
		return Promise.resolve('NO_FILES_LEFT');
	}

	add(local, remoteFilePath, isDBFile) {
		const file = local.path;
		utils.debug(`Backuper.add: ${file}`);
		if (!isDBFile) {
			this.sessionCount++;
		}

		const remoteFile = remoteFilePath || utils.remoteFilePath(file);
		let encryptedFile;

		const cleanup = () => {
			if (encryptedFile) {
				utils.debug(`Removing ${encryptedFile.path}`);
				fs.unlinkSync(encryptedFile.path);
			}
		};

		const done = () => {
			if (isDBFile) {
				return;
			}
			// Remember the uploaded hash to compare for future runs
			// Remember the encrypted file size to decide if we can remove if needed
			this.db.updateRemote({
				path: local.path,
				hash: local.hash,
				type: DB.TYPES.FILE,
				size: encryptedFile ? encryptedFile.size : 0,
				timestamp: Date.now()
			});
			if (utils.DRY_RUN) {
				this.sessionSize += local.size;
			}
			else {
				if (encryptedFile) {
					this.sessionSize += encryptedFile.size;
				}
			}
			cleanup();
		};

		const encrypt = () => {
			return Crypter.encrypt(file).then(
				(encryptedResult) => {
					encryptedFile = encryptedResult;
				}
			);
		};

		const upload = (localFile, fileSize) => {
			return this.uploadToS3(localFile,	remoteFile, fileSize).then(
				(stdout) => {
					if (utils.TEST || utils.DEV) {
						utils.debug(`aws stdout: ${stdout}`);
					}
					utils.debug(`Backuper.add success: ${file}`);
					done();
				},
				(err) => {
					utils.log(`Backuper.add error: ${file}`);
					utils.debug(`Error: ${err}`);
					// Remember failed file to avoid trying it again in this sesssion
					this.skipFiles.push(file);
					this.sessionFailed++;
					cleanup();
				}
			);
		};

		if (utils.DRY_RUN) {
			done();
			return Promise.resolve();
		}

		if (isDBFile) {
			// Using fileSize 0 to force upload to S3 in STANDARD storage class
			// since we will be updating the DB file often
			return upload(file, 0);
		}

		return encrypt()
			.then(
				() => upload(encryptedFile.path, encryptedFile.size)
			);
	}

	uploadToS3(localFile, remoteFile, fileSize) {
		const remoteURL = `s3://${config.s3bucket}${remoteFile}`;
		utils.debug(`Backuper.uploadToS3: ${remoteURL}`);

		// `STANDARD_IA` has a minimum object size of 128KB.
		// Smaller objects will be charged for 128KB of storage.
		const storageClass = fileSize >= 128 * 1024
			? 'STANDARD_IA'
			: 'STANDARD';

		const args = [
			's3',
			'cp',
			localFile,
			remoteURL,
			'--no-guess-mime-type',
			'--storage-class',
			storageClass
		];

		if (utils.TEST || utils.DEV) {
			utils.debug(AWS, args.join(' '));
		}

		return utils.execPromise(AWS, args);
	}

	remove(remote) {
		const file = remote.path;
		utils.debug(`Backuper.remove: ${file}`);

		const remoteFile = utils.remoteFilePath(file);

		// `STANDARD_IA` has a minimum object size of 128KB and a minimum required
		// time of 30 days. We delete these files only after 30 days of upload time.
		let canRemove = true;
		if (remote.size >= 128 * 1024) {
			canRemove = remote.timestamp < Date.now() - S3_DELETE_IA_INTERVAL;
		}

		const done = () => {
			// Remove file from both lists
			this.db.deleteLocal(file);
			this.db.deleteRemote(file);
		};

		if (canRemove) {
			this.sessionCount++;

			/* istanbul ignore if */
			if (utils.DRY_RUN) {
				done();
				return Promise.resolve();
			}

			return this.removeFromS3(remoteFile)
				.then(
					(stdout) => {
						if (utils.TEST) {
							utils.debug(`aws stdout: ${stdout}`);
						}
						utils.debug(`Backuper.remove success: ${file}`);
						done();
					},
					(err) => {
						utils.log(`Backuper.remove error: ${file}`);
						utils.debug(`Error: ${err}`);
						// Remember failed file to avoid trying it again in this sesssion
						this.skipFiles.push(file);
						this.sessionFailed++;
					}
				);
		}

		utils.debug(
			'Backuper.remove skipping file due to storage class and timestamp'
		);
		// Remember file to avoid trying it again in this sesssion
		this.skipFiles.push(file);
		return Promise.resolve();
	}

	removeFromS3(remoteFile) {
		const remoteURL = `s3://${config.s3bucket}${remoteFile}`;
		utils.debug(`Backuper.removeFromS3: ${remoteURL}`);

		const args = [
			's3',
			'rm',
			remoteURL
		];

		if (utils.TEST || utils.DEV) {
			utils.debug(AWS, args.join(' '));
		}

		return utils.execPromise(AWS, args);
	}
}

module.exports = Backuper;
