import fs from 'node:fs';
import path from 'node:path';

import { DB_TYPES } from './DB.js';
import config from './config.js';
import { DELETED, debug, execSync, hash, log, remoteFilePath } from './utils.js';

const PROGRESS_LOG_FILES = 1000;
const PROGRESS_LOG_ARCHIVES = 10;

function hasIgnore(file) {
  return config.ignorePatterns.find((pattern) => file.indexOf(pattern) !== -1);
}

function hasCompressLeaves(file) {
  return config.compressLeavesPatterns.find((pattern) => file.indexOf(pattern) !== -1);
}

function archiveFor(file) {
  const dir = path.dirname(file);
  return dir + path.sep + path.basename(dir) + '.tar';
}

class Scanner {
  constructor(db) {
    this.db = db;
  }

  static findFiles(dir, args = []) {
    let output;

    try {
      output = execSync('find', [dir, '-type', 'f', ...args], false, true);
    } catch (err) {
      throw new Error(`Failed to scan source ${dir}: ${err.message || err}`, { cause: err });
    }

    const files = output
      .split('\n')
      .filter((file) => file && file.length)
      .filter((file) => !hasIgnore(file));

    files.sort();

    return files;
  }

  static scanFile(file) {
    const stat = fs.statSync(file);
    const mtime = stat.mtime.toISOString().replace(/\.\d{3}Z/, '');
    return {
      hash: `${remoteFilePath(file)} ${stat.size} ${mtime}`,
      size: stat.size,
    };
  }

  scan() {
    const lastScanTimestamp = this.db.getSetting('lastScanTimestamp', 0);
    const lastTime = parseInt(lastScanTimestamp, 10);
    if (lastTime && lastTime + config.scanInterval > Date.now()) {
      debug('A scan was performed too recently. Skipping rescan!');
      return;
    }

    log('Scanning sources for new files...');

    for (const source of config.sources) {
      // We intentionally don't catch any errors thrown in `scanSource`
      // to avoid removing already backed up files from the DB in case of a temporary scan failure.
      this.scanSource(source);
    }

    this.scanDeletedSources();
    this.pruneDeletedFiles();

    this.db.setSetting('lastScanTimestamp', String(Date.now()));
  }

  scanSource(source) {
    const prefix = `Source: ${source} - `;
    log(`${prefix}Scanning...`);

    const lines = Scanner.findFiles(source);
    if (!lines.length) {
      debug(`${prefix}No files found!`);
    }

    const files = lines.filter((file) => !hasCompressLeaves(file));

    const archivesFiles = {};
    for (const file of lines.filter((line) => hasCompressLeaves(line))) {
      const archive = archiveFor(file);
      if (!archivesFiles[archive]) {
        archivesFiles[archive] = [];
      }
      archivesFiles[archive].push(file);
    }
    const archives = Object.keys(archivesFiles);

    debug(`${prefix}Files found: ${files.length}`);
    debug(`${prefix}Archives found: ${archives.length}`);

    const locals = this.db.getLocalsWithPrefix(source);

    // Mark deleted files
    let deleted = 0;
    for (const item of locals) {
      const file = item.path;
      if (
        // Search only through files in this source
        file.indexOf(source) === 0 &&
        // Find files which are no longer present
        files.indexOf(file) === -1 &&
        archives.indexOf(file) === -1 &&
        // But which haven't been yet marked as deleted
        item.hash !== DELETED
      ) {
        item.hash = DELETED;
        this.db.updateLocal(item);
        deleted++;
      }
    }
    if (deleted > 0) {
      debug(`${prefix}Deleted files: ${deleted}`);
    }

    // Record new files / Update existing files hashes
    for (const [index, file] of files.entries()) {
      if (!file) {
        continue;
      }
      /* istanbul ignore if */
      if (index % PROGRESS_LOG_FILES === PROGRESS_LOG_FILES - 1) {
        debug(`${prefix}Scanning files ${index + 1}/${files.length}...`);
      }
      const scan = Scanner.scanFile(file);
      const fileHash = hash(scan.hash);

      this.db.updateLocal(file, fileHash, scan.size, DB_TYPES.FILE);
    }

    // Record new archives / Update existing archives hashes
    for (const [index, archive] of archives.entries()) {
      /* istanbul ignore if */
      if (index % PROGRESS_LOG_ARCHIVES === PROGRESS_LOG_ARCHIVES - 1) {
        debug(`${prefix}Scanning archives ${index + 1}/${archives.length}...`);
      }
      let size = 0;
      const hashes = archivesFiles[archive].map(Scanner.scanFile).map((scan) => {
        size += scan.size;
        return hash(scan.hash);
      });
      const archiveHash = hash(hashes.join('-'));

      this.db.updateLocal(archive, archiveHash, size, DB_TYPES.ARCHIVE);
    }
  }

  scanDeletedSources() {
    const locals = this.db.getAllLocalsPaths();
    let deleted = 0;

    for (const file of locals) {
      // TODO: figure why file is null
      if (!file) {
        continue;
      }
      const source = config.sources.find((source) => file.indexOf(source) === 0);
      if (!source) {
        this.db.updateLocal(file, DELETED, 0);
        deleted++;
      }
    }

    if (deleted > 0) {
      debug(`Deleting files from unknown sources: ${deleted}`);
    }
  }

  pruneDeletedFiles() {
    const locals = this.db.getLocalsPathsForPruning();

    if (locals.length) {
      debug(`Pruning deleted files from DB: ${locals.length}`);
    }

    for (const path of locals) {
      this.db.deleteLocal(path);
    }
  }
}

export default Scanner;
