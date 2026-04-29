import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import md5File from 'md5-file';

import config from '../lib/config.js';
import { ROOT_DIR } from '../lib/root.js';
import DB from '../lib/DB.js';
import utils from '../lib/utils.js';

const BIN_FILE = path.resolve(ROOT_DIR, 'bin', 'backup-to-cloud');
const DATA_DIR = path.resolve(ROOT_DIR, 'data') + path.sep;
const TEMP_DIR = path.resolve(ROOT_DIR, 'tmp') + path.sep;
const AWS_LOG = `${DATA_DIR}aws.json`;
const DB_FILE = path.resolve(ROOT_DIR, config.dbSQLite);
const FIXTURES_DIR = path.resolve(ROOT_DIR, 'test', '_fixtures_') + path.sep;

export function assertIncludes(actual, expected) {
  assert.ok(actual.includes(expected));
}

export function assertNotIncludes(actual, expected) {
  assert.ok(!actual.includes(expected));
}

export function assertIsArray(value) {
  assert.ok(Array.isArray(value));
}

export function assertIsObject(value) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
}

export function assertLocalDeleted(db, path) {
  assert.strictEqual(db.localsByPath[path].hash, utils.DELETED);
}

export function assertFilesEqual(fileA, fileB) {
  assert.strictEqual(md5File.sync(fileA), md5File.sync(fileB));
}

export function assertFilesNotEqual(fileA, fileB) {
  assert.notStrictEqual(md5File.sync(fileA), md5File.sync(fileB));
}

export default {
  AWS_LOG,
  DATA_DIR,
  DB_FILE,
  DB_TYPES: DB.TYPES,
  DELETED: utils.DELETED,
  FIXTURES_DIR,
  ROOT_DIR,
  TEMP_DIR,

  execPromise: utils.execPromise,

  clean(items) {
    if (fs.existsSync(AWS_LOG)) {
      fs.unlinkSync(AWS_LOG);
    }
    if (fs.existsSync(DB_FILE)) {
      fs.unlinkSync(DB_FILE);
    }
    if (items && Array.isArray(items)) {
      for (const item of items) {
        if (item !== '*' && item !== '**' && item !== '/') {
          if (/\*+$/.test(item)) {
            const basePath = item.replace(/\*+$/, '');
            if (fs.existsSync(basePath)) {
              for (const child of fs.readdirSync(basePath)) {
                fs.rmSync(path.join(basePath, child), {
                  force: true,
                  recursive: true,
                });
              }
            }
          } else {
            fs.rmSync(item, {
              force: true,
              recursive: true,
            });
          }
        }
      }
    }
  },

  getAWSLog() {
    if (fs.existsSync(AWS_LOG)) {
      return JSON.parse(fs.readFileSync(AWS_LOG, 'utf-8'));
    }
    return [];
  },

  getDataContent() {
    if (fs.existsSync(DB_FILE)) {
      const db = new DB();
      db.initialize();
      const result = db.getAll();
      db.close();
      return result;
    }
    return {};
  },

  setDataContent(data) {
    const db = new DB();
    db.initialize();
    db.setAll(data);
    db.close();
  },

  async run(args, command, allowFailure = false) {
    const filteredArgs = [command || 'backup'].concat(args || []).filter((arg) => !!arg);

    try {
      return await utils.execPromise(BIN_FILE, filteredArgs);
    } catch (err) {
      if (allowFailure) {
        return err;
      }
      throw err;
    }
  },

  delay(timeout) {
    return new Promise((resolve) => {
      setTimeout(resolve, timeout);
    });
  },

  mockLocal(path, hash, size, type) {
    return {
      path: path,
      hash: hash || utils.DELETED,
      type: type || DB.TYPES.FILE,
      size: size || 123,
    };
  },

  mockRemote(path, hash, size, timestamp, type) {
    return {
      path: path,
      hash: hash || 'abc',
      type: type || DB.TYPES.FILE,
      size: size || 123,
      timestamp: timestamp || 456,
    };
  },

  cp(from, to) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to);
  },
};
