import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';

import { TEMP_DIR, clean, runWithStatus } from './utils.js';

const CLEANUP = [];

function createWorkspace() {
  const workspace = fs.mkdtempSync(path.join(TEMP_DIR, 'check-config-'));

  CLEANUP.push(workspace);

  return workspace;
}

function createConfig(workspace, envName, content) {
  const configPath = path.join(workspace, `config.${envName}.js`);

  fs.writeFileSync(configPath, content);

  return configPath;
}

after(() => {
  clean(CLEANUP.splice(0));
});

describe('check-config', { concurrency: false }, () => {
  let workspace;

  beforeEach(() => {
    workspace = createWorkspace();
  });

  it('succeeds for valid config', async () => {
    const envName = 'check-config-ok';

    createConfig(
      workspace,
      envName,
      `export default {
  aws: 'node',
  dbSQLite: 'data/db-test.sqlite',
  encryptionPassphrase: 'password',
  gpg: 'node',
  maxSessionSize: 1024,
  scanInterval: 1000,
  sources: ['/tmp'],
  s3bucket: 'bucket'
};
`,
    );

    const result = runWithStatus([], 'check-config', {
      env: {
        BACKUP_ENV: envName,
      },
      cwd: workspace,
    });

    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.status, 0);
    assert.match(result.stdout, /Config seems in order!/);
    assert.strictEqual(result.stderr, '');
  });

  it('fails when the config file is missing', () => {
    const envName = 'missing-check-config';
    const configPath = path.join(workspace, `config.${envName}.js`);

    fs.rmSync(configPath, { force: true });

    const result = runWithStatus([], 'check-config', {
      env: {
        BACKUP_ENV: envName,
      },
      cwd: workspace,
    });

    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /Config check failed:/);
    assert.match(result.stdout, /`aws` must be defined in config/);
  });

  it('fails when required config values are missing', () => {
    const envName = 'invalid-check-config';

    createConfig(
      workspace,
      envName,
      `export default {
  dbSQLite: 'data/db-test.sqlite',
  encryptionPassphrase: 'password',
  gpg: 'gpg',
  maxSessionSize: 1024,
  scanInterval: 1000,
  s3bucket: 'bucket'
};
`,
    );

    const result = runWithStatus([], 'check-config', {
      env: {
        BACKUP_ENV: envName,
      },
      cwd: workspace,
    });

    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /Config check failed:/);
    assert.match(
      result.stdout,
      /`aws` must be defined in config|`sources` must be defined in config/,
    );
  });

  it('fails when aws binary is missing', () => {
    const envName = 'missing-aws';

    createConfig(
      workspace,
      envName,
      `export default {
  aws: 'command-that-does-not-exist',
  dbSQLite: 'data/db-test.sqlite',
  encryptionPassphrase: 'password',
  gpg: 'node',
  maxSessionSize: 1024,
  scanInterval: 1000,
  sources: ['/tmp'],
  s3bucket: 'bucket'
};
`,
    );

    const result = runWithStatus([], 'check-config', {
      env: {
        BACKUP_ENV: envName,
      },
      cwd: workspace,
    });

    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /Config check failed:/);
    assert.match(result.stdout, /command-that-does-not-exist/);
    assert.match(result.stdout, /not found|exit code: 127/);
  });

  it('fails when gpg binary is missing', () => {
    const envName = 'missing-gpg';

    createConfig(
      workspace,
      envName,
      `export default {
  aws: 'node',
  dbSQLite: 'data/db-test.sqlite',
  encryptionPassphrase: 'password',
  gpg: 'missing-gpg-binary',
  maxSessionSize: 1024,
  scanInterval: 1000,
  sources: ['/tmp'],
  s3bucket: 'bucket'
};
`,
    );

    const result = runWithStatus([], 'check-config', {
      env: {
        BACKUP_ENV: envName,
      },
      cwd: workspace,
    });

    assert.strictEqual(result.error, undefined);
    assert.strictEqual(result.status, 1);
    assert.match(result.stdout, /Config check failed:/);
    assert.match(result.stdout, /missing-gpg-binary/);
    assert.match(result.stdout, /not found|exit code: 127/);
  });
});
