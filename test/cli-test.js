import fs from 'node:fs';
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import utils from './utils.js';

describe('cli', { concurrency: false }, () => {
  beforeEach(() => {
    utils.clean();
  });

  it('shows help', async () => {
    const result = await utils.run(['--help']);

    assert.match(result, /Usage:/);
    assert.strictEqual(fs.existsSync(utils.DB_FILE), false, 'db file was not created');
  });

  it('checks config', async () => {
    const result = await utils.run(['--check-config']);

    assert.match(result, /Config seems in order!/);
  });
});
