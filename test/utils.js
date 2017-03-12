const fs = require('fs');
const path = require('path');
const utils = require('../lib/utils');

const BIN_FILE = path.resolve(__dirname, '..', 'bin', 'backup-to-cloud');
const DATA_DIR = path.resolve(__dirname, '..', 'data') + path.sep;
const TEMP_DIR = path.resolve(__dirname, '..', 'tmp') + path.sep;
const AWS_LOG = DATA_DIR + 'aws.json';
const DATA_FILE = DATA_DIR + 'db-test.json';
const FIXTURES_DIR = path.resolve(__dirname, '_fixtures_') + path.sep;

module.exports = {
	AWS_LOG: AWS_LOG,
	DATA_DIR: DATA_DIR,
	DATA_FILE: DATA_FILE,
	DELETED: 'DELETED',
	FIXTURES_DIR: FIXTURES_DIR,
	TEMP_DIR: TEMP_DIR,

	execPromise: utils.execPromise,

	clean: () => {
		if (fs.existsSync(AWS_LOG)) {
			fs.unlinkSync(AWS_LOG);
		}
		if (fs.existsSync(DATA_FILE)) {
			fs.unlinkSync(DATA_FILE);
		}
	},

	getAWSLog: () => {
		if (fs.existsSync(AWS_LOG)) {
			return JSON.parse(fs.readFileSync(AWS_LOG, 'utf-8'));
		}
		return [];
	},

	getDataContent: () => {
		if (fs.existsSync(DATA_FILE)) {
			return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
		}
		return {};
	},

	setDataContent: (data) => {
		fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
	},

	run: (args) => {
		const cmd = process.env.COVERAGE
			? './node_modules/.bin/istanbul'
			: BIN_FILE;
		const execArgs = process.env.COVERAGE
			? [
				'cover',
				'--report', 'none',
				'--print', 'none',
				'--include-pid',
				BIN_FILE,
				'--'
			].concat(args)
			: args;
		return utils.execPromise(cmd, execArgs);
	},

	delay: (timeout) => {
		return new Promise((resolve) => {
			setTimeout(resolve, timeout);
		});
	}
};
