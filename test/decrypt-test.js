const assert = require('chai').assert;
const childProcess = require('child_process');
const fs = require('fs');

const Crypter = require('../lib/Crypter');
const utils = require('./utils');

const execFileSync = childProcess.execFileSync;

const FIXTURES_DIR = utils.FIXTURES_DIR;
const TEMP_DIR = utils.TEMP_DIR;

describe('decrypt', () => {
	if (!fs.existsSync(TEMP_DIR)) {
		execFileSync('mkdir', ['-p', TEMP_DIR]);
	}

	it('shows help', () => {
		return utils.run(['--help'], 'decrypt')
			.then((result) => {
				assert.include(result, 'Usage:');
			});
	});

	it('stops if input file does not exist', () => {
		const fileOutput = TEMP_DIR + 'should-not-be-created.txt';

		const args = [
			'--output',
			fileOutput,
			TEMP_DIR + 'this-should-not-exist.txt'
		];

		return utils.run(args, 'decrypt')
			.then(() => {
				assert.isOk(false);
			}, () => {
				assert.isNotOk(fs.existsSync(fileOutput));
			});
	});

	it('decrypts file', () => {
		const fileSource = FIXTURES_DIR + 'bar/1-small.txt';
		const fileOutput = TEMP_DIR + 'decrypted.txt';

		const contentSource = fs.readFileSync(fileSource, 'utf-8');

		return Crypter.encrypt(fileSource)
			.then((encryptedFile) => {
				const args = [
					'--output',
					fileOutput,
					encryptedFile.path
				];

				const contentEncrypted = fs.readFileSync(encryptedFile.path, 'utf-8');
				assert.notEqual(contentSource, contentEncrypted);

				return utils.run(args, 'decrypt');
			})
			.then(() => {
				const contentDecrypted = fs.readFileSync(fileOutput, 'utf-8');
				assert.equal(contentSource, contentDecrypted);
			});
	});
});
