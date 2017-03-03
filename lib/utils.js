const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');

const config = require('./config');

const execFile = childProcess.execFile;
const execFileSync = childProcess.execFileSync;

function hasFlag(flag) {
	return !!process.argv.find((arg) => arg === '--' + flag);
}

function promisifyChildProcess(child, bin) {
	return new Promise((resolve, reject) => {
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (data) => stdout += data);
		child.stderr.on('data', (data) => stderr += data);
		child.addListener('error', () => reject(stderr));
		child.addListener('exit', (code) => {
			if (utils.TEST) {
				utils.debug(`${bin} child process exit code: ${code}`);
			}
			if (code) {
				reject(stderr);
			} else {
				resolve(stdout);
			}
		});
	});
}

const utils = {
	DRY_RUN: hasFlag('dry'),
	TEST: process.env.BACKUP_ENV === 'test',
	VERBOSE: hasFlag('verbose'),

	hasFlag: hasFlag,

	execPromise: (bin, args) => {
		const cp = execFile(bin, args);
		return promisifyChildProcess(cp, bin);
	},

	execSync: (bin, args) => {
		try {
			return execFileSync(bin, args, {
				encoding: 'utf-8'
			});
		}
		catch(err) {
			// Silently ignore :O
			// utils.log(err);
		}
	},

	hash: (data) => {
		return crypto.createHash('sha256').update(data).digest('hex');
	},

	tempFile: (prefix) => {
		let file;
		do {
			file = os.tmpdir() + '/' + prefix + crypto.randomBytes(6).readUInt32LE(0);
		} while (fs.existsSync(file));
		return file;
	},

	remoteFilePath: (file) => {
		return config.prefixRemove.reduce((remoteFile, prefix) => {
			return remoteFile.replace(prefix, '');
		}, file);
	},

	log: function() {
		const time = new Date().toISOString();
		console.log.apply(console, [time].concat([].slice.call(arguments)));
	},

	debug: function() {
		if (this.VERBOSE) {
			const time = new Date().toISOString();
			console.log.apply(console, [time].concat([].slice.call(arguments)));
		}
	}
};

module.exports = utils;
