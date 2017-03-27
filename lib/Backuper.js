const fs = require('fs');
const path = require('path');

const Crypter = require('../lib/Crypter');
const config = require('./config');
const utils = require('./utils');

const DELETED = 'DELETED';
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
		this.all = this.db.get('all', {});
		this.synced = this.db.get('synced', {});
		this.allFiles = Object.keys(this.all).sort();
		this.syncedFiles = Object.keys(this.synced).sort();
		this.skipFiles = [];

		utils.log(
			'Backuper.start:',
			`all=${this.allFiles.length} / synced=${this.syncedFiles.length}`
		);

		return this.next();
	}

	finish() {
		utils.debug('Backuper.finish');
		if (!this.sessionCount) {
			return Promise.resolve();
		}

		this.db.save();
		const dbFile = this.db.file;
		const dbRemoteFile = '/' + path.basename(dbFile);
		return this.add(dbFile, dbRemoteFile, true);
	}

	getNextToAdd() {
		return this.allFiles.find((file) => (
			// File was not tried and skipped during this sesssion
			this.skipFiles.indexOf(file) === -1 &&
			// File is not deleted
			this.all[file] !== DELETED &&
			(
				// File was never uploaded
				this.syncedFiles.indexOf(file) === -1 ||
				// OR file has a mismatch hash
				this.synced[file][0] !== this.all[file][0]
			)
		));
	}

	getNextToRemove() {
		return this.allFiles.find((file) => (
			// File was not tried and skipped during this sesssion
			this.skipFiles.indexOf(file) === -1 &&
			// Local file was deleted
			this.all[file] === DELETED &&
			// Remote file was previously uploaded and not deleted yet
			this.syncedFiles.indexOf(file) !== -1
		));
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

	add(file, remoteFilePath, isDBFile) {
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
			this.syncedFiles.push(file);
			// Remember the uploaded hash to compare for future runs
			this.synced[file] = [
				// file hash
				this.all[file][0],
				// file size
				encryptedFile ? encryptedFile.size : 0,
				// remote upload timestamp
				Date.now()
			];
			if (utils.DRY_RUN) {
				this.sessionSize += this.all[file][1];
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
			`"${localFile}"`,
			`"${remoteURL}"`,
			'--no-guess-mime-type',
			'--storage-class',
			storageClass,
			'--output',
			'json'
		];

		if (utils.TEST || utils.DEV) {
			utils.debug(AWS, args.join(' '));
		}

		return utils.execPromise(AWS, args);
	}

	remove(file) {
		utils.debug(`Backuper.remove: ${file}`);

		const remoteFile = utils.remoteFilePath(file);
		const fileSize = this.synced[file][1];

		// `STANDARD_IA` has a minimum object size of 128KB and a minimum required
		// time of 30 days. We delete these files only after 30 days of upload time.
		let canRemove = true;
		if (fileSize >= 128 * 1024) {
			const remoteTimestamp = this.synced[file][2];
			canRemove = remoteTimestamp < Date.now() - S3_DELETE_IA_INTERVAL;
		}

		const done = () => {
			// Remove file from both lists
			delete this.all[file];
			delete this.synced[file];
			this.allFiles = Object.keys(this.all);
			this.syncedFiles = Object.keys(this.synced);
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
			remoteURL,
			'--output',
			'json'
		];

		if (utils.TEST || utils.DEV) {
			utils.debug(AWS, args.join(' '));
		}

		return utils.execPromise(AWS, args);
	}
}

module.exports = Backuper;
