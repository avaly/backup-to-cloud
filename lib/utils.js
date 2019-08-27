const crypto = require('crypto');
const childProcess = require('child_process');
const fs = require('fs');
const md5File = require('md5-file');
const os = require('os');
const path = require('path');

const config = require('./config');

const exec = childProcess.exec;
const spawnSync = childProcess.spawnSync;

function hasFlag(flag) {
	return !!process.argv.find(arg => arg === '--' + flag);
}

function getOption(name) {
	const index = process.argv.findIndex(arg => arg === '--' + name);
	if (index > -1) {
		return process.argv[index + 1];
	}
	return null;
}

const utils = {
	DELETED: 'DELETED',
	DRY_RUN: hasFlag('dry'),
	DEV: process.env.BACKUP_ENV === 'dev',
	FIXTURES_DIR: path.resolve(__dirname, '..', 'test', '_fixtures_') + path.sep,
	TEST: process.env.BACKUP_ENV === 'test',
	VERBOSE: hasFlag('verbose'),

	hasFlag: hasFlag,
	getOption: getOption,

	execPromise: (bin, args, cwd, verbose) => {
		return new Promise((resolve, reject) => {
			const cmd = bin
				.split(' ')
				.concat(args)
				.map(utils.escape)
				.join(' ');

			const child = exec(cmd, {
				cwd: cwd || path.resolve(__dirname, '..'),
			});

			let stdout = '';
			let stderr = '';
			child.stdout.on('data', data => {
				stdout += data;
				if (verbose) {
					utils.debug(data);
				}
			});
			child.stderr.on('data', data => {
				stderr += data;
				if (verbose) {
					utils.debug(data);
				}
			});

			child.addListener('error', err => {
				if (err.code === 'ENOENT') {
					return reject(`Could not find ${err.path}`);
				}
				reject(stderr);
			});

			child.addListener('exit', code => {
				if (utils.TEST) {
					utils.debug(`${bin} child process exit code: ${code}`);
				}
				if (code) {
					reject(`exit code: ${code}\n\n${stderr}\n\n${stdout}`);
				} else {
					resolve(stdout);
				}
			});
		});
	},

	execSync: (bin, args, escapeArgs) => {
		const execArgs = escapeArgs ? args.map(utils.escape) : args;

		const result = spawnSync(bin, execArgs, {
			encoding: 'utf-8',
		});

		return result.stdout;
	},

	escape: s => {
		return s && `"${s.replace(/([`"$])/g, '\\$1')}"`;
	},

	hash: data => {
		return crypto
			.createHash('sha256')
			.update(data)
			.digest('hex');
	},

	mkdir: dir => {
		if (!fs.existsSync(dir)) {
			utils.execSync('mkdir', ['-p', dir]);
		}
	},

	tempFile: prefix => {
		const tempDir = config.tempDir || os.tmpdir();
		utils.mkdir(tempDir);

		let file;
		do {
			file = `${tempDir}/${prefix}${crypto.randomBytes(6).readUInt32LE(0)}`;
		} while (fs.existsSync(file));

		return file;
	},

	localFilePath: filePath => {
		if (fs.existsSync(filePath)) {
			return filePath;
		}

		const localPrefix = config.prefixRemove.find(prefix => {
			return fs.existsSync(`${prefix}${filePath}`);
		});

		if (!localPrefix) {
			throw new Error(`Could not find any prefix for a local file: ${filePath}`);
		}

		return localPrefix + filePath;
	},

	remoteFilePath: file => {
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
	},

	ask(question) {
		// Code adapted from https://github.com/tcql/node-yesno/blob/master/yesno.js
		return new Promise((resolve, reject) => {
			process.stdout.write(question + ' ');

			process.stdin.setEncoding('utf8');
			process.stdin
				.once('data', function(val) {
					let result;
					const clean = val.trim().toLowerCase();

					if (['yes', 'y', 'ok'].includes(clean)) {
						result = true;
					} else if (['no', 'n'].includes(clean)) {
						result = false;
					} else {
						reject(new Error(`Invalid response: ${clean}`));
						return;
					}

					process.stdin.unref();
					resolve(result);
				})
				.resume();
		});
	},

	areFilesIdentical: (fileA, fileB) => {
		return (
			fs.existsSync(fileA) && fs.existsSync(fileB) && md5File.sync(fileA) === md5File.sync(fileB)
		);
	},
};

if (utils.VERBOSE) {
	process.on('unhandledRejection', (reason, p) => {
		console.error('Unhandled Rejection at: Promise', p, 'reason:', reason);
	});
}

module.exports = utils;
