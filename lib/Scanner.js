const fs = require('fs');
const path = require('path');

const DB = require('./DB.sqlite');
const config = require('./config');
const utils = require('./utils');

const DELETED = utils.DELETED;
const PROGRESS_LOG_FILES = 1000;
const PROGRESS_LOG_ARCHIVES = 10;

function hasIgnore(file) {
	return config.ignorePatterns.find(pattern => file.indexOf(pattern) !== -1);
}

function hasCompressLeaves(file) {
	return config.compressLeavesPatterns.find(pattern => file.indexOf(pattern) !== -1);
}
function archiveFor(file) {
	const dir = path.dirname(file);
	return dir + path.sep + path.basename(dir) + '.tar';
}
function scanFile(file) {
	const stat = fs.statSync(file);
	return {
		hash: file + ' ' + stat.size + ' ' + stat.mtime.getTime(),
		size: stat.size,
	};
}

class Scanner {
	constructor(db) {
		this.db = db;
	}

	async scan() {
		const lastScanTimestamp = await this.db.getSetting('lastScanTimestamp', 0);
		const lastTime = parseInt(lastScanTimestamp, 10);
		if (lastTime && lastTime + config.scanInterval > Date.now()) {
			utils.debug('A scan was performed too recently. Skipping rescan!');
			return;
		}

		utils.log('Scanning sources for new files...');

		await config.sources.reduce((chain, source) => {
			return chain.then(() => this.scanSource(source));
		}, Promise.resolve());

		await this.scanDeletedSources();
		await this.pruneDeletedFiles();

		await this.db.setSetting('lastScanTimestamp', String(Date.now()));
	}

	async scanSource(source) {
		const prefix = `Source: ${source} - `;
		utils.log(prefix.substr(0, prefix.length - 3));

		const lines = Scanner.findFiles(source);
		/* istanbul ignore if */
		if (!lines.length) {
			utils.debug(`${prefix}No files found!`);
			return;
		}

		const files = lines.filter(file => !hasCompressLeaves(file));

		const archivesFiles = {};
		lines.filter(file => hasCompressLeaves(file)).forEach(file => {
			const archive = archiveFor(file);
			if (!archivesFiles[archive]) {
				archivesFiles[archive] = [];
			}
			archivesFiles[archive].push(file);
		});
		const archives = Object.keys(archivesFiles);

		utils.debug(`${prefix}Files found: ${files.length}`);
		utils.debug(`${prefix}Archives found: ${archives.length}`);

		const locals = await this.db.getLocalsWithPrefix(source);

		// Mark deleted files
		let deleted = 0;
		locals.forEach(async item => {
			const file = item.path;
			if (
				// Search only through files in this source
				file.indexOf(source) === 0 &&
				// Find files which are no longer present
				(files.indexOf(file) === -1 && archives.indexOf(file) === -1) &&
				// But which haven't been yet marked as deleted
				item.hash !== DELETED
			) {
				item.hash = DELETED;
				await this.db.updateLocal(item);
				deleted++;
			}
		});
		if (deleted > 0) {
			utils.debug(`${prefix}Deleted files: ${deleted}`);
		}

		// Record new files / Update existing files hashes
		files.forEach(async (file, index) => {
			if (!file) {
				return;
			}
			/* istanbul ignore if */
			if (index % PROGRESS_LOG_FILES === PROGRESS_LOG_FILES - 1) {
				utils.debug(`${prefix}Scanning files ${index + 1}/${files.length}...`);
			}
			const scan = scanFile(file);
			const hash = utils.hash(scan.hash);

			await this.db.updateLocal(file, hash, scan.size, DB.TYPES.FILE);
		});

		// Record new archives / Update existing archives hashes
		archives.forEach(async (archive, index) => {
			/* istanbul ignore if */
			if (index % PROGRESS_LOG_ARCHIVES === PROGRESS_LOG_ARCHIVES - 1) {
				utils.debug(`${prefix}Scanning archives ${index + 1}/${archives.length}...`);
			}
			let size = 0;
			const hashes = archivesFiles[archive].map(scanFile).map(scan => {
				size += scan.size;
				return utils.hash(scan.hash);
			});
			const hash = utils.hash(hashes.join('-'));

			await this.db.updateLocal(archive, hash, size, DB.TYPES.ARCHIVE);
		});
	}

	async scanDeletedSources() {
		const locals = await this.db.getAllLocalsPaths();
		let deleted = 0;

		locals.forEach(async file => {
			// TODO: figure why file is null
			if (!file) {
				return;
			}
			const source = config.sources.find(source => file.indexOf(source) === 0);
			if (!source) {
				await this.db.updateLocal(file, DELETED, 0);
				deleted++;
			}
		});

		if (deleted > 0) {
			utils.debug(`Deleting files from unkown sources: ${deleted}`);
		}
	}

	async pruneDeletedFiles() {
		const locals = await this.db.getLocalsPathsForPruning();

		if (locals.length) {
			utils.debug(`Pruning deleted files from DB: ${locals.length}`);
		}

		locals.forEach(async path => {
			await this.db.deleteLocal(path);
		});
	}
}

Scanner.findFiles = dir => {
	const output = utils.execSync('find', [dir, '-type', 'f'], false);
	const files = output
		.split('\n')
		.filter(file => file && file.length)
		.filter(file => !hasIgnore(file));
	files.sort();
	return files;
};

module.exports = Scanner;
