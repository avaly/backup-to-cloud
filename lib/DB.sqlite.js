const path = require('path');
const sqlite3 = require('better-sqlite3');

const config = require('./config');
const pkg = require('../package.json');
const utils = require('./utils');

const DELETED = utils.DELETED;
const DB_FILE = path.resolve(path.join(__dirname, '..', config.dbSQLite));
const DB_DEBUG = process.env.DB_DEBUG && (utils.DEV || utils.TEST);

const Q_INSERT_SETTINGS = `
	INSERT OR REPLACE INTO settings (name, value)
	VALUES (@name, @value)
`;
const Q_INSERT_LOCALS = `
	INSERT OR REPLACE INTO locals (path, hash, type, size)
	VALUES (@path, @hash, @type, @size)
`;
const Q_INSERT_REMOTES = `
	INSERT OR REPLACE INTO remotes (path, hash, type, size, timestamp)
	VALUES (@path, @hash, @type, @size, @timestamp)
`;

class DB {
	constructor(dbFile = DB_FILE) {
		utils.debug(`Loading DB... ${dbFile}`);
		this.file = dbFile;

		const file = dbFile + (utils.DRY_RUN ? '.dry' : '');
		if (!utils.DRY_RUN) {
			const dir = path.dirname(file);
			utils.mkdir(dir);
		}

		this.db = new sqlite3(file, {
			memory: utils.DRY_RUN
		});

		this.initializeTables();
		if (utils.DRY_RUN) {
			this.initializeFromFile();
		}
	}

	initializeTables() {
		const db = this.db;

		try {
			db.prepare('PRAGMA table_info(settings)').get();
		}
		catch (err) {
			db.prepare(`
				CREATE TABLE settings(
					name TEXT PRIMARY KEY,
					value TEXT
				)
			`).run();
			db.prepare(Q_INSERT_SETTINGS).run({
				name: 'version',
				value: pkg.version
			});
		}

		try {
			db.prepare('PRAGMA table_info(locals)').get();
		}
		catch (err) {
			db.prepare(`
				CREATE TABLE locals(
					path TEXT PRIMARY KEY,
					hash TEXT,
					type TEXT,
					size NUM
				)
			`).run();
		}

		try {
			db.prepare('PRAGMA table_info(remotes)').get();
		}
		catch (err) {
			db.prepare(`
				CREATE TABLE remotes(
					path TEXT PRIMARY KEY,
					hash TEXT,
					type TEXT,
					size NUM,
					timestamp NUM
				)
			`).run();
		}
	}

	initializeFromFile() {
		/* istanbul ignore if */
		if (!utils.DRY_RUN) {
			return;
		}

		const db = new sqlite3(this.file);

		try {
			db.prepare('SELECT * FROM settings').all().map((setting) => {
				this.setSetting(setting.name, setting.value);
			});
			db.prepare('SELECT * FROM locals').all().map((local) => {
				this.updateLocal(local.path, local.hash, local.size);
			});
			db.prepare('SELECT * FROM remotes').all().map((remote) => {
				this.updateRemote(
					remote.path,
					remote.hash,
					remote.size,
					remote.timestamp
				);
			});
		}
		catch (err) {
			utils.debug(err);
		}

		db.close();
	}

	getAll() {
		const reducer = (accumulator, item) => {
			accumulator[item.path] = item;
			return accumulator;
		};

		try {
			const locals = this.db
				.prepare('SELECT * FROM locals ORDER BY path')
				.all();
			const remotes = this.db
				.prepare('SELECT * FROM remotes ORDER BY path')
				.all();

			return {
				settings: this.db
					.prepare('SELECT * FROM settings')
					.all()
					.reduce((accumulator, current) => {
						accumulator[current.name] = current.value;
						return accumulator;
					}, {}),
				locals: locals,
				localsByPath: locals.reduce(reducer, {}),
				remotes: remotes,
				remotesByPath: remotes.reduce(reducer, {})
			};
		}
		catch (err) {
			utils.debug(err);
			return {};
		}
	}

	getSetting(name, defaultValue) {
		try {
			const result = this.db
				.prepare('SELECT value FROM settings WHERE name=?')
				.get(name);
			return result.value;
		}
		catch (err) {
			return defaultValue;
		}
	}

	setSetting(name, value) {
		this.db.prepare(Q_INSERT_SETTINGS).run({
			name: name,
			value: value
		});
	}

