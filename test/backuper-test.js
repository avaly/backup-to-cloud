const assert = require('chai').assert;
const fs = require('fs');

const Crypter = require('../lib/Crypter');
const utils = require('./utils');

const DATA_DIR = utils.DATA_DIR;
const DELETED = utils.DELETED;
const FIXTURES_DIR = utils.FIXTURES_DIR;
const TEMP_DIR = utils.TEMP_DIR;

function assertAWS(log, index, operation, pattern, storageClass) {
	assert.isAbove(log.length, index);
	assert.equal(log[index][1], operation);
	if (operation === 'cp') {
		assert.match(log[index][3], pattern);
		if (storageClass) {
			assert.include(log[index], storageClass);
		}
	}
	else {
		assert.match(log[index][2], pattern);
	}
}

describe('backuper', () => {
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
				assert.include(output, 'Backuper.start: all=7 / synced=0');
				assert.include(output, 'Backuper.add:');
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
				// The last file is the DB file
				assert.equal(awsLog.length, 3);

				assertAWS(awsLog, 0, 'cp',
					/s3:\/\/test\-bucket\/.*\/_fixtures_\/bar\/1\-small\.txt/,
					'STANDARD');
				assertAWS(awsLog, 1, 'cp',
					/s3:\/\/test\-bucket\/.*\/_fixtures_\/bar\/2\-medium\.txt/,
					'STANDARD');
				assertAWS(awsLog, 2, 'cp',
					/s3:\/\/test\-bucket\/db\-test\.json/,
					'STANDARD');

				assert.equal(
					fs.readFileSync(TEMP_DIR + 'db-test.json', 'utf-8'),
					fs.readFileSync(DATA_DIR + 'db-test.json', 'utf-8')
				);

				// Verify encryption
				assert.notEqual(
					fs.readFileSync(TEMP_DIR + '1-small.txt', 'utf-8'),
					fs.readFileSync(FIXTURES_DIR + 'bar/1-small.txt', 'utf-8')
				);

				return Crypter.decrypt(TEMP_DIR + '1-small.txt');
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
				// Only one new file + the db (+ the other 3) fit into the session size
				assert.equal(awsLog.length, 5);

				assertAWS(awsLog, 3, 'cp',
					/s3:\/\/test\-bucket\/.*\/_fixtures_\/bar\/3\-large\.txt/,
					'STANDARD_IA');
				assertAWS(awsLog, 4, 'cp', /s3:\/\/test\-bucket\/db\-test\.json/);
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
				// 1-fail.dat should fail by aws-mock,
				assert.equal(awsLog.length, 8);

				assertAWS(awsLog, 5, 'cp',
					/s3:\/\/test\-bucket\/.*\/_fixtures_\/1\-fail\.dat/,
					'STANDARD');
				assertAWS(awsLog, 6, 'cp',
					/s3:\/\/test\-bucket\/.*\/_fixtures_\/2 medium\.dat/,
					'STANDARD');
				assertAWS(awsLog, 7, 'cp', /s3:\/\/test\-bucket\/db\-test\.json/);
			})
			.then(utils.getDataContent)
			.then((db) => {
				assert.isObject(db.synced);
				assert.equal(Object.keys(db.synced).length, 4);

				assert.isUndefined(
					db.synced[`${FIXTURES_DIR}foo/1-fail.dat`]
				);
				assert.isArray(
					db.synced[`${FIXTURES_DIR}foo/2 medium.dat`]
				);
			});
	});

	it('does not sync the DB file when no file syncs have been made', () => {
		const db = utils.getDataContent();
		Object.keys(db.all).forEach((file) => {
			db.synced[file] = [db.all[file][0], 123, 456];
		});
		utils.clean();
		utils.setDataContent(db);

		return transfer()
			.then(utils.getAWSLog)
			.then((awsLog) => {
				assert.isArray(awsLog);
				assert.equal(awsLog.length, 0);
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
				assert.equal(awsLog.length, 4);

				assertAWS(awsLog, 0, 'rm',
					/s3:\/\/test\-bucket\/.*\/bar\/1\-small\-recent\.txt/);
				assertAWS(awsLog, 1, 'rm',
					/s3:\/\/test\-bucket\/.*\/bar\/2\-small\-long\-ago\.txt/);
				assertAWS(awsLog, 2, 'rm',
					/s3:\/\/test\-bucket\/.*\/bar\/4\-large\-long\-ago\.txt/);
				assertAWS(awsLog, 3, 'cp', /s3:\/\/test\-bucket\/db\-test\.json/);
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

	it('should stop transfer after max failed', () => {
		utils.clean();

		const all = {};
		all[`${FIXTURES_DIR}foo/1-fail.dat`] = ['abc', 1];
		all[`${FIXTURES_DIR}foo/3-fail.dat`] = ['abc', 1];
		all[`${FIXTURES_DIR}foo/4-small.dat`] = ['abc', 1];
		utils.setDataContent({
			all: all
		});

		return transfer()
			.then(utils.getAWSLog)
			.then((awsLog) => {
				assert.isArray(awsLog);
				assert.equal(awsLog.length, 3);
				assertAWS(awsLog, 0, 'cp', /s3:\/\/test\-bucket\/.+\/1\-fail\.dat/);
				assertAWS(awsLog, 1, 'cp', /s3:\/\/test\-bucket\/.+\/3\-fail\.dat/);
				assertAWS(awsLog, 2, 'cp', /s3:\/\/test\-bucket\/db\-test\.json/);
			})
			.then(utils.getDataContent)
			.then((db) => {
				assert.isUndefined(db.synced[`${FIXTURES_DIR}foo/4-small.dat`]);
			});
	});
});
