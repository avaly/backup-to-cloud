import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import assert from 'node:assert/strict';

import Archiver from '../lib/Archiver.js';
import { TEMP_DIR, clean } from './utils.js';

const CLEANUP = [];

function track(targetPath) {
  CLEANUP.push(targetPath);
  return targetPath;
}

describe('archiver', () => {
  afterEach(() => {
    clean(CLEANUP.splice(0));
  });

  it('compresses files starting with a dash', async () => {
    const sourceDir = track(fs.mkdtempSync(path.join(TEMP_DIR, 'backup-to-cloud-archiver-src-')));
    const outputDir = track(fs.mkdtempSync(path.join(TEMP_DIR, 'backup-to-cloud-archiver-out-')));
    const dashFile = path.join(sourceDir, '-leading.txt');
    const plainFile = path.join(sourceDir, 'plain.txt');

    fs.writeFileSync(dashFile, 'dash content');
    fs.writeFileSync(plainFile, 'plain content');

    const archiveFile = track(await Archiver.compress(sourceDir));

    await Archiver.decompress(archiveFile, outputDir);

    assert.strictEqual(
      fs.readFileSync(path.join(outputDir, '-leading.txt'), 'utf8'),
      'dash content',
    );
    assert.strictEqual(fs.readFileSync(path.join(outputDir, 'plain.txt'), 'utf8'), 'plain content');
  });
});
