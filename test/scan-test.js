import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, it } from 'node:test';

import assert from 'node:assert/strict';

import Scanner from '../lib/Scanner.js';
import {
  assertIncludes,
  assertIsObject,
  assertLocalDeleted,
  clean,
  DB_FILE,
  DB_TYPES,
  delay,
  DELETED,
  execPromise,
  FIXTURES_DIR,
  getDataContent,
  mockLocal,
  mockRemote,
  run,
  setDataContent,
} from './utils.js';

function scan(dry) {
  return run(['--verbose', dry && '--dry'], 'scan');
}

describe('scan', { concurrency: false }, () => {
  beforeEach(() => {
    clean();
  });

  it('shows scan help', async () => {
    const result = await run(['--help'], 'scan');

    assert.match(result, /Usage:/);
    assert.match(result, /Scan sources and update the local DB/);
    assert.strictEqual(fs.existsSync(DB_FILE), false, 'db file was not created');
  });

  it('prepares file hash', () => {
    const file = Scanner.scanFile(`${FIXTURES_DIR}bar/1-small.txt`);

    assert.match(file.hash, /^\/bar\/1-small\.txt 1024 \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    assert.strictEqual(file.size, 1024);
  });

  it('saves nothing for dry mode', async () => {
    const output = await scan(true);

    assertIncludes(output, 'This is a DRY run!');
    assertIncludes(output, '/bar - Files found: 3');
    assertIncludes(output, '/bar - Archives found: 0');
    assertIncludes(output, '/foo - Files found: 4');
    assertIncludes(output, '/foo - Archives found: 0');
    assertIncludes(output, '/ham - Files found: 0');
    assertIncludes(output, '/ham - Archives found: 2');
    assertIncludes(output, '/empty - Files found: 0');
    assertIncludes(output, '/empty - Archives found: 0');
    assert.strictEqual(fs.existsSync(DB_FILE), false, 'db file was not created');
  });

  it('scans all files for first time', async () => {
    await scan();

    const db = getDataContent();

    assert.match(db.settings.lastScanTimestamp, /^\d+$/);
    assert.strictEqual(db.locals.length, 9);

    // File sizes
    assert.strictEqual(db.localsByPath[`${FIXTURES_DIR}foo/1-fail.dat`].size, 1024);
    assert.strictEqual(db.localsByPath[`${FIXTURES_DIR}foo/2 '"$@%&\`medium.dat`].size, 102400);
    assert.strictEqual(db.localsByPath[`${FIXTURES_DIR}foo/3-fail.dat`].size, 204800);

    assertIsObject(db.localsByPath[`${FIXTURES_DIR}bar/1-small.txt`]);
    // The hashes depend on the file modified time
    // so we can't rely on these for tests
    assert.strictEqual(typeof db.localsByPath[`${FIXTURES_DIR}bar/1-small.txt`].hash, 'string');
    assert.strictEqual(db.localsByPath[`${FIXTURES_DIR}bar/1-small.txt`].hash.length, 64);
    assertIsObject(db.localsByPath[`${FIXTURES_DIR}bar/2-medium.txt`]);
    assertIsObject(db.localsByPath[`${FIXTURES_DIR}bar/3-large.txt`]);

    assertIsObject(db.localsByPath[`${FIXTURES_DIR}ham/first/first.tar`]);
    // 2 files @ 1024 bytes
    assert.strictEqual(db.localsByPath[`${FIXTURES_DIR}ham/first/first.tar`].size, 2048);
    assertIsObject(db.localsByPath[`${FIXTURES_DIR}ham/first/second/second.tar`]);
    // 2 files @ 1024 bytes
    assert.strictEqual(db.localsByPath[`${FIXTURES_DIR}ham/first/second/second.tar`].size, 2048);

    // Ignored files
    assert.strictEqual(db.localsByPath[`${FIXTURES_DIR}bar/.svn/info`], undefined);
    assert.strictEqual(db.localsByPath[`${FIXTURES_DIR}bar/Thumbs.db`], undefined);
    assert.strictEqual(db.localsByPath[`${FIXTURES_DIR}foo/.DS_Store`], undefined);
    assert.strictEqual(
      db.localsByPath[`${FIXTURES_DIR}foo/node_modules/blah/package.json`],
      undefined,
    );
  });

  it('scans again only after interval', async () => {
    await scan();

    const db1 = getDataContent();

    assert.match(db1.settings.lastScanTimestamp, /^\d+$/);
    const timestamp = db1.settings.lastScanTimestamp;

    // This run should not execute since it's within the scan interval (1s)
    await scan();

    const db2 = getDataContent();

    assert.strictEqual(db2.settings.lastScanTimestamp, timestamp);

    await delay(1001);

    // This new run should execute the scan again
    await scan();

    const db3 = getDataContent();

    assert.notStrictEqual(db3.settings.lastScanTimestamp, timestamp);
  });

  it('marks deleted files', async () => {
    setDataContent({
      locals: [
        mockLocal(`${FIXTURES_DIR}foo/old.txt`),
        mockLocal(`${FIXTURES_DIR}old/from-old-source.txt`),
        mockLocal(`${FIXTURES_DIR}ham/third/third.tar`, DELETED, 123, DB_TYPES.ARCHIVE),
      ],
      remotes: [
        mockRemote(`${FIXTURES_DIR}bar/1-small.txt`),
        mockRemote(`${FIXTURES_DIR}foo/old.txt`),
        mockRemote(`${FIXTURES_DIR}old/from-old-source.txt`),
        mockRemote(`${FIXTURES_DIR}ham/third/third.tar`, 'abc', 123, 456, DB_TYPES.ARCHIVE),
      ],
    });

    await scan();

    const db = getDataContent();

    assert.strictEqual(db.locals.length, 12);

    assertLocalDeleted(db, `${FIXTURES_DIR}foo/old.txt`);
    assertLocalDeleted(db, `${FIXTURES_DIR}old/from-old-source.txt`);
    assertLocalDeleted(db, `${FIXTURES_DIR}ham/third/third.tar`);

    assertIsObject(db.localsByPath[`${FIXTURES_DIR}bar/1-small.txt`]);

    await execPromise('mv', [`${FIXTURES_DIR}bar/1-small.txt`, `${FIXTURES_DIR}../`]);
    await delay(1001);

    await scan();

    const db2 = getDataContent();

    assertLocalDeleted(db2, `${FIXTURES_DIR}bar/1-small.txt`);

    await execPromise('mv', [`${FIXTURES_DIR}../1-small.txt`, `${FIXTURES_DIR}bar/1-small.txt`]);
  });

  it('marks deleted files when source becomes empty', async () => {
    const files = ['1-small.txt', '2-medium.txt', '3-large.txt'];

    setDataContent({
      locals: files.map((file) => mockLocal(`${FIXTURES_DIR}empty/${file}`, 'abc')),
      remotes: files.map((file) => mockRemote(`${FIXTURES_DIR}empty/${file}`)),
    });

    await scan();

    const db = getDataContent();

    assertLocalDeleted(db, `${FIXTURES_DIR}empty/1-small.txt`);
    assertLocalDeleted(db, `${FIXTURES_DIR}empty/2-medium.txt`);
    assertLocalDeleted(db, `${FIXTURES_DIR}empty/3-large.txt`);
  });

  it('removes deleted files which have not been synced yet', async () => {
    setDataContent({
      locals: [
        mockLocal(`${FIXTURES_DIR}foo/old.txt`),
        mockLocal(`${FIXTURES_DIR}ham/fourth/fourth.tar`, DELETED, 123, DB_TYPES.ARCHIVE),
      ],
      remotes: [],
    });

    await scan();

    const db = getDataContent();

    assert.strictEqual(db.locals.length, 9);
    assert.strictEqual(db.localsByPath[`${FIXTURES_DIR}foo/old.txt`], undefined);
    assert.strictEqual(db.localsByPath[`${FIXTURES_DIR}ham/fourth/fourth.tar`], undefined);
  });

  it('throws error when source is invalid', async () => {
    let previousEnv = process.env.BACKUP_ENV;
    await fs.promises.cp(
      `${FIXTURES_DIR}scan-error/config.scan.js`,
      path.resolve(process.cwd(), 'config.scan.js'),
    );

    try {
      process.env.BACKUP_ENV = 'scan';

      await scan(true);

      assert.fail('Expected error was not thrown');
    } catch (err) {
      assertIncludes(err.message, 'Failed to scan source /non/existing/source');
    } finally {
      process.env.BACKUP_ENV = previousEnv;

      await fs.promises.rm(path.resolve(process.cwd(), 'config.scan.js'));
    }
  });
});
