const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');

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
	DRY_RUN: hasFlag('dry'),
	DEV: process.env.BACKUP_ENV === 'dev',
	TEST: process.env.BACKUP_ENV === 'test',
	VERBOSE: hasFlag('verbose'),

	hasFlag: hasFlag,
	getOption: getOption,

	execPromise: (bin, args, printOutput) => {
		return new Promise((resolve, reject) => {
			const child = exec([bin].concat(args).map(utils.escape).join(' '));

			let stdout = '';
			let stderr = '';
			child.stdout.on('data', (data) => {
				stdout += data;
				if (printOutput) {
					console.log(data);
				}
			});
			child.stderr.on('data', (data) => {
				stderr += data;
				if (printOutput) {
					console.error(data);
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
		return s && `"${s.replace(/(")/g, '\\$1')}"`;
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
