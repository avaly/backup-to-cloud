const fs = require('fs');

const package = require('../package.json');

const env = process.env.BACKUP_ENV || 'default';
const configFile = `${__dirname}/../config.${env}.js`;

if (!fs.existsSync(configFile)) {
	console.log(
		`${package.name} version ${package.version}

Config file is missing: config.${env}.js`,
	);
	process.exit(1);
}

module.exports = require(configFile);
