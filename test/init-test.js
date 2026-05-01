import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { assertFilesEqual, BIN_FILE, clean, execPromise, run, TEMP_DIR } from './utils.js';

const CLEANUP = [];

function createWorkspace() {
  const workspace = fs.mkdtempSync(path.join(TEMP_DIR, 'init-'));

  CLEANUP.push(workspace);

  fs.copyFileSync(
    path.join(process.cwd(), 'config.sample.js'),
    path.join(workspace, 'config.sample.js'),
  );

  return workspace;
}

afterEach(() => {
  clean(CLEANUP.splice(0));
});

describe('init', { concurrency: false }, () => {
  let workspace;
  let targetFile;

  beforeEach(() => {
    workspace = createWorkspace();
    targetFile = path.join(workspace, 'config.default.js');
  });

  it('shows help', async () => {
    const result = await run(['--help']);

    assert.match(result, /Usage:/);
    assert.strictEqual(fs.existsSync(targetFile), false, 'config file was not created');
  });

  it('creates config.default.js from the sample config', async () => {
    const output = await execPromise(BIN_FILE, ['init', '--directory', workspace]);

    assert.match(output, /Created config\.default\.js/);
    assert.strictEqual(fs.existsSync(targetFile), true);
    assertFilesEqual(path.join(workspace, 'config.sample.js'), targetFile);
  });

  it('fails if config.default.js already exists without --force', async () => {
    fs.writeFileSync(targetFile, 'export default {}\n');

    await assert.rejects(
      () => execPromise(BIN_FILE, ['init', '--directory', workspace]),
      /Config file already exists: .+config\.default\.js/,
    );
    assert.match(fs.readFileSync(targetFile, 'utf8'), /export default \{\}/);
  });

  it('overwrites config.default.js with --force', async () => {
    fs.writeFileSync(targetFile, 'export default {}\n');

    const output = await execPromise(BIN_FILE, ['init', '--directory', workspace, '--force']);

    assert.match(output, /Created config\.default\.js/);
    assertFilesEqual(path.join(workspace, 'config.sample.js'), targetFile);
  });
});
