import path from 'node:path';

import DB from './DB.js';
import config from './config.js';
import utils, { isDev, isDry, isTest } from './utils.js';

const AWS = config.aws;

class Verifier {
  async start(awsLSMock) {
    this.db = new DB();
    this.db.initialize();

    const all = this.db.getAll();
    this.remotes = all.remotesByPath;

    utils.log('Verifier.start');

    const remoteFiles = await this.fetchRemotesList(awsLSMock);

    this.compareLists(remoteFiles);

    await this.removeFromDB();
    await this.stop();
  }

  async stop() {
    this.db.close();
  }

  async fetchRemotesList(awsLSMock) {
    const remoteURL = `s3://${config.s3bucket}/`;
    utils.debug(`Verifier.fetchRemotesList: ${remoteURL}`);

    const args = ['s3', 'ls', '--recursive', remoteURL].concat(isTest() ? [awsLSMock] : []);

    if (isTest() || isDev()) {
      utils.debug(AWS, args.join(' '));
    }

    const output = await utils.execPromise(AWS, args);
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
      utils.log(`Found ${this.extraRemoteFiles.length} remote file(s) not in the DB:`);
      for (const file of this.extraRemoteFiles) {
        utils.log(`/${file}`);
      }
    } else {
      utils.log('All remote files are present in the DB!');
    }

    const extraDBFiles = Object.keys(this.remotes);
    if (extraDBFiles.length) {
      utils.log(`Found ${extraDBFiles.length} DB file(s) not present remotely:`);
      for (const file of extraDBFiles) {
        utils.log(file);
      }
    } else {
      utils.log('All DB files are present remotely!');
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
