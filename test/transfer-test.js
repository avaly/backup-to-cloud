const assert = require('chai').assert;
const fs = require('fs');
const utils = require('./utils');
const config = require('../config.test');

const DATA_DIR = utils.DATA_DIR;
const DELETED = utils.DELETED;
const FIXTURES_DIR = utils.FIXTURES_DIR;

describe('transfer', () => {
	const transfer = (dry) => utils.run(
		['--skip-scan', '--verbose', dry && '--dry']
	);

	before(() => {
		utils.clean();
		return utils.run(['--only-scan']);
	});

	it('transfers nothing on dry mode', () => {
		return transfer(true)
			.then((output) => {
				assert.include(output, 'This is a DRY run!');
				assert.include(output, 'Transfer.start: all=6 / synced=0');
				assert.include(output, 'Transfer.add:');
			})
			.then(utils.getAWSLog)
			.then((awsLog) => {
				assert.isArray(awsLog);
				assert.equal(awsLog.length, 0);
			});
	});

	it('encrypts and transfers files', () => {
		return transfer()
			.then(utils.getAWSLog)
			.then((awsLog) => {
				assert.isArray(awsLog);
				// Only the first 2 files fit into the session size
				// Since 1-small.txt encrypted is less than the session size
				assert.equal(awsLog.length, 2);

				assert.match(
					awsLog[0][3],
					/s3:\/\/test-bucket\/.*\/_fixtures_\/bar\/1-small\.txt/
				);
				assert.include(awsLog[0], 'STANDARD');

				assert.match(
					awsLog[1][3],
					/s3:\/\/test-bucket\/.*\/_fixtures_\/bar\/2-medium\.txt/
				);
				assert.include(awsLog[1], 'STANDARD');

				assert.notEqual(
					fs.readFileSync(DATA_DIR + '1-small.txt', 'utf-8'),
					fs.readFileSync(FIXTURES_DIR + 'bar/1-small.txt', 'utf-8')
				);

				return utils.execPromise(
					'gpg',
					[
						'-q',
						'-d',
						'--passphrase',
						config.encryptionPassphrase,
						DATA_DIR + '1-small.txt'
					]
				);
			})
			.then((decrypted) => {
				assert.equal(
					decrypted,
					fs.readFileSync(FIXTURES_DIR + 'bar/1-small.txt', 'utf-8')
				);
			})
			.then(utils.getDataContent)
			.then((db) => {
				assert.isObject(db.synced);
				assert.equal(Object.keys(db.synced).length, 2);

				const firstFile = `${FIXTURES_DIR}bar/1-small.txt`;
				assert.isArray(db.synced[firstFile]);
				assert.equal(db.synced[firstFile][0], db.all[firstFile][0]);
				assert.notEqual(db.synced[firstFile][1], db.all[firstFile][1]);
				assert.isAbove(
					db.synced[firstFile][2],
					Date.now() - 5 * 1000,
					'timestamp of upload should be withing last 5 seconds'
				);
			});
	});

	it('transfers next file', () => {
		return transfer()
			.then(utils.getAWSLog)
			.then((awsLog) => {
				assert.isArray(awsLog);
				// Only one new file (+ the other 2) fit into the session size
				assert.equal(awsLog.length, 3);

				assert.match(
					awsLog[2][3],
					/s3:\/\/test-bucket\/.*\/_fixtures_\/bar\/3-large\.txt/
				);
				assert.include(awsLog[2], 'STANDARD_IA');
			})
			.then(utils.getDataContent)
			.then((db) => {
				assert.isObject(db.synced);
				assert.equal(Object.keys(db.synced).length, 3);
			});
	});

	it('skips failed file and continues upload of other files', () => {
		return transfer()
			.then(utils.getAWSLog)
			.then((awsLog) => {
				assert.isArray(awsLog);
				// 1-small.dat should fail by aws-mock,
				assert.equal(awsLog.length, 5);

				assert.match(
					awsLog[3][3],
					/s3:\/\/test-bucket\/.*\/_fixtures_\/1-small\.dat/
				);
				assert.include(awsLog[3], 'STANDARD');

				assert.match(
					awsLog[4][3],
					/s3:\/\/test-bucket\/.*\/_fixtures_\/2-medium\.dat/
				);
				assert.include(awsLog[4], 'STANDARD');
			})
			.then(utils.getDataContent)
			.then((db) => {
				assert.isObject(db.synced);
				assert.equal(Object.keys(db.synced).length, 4);

				assert.isUndefined(
					db.synced[`${FIXTURES_DIR}foo/1-small.dat`]
				);
				assert.isArray(
					db.synced[`${FIXTURES_DIR}foo/2-medium.dat`]
				);
			});
	});

	it('removes deleted files', () => {
		utils.clean();

		const now = Date.now();
		const all = {};
		all[`${FIXTURES_DIR}bar/1-small-recent.txt`] = DELETED;
		all[`${FIXTURES_DIR}bar/2-small-long-ago.txt`] = DELETED;
		all[`${FIXTURES_DIR}bar/3-large-recent.txt`] = DELETED;
		all[`${FIXTURES_DIR}bar/4-large-long-ago.txt`] = DELETED;
		const synced = {};
		synced[`${FIXTURES_DIR}bar/1-small-recent.txt`] =
			['abc', 1024, now - 10 * 1000];
		synced[`${FIXTURES_DIR}bar/2-small-long-ago.txt`] =
			['abc', 1024, now - 31 * 24 * 3600 * 1000];
		// This will not be deleted due to recency and size (STANDARD_IA)
		synced[`${FIXTURES_DIR}bar/3-large-recent.txt`] =
			['abc', 135000, now - 10 * 1000];
		synced[`${FIXTURES_DIR}bar/4-large-long-ago.txt`] =
			['abc', 135000, now - 31 * 24 * 3600 * 1000];
		utils.setDataContent({
			all: all,
			synced: synced
		});

		return transfer()
			.then(utils.getAWSLog)
			.then((awsLog) => {
				assert.isArray(awsLog);
				assert.equal(awsLog.length, 3);

				assert.equal(awsLog[0][1], 'rm');
				assert.match(
					awsLog[0][2],
					/s3:\/\/test-bucket\/.*\/bar\/1-small-recent\.txt/
				);

				assert.equal(awsLog[1][1], 'rm');
				assert.match(
					awsLog[1][2],
					/s3:\/\/test-bucket\/.*\/bar\/2-small-long-ago\.txt/
				);

				assert.equal(awsLog[2][1], 'rm');
				assert.match(
					awsLog[2][2],
					/s3:\/\/test-bucket\/.*\/bar\/4-large-long-ago\.txt/
				);
			})
			.then(utils.getDataContent)
			.then((db) => {
				assert.equal(Object.keys(db.all).length, 1);
				assert.equal(Object.keys(db.synced).length, 1);

				const file = `${FIXTURES_DIR}bar/3-large-recent.txt`;
				assert.equal(db.all[file], DELETED);
				assert.isArray(db.synced[file]);
			});
	});
});