	getCounts() {
		try {
			return {
				locals: parseInt(
					this.db.prepare('SELECT COUNT(*) AS cnt FROM locals').get().cnt,
					10
				),
				remotes: parseInt(
					this.db.prepare('SELECT COUNT(*) AS cnt FROM remotes').get().cnt,
					10
				)
			};
		}
		catch (err) {
			utils.debug(err);
			return {};
		}
	}

	getLocalsWithPrefix(pathPrefix) {
		return this.db.prepare(
			'SELECT * FROM locals WHERE instr(path, ?)=1'
		).all(pathPrefix);
	}

	getAllLocalsPaths() {
		return this.db.prepare(
			'SELECT path FROM locals'
		).all().map(item => item.path);
	}

	getLocalsPathsForPruning() {
		return this.db.prepare(`
			SELECT locals.path FROM locals
			LEFT JOIN remotes ON remotes.path=locals.path
			WHERE locals.hash='${DELETED}' AND remotes.path IS NULL
		`).all().map(item => item.path);
	}

	getLocalForBackup(skipFiles, random) {
		const whereSkipFiles = skipFiles && skipFiles.length
			? `AND locals.path NOT IN ('${skipFiles.join('\',\'')}')`
			: '';
		const orderBy = random ? 'RANDOM()' : 'locals.path';
		// Where clause:
		// File is not deleted
		// (
		//   File was never uploaded
		//   OR File has a mismatch hash
		// )
		// File was not tried and skipped during this sesssion
		const query = `
			SELECT locals.path, locals.hash, locals.type
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
		/* istanbul ignore if */
		if (DB_DEBUG) {
			utils.debug('db.getLocalForBackup', query);
		}
		return this.db.prepare(query).get();
	}

	getLocalForRemove(skipFiles, random) {
		const whereSkipFiles = skipFiles && skipFiles.length
			? `AND locals.path NOT IN ('${skipFiles.join('\',\'')}')`
			: '';
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
		/* istanbul ignore if */
		if (DB_DEBUG) {
			utils.debug('db.getLocalForRemove', query);
		}
		return this.db.prepare(query).get();
	}

	updateLocal(path, hash, size, type) {
		const args = typeof path === 'string'
			? {
				path: path,
				hash: hash,
				type: type || DB.TYPES.FILE,
				size: size
			}
			: path;

		/* istanbul ignore if */
		if (DB_DEBUG) {
			utils.debug('db.updateLocal', args);
		}
		this.db.prepare(Q_INSERT_LOCALS).run(args);
	}

	deleteLocal(path) {
		/* istanbul ignore if */
		if (DB_DEBUG) {
			utils.debug('db.deleteLocal', path);
		}
		this.db.prepare(
			'DELETE FROM locals WHERE path=?'
		).run(path);
	}

	updateRemote(path, hash, size, timestamp, type) {
		const args = typeof path === 'string'
			? {
				path: path,
				hash: hash,
				type: type || DB.TYPES.FILE,
				size: size,
				timestamp: timestamp
			}
			: path;

		/* istanbul ignore if */
		if (DB_DEBUG) {
			utils.debug('db.updateRemote', args);
		}
		this.db.prepare(Q_INSERT_REMOTES).run(args);
	}

	deleteRemote(path) {
		/* istanbul ignore if */
		if (DB_DEBUG) {
			utils.debug('db.deleteRemote', path);
		}
		this.db.prepare(
			'DELETE FROM remotes WHERE path=?'
		).run(path);
	}

	close() {
		utils.debug(`Closing DB... ${DB_FILE}`);
		this.db.close();
	}
}

/* istanbul ignore if */
if (utils.TEST) {
	DB.prototype.setAll = function setAll(data) {
		this.db.prepare('DELETE FROM settings').run();
		(data.settings || []).forEach(
			(item) => this.db.prepare(Q_INSERT_SETTINGS).run(item)
		);
		this.db.prepare('DELETE FROM locals').run();
		(data.locals || []).forEach(
			(item) => this.db.prepare(Q_INSERT_LOCALS).run(item)
		);
		this.db.prepare('DELETE FROM remotes').run();
		(data.remotes || []).forEach(
			(item) => this.db.prepare(Q_INSERT_REMOTES).run(item)
		);
	};
}

DB.TYPES = {
	ARCHIVE: 'archive',
	FILE: 'file'
};

module.exports = DB;
