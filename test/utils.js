import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import md5File from 'md5-file';

import config from '../lib/config.js';
import { ROOT_DIR } from '../lib/root.js';
import DB, { DB_TYPES } from '../lib/DB.js';
import { DELETED, execPromise } from '../lib/utils.js';

export const DATA_DIR = path.resolve(ROOT_DIR, 'data') + path.sep;
export const AWS_LOG = `${DATA_DIR}aws.json`;
export const BIN_FILE = path.resolve(ROOT_DIR, 'bin', 'backup-to-cloud');
export const DB_FILE = path.resolve(ROOT_DIR, config.dbSQLite);
export const FIXTURES_DIR = path.resolve(ROOT_DIR, 'test', '_fixtures_') + path.sep;
export const TEMP_DIR = path.resolve(ROOT_DIR, 'tmp') + path.sep;

export { DELETED, DB_TYPES, ROOT_DIR, execPromise };

export function assertFilesEqual(fileA, fileB) {
  assert.strictEqual(md5File.sync(fileA), md5File.sync(fileB));
}

export function assertFilesNotEqual(fileA, fileB) {
  assert.notStrictEqual(md5File.sync(fileA), md5File.sync(fileB));
}

export function assertIncludes(actual, expected) {
  assert.ok(actual.includes(expected));
}

export function assertIsArray(value) {
  assert.ok(Array.isArray(value));
}

export function assertIsObject(value) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
}

export function assertLocalDeleted(db, path) {
  assert.strictEqual(db.localsByPath[path].hash, DELETED);
}

export function assertNotIncludes(actual, expected) {
  assert.ok(!actual.includes(expected));
}

export function clean(items) {
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
}

export function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to);
}

export function delay(timeout) {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
}

export function getAWSLog() {
  if (fs.existsSync(AWS_LOG)) {
    return JSON.parse(fs.readFileSync(AWS_LOG, 'utf-8'));
  }
  return [];
}

export function getDataContent() {
  if (fs.existsSync(DB_FILE)) {
    const db = new DB();
    db.initialize();
    const result = db.getAll();
    db.close();
    return result;
  }
  return {};
}

export function mockLocal(path, hash, size, type) {
  return {
    path: path,
    hash: hash || DELETED,
    type: type || DB_TYPES.FILE,
    size: size || 123,
  };
}

export function mockRemote(path, hash, size, timestamp, type) {
  return {
    path: path,
    hash: hash || 'abc',
    type: type || DB_TYPES.FILE,
    size: size || 123,
    timestamp: timestamp || 456,
  };
}

export async function run(args, command, allowFailure = false) {
  const commandArgs = command === null ? [] : [command ?? 'backup'];
  const filteredArgs = commandArgs.concat(args || []).filter((arg) => !!arg);

  try {
    return await execPromise(BIN_FILE, filteredArgs);
  } catch (err) {
    if (allowFailure) {
      return err;
    }
    throw err;
  }
}

export function setDataContent(data) {
  const db = new DB();
  db.initialize();
  db.setAll(data);
  db.close();
}
