import assert from 'node:assert';

import { execPromise } from './utils.js';

class ConfigChecker {
  constructor(config = null) {
    this.config = config;
  }

  async loadConfig() {
    if (this.config) {
      return this.config;
    }

    const configModule = await import('./config.js');
    this.config = configModule.default || configModule;
    return this.config;
  }

  async check() {
    const config = await this.loadConfig();

    this.variables(config);
    await this.aws(config);
    await this.gpg(config);
  }

  variables(config = this.config) {
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
      assert.ok(config && config[name], `\`${name}\` must be defined in config`);
    }
  }

  aws(config = this.config) {
    return execPromise(config.aws, ['--version']);
  }

  gpg(config = this.config) {
    return execPromise(config.gpg, ['--version']);
  }
}

export default ConfigChecker;
