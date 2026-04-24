import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

import { assert } from 'chai';

import Crypter from '../lib/Crypter.js';
import utils from './utils.js';

const FIXTURES_DIR = utils.FIXTURES_DIR;
const TEMP_DIR = utils.TEMP_DIR;

describe('decrypt', () => {
  if (!fs.existsSync(TEMP_DIR)) {
    execFileSync('mkdir', ['-p', TEMP_DIR]);
  }

  it('shows help', async () => {
    const result = await utils.run(['--help'], 'decrypt');

    assert.include(result, 'Usage:');
  });

  it('stops if input file does not exist', async () => {
    const fileOutput = `${TEMP_DIR}should-not-be-created.txt`;

    const args = ['--output', fileOutput, `${TEMP_DIR}this-should-not-exist.txt`];

    try {
      await utils.run(args, 'decrypt');

      assert.isOk(false);
    } catch {
      assert.isNotOk(fs.existsSync(fileOutput));
    }
  });

  it('decrypts file', async () => {
    const fileSource = `${FIXTURES_DIR}bar/1-small.txt`;
    const fileOutput = `${TEMP_DIR}decrypted.txt`;

    const contentSource = fs.readFileSync(fileSource, 'utf-8');
    const encryptedFile = await Crypter.encrypt(fileSource);
    const contentEncrypted = fs.readFileSync(encryptedFile.path, 'utf-8');

    assert.notEqual(contentSource, contentEncrypted);

    await utils.run(['--output', fileOutput, encryptedFile.path], 'decrypt');

    const contentDecrypted = fs.readFileSync(fileOutput, 'utf-8');

    assert.equal(contentSource, contentDecrypted);
  });
});
