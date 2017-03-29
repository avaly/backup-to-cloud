const assert = require('chai').assert;
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const utils = require('../lib/utils');

const execSync = childProcess.execSync;

const BIN_FILES = {
	backup: path.resolve(__dirname, '..', 'bin', 'backup-to-cloud'),
	decrypt: path.resolve(__dirname, '..', 'bin', 'backup-decrypt'),
	restore: path.resolve(__dirname, '..', 'bin', 'backup-restore'),
};
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

	clean: (items) => {
		if (fs.existsSync(AWS_LOG)) {
			fs.unlinkSync(AWS_LOG);
		}
		if (fs.existsSync(DATA_FILE)) {
			fs.unlinkSync(DATA_FILE);
		}
		if (items && Array.isArray(items)) {
			items.forEach((item) => {
				execSync('rm -rf ' + item);
			});
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

	run: (args, binFile) => {
		const bin = BIN_FILES[binFile || 'backup'];
		const cmd = process.env.COVERAGE
			? './node_modules/.bin/istanbul'
			: bin;
		const execArgs = process.env.COVERAGE
			? [
				'cover',
				'--report', 'none',
				'--print', 'none',
				'--include-pid',
				bin,
				'--'
			].concat(args)
			: args;
		return utils.execPromise(cmd, execArgs);
	},

	delay: (timeout) => {
		return new Promise((resolve) => {
			setTimeout(resolve, timeout);
		});
	},

	assertFilesEqual: (a, b) => {
		assert.equal(
			fs.readFileSync(a, 'utf-8'),
			fs.readFileSync(b, 'utf-8')
		);
	}
};
