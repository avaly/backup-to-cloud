import fs from 'node:fs';
import { beforeEach, describe, it } from 'node:test';

import { assert } from 'chai';

import utils from './utils.js';

describe('cli', () => {
  beforeEach(() => {
    utils.clean();
  });

  it('shows help', async () => {
    const result = await utils.run(['--help']);

    assert.include(result, 'Usage:');
    assert.isFalse(fs.existsSync(utils.DATA_FILE), 'data file was not created');
  });

  it('checks config', async () => {
    const result = await utils.run(['--check-config']);

    assert.include(result, 'Config seems in order!');
  });
});
