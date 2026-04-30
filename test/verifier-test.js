import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import config from '../lib/config.js';
import { copy, FIXTURES_DIR, getDataContent, run } from './utils.js';

describe('verifier', { concurrency: false }, () => {
  function verify(awsLSMock, dry) {
    return run(
      ['--verbose', dry ? '--dry' : '', '--aws-ls-mock', `${FIXTURES_DIR}verify/${awsLSMock}`],
      'verify',
    );
  }

  beforeEach(() => {
    copy(`${FIXTURES_DIR}verify/db-test.sqlite`, config.dbSQLite);
  });

  it('OK state', async () => {
    const output = await verify('ls-ok.txt');

    assert.match(output, /All remote files are present in the DB!/);
    assert.match(output, /All DB files are present remotely!/);
  });

  it('extra remote file, do nothing', async () => {
    const output = await verify('ls-extra-remote.txt');

    assert.match(output, /Found 2 remote file\(s\) not in the DB:/);
    assert.match(output, /\/blah\/who\.dat/);
    assert.match(output, /\/what\/is\/this\.txt/);
    assert.match(output, /All DB files are present remotely!/);
  });

  it('extra DB file, do nothing', async () => {
    const output = await verify('ls-extra-db.txt', true);

    assert.match(output, /This is a DRY run! No changes\/uploads will be made\./);
    assert.match(output, /All remote files are present in the DB!/);
    assert.match(output, /Found 2 DB file\(s\) not present remotely:/);
    assert.match(output, /\/bar\/3-large\.txt/);
    assert.match(output, /\/foo\/1-fail\.dat/);

    const db = getDataContent();

    assert.strictEqual(db.remotes.length, 6);
  });

  it('extra DB file, remove from DB', async () => {
    const output = await verify('ls-extra-db.txt', false);

    assert.match(output, /All remote files are present in the DB!/);
    assert.match(output, /Found 2 DB file\(s\) not present remotely:/);
    assert.match(output, /\/bar\/3-large\.txt/);
    assert.match(output, /\/foo\/1-fail\.dat/);

    const db = getDataContent();

    assert.strictEqual(db.remotes.length, 4);
    assert.strictEqual(db.remotesByPath['/bar/3-large.txt'], undefined);
    assert.strictEqual(db.remotesByPath['/foo/1-fail.dat'], undefined);
  });
});
