import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import pkg from './package.js';

const env = process.env.BACKUP_ENV || 'default';
const configFile = path.resolve(process.cwd(), `config.${env}.js`);
const configExists = fs.existsSync(configFile);

if (
  !configExists &&
  !process.argv.some(
    (arg) => arg === 'init' || arg === 'check-config' || arg === '--help' || arg === '-h',
  )
) {
  console.log(
    `${pkg.name} v${pkg.version}

Config file is missing: config.${env}.js`,
  );
  process.exit(1);
}

let config = {
  dbSQLite: 'data/db.sqlite',
};

if (configExists) {
  const configModule = await import(pathToFileURL(configFile).href);
  config = configModule.default || configModule;
}

export default config;
