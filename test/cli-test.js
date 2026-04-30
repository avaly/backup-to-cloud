import fs from 'node:fs';
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { clean, DB_FILE, run } from './utils.js';

describe('cli', { concurrency: false }, () => {
  beforeEach(() => {
    clean();
  });

  it('shows help', async () => {
    const result = await run(['--help']);

    assert.match(result, /Usage:/);
    assert.strictEqual(fs.existsSync(DB_FILE), false, 'db file was not created');
  });

  it('checks config', async () => {
    const result = await run(['--check-config']);

    assert.match(result, /Config seems in order!/);
  });
});
