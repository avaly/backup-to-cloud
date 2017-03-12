const fs = require('fs');

const config = require('./config');
const utils = require('./utils');

const DELETED = 'DELETED';
const PROGRESS_LOG = 1000;

class Scanner {
	constructor(db) {
		this.db = db;
	}

	scan() {
		const lastTime = this.db.get('lastScanTimestamp', 0);
		if (lastTime && lastTime + config.scanInterval > Date.now()) {
			utils.debug('A scan was performed too recently. Skipping rescan!');
			return;
		}

		utils.log('Scanning sources for new files...');
		config.sources.forEach(this.scanSource.bind(this));

		this.scanDeletedSources();
		this.pruneDeletedFiles();

		this.db.set('lastScanTimestamp', Date.now());
	}

	scanSource(source) {
		const prefix = `Source: ${source} - `;
		utils.log(prefix.substr(0, prefix.length - 3));

		const output = utils.execSync('find', [source, '-type', 'f']);
		/* istanbul ignore if */
		if (!output) {
			utils.debug(`${prefix}No files found!`);
			return;
		}

		const files = output.split('\n').filter(
			(file) => {
				if (!file || !file.length) {
					return false;
				}
				const hasIgnore = config.ignorePatterns.find(
					(ignore) => file.indexOf(ignore) !== -1
				);
				return !hasIgnore;
			}
		);
		const count = files.length;
		utils.debug(`${prefix}Files found: ${count}`);

		const all = this.db.get('all', {});

		// Mark deleted files
		let deleted = 0;
		Object.keys(all).forEach((file) => {
			if (
				// Search only through files in this source
				file.indexOf(source) === 0 &&
				// Find files which are no longer present
				files.indexOf(file) === -1 &&
				// But which haven't been yet marked as deleted
				all[file] !== DELETED
			) {
				all[file] = DELETED;
				deleted++;
			}
		});
		if (deleted > 0) {
			utils.debug(`${prefix}Deleted files: ${deleted}`);
		}

		// Record new files / Updated existing files hashes
		files.forEach((file, index) => {
			if (!file) {
				return;
			}
			/* istanbul ignore if */
			if ((index % PROGRESS_LOG) === PROGRESS_LOG - 1) {
				utils.debug(`${prefix}Scanning files ${index + 1}/${count}...`);
			}
			const stat = fs.statSync(file);
			const hash = utils.hash(
				file + ' ' + stat.size + ' ' + stat.mtime.getTime()
			);
			all[file] = [hash, stat.size];
		});
	}

	scanDeletedSources() {
		const all = this.db.get('all', {});
		let deleted = 0;

		Object.keys(all).forEach((file) => {
			const source = config.sources.find(
				(source) => file.indexOf(source) === 0
			);
			if (!source) {
				all[file] = DELETED;
				deleted++;
			}
		});

		if (deleted > 0) {
			utils.debug(`Deleting files from unkown sources: ${deleted}`);
		}
	}

	pruneDeletedFiles() {
		const all = this.db.get('all', {});
		const synced = this.db.get('synced', {});
		const allFiles = Object.keys(all);
		const syncedFiles = Object.keys(synced);

		// prune all locally deleted files which have not been synced yet
		allFiles.forEach((file) => {
			if (all[file] === DELETED && syncedFiles.indexOf(file) === -1) {
				delete all[file];
			}
		});
	}
}

module.exports = Scanner;
