import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import pkg from './package.js';
import { isSeaBinary } from './sea.js';

const env = process.env.BACKUP_ENV || 'default';
const configFile = path.resolve(process.cwd(), `config.${env}.js`);
const configExists = fs.existsSync(configFile);
const require = createRequire(import.meta.url);

if (
  !configExists &&
  !process.argv.some(
    (arg) =>
      arg === 'init' ||
      arg === 'check-config' ||
      arg === '--help' ||
      arg === '-h' ||
      arg === '--version' ||
      arg === '-V',
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
  const configModule = isSeaBinary()
    ? require(configFile)
    : await import(pathToFileURL(configFile).href);
  config = configModule.default || configModule;
}

export default config;
