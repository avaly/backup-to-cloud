const path = require('path');

const DB = require('../lib/DB.sqlite');
const config = require('./config');
const utils = require('./utils');

const AWS = config.aws;

class Verifier {
	async start(awsLSMock) {
		this.db = new DB();
		await this.db.initialize();

		const all = await this.db.getAll();
		this.remotes = all.remotesByPath;

		utils.log('Verifier.start');

		return this.fetchRemotesList(awsLSMock)
			.then(this.compareLists.bind(this))
			.then(this.removeFromDB.bind(this))
			.then(this.stop.bind(this));
	}

	async stop() {
		this.db.close();
	}

	fetchRemotesList(awsLSMock) {
		const remoteURL = `s3://${config.s3bucket}/`;
		utils.debug(`Verifier.fetchRemotesList: ${remoteURL}`);

		const args = ['s3', 'ls', '--recursive', remoteURL].concat(utils.TEST ? [awsLSMock] : []);

		if (utils.TEST || utils.DEV) {
			utils.debug(AWS, args.join(' '));
		}

		return utils.execPromise(AWS, args).then(output => {
			const dbFileName = path.basename(config.dbSQLite);

			return output
				.split('\n')
				.map(line => {
					const match = line.match(/^[\d-]{10} [\d:]{8}\s+\d+\s+(.+)$/);
					if (match && match[1]) {
						return match[1];
					}
				})
				.filter(file => !!file && file !== dbFileName);
		});
	}

	compareLists(remoteFiles) {
		const prefixes = [''].concat(config.prefixRemove);

		this.extraRemoteFiles = remoteFiles.filter(remoteRelative => {
			const remoteKey = '/' + remoteRelative;

			const found = prefixes.some(prefix => {
				const fullKey = prefix + remoteKey;
				if (this.remotes[fullKey]) {
					delete this.remotes[fullKey];
					return true;
				}
				return false;
			});

			return !found;
		});

		if (this.extraRemoteFiles.length) {
			utils.log(`Found ${this.extraRemoteFiles.length} remote file(s) not in the DB:`);
			this.extraRemoteFiles.forEach(file => utils.log('/' + file));
		} else {
			utils.log('All remote files are present in the DB!');
		}

		const extraDBFiles = Object.keys(this.remotes);
		if (extraDBFiles.length) {
			utils.log(`Found ${extraDBFiles.length} DB file(s) not present remotely:`);
			extraDBFiles.forEach(file => utils.log(file));
		} else {
			utils.log('All DB files are present remotely!');
		}
	}

	removeFromDB() {
		if (utils.DRY) {
			return;
		}

		const extraDBFiles = Object.keys(this.remotes);

		extraDBFiles.forEach(async file => {
			await this.db.deleteRemote(file);
		});
	}
}

module.exports = Verifier;
