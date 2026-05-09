import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import config from './config.js';
import { getBundledSampleConfigContent } from './sea.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_SAMPLE_CONFIG_PATH = path.resolve(__dirname, '..', 'config.sample.js');

export function getCliName(argv = process.argv) {
  return process.env.BACKUP_TO_CLOUD_CLI_NAME || path.basename(argv[1] || process.execPath);
}

export function getLockDirectory() {
  const directory = path.join(
    config.tempDir || process.env.XDG_RUNTIME_DIR || os.tmpdir(),
    'locks',
  );

  return path.resolve(directory);
}

export function getLockFilePath(lockName) {
  return path.join(getLockDirectory(), `.${lockName}.lock`);
}

export function getSampleConfigContent(directory = process.cwd()) {
  if (process.env.BACKUP_TO_CLOUD_SAMPLE_CONFIG) {
    return process.env.BACKUP_TO_CLOUD_SAMPLE_CONFIG;
  }

  const bundledSampleConfig = getBundledSampleConfigContent();
  if (bundledSampleConfig) {
    return bundledSampleConfig;
  }

  const localSamplePath = path.join(directory, 'config.sample.js');
  const sourcePath = fs.existsSync(localSamplePath) ? localSamplePath : DEFAULT_SAMPLE_CONFIG_PATH;

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Sample config file is missing: ${sourcePath}`);
  }

  return fs.readFileSync(sourcePath, 'utf8');
}
