const assert = require('chai').assert;
const fs = require('fs');
const utils = require('./utils');

const DELETED = utils.DELETED;
const FIXTURES_DIR = utils.FIXTURES_DIR;

describe('scan', () => {
	const scan = (dry) => utils.run(['--only-scan', '--verbose', dry && '--dry']);

	beforeEach(utils.clean);

	it('saves nothing for dry mode', () => {
		return scan(true)
			.then((output) => {
				assert.include(output, 'This is a DRY run!');
				assert.include(output, '/foo - Files found: 3');
				assert.include(output, '/bar - Files found: 3');
				assert.isFalse(
					fs.existsSync(utils.DATA_FILE),
					'data file was not created'
				);
			});
	});

	it('scans all files for first time', () => {
		return scan()
			.then(utils.getDataContent)
			.then((db) => {
				assert.isNumber(db.lastScanTimestamp);
				assert.isObject(db.all);
				assert.equal(Object.keys(db.all).length, 6);

				// File sizes
				assert.equal(
					db.all[`${FIXTURES_DIR}foo/1-small.dat`][1],
					1024
				);
				assert.equal(
					db.all[`${FIXTURES_DIR}foo/2-medium.dat`][1],
					102400
				);
				assert.equal(
					db.all[`${FIXTURES_DIR}foo/3-large.dat`][1],
					204800
				);

				assert.isArray(db.all[`${FIXTURES_DIR}bar/1-small.txt`]);
				// The hashes depend on the file modified time
				// so we can't rely on these for tests
				assert.isString(db.all[`${FIXTURES_DIR}bar/1-small.txt`][0]);
				assert.equal(db.all[`${FIXTURES_DIR}bar/1-small.txt`][0].length, 64);
				assert.isArray(db.all[`${FIXTURES_DIR}bar/2-medium.txt`]);
				assert.isArray(db.all[`${FIXTURES_DIR}bar/3-large.txt`]);

				// Ignored files
				assert.isUndefined(db.all[`${FIXTURES_DIR}bar/.svn/info`]);
				assert.isUndefined(db.all[`${FIXTURES_DIR}bar/Thumbs.db`]);
				assert.isUndefined(db.all[`${FIXTURES_DIR}foo/.DS_Store`]);
				assert.isUndefined(
					db.all[`${FIXTURES_DIR}foo/node_modules/blah/package.json`]
				);
			});
	});

	it('scans again only after interval', () => {
		let timestamp;
		return scan()
			.then(utils.getDataContent)
			.then((db) => {
				assert.isNumber(db.lastScanTimestamp);
				timestamp = db.lastScanTimestamp;

				// This run should not execute since it's within the scan interval (1s)
				return scan();
			})
			.then(utils.getDataContent)
			.then((db) => {
				assert.equal(db.lastScanTimestamp, timestamp);

				return utils.delay(1001);
			})
			// This new run should execute the scan again
			.then(scan)
			.then(utils.getDataContent)
			.then((db) => {
				assert.notEqual(db.lastScanTimestamp, timestamp);
			});
	});

	it('marks deleted files', () => {
		const all = {};
		all[`${FIXTURES_DIR}foo/old.txt`] = DELETED;
		all[`${FIXTURES_DIR}ham/from-old-source.txt`] = DELETED;
		const synced = {};
		synced[`${FIXTURES_DIR}bar/1-small.txt`] = ['abc', 123, 456];
		synced[`${FIXTURES_DIR}foo/old.txt`] = ['abc', 123, 456];
		synced[`${FIXTURES_DIR}ham/from-old-source.txt`] = ['abc', 123, 456];
		utils.setDataContent({
			all: all,
			synced: synced
		});

		return scan()
			.then(utils.getDataContent)
			.then((db) => {
				assert.isObject(db.all);
				assert.equal(Object.keys(db.all).length, 8);
				assert.equal(db.all[`${FIXTURES_DIR}foo/old.txt`], DELETED);
				assert.equal(db.all[`${FIXTURES_DIR}ham/from-old-source.txt`], DELETED);
				assert.isArray(db.all[`${FIXTURES_DIR}bar/1-small.txt`]);

				return utils.execPromise('mv', [
					`${FIXTURES_DIR}bar/1-small.txt`,
					`${FIXTURES_DIR}../`
				]);
			})
			.then(() => utils.delay(1001))
			.then(scan)
			.then(utils.getDataContent)
			.then((db) => {
				assert.equal(db.all[`${FIXTURES_DIR}bar/1-small.txt`], DELETED);

				return utils.execPromise('mv', [
					`${FIXTURES_DIR}../1-small.txt`,
					`${FIXTURES_DIR}bar/1-small.txt`
				]);
			});
	});

	it('removes deleted files which have not been synced yet', () => {
		const all = {};
		all[`${FIXTURES_DIR}foo/old.txt`] = DELETED;
		utils.setDataContent({
			all: all
		});

		return scan()
			.then(utils.getDataContent)
			.then((db) => {
				assert.isObject(db.all);
				assert.equal(Object.keys(db.all).length, 6);
				assert.isUndefined(db.all[`${FIXTURES_DIR}foo/old.txt`]);
			});
	});
});
