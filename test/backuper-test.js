const assert = require('chai').assert;
const fs = require('fs');
const path = require('path');

const Archiver = require('../lib/Archiver');
const Crypter = require('../lib/Crypter');
const Scanner = require('../lib/Scanner');
const appUtils = require('../lib/utils');
const utils = require('./utils');

const DATA_DIR = utils.DATA_DIR;
const FIXTURES_DIR = utils.FIXTURES_DIR;
const TEMP_DIR = utils.TEMP_DIR;
const LOCK_FILE = path.resolve(__dirname, '..', 'bin', '.backup-to-cloud.lock');

function assertAWS(log, index, operation, pattern, storageClass, hash) {
  assert.isAbove(log.length, index);
  assert.equal(log[index][1], operation);
  if (operation === 'cp') {
    assert.match(log[index][3], pattern);
    if (storageClass) {
      assert.include(log[index], '--storage-class');
      assert.include(log[index], storageClass);
    }
    if (hash) {
      assert.include(log[index], '--metadata');
      assert.include(log[index], `hash=${hash}`);
    }
  } else {
    assert.match(log[index][2], pattern);
  }
}

describe('backuper', () => {
  function transfer(dry, random) {
    return utils.run(['--skip-scan', '--verbose', dry && '--dry', random && '--random-order']);
  }

  let dbFromScan;

  before(async () => {
    utils.clean();

    await utils.run(['--only-scan', '--verbose']);

    dbFromScan = await utils.getDataContent();
  });

  it('does not start if lock file exists', async () => {
    fs.writeFileSync(LOCK_FILE, '');
    try {
      const output = await transfer(false);

      assert.include(output, 'Another instance is already running');
      assert.notInclude(output, 'Starting...');

      const awsLog = utils.getAWSLog();

      assert.isArray(awsLog);
      assert.equal(awsLog.length, 0);
    } finally {
      fs.unlinkSync(LOCK_FILE);
    }
  });

  it('transfers nothing on dry mode', async () => {
    const output = await transfer(true);
    assert.include(output, 'This is a DRY run!');
    assert.include(output, 'Backuper.start: locals=9 / remotes=0');
    assert.include(output, 'Backuper.add file:');
    assert.include(output, 'Backuper.next sessionSize=1.02 kB maxSessionSize=1.02 kB');
    assert.include(output, 'Backup result MAX_SESSION_SIZE');

    const awsLog = utils.getAWSLog();

    assert.isArray(awsLog);
    assert.equal(awsLog.length, 0);
  });

  it('encrypts and transfers files', async () => {
    await transfer();
    const awsLog = utils.getAWSLog();
    assert.isArray(awsLog);
    // Only the first 2 files fit into the session size
    // Since 1-small.txt encrypted is less than the session size
    // The last file is the DB file
    assert.equal(awsLog.length, 3);

    const file = Scanner.scanFile(`${FIXTURES_DIR}bar/1-small.txt`);

    assertAWS(
      awsLog,
      0,
      'cp',
      /s3:\/\/test-bucket\/bar\/1-small\.txt/,
      'STANDARD',
      appUtils.hash(file.hash),
    );
    assertAWS(awsLog, 1, 'cp', /s3:\/\/test-bucket\/bar\/2-medium\.txt/, 'STANDARD');
    assertAWS(awsLog, 2, 'cp', /s3:\/\/test-bucket\/db-test\.sqlite/, 'STANDARD');

    utils.assertFilesEqual(`${TEMP_DIR}db-test.sqlite`, `${DATA_DIR}db-test.sqlite`);

    // Verify encryption
    utils.assertFilesNotEqual(`${TEMP_DIR}1-small.txt`, `${FIXTURES_DIR}bar/1-small.txt`);

    await Crypter.decrypt(`${TEMP_DIR}1-small.txt`, `${TEMP_DIR}1-small-decrypted.txt`);

    utils.assertFilesEqual(`${TEMP_DIR}1-small-decrypted.txt`, `${FIXTURES_DIR}bar/1-small.txt`);

    const db = await utils.getDataContent();

    assert.equal(db.remotes.length, 2);

    const firstFile = `${FIXTURES_DIR}bar/1-small.txt`;
    assert.isObject(db.remotesByPath[firstFile]);
    assert.equal(db.remotesByPath[firstFile].hash, db.localsByPath[firstFile].hash);
    assert.equal(db.remotesByPath[firstFile].type, utils.DB_TYPES.FILE);
    assert.notEqual(db.remotesByPath[firstFile].size, db.localsByPath[firstFile].size);
    assert.isAbove(
      db.remotesByPath[firstFile].timestamp,
      Date.now() - 60 * 1000,
      'timestamp of upload should be withing last 60 seconds',
    );
  });

  it('transfers next file', async () => {
    await transfer();

    const awsLog = utils.getAWSLog();

    assert.isArray(awsLog);
    // Only one new file + the db (+ the other 3) fit into the session size
    assert.equal(awsLog.length, 5);

    assertAWS(awsLog, 3, 'cp', /s3:\/\/test-bucket\/bar\/3-large\.txt/, 'STANDARD_IA');
    assertAWS(awsLog, 4, 'cp', /s3:\/\/test-bucket\/db-test\.sqlite/);

    const db = await utils.getDataContent();

    assert.equal(db.remotes.length, 3);
  });

  it('skips failed file and continues upload of other files', async () => {
    await transfer();

    const awsLog = utils.getAWSLog();

    assert.isArray(awsLog);
    // 1-fail.dat should fail by aws-mock,
    assert.equal(awsLog.length, 8);

    assertAWS(awsLog, 5, 'cp', /s3:\/\/test-bucket\/1-fail\.dat/, 'STANDARD');
    assertAWS(awsLog, 6, 'cp', /s3:\/\/test-bucket\/2 '"\$@%&`medium\.dat/, 'STANDARD');
    assertAWS(awsLog, 7, 'cp', /s3:\/\/test-bucket\/db-test\.sqlite/);

    const db = await utils.getDataContent();

    assert.equal(db.remotes.length, 4);

    assert.isUndefined(db.remotesByPath[`${FIXTURES_DIR}foo/1-fail.dat`]);
    assert.isObject(db.remotesByPath[`${FIXTURES_DIR}foo/2 '"$@%&\`medium.dat`]);
  });

  it('skips failed encryption and continues upload of other files', async () => {
    utils.clean();

    const unreadableFile = `${FIXTURES_DIR}bar/0-unreadable.dat`;
    fs.writeFileSync(unreadableFile, 'do not read me');
    fs.chmodSync(unreadableFile, 0);

    try {
      await utils.setDataContent({
        locals: [
          utils.mockLocal(unreadableFile, 'broken-hash'),
          utils.mockLocal(`${FIXTURES_DIR}bar/1-small.txt`, 'good-hash'),
        ],
      });

      const output = await transfer();

      assert.include(output, `Backuper.add error: ${unreadableFile}`);
      assert.notInclude(output, 'Backup error');

      const awsLog = utils.getAWSLog();

      assert.isArray(awsLog);
      assert.equal(awsLog.length, 2);
      assertAWS(awsLog, 0, 'cp', /s3:\/\/test-bucket\/bar\/1-small\.txt/, 'STANDARD');
      assertAWS(awsLog, 1, 'cp', /s3:\/\/test-bucket\/db-test\.sqlite/, 'STANDARD');

      const db = await utils.getDataContent();

      assert.isUndefined(db.remotesByPath[unreadableFile]);
      assert.isObject(db.remotesByPath[`${FIXTURES_DIR}bar/1-small.txt`]);
    } finally {
      fs.chmodSync(unreadableFile, 0o644);
      fs.unlinkSync(unreadableFile);
    }
  });

  it('uploads archives', async () => {
    utils.clean();
    await utils.setDataContent({
      locals: dbFromScan.locals.filter((local) => local.type === utils.DB_TYPES.ARCHIVE),
    });

    await transfer();

    const awsLog = utils.getAWSLog();

    assert.isArray(awsLog);
    assert.equal(awsLog.length, 2);

    assertAWS(awsLog, 0, 'cp', /s3:\/\/test-bucket\/ham\/first\/first.tar/, 'STANDARD');
    assertAWS(awsLog, 1, 'cp', /s3:\/\/test-bucket\/db-test\.sqlite/);

    const db = await utils.getDataContent();

    assert.equal(db.remotes.length, 1);

    const archiveName = `${FIXTURES_DIR}ham/first/first.tar`;
    assert.isObject(db.remotesByPath[archiveName]);
    assert.equal(db.remotesByPath[archiveName].type, utils.DB_TYPES.ARCHIVE);

    await Crypter.decrypt(`${TEMP_DIR}first.tar`, `${TEMP_DIR}first-decrypted.tar`);
    await Archiver.decompress(`${TEMP_DIR}first-decrypted.tar`, `${TEMP_DIR}first`);

    utils.assertFilesEqual(`${TEMP_DIR}first/1-first.txt`, `${FIXTURES_DIR}ham/first/1-first.txt`);
    utils.assertFilesEqual(`${TEMP_DIR}first/2-first.txt`, `${FIXTURES_DIR}ham/first/2-first.txt`);
    assert.isFalse(fs.existsSync(`${TEMP_DIR}first/second/1-second.txt`));
    assert.isFalse(fs.existsSync(`${TEMP_DIR}first/second/2-second.txt`));
  });

  it('does not sync the DB file when no file syncs have been made', async () => {
    utils.clean();
    await utils.setDataContent({
      locals: dbFromScan.locals,
      remotes: dbFromScan.locals.map((local) =>
        Object.assign(
          {
            timestamp: 456,
          },
          local,
        ),
      ),
    });

    await transfer();

    const awsLog = utils.getAWSLog();

    assert.isArray(awsLog);
    assert.equal(awsLog.length, 0);
  });

  it('uploads files in random order', async () => {
    utils.clean();
    await utils.setDataContent({
      locals: dbFromScan.locals.slice(0, 2),
    });

    await transfer(false, true);

    const awsLog = utils.getAWSLog();

    assert.isArray(awsLog);
    assert.isAtLeast(awsLog.length, 2);
    assertAWS(awsLog, 0, 'cp', /s3:\/\/test-bucket\/bar\/(1-small|2-medium)\.txt/);
    assertAWS(awsLog, awsLog.length - 1, 'cp', /s3:\/\/test-bucket\/db-test\.sqlite/);

    const db = await utils.getDataContent();

    assert.isAtLeast(db.remotes.length, 1);
  });

  it('removes deleted files', async () => {
    utils.clean();

    const now = Date.now();
    await utils.setDataContent({
      locals: [
        utils.mockLocal(`${FIXTURES_DIR}bar/1-small-recent.txt`),
        utils.mockLocal(`${FIXTURES_DIR}bar/2-small-long-ago.txt`),
        utils.mockLocal(`${FIXTURES_DIR}bar/3-large-recent.txt`),
        utils.mockLocal(`${FIXTURES_DIR}bar/4-large-long-ago.txt`),
      ],
      remotes: [
        utils.mockRemote(`${FIXTURES_DIR}bar/1-small-recent.txt`, 'abc', 1024, now - 10 * 1000),
        utils.mockRemote(
          `${FIXTURES_DIR}bar/2-small-long-ago.txt`,
          'abc',
          1024,
          now - 31 * 24 * 3600 * 1000,
        ),
        utils.mockRemote(`${FIXTURES_DIR}bar/3-large-recent.txt`, 'abc', 135000, now - 10 * 1000),
        utils.mockRemote(
          `${FIXTURES_DIR}bar/4-large-long-ago.txt`,
          'abc',
          135000,
          now - 31 * 24 * 3600 * 1000,
        ),
      ],
    });

    await transfer();

    const awsLog = utils.getAWSLog();

    assert.isArray(awsLog);
    assert.equal(awsLog.length, 4);

    assertAWS(awsLog, 0, 'rm', /s3:\/\/test-bucket\/bar\/1-small-recent\.txt/);
    assertAWS(awsLog, 1, 'rm', /s3:\/\/test-bucket\/bar\/2-small-long-ago\.txt/);
    assertAWS(awsLog, 2, 'rm', /s3:\/\/test-bucket\/bar\/4-large-long-ago\.txt/);
    assertAWS(awsLog, 3, 'cp', /s3:\/\/test-bucket\/db-test\.sqlite/);

    const db = await utils.getDataContent();

    assert.equal(db.locals.length, 1);
    assert.equal(db.remotes.length, 1);

    const file = `${FIXTURES_DIR}bar/3-large-recent.txt`;
    utils.assertLocalDeleted(db, file);
    assert.isObject(db.remotesByPath[file]);
  });

  it('transfers files and removes deleted files up to maxSessionRemovals limit', async () => {
    utils.clean();

    const now = Date.now();
    await utils.setDataContent({
      locals: [
        ...dbFromScan.locals,
        utils.mockLocal(`${FIXTURES_DIR}bar/1-small-recent.txt`),
        utils.mockLocal(`${FIXTURES_DIR}bar/2-small-long-ago.txt`),
        utils.mockLocal(`${FIXTURES_DIR}bar/3-small-recent.txt`),
        utils.mockLocal(`${FIXTURES_DIR}bar/4-small-recent.txt`),
      ],
      remotes: [
        utils.mockRemote(`${FIXTURES_DIR}bar/1-small-recent.txt`, 'abc', 1024, now - 10 * 1000),
        utils.mockRemote(
          `${FIXTURES_DIR}bar/2-small-long-ago.txt`,
          'abc',
          1024,
          now - 31 * 24 * 3600 * 1000,
        ),
        utils.mockRemote(`${FIXTURES_DIR}bar/3-small-recent.txt`, 'abc', 1024, now - 10 * 1000),
        utils.mockRemote(`${FIXTURES_DIR}bar/4-small-recent.txt`, 'abc', 1024, now - 10 * 1000),
      ],
    });

    await transfer();

    const awsLog = utils.getAWSLog();

    assert.isArray(awsLog);
    // Only the first 2 files fit into the session size
    // maxSessionRemovals is 3 in test config, so only 3 of 4 deleted files are removed
    // The last file is the DB file
    assert.equal(awsLog.length, 6);

    assertAWS(awsLog, 0, 'cp', /s3:\/\/test-bucket\/bar\/1-small\.txt/, 'STANDARD');
    assertAWS(awsLog, 1, 'cp', /s3:\/\/test-bucket\/bar\/2-medium\.txt/, 'STANDARD');

    assertAWS(awsLog, 2, 'rm', /s3:\/\/test-bucket\/bar\/1-small-recent\.txt/);
    assertAWS(awsLog, 3, 'rm', /s3:\/\/test-bucket\/bar\/2-small-long-ago\.txt/);
    assertAWS(awsLog, 4, 'rm', /s3:\/\/test-bucket\/bar\/3-small-recent\.txt/);

    assertAWS(awsLog, 5, 'cp', /s3:\/\/test-bucket\/db-test\.sqlite/, 'STANDARD');

    const db = await utils.getDataContent();

    assert.equal(db.locals.length, dbFromScan.locals.length + 1);
    assert.isUndefined(db.locals.find((item) => item.path.includes('1-small-recent.txt')));
    assert.isUndefined(db.locals.find((item) => item.path.includes('2-small-long-ago.txt')));
    assert.isUndefined(db.locals.find((item) => item.path.includes('3-small-recent.txt')));

    // 4th deleted file should still exist due to maxSessionRemovals limit
    assert.equal(db.remotes.length, 3);
    assert.isObject(db.remotesByPath[`${FIXTURES_DIR}bar/4-small-recent.txt`]);
  });

  it('should stop transfer after max failed', async () => {
    utils.clean();

    await utils.setDataContent({
      locals: [
        utils.mockLocal(`${FIXTURES_DIR}foo/1-fail.dat`, 'abc'),
        utils.mockLocal(`${FIXTURES_DIR}foo/3-fail.dat`, 'abc'),
        utils.mockLocal(`${FIXTURES_DIR}foo/4-small.dat`, 'abc'),
      ],
    });

    await transfer();

    const awsLog = utils.getAWSLog();

    assert.isArray(awsLog);
    assert.equal(awsLog.length, 3);
    assertAWS(awsLog, 0, 'cp', /s3:\/\/test-bucket\/1-fail\.dat/, 'STANDARD', 'abc');
    assertAWS(awsLog, 1, 'cp', /s3:\/\/test-bucket\/3-fail\.dat/, 'STANDARD_IA', 'abc');
    assertAWS(awsLog, 2, 'cp', /s3:\/\/test-bucket\/db-test\.sqlite/);

    const db = await utils.getDataContent();

    assert.isUndefined(db.remotesByPath[`${FIXTURES_DIR}foo/4-small.dat`]);
  });
});
