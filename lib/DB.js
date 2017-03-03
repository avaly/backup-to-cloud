const fs = require('fs');
const path = require('path');

const config = require('./config');
const utils = require('./utils');

const DB_FILE = path.resolve(path.join(__dirname, '..', config.db));

class DB {
	constructor() {
		this.settings = {};
		if (fs.existsSync(DB_FILE)) {
			utils.debug(`Loading DB... ${DB_FILE}`);
			try {
				this.settings = require(DB_FILE);
			}
			catch(err) {
				// Silently ignore :O
			}
		}
	}

	save() {
		if (utils.DRY_RUN) {
			return;
		}
		utils.debug(`Saving DB... ${DB_FILE}`);
		fs.writeFileSync(
			DB_FILE,
			JSON.stringify(this.settings, null, 2),
			'utf-8'
		);
	}

	get(key, defaultValue) {
		if (typeof this.settings[key] === 'undefined') {
			this.settings[key] = defaultValue;
		}
		return this.settings[key];
	}

	set(key, value) {
		this.settings[key] = value;
	}
}

module.exports = DB;
