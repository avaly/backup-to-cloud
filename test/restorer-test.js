const assert = require('chai').assert;
const fs = require('fs');

const utils = require('./utils');

const FIXTURES_DIR = utils.FIXTURES_DIR;
const TEMP_DIR = utils.TEMP_DIR;

function assertAWS(log, index, remotePattern, localPattern) {
	assert.isAbove(log.length, index);
	if (log[index][1] === 'cp') {
		assert.match(log[index][2], remotePattern);
		if (localPattern) {
			assert.match(log[index][3], localPattern);
		}
	}
}

describe('restorer', () => {
	const restore = (args, dry, allowFailure = false) =>
		utils.run(['--verbose', dry && '--dry'].concat(args || []), 'restore', allowFailure);

	beforeEach(() => {
		utils.clean([TEMP_DIR + '*']);
	});

	it('transfers nothing on dry mode', () => {
		return restore(['--output', '.', '/'], true)
			.then(output => {
				assert.include(output, 'This is a DRY run!');
				assert.include(output, 'Restorer.start: remotePrefix=/ localPath=/');
				assert.include(
					output,
					'Restorer.filter: 7 matching files with a total file size of 427 kB in DB',
				);
			})
			.then(utils.getAWSLog)
			.then(awsLog => {
				assert.isArray(awsLog);
				assert.equal(awsLog.length, 1);
				assertAWS(awsLog, 0, /s3:\/\/test-bucket\/db-test\.sqlite/);
			});
	});

	it('shows help with no output flag', () => {
		return restore([])
			.then(output => {
				assert.include(output, 'Usage:');
			})
			.then(utils.getAWSLog)
			.then(awsLog => {
				assert.isArray(awsLog);
				assert.equal(awsLog.length, 0);
			});
	});

	it('restores prefix only', () => {
		return restore(['--yes', '--output', TEMP_DIR, '/bar/'])
			.then(output => {
				assert.include(
					output,
					'Restorer.filter: 3 matching files with a total file size of 308 kB in DB',
				);
				assert.include(output, 'Restorer.finish: 3 restored, 0 failed');
			})
			.then(utils.getAWSLog)
			.then(awsLog => {
				assert.isArray(awsLog);
				assert.equal(awsLog.length, 4);
				assertAWS(awsLog, 0, /s3:\/\/test-bucket\/db-test\.sqlite/);
				assertAWS(awsLog, 1, /s3:\/\/test-bucket\/bar\/1-small\.txt/);
				assertAWS(awsLog, 2, /s3:\/\/test-bucket\/bar\/2-medium\.txt/);
				assertAWS(awsLog, 3, /s3:\/\/test-bucket\/bar\/3-large\.txt/);

				utils.assertFilesEqual(TEMP_DIR + 'bar/1-small.txt', FIXTURES_DIR + 'bar/1-small.txt');
				utils.assertFilesEqual(TEMP_DIR + 'bar/2-medium.txt', FIXTURES_DIR + 'bar/2-medium.txt');
				utils.assertFilesEqual(TEMP_DIR + 'bar/3-large.txt', FIXTURES_DIR + 'bar/3-large.txt');
			});
	});

	it('restores all', () => {
		return restore(['--yes', '--output', TEMP_DIR, '/'])
			.then(output => {
				assert.include(
					output,
					'Restorer.filter: 7 matching files with a total file size of 427 kB in DB',
				);
				assert.include(output, 'Restorer.finish: 6 restored, 1 failed');
				assert.include(output, 'Failed to restore:');
				assert.include(output, '/foo/1-fail.dat');
			})
			.then(utils.getAWSLog)
			.then(awsLog => {
				assert.isArray(awsLog);
				assert.equal(awsLog.length, 8);
				assertAWS(awsLog, 0, /s3:\/\/test-bucket\/db-test\.sqlite/);
				assertAWS(awsLog, 1, /s3:\/\/test-bucket\/bar\/1-small\.txt/);
				assertAWS(awsLog, 2, /s3:\/\/test-bucket\/bar\/2-medium\.txt/);
				assertAWS(awsLog, 3, /s3:\/\/test-bucket\/bar\/3-large\.txt/);
				assertAWS(awsLog, 4, /s3:\/\/test-bucket\/1-fail\.dat/);
				assertAWS(awsLog, 5, /s3:\/\/test-bucket\/2 '"\$@%&`medium\.dat/);
				assertAWS(awsLog, 6, /s3:\/\/test-bucket\/3-dummy\.pdf/);
				assertAWS(awsLog, 7, /s3:\/\/test-bucket\/ham\/first\/first.tar/);

				utils.assertFilesEqual(TEMP_DIR + 'bar/1-small.txt', FIXTURES_DIR + 'bar/1-small.txt');
				utils.assertFilesEqual(TEMP_DIR + 'bar/2-medium.txt', FIXTURES_DIR + 'bar/2-medium.txt');
				utils.assertFilesEqual(TEMP_DIR + 'bar/3-large.txt', FIXTURES_DIR + 'bar/3-large.txt');
				assert.isFalse(fs.existsSync(TEMP_DIR + '1-fail.dat'));
				utils.assertFilesEqual(
					TEMP_DIR + '2 \'"$@%&`medium.dat',
					FIXTURES_DIR + 'foo/2 \'"$@%&`medium.dat',
				);
				utils.assertFilesEqual(TEMP_DIR + '3-dummy.pdf', FIXTURES_DIR + 'originals/3-dummy.pdf');
				utils.assertFilesEqual(
					TEMP_DIR + 'ham/first/1-first.txt',
					FIXTURES_DIR + 'ham/first/1-first.txt',
				);
				utils.assertFilesEqual(
					TEMP_DIR + 'ham/first/2-first.txt',
					FIXTURES_DIR + 'ham/first/2-first.txt',
				);
			});
	});

	it('tests a file', () => {
		return restore(['--test', '0', '--output', TEMP_DIR, '/'])
			.then(output => {
				assert.include(output, 'Restorer.test OK: /bar/1-small.txt');
				assert.include(output, 'Restorer result: PASS');
				assert.include(output, 'Restorer.finish: 1 restored, 0 failed');
			})
			.then(utils.getAWSLog)
			.then(awsLog => {
				assert.isArray(awsLog);
				assert.equal(awsLog.length, 2);
				assertAWS(awsLog, 0, /s3:\/\/test-bucket\/db-test\.sqlite/);
				assertAWS(awsLog, 1, /s3:\/\/test-bucket\/bar\/1-small\.txt/);
			});
	});

	it('tests an archive', () => {
		return restore(['--test', '6', '--output', TEMP_DIR, '/'])
			.then(output => {
				assert.include(output, 'Restorer.test OK: /ham/first/first.tar');
				assert.include(output, 'Restorer result: PASS');
				assert.include(output, 'Restorer.finish: 1 restored, 0 failed');
			})
			.then(utils.getAWSLog)
			.then(awsLog => {
				assert.isArray(awsLog);
				assert.equal(awsLog.length, 2);
				assertAWS(awsLog, 0, /s3:\/\/test-bucket\/db-test\.sqlite/);
				assertAWS(awsLog, 1, /s3:\/\/test-bucket\/ham\/first\/first\.tar/);
			});
	});

	it('tests a failing file', () => {
		return restore(['--test', '3', '--output', TEMP_DIR, '/'], false, true)
			.then(output => {
				assert.include(output, 'exit code: 1');
				assert.include(output, 'Restorer.test FAIL: /1-fail.dat');
				assert.include(output, 'Restorer result: FAIL');
				assert.include(output, 'Restorer.finish: 0 restored, 1 failed');
			})
			.then(utils.getAWSLog)
			.then(awsLog => {
				assert.isArray(awsLog);
				assert.equal(awsLog.length, 2);
				assertAWS(awsLog, 0, /s3:\/\/test-bucket\/db-test\.sqlite/);
				assertAWS(awsLog, 1, /s3:\/\/test-bucket\/1-fail\.dat/);
			})
			.catch(err => console.log('err', err));
	});
});
