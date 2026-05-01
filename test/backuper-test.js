import fs from 'node:fs';
import path from 'node:path';
import { before, describe, it } from 'node:test';

import assert from 'node:assert/strict';

import Archiver from '../lib/Archiver.js';
import Backuper from '../lib/Backuper.js';
import Crypter from '../lib/Crypter.js';
import Scanner from '../lib/Scanner.js';
import { hash } from '../lib/utils.js';
import {
  assertFilesEqual,
  assertFilesNotEqual,
  assertIncludes,
  assertIsArray,
  assertIsObject,
  assertLocalDeleted,
  assertNotIncludes,
  clean,
  DATA_DIR,
  DB_TYPES,
  FIXTURES_DIR,
  getAWSLog,
  getDataContent,
  mockLocal,
  mockRemote,
  run,
  setDataContent,
  TEMP_DIR,
} from './utils.js';

const LOCK_FILE = path.resolve(process.cwd(), 'bin', '.backup.lock');

function assertAWS(log, index, operation, pattern, storageClass, hash) {
  assert.ok(log.length > index);
  assert.strictEqual(log[index][1], operation);
  if (operation === 'cp') {
    assert.match(log[index][3], pattern);
    if (storageClass) {
      assertIncludes(log[index], '--storage-class');
      assertIncludes(log[index], storageClass);
    }
    if (hash) {
      assertIncludes(log[index], '--metadata');
      assertIncludes(log[index], `hash=${hash}`);
    }
  } else {
    assert.match(log[index][2], pattern);
  }
}

