const fs = require('fs');
const path = require('path');

const config = require('./config');
const utils = require('./utils');

const DB_FILE = path.resolve(path.join(__dirname, '..', config.db));
const DB_DIR = path.dirname(DB_FILE);

class DB {
	constructor() {
		this.file = DB_FILE;
		this.settings = {};
		if (fs.existsSync(DB_FILE)) {
			utils.debug(`Loading DB... ${DB_FILE}`);
			try {
				this.settings = require(DB_FILE);
			} catch (err) {
				// Silently ignore :O
			}
		}
	}

	save() {
		if (utils.DRY_RUN) {
			return;
		}
		utils.debug(`Saving DB... ${DB_FILE}`);
		if (!fs.existsSync(DB_DIR)) {
			utils.execSync('mkdir', ['-p', DB_DIR]);
		}
		fs.writeFileSync(DB_FILE, JSON.stringify(this.settings, null, 2), 'utf-8');
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
