import fs from 'node:fs';
import path from 'node:path';

import prettyBytes from 'pretty-bytes';

import Archiver from './Archiver.js';
import Crypter from './Crypter.js';
import DB, { DB_TYPES } from './DB.js';
import Scanner from './Scanner.js';
import * as slack from './slack.js';
import config from './config.js';
import {
  areFilesIdentical,
  ask,
  debug,
  execPromise,
  getOption,
  hasFlag,
  isDry,
  isTest,
  localFilePath,
  log,
  remoteFilePath,
  tempFile,
} from './utils.js';

const AWS = config.aws;

class Restorer {
  async start(remotePrefix, localPath) {
    this.remotePrefix = remotePrefix[0] === '/' ? remotePrefix : `/${remotePrefix}`;
    this.localPath = localPath;

    this.successCount = 0;
    this.failedCount = 0;
    this.failedFiles = [];

    if (hasFlag('max-size')) {
      const maxSizeOption = getOption('max-size');
      const maxSizeNumber = Number(maxSizeOption);

      if (!/^\d+$/.test(maxSizeOption) || !Number.isSafeInteger(maxSizeNumber)) {
        log(
          'Restorer.start:',
          `invalid --max-size value "${maxSizeOption}". Please provide a positive numeric value.`,
        );
        throw new Error('Invalid --max-size option');
      } else {
        this.maxSize = maxSizeNumber;
      }
    }

    log('Restorer.start:', `remotePrefix=${remotePrefix} localPath=${localPath}`);

    await this.fetchRemoteDB();

    return this.filter();
  }

  async fetchRemoteDB() {
    const dbLocalFile = tempFile('restore-db');
    const dbRemoteFile = path.basename(config.dbSQLite);
    const dbRemoteURL = `s3://${config.s3bucket}/${dbRemoteFile}`;
    const args = ['s3', 'cp', dbRemoteURL, dbLocalFile];

    log('Restorer: fetching remote DB...');

    const output = await execPromise(AWS, args);
    if (isTest()) {
      console.log(output);
    }

    const db = new DB(dbLocalFile);
    db.initialize();

    this.data = db.getAll();

    db.close();
  }

  async filter() {
    const hasTestFlag = hasFlag('test');

    let queue = this.data.remotes.filter(
      (remote) =>
        remoteFilePath(remote.path).indexOf(this.remotePrefix) === 0 &&
        (this.maxSize ? remote.size <= this.maxSize : true),
    );

    if (hasTestFlag && queue.length) {
      if (process.env.BACKUP_ENV === 'test') {
        queue = [queue[parseInt(getOption('test'), 10)]];
      } else {
        queue = [queue[Math.floor(Math.random() * queue.length)]];
      }
    }

    const count = queue.length;
    const totalSize = queue.reduce((accumulated, item) => accumulated + item.size, 0);

    this.restoreQueue = queue;

    log(
      `Restorer.filter: ${count} matching files with a total file size of ${prettyBytes(
        totalSize,
      )} in DB`,
    );

    // When running with --test, an empty queue would later cause test() to run
    // without any selected file (this.currentFile is never set). Guard against
    // that case explicitly and return a clear failure result / message that the CLI
    // will treat as a failure (it looks for results containing "FAIL").
    if (hasTestFlag && count === 0) {
      log('Restorer.filter: no matching files found - aborting without running test');
      return 'FAIL_NO_MATCHING_FILES';
    }

    if (hasFlag('dry') || hasFlag('yes') || hasFlag('test')) {
      return this.processQueue();
    }

    const answer = await ask(
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
      this.currentTempFile = tempFile('restore-');
      this.currentRemotePath = remoteFilePath(file.path);
      this.currentLocalPath = `${this.localPath}${this.currentRemotePath}`;

      debug(
        `Restorer.next: ${this.successCount} success, ${this.failedCount} failed, ${this.restoreQueue.length - index - 1} left`,
      );

      try {
        await this.download();
        await this.decrypt();
        await this.decompress();

        this.successCount++;
      } catch (err) {
        log(err);

        this.failedCount++;
        this.failedFiles.push(this.currentFile);
      } finally {
        this.cleanup();
      }
    }

    return hasFlag('test') ? this.test() : 'FINISHED';
  }

  async download() {
    const remoteURL = `s3://${config.s3bucket}${this.currentRemotePath}`;
    log(`Restorer.download: ${remoteURL} to ${this.currentTempFile}`);

    if (isDry()) {
      return;
    }

    const args = ['s3', 'cp', remoteURL, this.currentTempFile];

    const output = await execPromise(AWS, args);
    if (isTest()) {
      console.log(output);
    }
  }

  async decrypt() {
    if (isDry()) {
      return;
    }

    await Crypter.decrypt(this.currentTempFile, this.currentLocalPath);
  }

  async decompress() {
    if (isDry() || this.currentFile.type !== DB_TYPES.ARCHIVE) {
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

    if (this.currentFile.type === DB_TYPES.FILE) {
      const originalPath = localFilePath(filePath);

      passed = areFilesIdentical(this.currentLocalPath, originalPath);

      if (fs.existsSync(this.currentLocalPath)) {
        fs.unlinkSync(this.currentLocalPath);
      }
    }

    if (this.currentFile.type === DB_TYPES.ARCHIVE) {
      const localDir = path.dirname(this.currentLocalPath);
      const originalDir = localFilePath(path.dirname(filePath));

      fs.unlinkSync(this.currentLocalPath);

      const files = Scanner.findFiles(localDir);

      passed = files.reduce(
        (accumulated, localFilePath) =>
          accumulated &&
          areFilesIdentical(localFilePath, localFilePath.replace(localDir, originalDir)),
        true,
      );

      for (const file of files) {
        fs.unlinkSync(file);
      }
    }

    if (passed) {
      log(`Restorer.test OK: ${this.currentRemotePath}`);

      return 'PASS';
    }

    log(`Restorer.test FAIL: ${this.currentRemotePath}`);
    await slack.text(`Restore test failed: \`${filePath}\``);

    return 'FAIL';
  }

  finish() {
    log(`Restorer.finish: ${this.successCount} restored, ${this.failedCount} failed`);

    if (this.failedCount) {
      log('Failed to restore:');
      log(this.failedFiles.map((remote) => remote.path).join('\n'));
    }
  }
}

export default Restorer;
