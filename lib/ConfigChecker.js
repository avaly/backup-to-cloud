import assert from 'node:assert';

import config from './config.js';
import { execPromise } from './utils.js';

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
    return execPromise(config.aws, ['--version']);
  }

  gpg() {
    return execPromise(config.gpg, ['--version']);
  }
}

export default ConfigChecker;
