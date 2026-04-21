const assert = require('chai').assert;
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const utils = require('./utils');

const execFileSync = childProcess.execFileSync;
const EXECUTABLES_DIR = path.resolve(utils.ROOT_DIR, 'dist', 'executables');
const EXECUTABLES = ['backup-to-cloud', 'backup-restore', 'backup-verify', 'backup-decrypt'];

function supportsBuildSea() {
  const helpText = execFileSync(process.execPath, ['--help'], {
    encoding: 'utf-8',
  });
  return helpText.includes('--build-sea');
}

function executablePath(name) {
  return path.resolve(EXECUTABLES_DIR, process.platform === 'win32' ? `${name}.exe` : name);
}

describe('executables', function () {
  this.timeout(180000);

  before(function () {
    if (!supportsBuildSea()) {
      this.skip();
    }

    utils.clean([EXECUTABLES_DIR]);
    execFileSync(process.execPath, ['./scripts/build-binaries.js'], {
      cwd: utils.ROOT_DIR,
      encoding: 'utf-8',
    });
  });

  it('builds all CLI executables', () => {
    for (const executable of EXECUTABLES) {
      assert.isTrue(fs.existsSync(executablePath(executable)), `${executable} was not built`);
    }
  });

  it('runs config checks from the backup executable', () => {
    const output = execFileSync(executablePath('backup-to-cloud'), ['--check-config'], {
      cwd: utils.ROOT_DIR,
      encoding: 'utf-8',
      env: {
        ...process.env,
        BACKUP_ENV: 'test',
      },
    });

    assert.include(output, 'Config seems in order!');
  });
});
