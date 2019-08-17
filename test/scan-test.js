const assert = require('chai').assert;
const fs = require('fs');
const utils = require('./utils');
const Scanner = require('../lib/Scanner');

const FIXTURES_DIR = utils.FIXTURES_DIR;

describe('scan', () => {
	const scan = dry => utils.run(['--only-scan', '--verbose', dry && '--dry']);

	beforeEach(() => {
		utils.clean();
	});

	it('prepares file hash', () => {
		const file = Scanner.scanFile(`${FIXTURES_DIR}bar/1-small.txt`);

		assert.match(
			file.hash,
			/^\/test\/_fixtures_\/bar\/1-small\.txt 1024 \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
		);
		assert.equal(file.size, 1024);
	});

	it('saves nothing for dry mode', () => {
		return scan(true).then(output => {
			assert.include(output, 'This is a DRY run!');
			assert.include(output, '/bar - Files found: 3');
			assert.include(output, '/bar - Archives found: 0');
			assert.include(output, '/foo - Files found: 4');
			assert.include(output, '/foo - Archives found: 0');
			assert.include(output, '/ham - Files found: 0');
			assert.include(output, '/ham - Archives found: 2');
			assert.isFalse(fs.existsSync(utils.DATA_FILE), 'data file was not created');
		});
	});

	it('scans all files for first time', () => {
		return scan()
			.then(utils.getDataContent)
			.then(db => {
				assert.match(db.settings.lastScanTimestamp, /^\d+$/);
				assert.equal(db.locals.length, 9);

				// File sizes
				assert.equal(db.localsByPath[`${FIXTURES_DIR}foo/1-fail.dat`].size, 1024);
				assert.equal(db.localsByPath[`${FIXTURES_DIR}foo/2 '"$@%&\`medium.dat`].size, 102400);
				assert.equal(db.localsByPath[`${FIXTURES_DIR}foo/3-fail.dat`].size, 204800);

				assert.isObject(db.localsByPath[`${FIXTURES_DIR}bar/1-small.txt`]);
				// The hashes depend on the file modified time
				// so we can't rely on these for tests
				assert.isString(db.localsByPath[`${FIXTURES_DIR}bar/1-small.txt`].hash);
				assert.equal(db.localsByPath[`${FIXTURES_DIR}bar/1-small.txt`].hash.length, 64);
				assert.isObject(db.localsByPath[`${FIXTURES_DIR}bar/2-medium.txt`]);
				assert.isObject(db.localsByPath[`${FIXTURES_DIR}bar/3-large.txt`]);

				assert.isObject(db.localsByPath[`${FIXTURES_DIR}ham/first/first.tar`]);
				assert.isObject(db.localsByPath[`${FIXTURES_DIR}ham/first/second/second.tar`]);

				// Ignored files
				assert.isUndefined(db.localsByPath[`${FIXTURES_DIR}bar/.svn/info`]);
				assert.isUndefined(db.localsByPath[`${FIXTURES_DIR}bar/Thumbs.db`]);
				assert.isUndefined(db.localsByPath[`${FIXTURES_DIR}foo/.DS_Store`]);
				assert.isUndefined(db.localsByPath[`${FIXTURES_DIR}foo/node_modules/blah/package.json`]);
			});
	});

	it('scans again only after interval', async () => {
		await scan();

		const db1 = await utils.getDataContent();
		assert.match(db1.settings.lastScanTimestamp, /^\d+$/);
		const timestamp = db1.settings.lastScanTimestamp;

		// This run should not execute since it's within the scan interval (1s)
		await scan();

		const db2 = await utils.getDataContent();
		assert.equal(db2.settings.lastScanTimestamp, timestamp);

		await utils.delay(1001);

		// This new run should execute the scan again
		await scan();

		const db3 = await utils.getDataContent();
		assert.notEqual(db3.settings.lastScanTimestamp, timestamp);
	});

	it('marks deleted files', () => {
		utils.setDataContent({
			locals: [
				utils.mockLocal(`${FIXTURES_DIR}foo/old.txt`),
				utils.mockLocal(`${FIXTURES_DIR}old/from-old-source.txt`),
				utils.mockLocal(
					`${FIXTURES_DIR}ham/third/third.tar`,
					utils.DELETED,
					123,
					utils.DB_TYPES.ARCHIVE,
				),
			],
			remotes: [
				utils.mockRemote(`${FIXTURES_DIR}bar/1-small.txt`),
				utils.mockRemote(`${FIXTURES_DIR}foo/old.txt`),
				utils.mockRemote(`${FIXTURES_DIR}old/from-old-source.txt`),
				utils.mockRemote(
					`${FIXTURES_DIR}ham/third/third.tar`,
					'abc',
					123,
					456,
					utils.DB_TYPES.ARCHIVE,
				),
			],
		});

		return scan()
			.then(utils.getDataContent)
			.then(db => {
				assert.equal(db.locals.length, 12);

				utils.assertLocalDeleted(db, `${FIXTURES_DIR}foo/old.txt`);
				utils.assertLocalDeleted(db, `${FIXTURES_DIR}old/from-old-source.txt`);
				utils.assertLocalDeleted(db, `${FIXTURES_DIR}ham/third/third.tar`);

				assert.isObject(db.localsByPath[`${FIXTURES_DIR}bar/1-small.txt`]);

				return utils.execPromise('mv', [`${FIXTURES_DIR}bar/1-small.txt`, `${FIXTURES_DIR}../`]);
			})
			.then(() => utils.delay(1001))
			.then(scan)
			.then(utils.getDataContent)
			.then(db => {
				utils.assertLocalDeleted(db, `${FIXTURES_DIR}bar/1-small.txt`);

				return utils.execPromise('mv', [
					`${FIXTURES_DIR}../1-small.txt`,
					`${FIXTURES_DIR}bar/1-small.txt`,
				]);
			});
	});

	it('removes deleted files which have not been synced yet', () => {
		utils.setDataContent({
			locals: [
				utils.mockLocal(`${FIXTURES_DIR}foo/old.txt`),
				utils.mockLocal(
					`${FIXTURES_DIR}ham/fourth/fourth.tar`,
					utils.DELETED,
					123,
					utils.DB_TYPES.ARCHIVE,
				),
			],
			remotes: [],
		});

		return scan()
			.then(utils.getDataContent)
			.then(db => {
				assert.equal(db.locals.length, 9);
				assert.isUndefined(db.localsByPath[`${FIXTURES_DIR}foo/old.txt`]);
				assert.isUndefined(db.localsByPath[`${FIXTURES_DIR}ham/fourth/fourth.tar`]);
			});
	});
});
