const fs = require('fs');
const path = require('path');
const prettyBytes = require('pretty-bytes');

const Archiver = require('../lib/Archiver');
const Crypter = require('../lib/Crypter');
const DB = require('./DB.sqlite');
const Slacker = require('../lib/Slacker');
const config = require('./config');
const utils = require('./utils');

const S3_DELETE_IA_INTERVAL = 31 * 24 * 3600 * 1000;
const AWS = config.aws;
const NEXT = 'NEXT';
const MAX_SESSION_SIZE = 'MAX_SESSION_SIZE';

class Backuper {
	constructor(db, options) {
		this.db = db;
		this.options = options;
	}

	async start() {
		this.sessionCount = 0;
		this.sessionFailed = 0;
		this.sessionSize = 0;
		this.counts = await this.db.getCounts();
		this.skipFiles = [];

		utils.log('Backuper.start:', `locals=${this.counts.locals} / remotes=${this.counts.remotes}`);

		let result;
		do {
			result = await this.next();
		} while (result === NEXT);

		return result;
	}

	async finish() {
		utils.debug('Backuper.finish');

		if (!this.sessionCount) {
			return;
		}

		const dbFile = this.db.file;
		const dbRemoteFile = '/' + path.basename(dbFile);
		return this.add({ path: dbFile }, dbRemoteFile, true);
	}

	getNextToAdd() {
		return this.db.getLocalForBackup(this.skipFiles, this.options.random);
	}

	getNextToRemove() {
		return this.db.getLocalForRemove(this.skipFiles, this.options.random);
	}

	async next() {
		if (this.sessionFailed >= config.maxSessionFailures) {
			utils.debug(
				`Backuper.next sessionFailed=${this.sessionFailed} ` +
					`maxSessionFailures=${config.maxSessionFailures}`,
			);
			return 'MAX_SESSION_FAILED';
		}
		const isSessionMaxed = this.sessionSize >= config.maxSessionSize;

		utils.debug(`Backuper.next sessionSize=${prettyBytes(this.sessionSize)}`);

		if (!isSessionMaxed) {
			const nextFileToAdd = await this.getNextToAdd();
			if (nextFileToAdd) {
				utils.debug(
					`Backuper.next path=${nextFileToAdd.path} remotePath=${nextFileToAdd.remotePath} ` +
						`hash=${nextFileToAdd.hash} remoteHash=${nextFileToAdd.remoteHash}`,
				);

				await this.add(nextFileToAdd);
				return NEXT;
			}
		} else {
			utils.debug(
				`Backuper.next sessionSize=${prettyBytes(this.sessionSize)} ` +
					`maxSessionSize=${prettyBytes(config.maxSessionSize)}`,
			);
		}

		const nextFileToRemove = await this.getNextToRemove();
		if (nextFileToRemove) {
			await this.remove(nextFileToRemove);
			return isSessionMaxed ? MAX_SESSION_SIZE : NEXT;
		} else if (isSessionMaxed) {
			return MAX_SESSION_SIZE;
		}

		utils.debug('Backuper.next NO_FILES_LEFT');
		return 'NO_FILES_LEFT';
	}

