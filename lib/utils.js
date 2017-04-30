const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const config = require('./config');

const exec = childProcess.exec;
const execFileSync = childProcess.execFileSync;

function hasFlag(flag) {
	return !!process.argv.find((arg) => arg === '--' + flag);
}

function getOption(name) {
	const index = process.argv.findIndex((arg) => arg === '--' + name);
	if (index > -1) {
		return process.argv[index + 1];
	}
	return null;
}

const utils = {
	DELETED: 'DELETED',
	DRY_RUN: hasFlag('dry'),
	DEV: process.env.BACKUP_ENV === 'dev',
	TEST: process.env.BACKUP_ENV === 'test',
	VERBOSE: hasFlag('verbose'),

	hasFlag: hasFlag,
	getOption: getOption,

	execPromise: (bin, args, cwd, verbose) => {
		return new Promise((resolve, reject) => {
			const cmd = bin.split(' ').concat(args).map(utils.escape).join(' ');
			const child = exec(cmd, {
				cwd: cwd || path.resolve(__dirname, '..')
			});

			let stdout = '';
			let stderr = '';
			child.stdout.on('data', (data) => {
				stdout += data;
				if (verbose) {
					utils.debug(data);
				}
			});
			child.stderr.on('data', (data) => {
				stderr += data;
				if (verbose) {
					utils.debug(data);
				}
			});

			child.addListener('error', (err) => {
				if (err.code === 'ENOENT') {
					return reject(`Could not find ${err.path}`);
				}
				reject(stderr);
			});

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
	},

	execSync: (bin, args, escapeArgs) => {
		const execArgs = escapeArgs ? args.map(utils.escape) : args;
		try {
			return execFileSync(bin, execArgs, {
				encoding: 'utf-8'
			});
		}
		catch(err) {
			// Silently ignore :O
			// utils.log(err);
		}
	},

	escape: (s) => {
		return s && `"${s.replace(/([`"$])/g, '\\$1')}"`;
	},

	hash: (data) => {
		return crypto.createHash('sha256').update(data).digest('hex');
	},

	mkdir: (dir) => {
		if (!fs.existsSync(dir)) {
			utils.execSync('mkdir', ['-p', dir]);
		}
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
