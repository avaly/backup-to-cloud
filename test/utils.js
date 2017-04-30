const assert = require('chai').assert;
const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const DB = require('../lib/DB.sqlite');
const config = require('../lib/config');
const utils = require('../lib/utils');

const execSync = childProcess.execSync;

const BIN_FILES = {
	backup: path.resolve(__dirname, '..', 'bin', 'backup-to-cloud'),
	decrypt: path.resolve(__dirname, '..', 'bin', 'backup-decrypt'),
	restore: path.resolve(__dirname, '..', 'bin', 'backup-restore'),
	verify: path.resolve(__dirname, '..', 'bin', 'backup-verify'),
};
const DATA_DIR = path.resolve(__dirname, '..', 'data') + path.sep;
const TEMP_DIR = path.resolve(__dirname, '..', 'tmp') + path.sep;
const AWS_LOG = DATA_DIR + 'aws.json';
const DB_FILE = path.resolve(__dirname, '..') + path.sep + config.dbSQLite;
const FIXTURES_DIR = path.resolve(__dirname, '_fixtures_') + path.sep;

module.exports = {
	AWS_LOG: AWS_LOG,
	DATA_DIR: DATA_DIR,
	DB_FILE: DB_FILE,
	DB_TYPES: DB.TYPES,
	DELETED: utils.DELETED,
	FIXTURES_DIR: FIXTURES_DIR,
	TEMP_DIR: TEMP_DIR,

	execPromise: utils.execPromise,

	clean: (items) => {
		if (fs.existsSync(AWS_LOG)) {
			fs.unlinkSync(AWS_LOG);
		}
		if (fs.existsSync(DB_FILE)) {
			fs.unlinkSync(DB_FILE);
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
		if (fs.existsSync(DB_FILE)) {
			const db = new DB();
			return db.getAll();
		}
		return {};
	},

	setDataContent: (data) => {
		const db = new DB();
		return db.setAll(data);
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

	mockLocal: (path, hash, size, type) => {
		return {
			path: path,
			hash: hash || utils.DELETED,
			type: type || DB.TYPES.FILE,
			size: size || 123
		};
	},

	mockRemote: (path, hash, size, timestamp, type) => {
		return {
			path: path,
			hash: hash || 'abc',
			type: type || DB.TYPES.FILE,
			size: size || 123,
			timestamp: timestamp || 456
		};
	},

	assertLocalDeleted: (db, path) => {
		assert.equal(
			db.localsByPath[path].hash,
			utils.DELETED
		);
	},

	assertFilesEqual: (a, b) => {
		assert.equal(
			fs.readFileSync(a, 'utf-8'),
			fs.readFileSync(b, 'utf-8')
		);
	},

	cp: (from, to) => {
		const cmd = ['cp', from, to].join(' ');
		execSync(cmd, {
			encoding: 'utf-8'
		});
	},
};
