import path from 'node:path';

import Database from 'better-sqlite3';

import config from './config.js';
import pkg from './package.js';
import { ROOT_DIR } from './root.js';
import utils from './utils.js';

const DELETED = utils.DELETED;
const DB_FILE = path.resolve(ROOT_DIR, config.dbSQLite);
const DB_DEBUG = process.env.DB_DEBUG && (utils.DEV || utils.TEST);

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

function placeholders(items) {
  return items.map(() => '?').join(', ');
}

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

  initialize() {
    this.db = new Database(this.file, {
      verbose: DB_DEBUG ? (sql) => utils.debug('db.trace', sql) : undefined,
    });

    this.initializeTables();
  }

  initializeTables() {
    const { db } = this;

    const settingsTable = db.prepare(Q_TABLE_EXISTS).get('settings');
    if (!settingsTable) {
      db.exec(`
        CREATE TABLE settings(
          name TEXT PRIMARY KEY,
          value TEXT
        )
      `);
      db.prepare(Q_INSERT_SETTINGS).run('version', pkg.version);
    }

    const localsTable = db.prepare(Q_TABLE_EXISTS).get('locals');
    if (!localsTable) {
      db.exec(`
        CREATE TABLE locals(
          path TEXT PRIMARY KEY,
          hash TEXT,
          type TEXT,
          size NUM
        )
      `);
    }

    const remotesTable = db.prepare(Q_TABLE_EXISTS).get('remotes');
    if (!remotesTable) {
      db.exec(`
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

  getAll() {
    function reducer(accumulator, item) {
      accumulator[item.path] = item;
      return accumulator;
    }

    try {
      const locals = this.db.prepare('SELECT * FROM locals ORDER BY path').all();
      const remotes = this.db.prepare('SELECT * FROM remotes ORDER BY path').all();
      const settings = this.db.prepare('SELECT * FROM settings').all();

      return {
        settings: settings.reduce((accumulator, current) => {
          const { name, value } = current;
          accumulator[name] = value;
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

  getSetting(name, defaultValue) {
    try {
      const { value } = this.db.prepare('SELECT value FROM settings WHERE name=?').get(name);
      return value;
    } catch {
      return defaultValue;
    }
  }

  setSetting(name, value) {
    return this.db.prepare(Q_INSERT_SETTINGS).run(name, value);
  }

  getCounts() {
    try {
      const { cnt: localsCount } = this.db.prepare('SELECT COUNT(*) AS cnt FROM locals').get();
      const { cnt: remotesCount } = this.db.prepare('SELECT COUNT(*) AS cnt FROM remotes').get();

      return {
        locals: parseInt(localsCount, 10),
        remotes: parseInt(remotesCount, 10),
      };
    } catch (err) {
      utils.debug(err);
      return {};
    }
  }

  getLocalsWithPrefix(pathPrefix) {
    return this.db.prepare('SELECT * FROM locals WHERE instr(path, ?)=1').all(pathPrefix);
  }

  getAllLocalsPaths() {
    const locals = this.db.prepare('SELECT path FROM locals').all();
    return locals.map((item) => item.path);
  }

  getLocalsPathsForPruning() {
    const locals = this.db
      .prepare(
        `
          SELECT locals.path FROM locals
          LEFT JOIN remotes ON remotes.path=locals.path
          WHERE locals.hash=? AND remotes.path IS NULL
        `,
      )
      .all(DELETED);
    return locals.map((item) => item.path);
  }

  getLocalForBackup(skipFiles, random) {
    const skipArgs = skipFiles && skipFiles.length ? skipFiles : [];
    const whereSkipFiles = skipArgs.length
      ? `AND locals.path NOT IN (${placeholders(skipArgs)})`
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
      SELECT locals.*, remotes.path AS remotePath, remotes.hash AS remoteHash
      FROM locals
      LEFT JOIN remotes ON remotes.path = locals.path
      WHERE
        locals.hash != ?
        AND (
          remotes.path IS NULL
          OR remotes.hash != locals.hash
        )
        ${whereSkipFiles}
      ORDER BY ${orderBy}
      LIMIT 1
    `;
    return this.db.prepare(query).get(DELETED, ...skipArgs);
  }

  getLocalForRemove(skipFiles, random) {
    const skipArgs = skipFiles && skipFiles.length ? skipFiles : [];
    const whereSkipFiles = skipArgs.length
      ? `AND locals.path NOT IN (${placeholders(skipArgs)})`
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
        locals.hash = ?
        AND remotes.path IS NOT NULL
        ${whereSkipFiles}
      ORDER BY ${orderBy}
      LIMIT 1
    `;
    return this.db.prepare(query).get(DELETED, ...skipArgs);
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

    return this.db.prepare(Q_INSERT_LOCALS).run(args.path, args.hash, args.type, args.size);
  }

  deleteLocal(path) {
    return this.db.prepare('DELETE FROM locals WHERE path=?').run(path);
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

    return this.db
      .prepare(Q_INSERT_REMOTES)
      .run(args.path, args.hash, args.type, args.size, args.timestamp);
  }

  deleteRemote(path) {
    return this.db.prepare('DELETE FROM remotes WHERE path=?').run(path);
  }

  close() {
    utils.debug(`Closing DB... ${this.file}`);
    this.db.close();
  }
}

/* istanbul ignore if */
if (utils.TEST) {
  DB.prototype.setAll = function setAll(data) {
    const { settings = [], locals = [], remotes = [] } = data;

    const clearSettings = this.db.prepare('DELETE FROM settings');
    const clearLocals = this.db.prepare('DELETE FROM locals');
    const clearRemotes = this.db.prepare('DELETE FROM remotes');

    const setAll = this.db.transaction(() => {
      clearSettings.run();
      for (const { name, value } of settings) {
        this.setSetting(name, value);
      }

      clearLocals.run();
      for (const item of locals) {
        this.updateLocal(item);
      }

      clearRemotes.run();
      for (const item of remotes) {
        this.updateRemote(item);
      }
    });

    setAll();
  };
}

DB.TYPES = {
  ARCHIVE: 'archive',
  FILE: 'file',
};

export default DB;
