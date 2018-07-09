const path = require('path');
const sqlite = require('sqlite');

const config = require('./config');
const pkg = require('../package.json');
const utils = require('./utils');

const DELETED = utils.DELETED;
const DB_FILE = path.resolve(path.join(__dirname, '..', config.dbSQLite));
let DB_DEBUG = process.env.DB_DEBUG && (utils.DEV || utils.TEST);

const Q_TABLE_EXISTS = `
	SELECT * FROM sqlite_master
	WHERE type = 'table' AND name = ?
`;
const Q_INSERT_SETTINGS = `
	INSERT OR REPLACE INTO settings (name, value)
	VALUES (?, ?)
`;
const Q_INSERT_LOCALS = `
	INSERT OR REPLACE INTO locals (path, hash, type, size)
	VALUES (?, ?, ?, ?)
`;
const Q_INSERT_REMOTES = `
	INSERT OR REPLACE INTO remotes (path, hash, type, size, timestamp)
	VALUES (?, ?, ?, ?, ?)
`;

class DB {
	constructor(file = DB_FILE) {
		utils.debug(`Loading DB... ${file}`);
		this.file = file + (utils.DRY_RUN ? '.dry' : '');

		const dir = path.dirname(file);
		utils.mkdir(dir);

		if (utils.DRY_RUN) {
			utils.execSync('cp', [file, this.file]);
		}
	}

	async initialize() {
		this.db = await sqlite.open(this.file, {
			verbose: utils.VERBOSE,
		});
		if (DB_DEBUG) {
			this.db.on('trace', sql => {
				utils.debug('db.trace', sql);
			});
		}

		await this.initializeTables();
	}

	async initializeTables() {
		const { db } = this;

		const settingsTable = await db.get(Q_TABLE_EXISTS, 'settings');
		if (!settingsTable) {
			await db.run(`
				CREATE TABLE settings(
					name TEXT PRIMARY KEY,
					value TEXT
				)
			`);
			await db.run(Q_INSERT_SETTINGS, 'version', pkg.version);
		}

		const localsTable = await db.get(Q_TABLE_EXISTS, 'locals');
		if (!localsTable) {
			await db.run(`
				CREATE TABLE locals(
					path TEXT PRIMARY KEY,
					hash TEXT,
					type TEXT,
					size NUM
				)
			`);
		}

		const remotesTable = await db.get(Q_TABLE_EXISTS, 'remotes');
		if (!remotesTable) {
			await db.run(`
				CREATE TABLE remotes(
					path TEXT PRIMARY KEY,
					hash TEXT,
					type TEXT,
					size NUM,
					timestamp NUM
				)
			`);
		}
	}

	async getAll() {
		const reducer = (accumulator, item) => {
			accumulator[item.path] = item;
			return accumulator;
		};

		try {
			const locals = await this.db.all('SELECT * FROM locals ORDER BY path');
			const remotes = await this.db.all('SELECT * FROM remotes ORDER BY path');
			const settings = await this.db.all('SELECT * FROM settings');

			return {
				settings: settings.reduce((accumulator, current) => {
					accumulator[current.name] = current.value;
					return accumulator;
				}, {}),
				locals: locals,
				localsByPath: locals.reduce(reducer, {}),
				remotes: remotes,
				remotesByPath: remotes.reduce(reducer, {}),
			};
		} catch (err) {
			utils.debug(err);
			return {};
		}
	}

	async getSetting(name, defaultValue) {
		try {
			const result = await this.db.get('SELECT value FROM settings WHERE name=?', name);
			return result.value;
		} catch (err) {
			return defaultValue;
		}
	}

	setSetting(name, value) {
		return this.db.run(Q_INSERT_SETTINGS, name, value);
	}

	async getCounts() {
		try {
			const locals = await this.db.get('SELECT COUNT(*) AS cnt FROM locals');
			const remotes = await this.db.get('SELECT COUNT(*) AS cnt FROM remotes');

			return {
				locals: parseInt(locals.cnt, 10),
				remotes: parseInt(remotes.cnt, 10),
			};
		} catch (err) {
			utils.debug(err);
			return {};
		}
	}

