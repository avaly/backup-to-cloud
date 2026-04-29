import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { before, describe, it } from 'node:test';

import Crypter from '../lib/Crypter.js';
import utils, { assertIncludes, assertIsArray } from './utils.js';

const { FIXTURES_DIR, TEMP_DIR } = utils;

describe('decrypt', { concurrency: false }, () => {
  function decrypt(args, dry, allowFailure = false) {
    return utils.run(['--verbose', dry && '--dry'].concat(args || []), 'decrypt', allowFailure);
  }

  if (!fs.existsSync(TEMP_DIR)) {
    execFileSync('mkdir', ['-p', TEMP_DIR]);
  }

  before(() => {
    utils.clean();
  });

  it('shows help', async () => {
    const result = await decrypt(['--help']);

    assert.match(result, /Usage:/);
  });

  it('shows help with no output flag', async () => {
    const result = await decrypt([], false, true);

    assert.strictEqual(result instanceof Error, true);
    assertIncludes(result.message, 'exit code: 1');
    assertIncludes(result.message, 'Usage:');

    const awsLog = utils.getAWSLog();

    assertIsArray(awsLog);
    assert.strictEqual(awsLog.length, 0);
  });

  it('stops if input file does not exist', async () => {
    const fileOutput = `${TEMP_DIR}should-not-be-created.txt`;

    try {
      await decrypt(['--output', fileOutput, `${TEMP_DIR}this-should-not-exist.txt`]);

      assert.fail('Expected decrypt command to fail');
    } catch {
      assert.ok(!fs.existsSync(fileOutput));
    }
  });

  it('decrypts file', async () => {
    const fileSource = `${FIXTURES_DIR}bar/1-small.txt`;
    const fileOutput = `${TEMP_DIR}decrypted.txt`;

    const contentSource = fs.readFileSync(fileSource, 'utf-8');
    const encryptedFile = await Crypter.encrypt(fileSource);
    const contentEncrypted = fs.readFileSync(encryptedFile.path, 'utf-8');

    assert.notStrictEqual(contentSource, contentEncrypted);

    await decrypt(['--output', fileOutput, encryptedFile.path]);

    const contentDecrypted = fs.readFileSync(fileOutput, 'utf-8');

    assert.strictEqual(contentSource, contentDecrypted);
  });
});
