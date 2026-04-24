import fs from 'node:fs';
import path from 'node:path';

import { assert } from 'chai';
import md5File from 'md5-file';

import config, { ROOT_DIR } from '../lib/config.js';
import DB from '../lib/DB.js';
import utils from '../lib/utils.js';

const BIN_FILES = {
  backup: path.resolve(ROOT_DIR, 'bin', 'backup-to-cloud'),
  decrypt: path.resolve(ROOT_DIR, 'bin', 'backup-decrypt'),
  restore: path.resolve(ROOT_DIR, 'bin', 'backup-restore'),
  verify: path.resolve(ROOT_DIR, 'bin', 'backup-verify'),
};
const DATA_DIR = path.resolve(ROOT_DIR, 'data') + path.sep;
const TEMP_DIR = path.resolve(ROOT_DIR, 'tmp') + path.sep;
const AWS_LOG = `${DATA_DIR}aws.json`;
const DB_FILE = path.resolve(ROOT_DIR, config.dbSQLite);
const FIXTURES_DIR = path.resolve(ROOT_DIR, 'test', '_fixtures_') + path.sep;

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
          fs.rmSync(item.replace(/\*$/, ''), {
            force: true,
            recursive: true,
          });
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

  async run(args, binFile, allowFailure = false) {
    const bin = BIN_FILES[binFile || 'backup'];
    const filteredArgs = args.filter((arg) => !!arg);

    try {
      return await utils.execPromise(bin, filteredArgs);
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

  assertLocalDeleted(db, path) {
    assert.equal(db.localsByPath[path].hash, utils.DELETED);
  },

  assertFilesEqual(fileA, fileB) {
    assert.equal(md5File.sync(fileA), md5File.sync(fileB));
  },

  assertFilesNotEqual(fileA, fileB) {
    assert.notEqual(md5File.sync(fileA), md5File.sync(fileB));
  },

  cp(from, to) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to);
  },
};