	getLocalsWithPrefix(pathPrefix) {
		return this.db.all('SELECT * FROM locals WHERE instr(path, ?)=1', pathPrefix);
	}

	async getAllLocalsPaths() {
		const locals = await this.db.all('SELECT path FROM locals');
		// console.info('locals', locals);
		return locals.map(item => item.path);
	}

	async getLocalsPathsForPruning() {
		const locals = await this.db.all(`
			SELECT locals.path FROM locals
			LEFT JOIN remotes ON remotes.path=locals.path
			WHERE locals.hash='${DELETED}' AND remotes.path IS NULL
		`);
		return locals.map(item => item.path);
	}

	getLocalForBackup(skipFiles, random) {
		const whereSkipFiles =
			skipFiles && skipFiles.length ? `AND locals.path NOT IN ('${skipFiles.join('\',\'')}')` : '';
		const orderBy = random ? 'RANDOM()' : 'locals.path';
		// Where clause:
		// File is not deleted
		// (
		//   File was never uploaded
		//   OR File has a mismatch hash
		// )
		// File was not tried and skipped during this sesssion
		const query = `
			SELECT locals.*, remotes.path AS remotePath, remotes.hash AS remoteHash
			FROM locals
			LEFT JOIN remotes ON remotes.path = locals.path
			WHERE
				locals.hash != '${DELETED}'
				AND (
					remotes.path IS NULL
					OR remotes.hash != locals.hash
				)
				${whereSkipFiles}
			ORDER BY ${orderBy}
			LIMIT 1
		`;
		return this.db.get(query);
	}

	getLocalForRemove(skipFiles, random) {
		const whereSkipFiles =
			skipFiles && skipFiles.length ? `AND locals.path NOT IN ('${skipFiles.join('\',\'')}')` : '';
		const orderBy = random ? 'RANDOM()' : 'locals.path';
		// Where clause:
		// Local file was deleted
		// Remote file was previously uploaded and not deleted yet
		// File was not tried and skipped during this sesssion
		const query = `
			SELECT locals.path, remotes.size, remotes.timestamp
			FROM locals
			LEFT JOIN remotes ON remotes.path = locals.path
			WHERE
				locals.hash = '${DELETED}'
				AND remotes.path IS NOT NULL
				${whereSkipFiles}
			ORDER BY ${orderBy}
			LIMIT 1
		`;
		return this.db.get(query);
	}

	updateLocal(path, hash, size, type) {
		// prettier-ignore
		const args = typeof path === 'string'
			? {
				path: path,
				hash: hash,
				type: type || DB.TYPES.FILE,
				size: size,
			}
			: path;

		return this.db.run(Q_INSERT_LOCALS, args.path, args.hash, args.type, args.size);
	}

	deleteLocal(path) {
		return this.db.run('DELETE FROM locals WHERE path=?', path);
	}

	updateRemote(path, hash, size, timestamp, type) {
		// prettier-ignore
		const args = typeof path === 'string'
			? {
				path: path,
				hash: hash,
				type: type || DB.TYPES.FILE,
				size: size,
				timestamp: timestamp,
			}
			: path;

		return this.db.run(
			Q_INSERT_REMOTES,
			args.path,
			args.hash,
			args.type,
			args.size,
			args.timestamp,
		);
	}

	deleteRemote(path) {
		return this.db.run('DELETE FROM remotes WHERE path=?', path);
	}

	close() {
		utils.debug(`Closing DB... ${DB_FILE}`);
		this.db.close();
	}
}

/* istanbul ignore if */
if (utils.TEST) {
	DB.prototype.setAll = async function setAll(data) {
		await this.db.run('DELETE FROM settings');
		(data.settings || []).forEach(async item => await this.setSetting(item.name, item.value));

		await this.db.run('DELETE FROM locals');
		(data.locals || []).forEach(async item => await this.updateLocal(item));

		await this.db.run('DELETE FROM remotes');
		(data.remotes || []).forEach(async item => await this.updateRemote(item));
	};
}

DB.TYPES = {
	ARCHIVE: 'archive',
	FILE: 'file',
};

module.exports = DB;
