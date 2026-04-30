import path from 'node:path';

import Scanner from './Scanner.js';
import config from './config.js';
import { debug, execPromise, mkdir, tempFile } from './utils.js';

const TAR = config.tar;

class Archiver {
  async compress(dir) {
    const archiveFile = tempFile('backup-');
    debug(`Archiver.compress: ${dir} to ${archiveFile}`);

    const files = Scanner.findFiles(dir, ['-maxdepth', '1']).map((file) =>
      file.replace(dir + path.sep, ''),
    );
    const args = ['cf', archiveFile].concat(files);

    await execPromise(TAR, args, dir);

    return archiveFile;
  }

  decompress(archive, dir) {
    debug(`Archiver.decompress: ${archive} to ${dir}`);
    mkdir(dir);

    const args = ['xf', archive, '-C', dir];

    return execPromise(TAR, args);
  }
}

export default new Archiver();
