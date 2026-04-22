const assert = require('chai').assert;
const fs = require('fs');
const utils = require('./utils');
const Scanner = require('../lib/Scanner');

const { FIXTURES_DIR, ROOT_DIR } = utils;

function scan(dry) {
  return utils.run(['--only-scan', '--verbose', dry && '--dry']);
}

describe('scan', () => {
  beforeEach(() => {
    utils.clean();
  });

  it('prepares file hash', () => {
    const file = Scanner.scanFile(`${FIXTURES_DIR}bar/1-small.txt`);

    assert.match(file.hash, /^\/bar\/1-small\.txt 1024 \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    assert.equal(file.size, 1024);
  });

  it('saves nothing for dry mode', async () => {
    const output = await scan(true);

    assert.include(output, 'This is a DRY run!');
    assert.include(output, '/bar - Files found: 3');
    assert.include(output, '/bar - Archives found: 0');
    assert.include(output, '/foo - Files found: 4');
    assert.include(output, '/foo - Archives found: 0');
    assert.include(output, '/ham - Files found: 0');
    assert.include(output, '/ham - Archives found: 2');
    assert.include(output, '/empty - Files found: 0');
    assert.include(output, '/empty - Archives found: 0');
    assert.isFalse(fs.existsSync(utils.DB_FILE), 'db file was not created');
  });

  it('scans all files for first time', async () => {
    await scan();

    const db = utils.getDataContent();

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
    // 2 files @ 1024 bytes
    assert.equal(db.localsByPath[`${FIXTURES_DIR}ham/first/first.tar`].size, 2048);
    assert.isObject(db.localsByPath[`${FIXTURES_DIR}ham/first/second/second.tar`]);
    // 2 files @ 1024 bytes
    assert.equal(db.localsByPath[`${FIXTURES_DIR}ham/first/second/second.tar`].size, 2048);

    // Ignored files
    assert.isUndefined(db.localsByPath[`${FIXTURES_DIR}bar/.svn/info`]);
    assert.isUndefined(db.localsByPath[`${FIXTURES_DIR}bar/Thumbs.db`]);
    assert.isUndefined(db.localsByPath[`${FIXTURES_DIR}foo/.DS_Store`]);
    assert.isUndefined(db.localsByPath[`${FIXTURES_DIR}foo/node_modules/blah/package.json`]);
  });

  it('scans again only after interval', async () => {
    await scan();

    const db1 = utils.getDataContent();

    assert.match(db1.settings.lastScanTimestamp, /^\d+$/);
    const timestamp = db1.settings.lastScanTimestamp;

    // This run should not execute since it's within the scan interval (1s)
    await scan();

    const db2 = utils.getDataContent();

    assert.equal(db2.settings.lastScanTimestamp, timestamp);

    await utils.delay(1001);

    // This new run should execute the scan again
    await scan();

    const db3 = utils.getDataContent();

    assert.notEqual(db3.settings.lastScanTimestamp, timestamp);
  });

  it('marks deleted files', async () => {
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

    await scan();

    const db = utils.getDataContent();

    assert.equal(db.locals.length, 12);

    utils.assertLocalDeleted(db, `${FIXTURES_DIR}foo/old.txt`);
    utils.assertLocalDeleted(db, `${FIXTURES_DIR}old/from-old-source.txt`);
    utils.assertLocalDeleted(db, `${FIXTURES_DIR}ham/third/third.tar`);

    assert.isObject(db.localsByPath[`${FIXTURES_DIR}bar/1-small.txt`]);

    await utils.execPromise('mv', [`${FIXTURES_DIR}bar/1-small.txt`, `${FIXTURES_DIR}../`]);
    await utils.delay(1001);

    await scan();

    const db2 = utils.getDataContent();

    utils.assertLocalDeleted(db2, `${FIXTURES_DIR}bar/1-small.txt`);

    await utils.execPromise('mv', [
      `${FIXTURES_DIR}../1-small.txt`,
      `${FIXTURES_DIR}bar/1-small.txt`,
    ]);
  });

  it('marks deleted files when source becomes empty', async () => {
    const files = ['1-small.txt', '2-medium.txt', '3-large.txt'];

    utils.setDataContent({
      locals: files.map((file) => utils.mockLocal(`${FIXTURES_DIR}empty/${file}`, 'abc')),
      remotes: files.map((file) => utils.mockRemote(`${FIXTURES_DIR}empty/${file}`)),
    });

    await scan();

    const db = utils.getDataContent();

    utils.assertLocalDeleted(db, `${FIXTURES_DIR}empty/1-small.txt`);
    utils.assertLocalDeleted(db, `${FIXTURES_DIR}empty/2-medium.txt`);
    utils.assertLocalDeleted(db, `${FIXTURES_DIR}empty/3-large.txt`);
  });

  it('removes deleted files which have not been synced yet', async () => {
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

    await scan();

    const db = utils.getDataContent();

    assert.equal(db.locals.length, 9);
    assert.isUndefined(db.localsByPath[`${FIXTURES_DIR}foo/old.txt`]);
    assert.isUndefined(db.localsByPath[`${FIXTURES_DIR}ham/fourth/fourth.tar`]);
  });

  it('throws error when source is invalid', async () => {
    let previousEnv = process.env.BACKUP_ENV;
    await fs.promises.cp(`${FIXTURES_DIR}scan-error/config.scan.js`, `${ROOT_DIR}config.scan.js`);

    try {
      process.env.BACKUP_ENV = 'scan';

      await scan(true);

      assert.fail('Expected error was not thrown');
    } catch (err) {
      assert.include(err.message, 'Failed to scan source /non/existing/source');
    } finally {
      process.env.BACKUP_ENV = previousEnv;

      await fs.promises.rm(`${ROOT_DIR}config.scan.js`);
    }
  });
});
