import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import pkg from './package.js';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const env = process.env.BACKUP_ENV || 'default';
const configFile = path.resolve(ROOT_DIR, `config.${env}.js`);

if (!fs.existsSync(configFile)) {
  console.log(
    `${pkg.name} version ${pkg.version}

Config file is missing: config.${env}.js`,
  );
  process.exit(1);
}

const config = (await import(pathToFileURL(configFile).href)).default;

export default config;
