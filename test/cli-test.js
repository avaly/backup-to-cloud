const assert = require('chai').assert;
const fs = require('fs');
const utils = require('./utils');

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
