const fs = require('fs');
const path = require('path');
const { default: prettyBytes } = require('pretty-bytes');

const Archiver = require('../lib/Archiver');
const Crypter = require('../lib/Crypter');
const DB = require('./DB');
const Scanner = require('../lib/Scanner');
const Slacker = require('../lib/Slacker');
const config = require('./config');
const utils = require('./utils');

const AWS = config.aws;

class Restorer {
  async start(remotePrefix, localPath) {
    this.remotePrefix = remotePrefix[0] === '/' ? remotePrefix : `/${remotePrefix}`;
    this.localPath = localPath;

    this.successCount = 0;
    this.failedCount = 0;
    this.failedFiles = [];

    if (utils.hasFlag('max-size')) {
      const maxSizeOption = utils.getOption('max-size');
      const maxSizeNumber = Number(maxSizeOption);

      if (!/^\d+$/.test(maxSizeOption) || !Number.isSafeInteger(maxSizeNumber)) {
        utils.log(
          'Restorer.start:',
          `invalid --max-size value "${maxSizeOption}". Please provide a positive numeric value.`,
        );
        throw new Error('Invalid --max-size option');
      } else {
        this.maxSize = maxSizeNumber;
      }
    }

    utils.log('Restorer.start:', `remotePrefix=${remotePrefix} localPath=${localPath}`);

    await this.fetchRemoteDB();

    return this.filter();
  }

  async fetchRemoteDB() {
    const dbLocalFile = utils.tempFile('restore-db');
    const dbRemoteFile = path.basename(config.dbSQLite);
    const dbRemoteURL = `s3://${config.s3bucket}/${dbRemoteFile}`;
    const args = ['s3', 'cp', dbRemoteURL, dbLocalFile];

    utils.log('Restorer: fetching remote DB...');

    const output = await utils.execPromise(AWS, args);
    if (utils.TEST) {
      console.log(output);
    }

    const db = new DB(dbLocalFile);
    db.initialize();

    this.data = db.getAll();

    db.close();
  }

  async filter() {
    const isTest = utils.hasFlag('test');

    let queue = this.data.remotes.filter(
      (remote) =>
        utils.remoteFilePath(remote.path).indexOf(this.remotePrefix) === 0 &&
        (this.maxSize ? remote.size <= this.maxSize : true),
    );

    if (isTest && queue.length) {
      if (process.env.BACKUP_ENV === 'test') {
        queue = [queue[parseInt(utils.getOption('test'), 10)]];
      } else {
        queue = [queue[Math.floor(Math.random() * queue.length)]];
      }
    }

    const count = queue.length;
    const totalSize = queue.reduce((accumulated, item) => accumulated + item.size, 0);

    this.restoreQueue = queue;

    utils.log(
      `Restorer.filter: ${count} matching files with a total file size of ${prettyBytes(
        totalSize,
      )} in DB`,
    );

    // When running with --test, an empty queue would later cause test() to run
    // without any selected file (this.currentFile is never set). Guard against
    // that case explicitly and return a clear failure result / message that the CLI
    // will treat as a failure (it looks for results containing "FAIL").
    if (isTest && count === 0) {
      utils.log('Restorer.filter: no matching files found - aborting without running test');
      return 'FAIL_NO_MATCHING_FILES';
    }

    if (utils.hasFlag('dry') || utils.hasFlag('yes') || utils.hasFlag('test')) {
      return this.processQueue();
    }

    const answer = await utils.ask(
      `Are you sure you want to restore ${count} files with a total file size of ${prettyBytes(
        totalSize,
      )} locally? (yes|y|no|n)`,
    );
    if (answer) {
      return this.processQueue();
    }
  }

  async processQueue() {
    for (const [index, file] of this.restoreQueue.entries()) {
      this.currentFile = file;
      this.currentTempFile = utils.tempFile('restore-');
      this.currentRemotePath = utils.remoteFilePath(file.path);
      this.currentLocalPath = `${this.localPath}${this.currentRemotePath}`;

      utils.debug(
        `Restorer.next: ${this.successCount} success, ${this.failedCount} failed, ${this.restoreQueue.length - index - 1} left`,
      );

      try {
        await this.download();
        await this.decrypt();
        await this.decompress();

        this.successCount++;
      } catch (err) {
        utils.log(err);

        this.failedCount++;
        this.failedFiles.push(this.currentFile);
      } finally {
        this.cleanup();
      }
    }

    return utils.hasFlag('test') ? this.test() : 'FINISHED';
  }

  async download() {
    const remoteURL = `s3://${config.s3bucket}${this.currentRemotePath}`;
    utils.log(`Restorer.download: ${remoteURL} to ${this.currentTempFile}`);

    if (utils.DRY_RUN) {
      return;
    }

    const args = ['s3', 'cp', remoteURL, this.currentTempFile];

    const output = await utils.execPromise(AWS, args);
    if (utils.TEST) {
      console.log(output);
    }
  }

  async decrypt() {
    if (utils.DRY_RUN) {
      return;
    }

    await Crypter.decrypt(this.currentTempFile, this.currentLocalPath);
  }

  async decompress() {
    if (utils.DRY_RUN || this.currentFile.type !== DB.TYPES.ARCHIVE) {
      return;
    }

    const dir = path.dirname(this.currentLocalPath);
    await Archiver.decompress(this.currentLocalPath, dir);
  }

  cleanup() {
    const tempFile = this.currentTempFile;

    if (tempFile && fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }

  async test() {
    const filePath = this.currentFile.path;
    let passed;

    if (this.currentFile.type === DB.TYPES.FILE) {
      const originalPath = utils.localFilePath(filePath);

      passed = utils.areFilesIdentical(this.currentLocalPath, originalPath);

      if (fs.existsSync(this.currentLocalPath)) {
        fs.unlinkSync(this.currentLocalPath);
      }
    }

    if (this.currentFile.type === DB.TYPES.ARCHIVE) {
      const localDir = path.dirname(this.currentLocalPath);
      const originalDir = utils.localFilePath(path.dirname(filePath));

      fs.unlinkSync(this.currentLocalPath);

      const files = Scanner.findFiles(localDir);

      passed = files.reduce(
        (accumulated, localFilePath) =>
          accumulated &&
          utils.areFilesIdentical(localFilePath, localFilePath.replace(localDir, originalDir)),
        true,
      );

      for (const file of files) {
        fs.unlinkSync(file);
      }
    }

    if (passed) {
      utils.log(`Restorer.test OK: ${this.currentRemotePath}`);

      return 'PASS';
    }

    utils.log(`Restorer.test FAIL: ${this.currentRemotePath}`);
    await Slacker.text(`Restore test failed: \`${filePath}\``);

    return 'FAIL';
  }

  finish() {
    utils.log(`Restorer.finish: ${this.successCount} restored, ${this.failedCount} failed`);

    if (this.failedCount) {
      utils.log('Failed to restore:');
      utils.log(this.failedFiles.map((remote) => remote.path).join('\n'));
    }
  }
}

module.exports = Restorer;