	async add(local, remoteFilePath, isDBFile) {
		const { hash, path: file, type } = local;

		utils.debug(`Backuper.add ${type}: ${file}`);

		if (!isDBFile) {
			this.sessionCount++;
		}

		const remoteFile = remoteFilePath || utils.remoteFilePath(file);
		let encryptedFile;

		const removeFile = filePath => {
			if (filePath) {
				utils.debug(`Removing ${filePath}`);
				fs.unlinkSync(filePath);
			}
		};

		const cleanup = () => {
			if (type === DB.TYPES.ARCHIVE) {
				removeFile(fileToEncrypt);
			}
			if (encryptedFile) {
				removeFile(encryptedFile.path);
			}
		};

		const done = async () => {
			if (isDBFile) {
				return;
			}
			// Remember the uploaded hash to compare for future runs
			// Remember the encrypted file size to decide if we can remove if needed
			await this.db.updateRemote({
				path: file,
				hash: local.hash,
				type: type,
				size: encryptedFile ? encryptedFile.size : 0,
				timestamp: Date.now(),
			});

			if (utils.DRY_RUN) {
				this.sessionSize += local.size;
			} else {
				if (encryptedFile) {
					this.sessionSize += encryptedFile.size;
				}
				Slacker.text(`Uploaded ${type}: \`${file}\` - ${prettyBytes(encryptedFile.size)}`);
			}

			cleanup();
		};

		const upload = (localFile, fileSize) => {
			return this.uploadToS3(localFile, remoteFile, fileSize, hash).then(
				() => {
					utils.debug(`Backuper.add success: ${file}`);
					return done();
				},
				err => {
					utils.log(`Backuper.add error: ${file}`);
					utils.debug(`Error: ${err}`);
					// Remember failed file to avoid trying it again in this sesssion
					this.skipFiles.push(file);
					this.sessionFailed++;
					cleanup();
				},
			);
		};

		if (utils.DRY_RUN) {
			await done();
			return;
		}

		if (isDBFile) {
			// Using fileSize 0 to force upload to S3 in STANDARD storage class
			// since we will be updating the DB file often
			await upload(file, 0);
			return;
		}

		let fileToEncrypt = file;
		if (type === DB.TYPES.ARCHIVE) {
			fileToEncrypt = await Archiver.compress(path.dirname(file));
		}

		encryptedFile = await Crypter.encrypt(fileToEncrypt);
		await upload(encryptedFile.path, encryptedFile.size);
	}

	uploadToS3(localFile, remoteFile, fileSize, hash) {
		const remoteURL = `s3://${config.s3bucket}${remoteFile}`;

		utils.debug(`Backuper.uploadToS3: ${remoteURL} - ${prettyBytes(fileSize)}`);

		// `STANDARD_IA` has a minimum object size of 128KB.
		// Smaller objects will be charged for 128KB of storage.
		const storageClass = fileSize >= 128 * 1024 ? 'STANDARD_IA' : 'STANDARD';

		const args = [
			's3',
			'cp',
			localFile,
			remoteURL,
			'--expected-size',
			String(fileSize),
			'--no-guess-mime-type',
			'--no-progress',
			'--storage-class',
			storageClass,
		];
		if (hash) {
			args.push('--metadata');
			args.push(`hash=${hash}`);
		}

		if (utils.TEST || utils.DEV) {
			utils.debug(AWS, args.join(' '));
		}

		return utils.execPromise(AWS, args, null, true);
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
			Slacker.text(`Removed: \`${file}\``);
			// Remove file from both lists
			return Promise.all([this.db.deleteLocal(file), this.db.deleteRemote(file)]);
		};

		if (canRemove) {
			this.sessionCount++;

			/* istanbul ignore if */
			if (utils.DRY_RUN) {
				return done();
			}

			return this.removeFromS3(remoteFile).then(
				() => {
					utils.debug(`Backuper.remove success: ${file}`);
					return done();
				},
				err => {
					utils.log(`Backuper.remove error: ${file}`);
					utils.debug(`Error: ${err}`);
					// Remember failed file to avoid trying it again in this sesssion
					this.skipFiles.push(file);
					this.sessionFailed++;
				},
			);
		}

		utils.debug('Backuper.remove skipping file due to storage class and timestamp');
		// Remember file to avoid trying it again in this sesssion
		this.skipFiles.push(file);
		return Promise.resolve();
	}

	removeFromS3(remoteFile) {
		const remoteURL = `s3://${config.s3bucket}${remoteFile}`;
		utils.debug(`Backuper.removeFromS3: ${remoteURL}`);

		const args = ['s3', 'rm', remoteURL];

		if (utils.TEST || utils.DEV) {
			utils.debug(AWS, args.join(' '));
		}

		return utils.execPromise(AWS, args, null, true);
	}
}

module.exports = Backuper;
