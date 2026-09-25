import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import DB, { DB_TYPES } from '../lib/DB.js';
import { DELETED, initializeProcess } from '../lib/utils.js';

function getTempDbFile() {
  return path.join(os.tmpdir(), `backup-to-cloud-db-test-${process.pid}-${Date.now()}.sqlite`);
}

describe('DB', { concurrency: false }, () => {
  let file;

  beforeEach(() => {
    initializeProcess({ dryRun: false });
    file = getTempDbFile();
  });

  afterEach(() => {
    initializeProcess({ dryRun: false });
    fs.rmSync(file, { force: true });
    fs.rmSync(file + '.dry', { force: true });
  });

  test('initializes tables and version setting', () => {
    const db = new DB(file);
    db.initialize();

    assert.strictEqual(db.getSetting('missing', 'fallback'), 'fallback');

    const all = db.getAll();
    assert.strictEqual(typeof all.settings.version, 'string');
    assert.deepStrictEqual(all.locals, []);
    assert.deepStrictEqual(all.remotes, []);

    db.close();
  });

  test('stores and queries locals and remotes', () => {
    const db = new DB(file);
    db.initialize();

    db.updateLocal('/bar/c.txt', 'hash-c', 789, DB_TYPES.ARCHIVE);
    db.updateLocal('/foo/a.txt', 'hash-a', 123);
    db.updateLocal('/foo/b.txt', DELETED, 456, DB_TYPES.ARCHIVE);
    db.updateLocal('/foo/d.txt', DELETED, 999);
    db.updateRemote('/foo/a.txt', 'hash-a', 123, 1000);
    db.updateRemote('/foo/b.txt', 'hash-b', 456, 1500, DB_TYPES.ARCHIVE);
    db.updateRemote('/bar/c.txt', 'hash-old', 789, 2000, DB_TYPES.ARCHIVE);

    assert.deepStrictEqual(db.getCounts(), { locals: 4, remotes: 3 });
    assert.deepStrictEqual(db.getAllLocalsPaths(), [
      '/bar/c.txt',
      '/foo/a.txt',
      '/foo/b.txt',
      '/foo/d.txt',
    ]);
    assert.deepStrictEqual(db.getLocalsPathsForPruning(), ['/foo/d.txt']);
    assert.deepStrictEqual(
      db.getLocalsWithPrefix('/foo').map((item) => item.path),
      ['/foo/a.txt', '/foo/b.txt', '/foo/d.txt'],
    );

    assert.deepStrictEqual(
      { ...db.getLocalForBackup([], false) },
      {
        path: '/bar/c.txt',
        hash: 'hash-c',
        remoteHash: 'hash-old',
        remotePath: '/bar/c.txt',
        size: 789,
        type: 'archive',
      },
    );

    assert.deepStrictEqual(
      { ...db.getLocalForRemove([], false) },
      {
        path: '/foo/b.txt',
        size: 456,
        timestamp: 1500,
      },
    );

    db.close();
  });

  test('supports positional bindings in dynamic NOT IN clauses', () => {
    const db = new DB(file);
    db.initialize();

    db.updateLocal('/a.txt', 'hash-a', 1);
    db.updateLocal('/b.txt', 'hash-b', 2);

    assert.strictEqual(db.getLocalForBackup(['/a.txt'], false).path, '/b.txt');

    db.close();
  });

  test('reopens existing DB files', () => {
    let db = new DB(file);
    db.initialize();
    db.setSetting('persisted', 'yes');
    db.updateLocal('/keep.txt', 'hash-keep', 5);
    db.close();

    db = new DB(file);
    db.initialize();

    assert.strictEqual(db.getSetting('persisted'), 'yes');
    assert.strictEqual(db.getAll().localsByPath['/keep.txt'].size, 5);

    db.close();
  });

  test('uses dry copy without mutating original DB', () => {
    let db = new DB(file);
    db.initialize();
    db.setSetting('mode', 'original');
    db.close();

    initializeProcess({ dryRun: true });

    db = new DB(file);
    db.initialize();
    assert.strictEqual(db.file, file + '.dry');
    assert.strictEqual(db.getSetting('mode'), 'original');
    db.setSetting('mode', 'dry');
    db.close();

    initializeProcess({ dryRun: false });

    db = new DB(file);
    db.initialize();
    assert.strictEqual(db.getSetting('mode'), 'original');
    db.close();
  });

  test('rolls back setAll on failure', () => {
    const db = new DB(file);
    db.initialize();
    db.setSetting('before', '1');
    db.updateLocal('/before.txt', 'hash-before', 1);

    const originalUpdateRemote = db.updateRemote;
    db.updateRemote = function failingUpdateRemote() {
      throw new Error('boom');
    };

    assert.throws(
      () =>
        db.setAll({
          settings: [{ name: 'after', value: '2' }],
          locals: [{ path: '/after.txt', hash: 'hash-after', size: 2, type: DB_TYPES.FILE }],
          remotes: [{ path: '/after.txt', hash: 'hash-after', size: 2, timestamp: 3 }],
        }),
      /boom/,
    );

    db.updateRemote = originalUpdateRemote;

    const all = db.getAll();
    assert.strictEqual(all.settings.before, '1');
    assert.strictEqual(all.settings.after, undefined);
    assert.strictEqual(all.localsByPath['/before.txt'].hash, 'hash-before');
    assert.strictEqual(all.localsByPath['/after.txt'], undefined);

    db.close();
  });
});
