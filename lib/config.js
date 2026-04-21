const fs = require('fs');

const package = require('../package.json');
const runtime = require('./runtime');

const env = process.env.BACKUP_ENV || 'default';
const configFile = runtime.findConfigFile(env);

if (!configFile || !fs.existsSync(configFile)) {
  console.log(
    `${package.name} version ${package.version}

Config file is missing: ${configFile || `config.${env}.js`}`,
  );
  process.exit(1);
}

module.exports = require(configFile);