describe('backuper', { concurrency: false }, () => {
  function transfer(dry, random) {
    return run(['--skip-scan', '--verbose', dry && '--dry', random && '--random-order']);
  }

  let dbFromScan;

  before(async () => {
    clean();

    await run(['--only-scan', '--verbose']);

    dbFromScan = getDataContent();
  });

  it('does not start if lock file exists', async () => {
    fs.writeFileSync(LOCK_FILE, '');
    try {
      const output = await transfer(false);

      assertIncludes(output, 'Another instance is already running');
      assertNotIncludes(output, 'Starting...');

      const awsLog = getAWSLog();

      assertIsArray(awsLog);
      assert.strictEqual(awsLog.length, 0);
    } finally {
      fs.unlinkSync(LOCK_FILE);
    }
  });

  it('transfers nothing on dry mode', async () => {
    const output = await transfer(true);
    assertIncludes(output, 'This is a DRY run!');
    assertIncludes(output, 'Backuper.start: locals=9 / remotes=0');
    assertIncludes(output, 'Backuper.add file:');
    assertIncludes(output, 'Backuper.next sessionSize=1.02 kB maxSessionSize=1.02 kB');
    assertIncludes(output, 'Backup result MAX_SESSION_SIZE');

    const awsLog = getAWSLog();

    assertIsArray(awsLog);
    assert.strictEqual(awsLog.length, 0);
  });

  it('encrypts and transfers files', async () => {
    await transfer();
    const awsLog = getAWSLog();
    assertIsArray(awsLog);
    // Only the first 2 files fit into the session size
    // Since 1-small.txt encrypted is less than the session size
    // The last file is the DB file
    assert.strictEqual(awsLog.length, 3);

    const file = Scanner.scanFile(`${FIXTURES_DIR}bar/1-small.txt`);

    assertAWS(
      awsLog,
      0,
      'cp',
      /s3:\/\/test-bucket\/bar\/1-small\.txt/,
      'STANDARD',
      hash(file.hash),
    );
    assertAWS(awsLog, 1, 'cp', /s3:\/\/test-bucket\/bar\/2-medium\.txt/, 'STANDARD');
    assertAWS(awsLog, 2, 'cp', /s3:\/\/test-bucket\/db-test\.sqlite/, 'STANDARD');

    assertFilesEqual(`${TEMP_DIR}db-test.sqlite`, `${DATA_DIR}db-test.sqlite`);

    // Verify encryption
    assertFilesNotEqual(`${TEMP_DIR}1-small.txt`, `${FIXTURES_DIR}bar/1-small.txt`);

    await Crypter.decrypt(`${TEMP_DIR}1-small.txt`, `${TEMP_DIR}1-small-decrypted.txt`);

    assertFilesEqual(`${TEMP_DIR}1-small-decrypted.txt`, `${FIXTURES_DIR}bar/1-small.txt`);

    const db = getDataContent();

    assert.strictEqual(db.remotes.length, 2);

    const firstFile = `${FIXTURES_DIR}bar/1-small.txt`;
    assertIsObject(db.remotesByPath[firstFile]);
    assert.strictEqual(db.remotesByPath[firstFile].hash, db.localsByPath[firstFile].hash);
    assert.strictEqual(db.remotesByPath[firstFile].type, DB_TYPES.FILE);
    assert.notStrictEqual(db.remotesByPath[firstFile].size, db.localsByPath[firstFile].size);
    assert.ok(
      db.remotesByPath[firstFile].timestamp > Date.now() - 60 * 1000,
      'timestamp of upload should be within last 60 seconds',
    );
  });

  it('transfers next file', async () => {
    await transfer();

    const awsLog = getAWSLog();

    assertIsArray(awsLog);
    // Only one new file + the db (+ the other 3) fit into the session size
    assert.strictEqual(awsLog.length, 5);

    assertAWS(awsLog, 3, 'cp', /s3:\/\/test-bucket\/bar\/3-large\.txt/, 'STANDARD_IA');
    assertAWS(awsLog, 4, 'cp', /s3:\/\/test-bucket\/db-test\.sqlite/);

    const db = getDataContent();

    assert.strictEqual(db.remotes.length, 3);
  });

  it('skips failed file and continues upload of other files', async () => {
    await transfer();

    const awsLog = getAWSLog();

    assertIsArray(awsLog);
    // 1-fail.dat should fail by aws-mock,
    assert.strictEqual(awsLog.length, 8);

    assertAWS(awsLog, 5, 'cp', /s3:\/\/test-bucket\/1-fail\.dat/, 'STANDARD');
    assertAWS(awsLog, 6, 'cp', /s3:\/\/test-bucket\/2 '"\$@%&`medium\.dat/, 'STANDARD');
    assertAWS(awsLog, 7, 'cp', /s3:\/\/test-bucket\/db-test\.sqlite/);

    const db = getDataContent();

    assert.strictEqual(db.remotes.length, 4);

    assert.strictEqual(db.remotesByPath[`${FIXTURES_DIR}foo/1-fail.dat`], undefined);
    assertIsObject(db.remotesByPath[`${FIXTURES_DIR}foo/2 '"$@%&\`medium.dat`]);
  });

  it('skips failed encryption and continues upload of other files', async () => {
    clean();

    const unreadableFile = `${FIXTURES_DIR}bar/0-unreadable.dat`;
    fs.writeFileSync(unreadableFile, 'do not read me');
    fs.chmodSync(unreadableFile, 0);

    try {
      setDataContent({
        locals: [
          mockLocal(unreadableFile, 'broken-hash'),
          mockLocal(`${FIXTURES_DIR}bar/1-small.txt`, 'good-hash'),
        ],
      });

      const output = await transfer();

      assertIncludes(output, `Backuper.add error: ${unreadableFile}`);
      assertNotIncludes(output, 'Backup error');

      const awsLog = getAWSLog();

      assertIsArray(awsLog);
      assert.strictEqual(awsLog.length, 2);
      assertAWS(awsLog, 0, 'cp', /s3:\/\/test-bucket\/bar\/1-small\.txt/, 'STANDARD');
      assertAWS(awsLog, 1, 'cp', /s3:\/\/test-bucket\/db-test\.sqlite/, 'STANDARD');

      const db = getDataContent();

      assert.strictEqual(db.remotesByPath[unreadableFile], undefined);
      assertIsObject(db.remotesByPath[`${FIXTURES_DIR}bar/1-small.txt`]);
    } finally {
      fs.chmodSync(unreadableFile, 0o644);
      fs.unlinkSync(unreadableFile);
    }
  });

  it('uploads archives', async () => {
    clean();
    setDataContent({
      locals: dbFromScan.locals.filter((local) => local.type === DB_TYPES.ARCHIVE),
    });

    await transfer();

    const awsLog = getAWSLog();

    assertIsArray(awsLog);
    assert.strictEqual(awsLog.length, 2);

    assertAWS(awsLog, 0, 'cp', /s3:\/\/test-bucket\/ham\/first\/first.tar/, 'STANDARD');
    assertAWS(awsLog, 1, 'cp', /s3:\/\/test-bucket\/db-test\.sqlite/);

    const db = getDataContent();

    assert.strictEqual(db.remotes.length, 1);

    const archiveName = `${FIXTURES_DIR}ham/first/first.tar`;
    assertIsObject(db.remotesByPath[archiveName]);
    assert.strictEqual(db.remotesByPath[archiveName].type, DB_TYPES.ARCHIVE);

    await Crypter.decrypt(`${TEMP_DIR}first.tar`, `${TEMP_DIR}first-decrypted.tar`);
    await Archiver.decompress(`${TEMP_DIR}first-decrypted.tar`, `${TEMP_DIR}first`);

    assertFilesEqual(`${TEMP_DIR}first/1-first.txt`, `${FIXTURES_DIR}ham/first/1-first.txt`);
    assertFilesEqual(`${TEMP_DIR}first/2-first.txt`, `${FIXTURES_DIR}ham/first/2-first.txt`);
    assert.strictEqual(fs.existsSync(`${TEMP_DIR}first/second/1-second.txt`), false);
    assert.strictEqual(fs.existsSync(`${TEMP_DIR}first/second/2-second.txt`), false);
  });

  it('does not sync the DB file when no file syncs have been made', async () => {
    clean();
    setDataContent({
      locals: dbFromScan.locals,
      remotes: dbFromScan.locals.map((local) =>
        Object.assign(
          {
            timestamp: 456,
          },
          local,
        ),
      ),
    });

    await transfer();

    const awsLog = getAWSLog();

    assertIsArray(awsLog);
    assert.strictEqual(awsLog.length, 0);
  });

  it('uploads files in random order', async () => {
    clean();
    setDataContent({
      locals: dbFromScan.locals.slice(0, 2),
    });

    await transfer(false, true);

    const awsLog = getAWSLog();

    assertIsArray(awsLog);
    assert.ok(awsLog.length >= 2);
    assertAWS(awsLog, 0, 'cp', /s3:\/\/test-bucket\/bar\/(1-small|2-medium)\.txt/);
    assertAWS(awsLog, awsLog.length - 1, 'cp', /s3:\/\/test-bucket\/db-test\.sqlite/);

    const db = getDataContent();

    assert.ok(db.remotes.length >= 1);
  });

  it('removes deleted files', async () => {
    clean();

    const now = Date.now();
    setDataContent({
      locals: [
        mockLocal(`${FIXTURES_DIR}bar/1-small-recent.txt`),
        mockLocal(`${FIXTURES_DIR}bar/2-small-long-ago.txt`),
        mockLocal(`${FIXTURES_DIR}bar/3-large-recent.txt`),
        mockLocal(`${FIXTURES_DIR}bar/4-large-long-ago.txt`),
      ],
      remotes: [
        mockRemote(`${FIXTURES_DIR}bar/1-small-recent.txt`, 'abc', 1024, now - 10 * 1000),
        mockRemote(
          `${FIXTURES_DIR}bar/2-small-long-ago.txt`,
          'abc',
          1024,
          now - 31 * 24 * 3600 * 1000,
        ),
        mockRemote(`${FIXTURES_DIR}bar/3-large-recent.txt`, 'abc', 135000, now - 10 * 1000),
        mockRemote(
          `${FIXTURES_DIR}bar/4-large-long-ago.txt`,
          'abc',
          135000,
          now - 31 * 24 * 3600 * 1000,
        ),
      ],
    });

    await transfer();

    const awsLog = getAWSLog();

    assertIsArray(awsLog);
    assert.strictEqual(awsLog.length, 4);

    assertAWS(awsLog, 0, 'rm', /s3:\/\/test-bucket\/bar\/1-small-recent\.txt/);
    assertAWS(awsLog, 1, 'rm', /s3:\/\/test-bucket\/bar\/2-small-long-ago\.txt/);
    assertAWS(awsLog, 2, 'rm', /s3:\/\/test-bucket\/bar\/4-large-long-ago\.txt/);
    assertAWS(awsLog, 3, 'cp', /s3:\/\/test-bucket\/db-test\.sqlite/);

    const db = getDataContent();

    assert.strictEqual(db.locals.length, 1);
    assert.strictEqual(db.remotes.length, 1);

    const file = `${FIXTURES_DIR}bar/3-large-recent.txt`;
    assertLocalDeleted(db, file);
    assertIsObject(db.remotesByPath[file]);
  });

  it('transfers files and removes deleted files up to maxSessionRemovals limit', async () => {
    clean();

    const now = Date.now();
    setDataContent({
      locals: [
        ...dbFromScan.locals,
        mockLocal(`${FIXTURES_DIR}bar/1-small-recent.txt`),
        mockLocal(`${FIXTURES_DIR}bar/2-small-long-ago.txt`),
        mockLocal(`${FIXTURES_DIR}bar/3-small-recent.txt`),
        mockLocal(`${FIXTURES_DIR}bar/4-small-recent.txt`),
      ],
      remotes: [
        mockRemote(`${FIXTURES_DIR}bar/1-small-recent.txt`, 'abc', 1024, now - 10 * 1000),
        mockRemote(
          `${FIXTURES_DIR}bar/2-small-long-ago.txt`,
          'abc',
          1024,
          now - 31 * 24 * 3600 * 1000,
        ),
        mockRemote(`${FIXTURES_DIR}bar/3-small-recent.txt`, 'abc', 1024, now - 10 * 1000),
        mockRemote(`${FIXTURES_DIR}bar/4-small-recent.txt`, 'abc', 1024, now - 10 * 1000),
      ],
    });

    await transfer();

    const awsLog = getAWSLog();

    assertIsArray(awsLog);
    // Only the first 2 files fit into the session size
    // maxSessionRemovals is 3 in test config, so only 3 of 4 deleted files are removed
    // The last file is the DB file
    assert.strictEqual(awsLog.length, 6);

    assertAWS(awsLog, 0, 'cp', /s3:\/\/test-bucket\/bar\/1-small\.txt/, 'STANDARD');
    assertAWS(awsLog, 1, 'cp', /s3:\/\/test-bucket\/bar\/2-medium\.txt/, 'STANDARD');

    assertAWS(awsLog, 2, 'rm', /s3:\/\/test-bucket\/bar\/1-small-recent\.txt/);
    assertAWS(awsLog, 3, 'rm', /s3:\/\/test-bucket\/bar\/2-small-long-ago\.txt/);
    assertAWS(awsLog, 4, 'rm', /s3:\/\/test-bucket\/bar\/3-small-recent\.txt/);

    assertAWS(awsLog, 5, 'cp', /s3:\/\/test-bucket\/db-test\.sqlite/, 'STANDARD');

    const db = getDataContent();

    assert.strictEqual(db.locals.length, dbFromScan.locals.length + 1);
    assert.strictEqual(
      db.locals.find((item) => item.path.includes('1-small-recent.txt')),
      undefined,
    );
    assert.strictEqual(
      db.locals.find((item) => item.path.includes('2-small-long-ago.txt')),
      undefined,
    );
    assert.strictEqual(
      db.locals.find((item) => item.path.includes('3-small-recent.txt')),
      undefined,
    );

    // 4th deleted file should still exist due to maxSessionRemovals limit
    assert.strictEqual(db.remotes.length, 3);
    assertIsObject(db.remotesByPath[`${FIXTURES_DIR}bar/4-small-recent.txt`]);
  });

  it('should stop transfer after max failed', async () => {
    clean();

    setDataContent({
      locals: [
        mockLocal(`${FIXTURES_DIR}foo/1-fail.dat`, 'abc'),
        mockLocal(`${FIXTURES_DIR}foo/3-fail.dat`, 'abc'),
        mockLocal(`${FIXTURES_DIR}foo/4-small.dat`, 'abc'),
      ],
    });

    await transfer();

    const awsLog = getAWSLog();

    assertIsArray(awsLog);
    assert.strictEqual(awsLog.length, 3);
    assertAWS(awsLog, 0, 'cp', /s3:\/\/test-bucket\/1-fail\.dat/, 'STANDARD', 'abc');
    assertAWS(awsLog, 1, 'cp', /s3:\/\/test-bucket\/3-fail\.dat/, 'STANDARD_IA', 'abc');
    assertAWS(awsLog, 2, 'cp', /s3:\/\/test-bucket\/db-test\.sqlite/);

    const db = getDataContent();

    assert.strictEqual(db.remotesByPath[`${FIXTURES_DIR}foo/4-small.dat`], undefined);
  });

  it('skips failed archive compression before temp archive exists', async () => {
    const local = mockLocal(
      `${FIXTURES_DIR}ham/first/first.tar`,
      'archive-hash',
      123,
      DB_TYPES.ARCHIVE,
    );
    const db = {
      updateRemote: async () => {
        throw new Error('updateRemote should not be called');
      },
    };
    const backuper = new Backuper(db, {});
    const { compress } = Archiver;
    const { unlinkSync } = fs;
    const unlinkCalls = [];

    backuper.skipFiles = [];
    backuper.sessionCount = 0;
    backuper.sessionFailed = 0;
    backuper.sessionRemoved = 0;
    backuper.sessionSize = 0;

    Archiver.compress = async () => {
      throw new Error('compress failed');
    };
    fs.unlinkSync = (filePath) => {
      unlinkCalls.push(filePath);
    };

    try {
      await backuper.add(local);

      assert.deepStrictEqual(unlinkCalls, []);
      assert.deepStrictEqual(backuper.skipFiles, [local.path]);
      assert.strictEqual(backuper.sessionFailed, 1);
      assert.strictEqual(backuper.sessionCount, 1);
    } finally {
      Archiver.compress = compress;
      fs.unlinkSync = unlinkSync;
    }
  });
});
