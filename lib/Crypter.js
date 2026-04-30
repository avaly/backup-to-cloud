import fs from 'node:fs';
import path from 'node:path';

import config from './config.js';
import { debug, execPromise, mkdir, tempFile } from './utils.js';

class Crypter {
  async encrypt(file) {
    const encryptedPath = tempFile('backup-');
    debug(`Crypter.encrypt: ${file} to ${encryptedPath}`);

    const args = [
      '--batch',
      '--symmetric',
      '--passphrase',
      config.encryptionPassphrase,
      '--output',
      encryptedPath,
      file,
    ];

    await execPromise(config.gpg, args);

    const stat = fs.statSync(encryptedPath);

    return {
      path: encryptedPath,
      size: stat.size,
    };
  }

  decrypt(fileInput, fileOutput) {
    debug(`Crypter.decrypt: ${fileInput} to ${fileOutput}`);

    mkdir(path.dirname(fileOutput));

    const args = [
      '--output',
      fileOutput,
      '--batch',
      '--decrypt',
      '--yes',
      '--quiet',
      '--passphrase',
      config.encryptionPassphrase,
      fileInput,
    ];

    return execPromise(config.gpg, args);
  }
}

export default new Crypter();
