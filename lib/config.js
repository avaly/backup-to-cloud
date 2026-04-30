import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import pkg from './package.js';
import { ROOT_DIR } from './root.js';

const env = process.env.BACKUP_ENV || 'default';
const configFile = path.resolve(ROOT_DIR, `config.${env}.js`);
const configExists = fs.existsSync(configFile);

if (
  !configExists &&
  !process.argv.some((arg) => arg === 'init' || arg === '--help' || arg === '-h')
) {
  console.trace();
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

export { ROOT_DIR };
export default config;
