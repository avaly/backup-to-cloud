import fs from 'node:fs';
import path from 'node:path';

import prettyBytes from 'pretty-bytes';

import Archiver from './Archiver.js';
import Crypter from './Crypter.js';
import DB from './DB.js';
import Slacker from './Slacker.js';
import config from './config.js';
import utils, { isDev, isDry, isTest } from './utils.js';

const S3_DELETE_IA_INTERVAL = 31 * 24 * 3600 * 1000;
const AWS = config.aws;
const NEXT = 'NEXT';
const MAX_SESSION_SIZE = 'MAX_SESSION_SIZE';

class Backuper {
  constructor(db, options) {
    this.db = db;
    this.options = options;
  }

  async start() {
    this.sessionCount = 0;
    this.sessionFailed = 0;
    this.sessionSize = 0;
    this.sessionRemoved = 0;
    this.counts = this.db.getCounts();
    this.skipFiles = [];

    utils.log('Backuper.start:', `locals=${this.counts.locals} / remotes=${this.counts.remotes}`);

    let result;
    do {
      result = await this.next();
    } while (result === NEXT);

    return result;
  }

  async finish() {
    utils.debug('Backuper.finish');

    if (!this.sessionCount) {
      return;
    }

    const dbFile = this.db.file;
    const dbRemoteFile = `/${path.basename(dbFile)}`;
    return this.add({ path: dbFile }, dbRemoteFile, true);
  }

  getNextToAdd() {
    return this.db.getLocalForBackup(this.skipFiles, this.options.random);
  }

  getNextToRemove() {
    return this.db.getLocalForRemove(this.skipFiles, this.options.random);
  }

  async next() {
    const { maxSessionFailures, maxSessionRemovals, maxSessionSize } = config;

    if (this.sessionFailed >= config.maxSessionFailures) {
      utils.debug(
        `Backuper.next sessionFailed=${this.sessionFailed} maxSessionFailures=${maxSessionFailures}`,
      );
      return 'MAX_SESSION_FAILED';
    }
    const isSessionMaxed = this.sessionSize >= maxSessionSize;

    utils.debug(`Backuper.next sessionSize=${prettyBytes(this.sessionSize)}`);

    if (!isSessionMaxed) {
      const nextFileToAdd = await this.getNextToAdd();
      if (nextFileToAdd) {
        utils.debug(
          `Backuper.next path=${nextFileToAdd.path} remotePath=${nextFileToAdd.remotePath} hash=${nextFileToAdd.hash} remoteHash=${nextFileToAdd.remoteHash}`,
        );

        await this.add(nextFileToAdd);
        return NEXT;
      }
    } else {
      utils.debug(
        `Backuper.next sessionSize=${prettyBytes(this.sessionSize)} maxSessionSize=${prettyBytes(maxSessionSize)}`,
      );
    }

    const isRemovalsMaxed = maxSessionRemovals > 0 && this.sessionRemoved >= maxSessionRemovals;

    if (!isRemovalsMaxed) {
      const nextFileToRemove = await this.getNextToRemove();
      if (nextFileToRemove) {
        await this.remove(nextFileToRemove);
        return NEXT;
      }
    } else {
      utils.debug(
        `Backuper.next sessionRemoved=${this.sessionRemoved} maxSessionRemovals=${maxSessionRemovals}`,
      );
    }

    if (isSessionMaxed) {
      return MAX_SESSION_SIZE;
    }

    utils.debug('Backuper.next NO_FILES_LEFT');
    return 'NO_FILES_LEFT';
  }

