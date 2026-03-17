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
		utils.clean([`${TEMP_DIR}*`]);
	});

	it('transfers nothing on dry mode', async () => {
		const output = await restore(['--output', '.', '/'], true);

		assert.include(output, 'This is a DRY run!');
		assert.include(output, 'Restorer.start: remotePrefix=/ localPath=/');
		assert.include(
			output,
			'Restorer.filter: 7 matching files with a total file size of 427 kB in DB',
		);

		const awsLog = utils.getAWSLog();

		assert.isArray(awsLog);
		assert.equal(awsLog.length, 1);
		assertAWS(awsLog, 0, /s3:\/\/test-bucket\/db-test\.sqlite/);
	});

	it('shows help with no output flag', async () => {
		const output = await restore([]);

		assert.include(output, 'Usage:');

		const awsLog = utils.getAWSLog();

		assert.isArray(awsLog);
		assert.equal(awsLog.length, 0);
	});

	it('restores prefix only', async () => {
		const output = await restore(['--yes', '--output', TEMP_DIR, '/bar/']);

		assert.include(
			output,
			'Restorer.filter: 3 matching files with a total file size of 308 kB in DB',
		);
		assert.include(output, 'Restorer.finish: 3 restored, 0 failed');

		const awsLog = utils.getAWSLog();

		assert.isArray(awsLog);
		assert.equal(awsLog.length, 4);
		assertAWS(awsLog, 0, /s3:\/\/test-bucket\/db-test\.sqlite/);
		assertAWS(awsLog, 1, /s3:\/\/test-bucket\/bar\/1-small\.txt/);
		assertAWS(awsLog, 2, /s3:\/\/test-bucket\/bar\/2-medium\.txt/);
		assertAWS(awsLog, 3, /s3:\/\/test-bucket\/bar\/3-large\.txt/);

		utils.assertFilesEqual(`${TEMP_DIR}bar/1-small.txt`, `${FIXTURES_DIR}bar/1-small.txt`);
		utils.assertFilesEqual(`${TEMP_DIR}bar/2-medium.txt`, `${FIXTURES_DIR}bar/2-medium.txt`);
		utils.assertFilesEqual(`${TEMP_DIR}bar/3-large.txt`, `${FIXTURES_DIR}bar/3-large.txt`);
	});

	it('restores all', async () => {
		const output = await restore(['--yes', '--output', TEMP_DIR, '/']);

		assert.include(
			output,
			'Restorer.filter: 7 matching files with a total file size of 427 kB in DB',
		);
		assert.include(output, 'Restorer.finish: 6 restored, 1 failed');
		assert.include(output, 'Failed to restore:');
		assert.include(output, '/foo/1-fail.dat');

		const awsLog = utils.getAWSLog();

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

		utils.assertFilesEqual(`${TEMP_DIR}bar/1-small.txt`, `${FIXTURES_DIR}bar/1-small.txt`);
		utils.assertFilesEqual(`${TEMP_DIR}bar/2-medium.txt`, `${FIXTURES_DIR}bar/2-medium.txt`);
		utils.assertFilesEqual(`${TEMP_DIR}bar/3-large.txt`, `${FIXTURES_DIR}bar/3-large.txt`);
		assert.isFalse(fs.existsSync(`${TEMP_DIR}1-fail.dat`));
		utils.assertFilesEqual(
			`${TEMP_DIR}2 '"$@%&\`medium.dat`,
			`${FIXTURES_DIR}foo/2 '"$@%&\`medium.dat`,
		);
		utils.assertFilesEqual(`${TEMP_DIR}3-dummy.pdf`, `${FIXTURES_DIR}originals/3-dummy.pdf`);
		utils.assertFilesEqual(
			`${TEMP_DIR}ham/first/1-first.txt`,
			`${FIXTURES_DIR}ham/first/1-first.txt`,
		);
		utils.assertFilesEqual(
			`${TEMP_DIR}ham/first/2-first.txt`,
			`${FIXTURES_DIR}ham/first/2-first.txt`,
		);
	});

	it('filters by max size in dry mode', async () => {
		const output = await restore(['--max-size', '10000', '--output', TEMP_DIR, '/'], true);

		assert.include(output, 'This is a DRY run!');
		assert.include(
			output,
			'Restorer.filter: 3 matching files with a total file size of 4.1 kB in DB',
		);

		const awsLog = utils.getAWSLog();

		assert.isArray(awsLog);
		assert.equal(awsLog.length, 1);
		assertAWS(awsLog, 0, /s3:\/\/test-bucket\/db-test\.sqlite/);
	});

	it('tests a file', async () => {
		const output = await restore(['--test', '0', '--output', TEMP_DIR, '/']);

		assert.include(output, 'Restorer.test OK: /bar/1-small.txt');
		assert.include(output, 'Restorer result: PASS');
		assert.include(output, 'Restorer.finish: 1 restored, 0 failed');

		const awsLog = utils.getAWSLog();

		assert.isArray(awsLog);
		assert.equal(awsLog.length, 2);
		assertAWS(awsLog, 0, /s3:\/\/test-bucket\/db-test\.sqlite/);
		assertAWS(awsLog, 1, /s3:\/\/test-bucket\/bar\/1-small\.txt/);
	});

	it('tests an archive', async () => {
		const output = await restore(['--test', '6', '--output', TEMP_DIR, '/']);

		assert.include(output, 'Restorer.test OK: /ham/first/first.tar');
		assert.include(output, 'Restorer result: PASS');
		assert.include(output, 'Restorer.finish: 1 restored, 0 failed');

		const awsLog = utils.getAWSLog();

		assert.isArray(awsLog);
		assert.equal(awsLog.length, 2);
		assertAWS(awsLog, 0, /s3:\/\/test-bucket\/db-test\.sqlite/);
		assertAWS(awsLog, 1, /s3:\/\/test-bucket\/ham\/first\/first\.tar/);
	});

	it('tests a failing file', async () => {
		const output = await restore(['--test', '3', '--output', TEMP_DIR, '/'], false, true);

		assert.include(output, 'exit code: 1');
		assert.include(output, 'Restorer.test FAIL: /1-fail.dat');
		assert.include(output, 'Restorer result: FAIL');
		assert.include(output, 'Restorer.finish: 0 restored, 1 failed');

		const awsLog = utils.getAWSLog();

		assert.isArray(awsLog);
		assert.equal(awsLog.length, 2);
		assertAWS(awsLog, 0, /s3:\/\/test-bucket\/db-test\.sqlite/);
		assertAWS(awsLog, 1, /s3:\/\/test-bucket\/1-fail\.dat/);
	});

	it('tests a file filtered by max size', async () => {
		// Use a test index that would have selected a large file (e.g. /bar/3-large.txt)
		// before max-size filtering, and ensure that a small file is tested instead.
		const output = await restore(['--test', '2', '--max-size', '10000', '--output', TEMP_DIR, '/']);

		// The tested file should be one of the small (<= max-size) files.
		assert.include(output, 'Restorer.test OK: /ham/first/first.tar');
		// Ensure the large file is not selected.
		assert.notInclude(output, 'Restorer.test OK: /bar/3-large.txt');
		assert.include(output, 'Restorer.finish: 1 restored, 0 failed');

		const awsLog = utils.getAWSLog();

		assert.isArray(awsLog);
		assert.equal(awsLog.length, 2);
		assertAWS(awsLog, 0, /s3:\/\/test-bucket\/db-test\.sqlite/);
		assertAWS(awsLog, 1, /s3:\/\/test-bucket\/ham\/first\/first\.tar/);
	});
});
