const assert = require('chai').assert;
const fs = require('fs');
const utils = require('./utils');

const FIXTURES_DIR = utils.FIXTURES_DIR;

describe('scan', () => {
	const scan = (dry) => utils.run(['--only-scan', '--verbose', dry && '--dry']);

	beforeEach(() => {
		utils.clean();
	});

	it('saves nothing for dry mode', () => {
		return scan(true)
			.then((output) => {
				assert.include(output, 'This is a DRY run!');
				assert.include(output, '/bar - Files found: 3');
				assert.include(output, '/foo - Files found: 4');
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
				assert.match(db.settings.lastScanTimestamp, /^\d+$/);
				assert.equal(db.locals.length, 7);

				// File sizes
				assert.equal(
					db.localsByPath[`${FIXTURES_DIR}foo/1-fail.dat`].size,
					1024
				);
				assert.equal(
					db.localsByPath[`${FIXTURES_DIR}foo/2 medium.dat`].size,
					102400
				);
				assert.equal(
					db.localsByPath[`${FIXTURES_DIR}foo/3-fail.dat`].size,
					204800
				);

				assert.isObject(db.localsByPath[`${FIXTURES_DIR}bar/1-small.txt`]);
				// The hashes depend on the file modified time
				// so we can't rely on these for tests
				assert.isString(db.localsByPath[`${FIXTURES_DIR}bar/1-small.txt`].hash);
				assert.equal(
					db.localsByPath[`${FIXTURES_DIR}bar/1-small.txt`].hash.length,
					64
				);
				assert.isObject(db.localsByPath[`${FIXTURES_DIR}bar/2-medium.txt`]);
				assert.isObject(db.localsByPath[`${FIXTURES_DIR}bar/3-large.txt`]);

				// Ignored files
				assert.isUndefined(db.localsByPath[`${FIXTURES_DIR}bar/.svn/info`]);
				assert.isUndefined(db.localsByPath[`${FIXTURES_DIR}bar/Thumbs.db`]);
				assert.isUndefined(db.localsByPath[`${FIXTURES_DIR}foo/.DS_Store`]);
				assert.isUndefined(
					db.localsByPath[`${FIXTURES_DIR}foo/node_modules/blah/package.json`]
				);
			});
	});

	it('scans again only after interval', () => {
		let timestamp;
		return scan()
			.then(utils.getDataContent)
			.then((db) => {
				assert.match(db.settings.lastScanTimestamp, /^\d+$/);
				timestamp = db.settings.lastScanTimestamp;

				// This run should not execute since it's within the scan interval (1s)
				return scan();
			})
			.then(utils.getDataContent)
			.then((db) => {
				assert.equal(db.settings.lastScanTimestamp, timestamp);

				return utils.delay(1001);
			})
			// This new run should execute the scan again
			.then(scan)
			.then(utils.getDataContent)
			.then((db) => {
				assert.notEqual(db.settings.lastScanTimestamp, timestamp);
			});
	});

	it('marks deleted files', () => {
		utils.setDataContent({
			locals: [
				utils.mockLocal(`${FIXTURES_DIR}foo/old.txt`),
				utils.mockLocal(`${FIXTURES_DIR}ham/from-old-source.txt`)
			],
			remotes: [
				utils.mockRemote(`${FIXTURES_DIR}bar/1-small.txt`),
				utils.mockRemote(`${FIXTURES_DIR}foo/old.txt`),
				utils.mockRemote(`${FIXTURES_DIR}ham/from-old-source.txt`)
			]
		});

		return scan()
			.then(utils.getDataContent)
			.then((db) => {
				assert.equal(db.locals.length, 9);
				utils.assertLocalDeleted(db, `${FIXTURES_DIR}foo/old.txt`);
				utils.assertLocalDeleted(db, `${FIXTURES_DIR}ham/from-old-source.txt`);
				assert.isObject(db.localsByPath[`${FIXTURES_DIR}bar/1-small.txt`]);

				return utils.execPromise('mv', [
					`${FIXTURES_DIR}bar/1-small.txt`,
					`${FIXTURES_DIR}../`
				]);
			})
			.then(() => utils.delay(1001))
			.then(scan)
			.then(utils.getDataContent)
			.then((db) => {
				utils.assertLocalDeleted(db, `${FIXTURES_DIR}bar/1-small.txt`);

				return utils.execPromise('mv', [
					`${FIXTURES_DIR}../1-small.txt`,
					`${FIXTURES_DIR}bar/1-small.txt`
				]);
			});
	});

	it('removes deleted files which have not been synced yet', () => {
		utils.setDataContent({
			locals: [
				utils.mockLocal(`${FIXTURES_DIR}foo/old.txt`)
			],
			remotes: []
		});

		return scan()
			.then(utils.getDataContent)
			.then((db) => {
				assert.equal(db.locals.length, 7);
				assert.isUndefined(db.localsByPath[`${FIXTURES_DIR}foo/old.txt`]);
			});
	});
});
