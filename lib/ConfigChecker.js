const assert = require('assert');

const config = require('./config');
const utils = require('./utils');

class ConfigChecker {
  async check() {
    this.variables();
    await this.aws();
    await this.gpg();
  }

  variables() {
    const vars = [
      'aws',
      'dbSQLite',
      'encryptionPassphrase',
      'gpg',
      'maxSessionSize',
      'scanInterval',
      'sources',
      's3bucket',
    ];
    for (const name of vars) {
      assert.ok(config[name], `\`${name}\` must be defined in config`);
    }
  }

  aws() {
    return utils.execPromise(config.aws, ['--version']);
  }

  gpg() {
    return utils.execPromise(config.gpg, ['--version']);
  }
}

module.exports = ConfigChecker;
