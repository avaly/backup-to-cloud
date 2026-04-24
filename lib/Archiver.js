import path from 'node:path';

import Scanner from './Scanner.js';
import config from './config.js';
import utils from './utils.js';

const TAR = config.tar;

class Archiver {
  async compress(dir) {
    const tempFile = utils.tempFile('backup-');
    utils.debug(`Archiver.compress: ${dir} to ${tempFile}`);

    const files = Scanner.findFiles(dir, ['-maxdepth', '1']).map((file) =>
      file.replace(dir + path.sep, ''),
    );
    const args = ['cf', tempFile].concat(files);

    await utils.execPromise(TAR, args, dir);

    return tempFile;
  }

  decompress(archive, dir) {
    utils.debug(`Archiver.decompress: ${archive} to ${dir}`);
    utils.mkdir(dir);

    const args = ['xf', archive, '-C', dir];

    return utils.execPromise(TAR, args);
  }
}

export default new Archiver();