  async add(local, remoteFilePath, isDBFile) {
    const backuper = this;
    const { hash, path: file, type } = local;

    utils.debug(`Backuper.add ${type}: ${file}`);

    if (!isDBFile) {
      this.sessionCount++;
    }

    const remoteFile = remoteFilePath || utils.remoteFilePath(file);
    let archiveFile = null;
    let fileToEncrypt = file;
    let encryptedFile;

    function removeFile(filePath) {
      if (filePath) {
        utils.debug(`Removing ${filePath}`);
        fs.unlinkSync(filePath);
      }
    }

    function done() {
      if (isDBFile) {
        return;
      }
      // Remember the uploaded hash to compare for future runs
      // Remember the encrypted file size to decide if we can remove if needed
      backuper.db.updateRemote({
        path: file,
        hash: local.hash,
        type: type,
        size: encryptedFile ? encryptedFile.size : 0,
        timestamp: Date.now(),
      });

      if (isDry()) {
        backuper.sessionSize += local.size;
      } else {
        if (encryptedFile) {
          backuper.sessionSize += encryptedFile.size;
        }
        Slacker.text(`Uploaded ${type}: \`${file}\` - ${prettyBytes(encryptedFile.size)}`);
      }
    }

    async function upload(localFile, fileSize) {
      await backuper.uploadToS3(localFile, remoteFile, fileSize, hash);
      utils.debug(`Backuper.add success: ${file}`);
      done();
    }

    if (isDry()) {
      done();
      return;
    }

    try {
      if (isDBFile) {
        // Using fileSize 0 to force upload to S3 in STANDARD storage class
        // since we will be updating the DB file often
        await upload(file, 0);
        return;
      }

      if (type === DB.TYPES.ARCHIVE) {
        archiveFile = await Archiver.compress(path.dirname(file));
        fileToEncrypt = archiveFile;
      }

      encryptedFile = await Crypter.encrypt(fileToEncrypt);

      await upload(encryptedFile.path, encryptedFile.size);
    } catch (err) {
      utils.log(`Backuper.add error: ${file}`);
      utils.debug(`Error: ${err}`);
      // Remember failed file to avoid trying it again in this sesssion
      backuper.skipFiles.push(file);
      backuper.sessionFailed++;
    } finally {
      if (archiveFile) {
        removeFile(archiveFile);
      }
      if (encryptedFile) {
        removeFile(encryptedFile.path);
      }
    }
  }

  uploadToS3(localFile, remoteFile, fileSize, hash) {
    const remoteURL = `s3://${config.s3bucket}${remoteFile}`;

    utils.debug(`Backuper.uploadToS3: ${remoteURL} - ${prettyBytes(fileSize)}`);

    const storageClass = fileSize >= config.storageClassIAMinimumSize ? 'STANDARD_IA' : 'STANDARD';

    const args = [
      's3',
      'cp',
      localFile,
      remoteURL,
      '--expected-size',
      String(fileSize),
      '--no-guess-mime-type',
      '--no-progress',
      '--storage-class',
      storageClass,
    ];
    if (hash) {
      args.push('--metadata');
      args.push(`hash=${hash}`);
    }

    if (isTest() || isDev()) {
      utils.debug(AWS, args.join(' '));
    }

    return utils.execPromise(AWS, args);
  }

  async remove(remote) {
    const backuper = this;
    const { path: file, size, timestamp } = remote;

    utils.debug(`Backuper.remove: ${file}`);

    const remoteFile = utils.remoteFilePath(file);

    // `STANDARD_IA` has a minimum object size of 128KB and a minimum required
    // time of 30 days. We delete these files only after 30 days of upload time.
    let canRemove = true;
    if (size >= config.storageClassIAMinimumSize) {
      canRemove = timestamp < Date.now() - S3_DELETE_IA_INTERVAL;
    }

    function done() {
      Slacker.text(`Removed: \`${file}\``);
      // Remove file from both lists
      backuper.db.deleteLocal(file);
      backuper.db.deleteRemote(file);
    }

    if (canRemove) {
      this.sessionCount++;

      /* istanbul ignore if */
      if (isDry()) {
        this.sessionRemoved++;
        done();
        return;
      }

      try {
        await this.removeFromS3(remoteFile);
        this.sessionRemoved++;
        utils.debug(`Backuper.remove success: ${file}`);
        done();
      } catch (err) {
        utils.log(`Backuper.remove error: ${file}`);
        utils.debug(`Error: ${err}`);
        // Remember failed file to avoid trying it again in this session
        this.skipFiles.push(file);
        this.sessionFailed++;
      }
      return;
    }

    utils.debug('Backuper.remove skipping file due to storage class and timestamp');

    // Remember file to avoid trying it again in this session
    this.skipFiles.push(file);
  }

  removeFromS3(remoteFile) {
    const remoteURL = `s3://${config.s3bucket}${remoteFile}`;

    utils.debug(`Backuper.removeFromS3: ${remoteURL}`);

    const args = ['s3', 'rm', remoteURL];

    if (isTest() || isDev()) {
      utils.debug(AWS, args.join(' '));
    }

    return utils.execPromise(AWS, args);
  }
}

export default Backuper;
