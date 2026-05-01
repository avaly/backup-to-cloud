import path from 'node:path';

import DB from './DB.js';
import config from './config.js';
import { debug, execPromise, isDev, isDry, isTest, log } from './utils.js';

const AWS = config.aws;

class Verifier {
  async start(awsLSMock) {
    this.db = new DB();
    this.db.initialize();

    const all = this.db.getAll();
    this.remotes = all.remotesByPath;

    log('Verifier.start');

    const remoteFiles = await this.fetchRemotesList(awsLSMock);

    this.compareLists(remoteFiles);

    await this.removeFromDB();
    await this.stop();
  }

  async stop() {
    if (this.db) {
      this.db.close();
    }
  }

  async fetchRemotesList(awsLSMock) {
    const remoteURL = `s3://${config.s3bucket}/`;
    debug(`Verifier.fetchRemotesList: ${remoteURL}`);

    const args = ['s3', 'ls', '--recursive', remoteURL].concat(isTest() ? [awsLSMock] : []);

    if (isTest() || isDev()) {
      debug(AWS, args.join(' '));
    }

    const output = await execPromise(AWS, args);
    const dbFileName = path.basename(config.dbSQLite);

    return output
      .split('\n')
      .map((line) => {
        const match = line.match(/^[\d-]{10} [\d:]{8}\s+\d+\s+(.+)$/);
        if (match && match[1]) {
          return match[1];
        }
      })
      .filter((file) => !!file && file !== dbFileName);
  }

  compareLists(remoteFiles) {
    const prefixes = [''].concat(config.prefixRemove);

    this.extraRemoteFiles = remoteFiles.filter((remoteRelative) => {
      const remoteKey = `/${remoteRelative}`;

      const found = prefixes.some((prefix) => {
        const fullKey = prefix + remoteKey;
        if (this.remotes[fullKey]) {
          delete this.remotes[fullKey];
          return true;
        }
        return false;
      });

      return !found;
    });

    if (this.extraRemoteFiles.length) {
      log(`Found ${this.extraRemoteFiles.length} remote file(s) not in the DB:`);
      for (const file of this.extraRemoteFiles) {
        log(`/${file}`);
      }
    } else {
      log('All remote files are present in the DB!');
    }

    const extraDBFiles = Object.keys(this.remotes);
    if (extraDBFiles.length) {
      log(`Found ${extraDBFiles.length} DB file(s) not present remotely:`);
      for (const file of extraDBFiles) {
        log(file);
      }
    } else {
      log('All DB files are present remotely!');
    }
  }

  async removeFromDB() {
    if (isDry()) {
      return;
    }

    const extraDBFiles = Object.keys(this.remotes);

    for (const file of extraDBFiles) {
      this.db.deleteRemote(file);
    }
  }
}

export default Verifier;
