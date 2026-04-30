import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, it } from 'node:test';

import assert from 'node:assert/strict';

import {
  assertFilesEqual,
  assertIncludes,
  assertIsArray,
  assertNotIncludes,
  clean,
  FIXTURES_DIR,
  getAWSLog,
  ROOT_DIR,
  run,
  TEMP_DIR,
} from './utils.js';

const LOCK_FILE = path.resolve(ROOT_DIR, 'bin', '.restore.lock');

function assertAWS(log, index, remotePattern, localPattern) {
  assert.ok(log.length > index);
  if (log[index][1] === 'cp') {
    assert.match(log[index][2], remotePattern);
    if (localPattern) {
      assert.match(log[index][3], localPattern);
    }
  }
}

describe('restorer', { concurrency: false }, () => {
  function restore(args, dry, allowFailure = false) {
    return run(['--verbose', dry && '--dry'].concat(args || []), 'restore', allowFailure);
  }

  beforeEach(() => {
    clean([`${TEMP_DIR}*`]);
  });

  it('does not start if lock file exists', async () => {
    fs.writeFileSync(LOCK_FILE, '');
    try {
      const output = await restore(['--output', '.', '/'], false);

      assertIncludes(output, 'Another instance is already running');
      assertNotIncludes(output, 'Restorer.start');

      const awsLog = getAWSLog();

      assertIsArray(awsLog);
      assert.strictEqual(awsLog.length, 0);
    } finally {
      fs.unlinkSync(LOCK_FILE);
    }
  });

  it('transfers nothing on dry mode', async () => {
    const output = await restore(['--output', '.', '/'], true);

    assertIncludes(output, 'This is a DRY run!');
    assertIncludes(output, 'Restorer.start: remotePrefix=/ localPath=/');
    assertIncludes(
      output,
      'Restorer.filter: 7 matching files with a total file size of 427 kB in DB',
    );

    const awsLog = getAWSLog();

    assertIsArray(awsLog);
    assert.strictEqual(awsLog.length, 1);
    assertAWS(awsLog, 0, /s3:\/\/test-bucket\/db-test\.sqlite/);
  });

  it('shows help with no output flag', async () => {
    const result = await restore([], false, true);

    assert.strictEqual(result instanceof Error, true);
    assertIncludes(result.message, 'exit code: 1');
    assertIncludes(result.message, 'Usage:');

    const awsLog = getAWSLog();

    assertIsArray(awsLog);
    assert.strictEqual(awsLog.length, 0);
  });

  it('restores prefix only', async () => {
    const output = await restore(['--yes', '--output', TEMP_DIR, '/bar/']);

    assertIncludes(
      output,
      'Restorer.filter: 3 matching files with a total file size of 308 kB in DB',
    );
    assertIncludes(output, 'Restorer.finish: 3 restored, 0 failed');

    const awsLog = getAWSLog();

    assertIsArray(awsLog);
    assert.strictEqual(awsLog.length, 4);
    assertAWS(awsLog, 0, /s3:\/\/test-bucket\/db-test\.sqlite/);
    assertAWS(awsLog, 1, /s3:\/\/test-bucket\/bar\/1-small\.txt/);
    assertAWS(awsLog, 2, /s3:\/\/test-bucket\/bar\/2-medium\.txt/);
    assertAWS(awsLog, 3, /s3:\/\/test-bucket\/bar\/3-large\.txt/);

    assertFilesEqual(`${TEMP_DIR}bar/1-small.txt`, `${FIXTURES_DIR}bar/1-small.txt`);
    assertFilesEqual(`${TEMP_DIR}bar/2-medium.txt`, `${FIXTURES_DIR}bar/2-medium.txt`);
    assertFilesEqual(`${TEMP_DIR}bar/3-large.txt`, `${FIXTURES_DIR}bar/3-large.txt`);
  });

  it('restores all', async () => {
    const output = await restore(['--yes', '--output', TEMP_DIR, '/']);

    assertIncludes(
      output,
      'Restorer.filter: 7 matching files with a total file size of 427 kB in DB',
    );
    assertIncludes(output, 'Restorer.finish: 6 restored, 1 failed');
    assertIncludes(output, 'Failed to restore:');
    assertIncludes(output, '/foo/1-fail.dat');

    const awsLog = getAWSLog();

    assertIsArray(awsLog);
    assert.strictEqual(awsLog.length, 8);
    assertAWS(awsLog, 0, /s3:\/\/test-bucket\/db-test\.sqlite/);
    assertAWS(awsLog, 1, /s3:\/\/test-bucket\/bar\/1-small\.txt/);
    assertAWS(awsLog, 2, /s3:\/\/test-bucket\/bar\/2-medium\.txt/);
    assertAWS(awsLog, 3, /s3:\/\/test-bucket\/bar\/3-large\.txt/);
    assertAWS(awsLog, 4, /s3:\/\/test-bucket\/1-fail\.dat/);
    assertAWS(awsLog, 5, /s3:\/\/test-bucket\/2 '"\$@%&`medium\.dat/);
    assertAWS(awsLog, 6, /s3:\/\/test-bucket\/3-dummy\.pdf/);
    assertAWS(awsLog, 7, /s3:\/\/test-bucket\/ham\/first\/first.tar/);

    assertFilesEqual(`${TEMP_DIR}bar/1-small.txt`, `${FIXTURES_DIR}bar/1-small.txt`);
    assertFilesEqual(`${TEMP_DIR}bar/2-medium.txt`, `${FIXTURES_DIR}bar/2-medium.txt`);
    assertFilesEqual(`${TEMP_DIR}bar/3-large.txt`, `${FIXTURES_DIR}bar/3-large.txt`);
    assert.strictEqual(fs.existsSync(`${TEMP_DIR}1-fail.dat`), false);
    assertFilesEqual(`${TEMP_DIR}2 '"$@%&\`medium.dat`, `${FIXTURES_DIR}foo/2 '"$@%&\`medium.dat`);
    assertFilesEqual(`${TEMP_DIR}3-dummy.pdf`, `${FIXTURES_DIR}originals/3-dummy.pdf`);
    assertFilesEqual(`${TEMP_DIR}ham/first/1-first.txt`, `${FIXTURES_DIR}ham/first/1-first.txt`);
    assertFilesEqual(`${TEMP_DIR}ham/first/2-first.txt`, `${FIXTURES_DIR}ham/first/2-first.txt`);
  });

  it('filters by max size in dry mode', async () => {
    const output = await restore(['--max-size', '10000', '--output', TEMP_DIR, '/'], true);

    assertIncludes(output, 'This is a DRY run!');
    assertIncludes(
      output,
      'Restorer.filter: 3 matching files with a total file size of 4.1 kB in DB',
    );

    const awsLog = getAWSLog();

    assertIsArray(awsLog);
    assert.strictEqual(awsLog.length, 1);
    assertAWS(awsLog, 0, /s3:\/\/test-bucket\/db-test\.sqlite/);
  });

  it('tests a file', async () => {
    const output = await restore(['--test', '0', '--output', TEMP_DIR, '/']);

    assertIncludes(output, 'Restorer.test OK: /bar/1-small.txt');
    assertIncludes(output, 'Restorer result: PASS');
    assertIncludes(output, 'Restorer.finish: 1 restored, 0 failed');

    const awsLog = getAWSLog();

    assertIsArray(awsLog);
    assert.strictEqual(awsLog.length, 2);
    assertAWS(awsLog, 0, /s3:\/\/test-bucket\/db-test\.sqlite/);
    assertAWS(awsLog, 1, /s3:\/\/test-bucket\/bar\/1-small\.txt/);
  });

  it('tests an archive', async () => {
    const output = await restore(['--test', '6', '--output', TEMP_DIR, '/']);

    assertIncludes(output, 'Restorer.test OK: /ham/first/first.tar');
    assertIncludes(output, 'Restorer result: PASS');
    assertIncludes(output, 'Restorer.finish: 1 restored, 0 failed');

    const awsLog = getAWSLog();

    assertIsArray(awsLog);
    assert.strictEqual(awsLog.length, 2);
    assertAWS(awsLog, 0, /s3:\/\/test-bucket\/db-test\.sqlite/);
    assertAWS(awsLog, 1, /s3:\/\/test-bucket\/ham\/first\/first\.tar/);
  });

  it('tests a failing file', async () => {
    const result = await restore(['--test', '3', '--output', TEMP_DIR, '/'], false, true);

    assert.strictEqual(result instanceof Error, true);
    assertIncludes(result.message, 'exit code: 1');
    assertIncludes(result.message, 'Restorer.test FAIL: /1-fail.dat');
    assertIncludes(result.message, 'Restorer result: FAIL');
    assertIncludes(result.message, 'Restorer.finish: 0 restored, 1 failed');

    const awsLog = getAWSLog();

    assertIsArray(awsLog);
    assert.strictEqual(awsLog.length, 2);
    assertAWS(awsLog, 0, /s3:\/\/test-bucket\/db-test\.sqlite/);
    assertAWS(awsLog, 1, /s3:\/\/test-bucket\/1-fail\.dat/);
  });

  it('tests a file filtered by max size', async () => {
    // Use a test index that would have selected a large file (e.g. /bar/3-large.txt)
    // before max-size filtering, and ensure that a small file is tested instead.
    const output = await restore(['--test', '2', '--max-size', '10000', '--output', TEMP_DIR, '/']);

    // The tested file should be one of the small (<= max-size) files.
    assertIncludes(output, 'Restorer.test OK: /ham/first/first.tar');
    // Ensure the large file is not selected.
    assertNotIncludes(output, 'Restorer.test OK: /bar/3-large.txt');
    assertIncludes(output, 'Restorer.finish: 1 restored, 0 failed');

    const awsLog = getAWSLog();

    assertIsArray(awsLog);
    assert.strictEqual(awsLog.length, 2);
    assertAWS(awsLog, 0, /s3:\/\/test-bucket\/db-test\.sqlite/);
    assertAWS(awsLog, 1, /s3:\/\/test-bucket\/ham\/first\/first\.tar/);
  });
});
