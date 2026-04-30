import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import pkg from './package.js';
import { ROOT_DIR } from './root.js';

const env = process.env.BACKUP_ENV || 'default';
const configFile = path.resolve(ROOT_DIR, `config.${env}.js`);

if (!fs.existsSync(configFile)) {
  console.log(
    `${pkg.name} version ${pkg.version}

Config file is missing: config.${env}.js`,
  );
  process.exit(1);
}

const configModule = await import(pathToFileURL(configFile).href);
const config = configModule.default || configModule.config || configModule;

export { ROOT_DIR };
export default config;
