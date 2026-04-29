import { exec, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import md5File from 'md5-file';

import config from './config.js';
import { ROOT_DIR } from './root.js';

const runtimeState = {
  dryRun: null,
  ignoreLock: null,
  verbose: null,
};

export function getOption(name) {
  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  if (index > -1) {
    return process.argv[index + 1];
  }
  return null;
}

export function hasFlag(flag) {
  return !!process.argv.find((arg) => arg === `--${flag}`);
}

export function initializeProcess(options = {}) {
  if (typeof options.dryRun === 'boolean') {
    runtimeState.dryRun = options.dryRun;
  }
  if (typeof options.ignoreLock === 'boolean') {
    runtimeState.ignoreLock = options.ignoreLock;
  }
  if (typeof options.verbose === 'boolean') {
    runtimeState.verbose = options.verbose;
  }

  if (process.__backupToCloudVerboseHandlerAttached) {
    return;
  }

  process.__backupToCloudVerboseHandlerAttached = true;
  process.on('unhandledRejection', (reason, p) => {
    if (!isVerbose()) {
      return;
    }

    console.error('Unhandled Rejection at: Promise', p, 'reason:', reason);
  });
}

export function isDry() {
  return runtimeState.dryRun ?? hasFlag('dry');
}

export function isVerbose() {
  return runtimeState.verbose ?? hasFlag('verbose');
}

export function isTest() {
  return process.env.BACKUP_ENV === 'test';
}

export function isDev() {
  return process.env.BACKUP_ENV === 'dev';
}

const utils = {
  DELETED: 'DELETED',
  FIXTURES_DIR: path.resolve(ROOT_DIR, 'test', '_fixtures_') + path.sep,

  execPromise(bin, args, cwd, verbose) {
    return new Promise((resolve, reject) => {
      const cmd = bin.split(' ').concat(args).map(utils.escape).join(' ');

      const child = exec(cmd, {
        cwd: cwd || ROOT_DIR,
      });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (data) => {
        stdout += data;
        if (verbose) {
          utils.debug(data.trim());
        }
      });
      child.stderr.on('data', (data) => {
        stderr += data;
        if (verbose) {
          utils.debug(data.trim());
        }
      });

      child.addListener('error', (err) => {
        if (err.code === 'ENOENT') {
          return reject(new Error(`Could not find ${err.path}`));
        }

        const message = stderr ? `${err.message}\n\n${stderr}` : err.message;
        reject(new Error(message));
      });

      child.addListener('exit', (code) => {
        if (isTest()) {
          utils.debug(`${bin} child process exit code: ${code}`);
        }
        if (code) {
          reject(new Error(`exit code: ${code}\n\n${stderr}\n\n${stdout}`));
        } else {
          resolve(stdout);
        }
      });
    });
  },

  execSync(bin, args, escapeArgs, strict = false) {
    const execArgs = escapeArgs ? args.map(utils.escape) : args;

    const result = spawnSync(bin, execArgs, {
      encoding: 'utf-8',
      maxBuffer: 100 * 1024 * 1024,
    });

    if (strict && result.error) {
      if (result.error.code === 'ENOENT') {
        throw new Error(`Could not find ${result.error.path || bin}`);
      }
      throw result.error;
    }

    if (strict && (result.signal || (result.status !== 0 && result.status !== null))) {
      const details = [result.stderr, result.stdout]
        .map((output) => output && output.trim())
        .filter((output) => output)
        .join('\n\n');
      const command = [bin].concat(args).join(' ');
      const reason = result.signal ? `signal ${result.signal}` : result.status;
      throw new Error(`Command failed (${reason}): ${command}${details ? `\n${details}` : ''}`);
    }

    return result.stdout;
  },

  escape(s) {
    return s && `"${s.replace(/([`"$])/g, '\\$1')}"`;
  },

  hash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  },

  mkdir(dir) {
    if (!fs.existsSync(dir)) {
      utils.execSync('mkdir', ['-p', dir]);
    }
  },

  tempFile(prefix) {
    const tempDir = config.tempDir || os.tmpdir();
    utils.mkdir(tempDir);

    let file;
    do {
      file = `${tempDir}/${prefix}${crypto.randomBytes(6).readUInt32LE(0)}`;
    } while (fs.existsSync(file));

    return file;
  },

  localFilePath(filePath) {
    if (fs.existsSync(filePath)) {
      return filePath;
    }

    const localPrefix = config.prefixRemove.find((prefix) => {
      return fs.existsSync(`${prefix}${filePath}`);
    });

    if (!localPrefix) {
      throw new Error(`Could not find any prefix for a local file: ${filePath}`);
    }

    return `${localPrefix}${filePath}`;
  },

  remoteFilePath(file) {
    return config.prefixRemove.reduce((remoteFile, prefix) => {
      return remoteFile.replace(prefix, '');
    }, file);
  },

  log() {
    const time = new Date().toISOString();
    console.log.apply(console, [time].concat([].slice.call(arguments)));
  },

  debug() {
    if (isVerbose()) {
      const time = new Date().toISOString();
      console.log.apply(console, [time].concat([].slice.call(arguments)));
    }
  },

  ask(question) {
    // Code adapted from https://github.com/tcql/node-yesno/blob/master/yesno.js
    return new Promise((resolve, reject) => {
      process.stdout.write(`${question} `);

      process.stdin.setEncoding('utf8');
      process.stdin
        .once('data', function (val) {
          let result;
          const clean = val.trim().toLowerCase();

          if (['yes', 'y', 'ok'].includes(clean)) {
            result = true;
          } else if (['no', 'n'].includes(clean)) {
            result = false;
          } else {
            reject(new Error(`Invalid response: ${clean}`));
            return;
          }

          process.stdin.unref();
          resolve(result);
        })
        .resume();
    });
  },

  acquireLock(lockFile) {
    if (runtimeState.ignoreLock ?? hasFlag('ignore-lock')) {
      // When ignore-lock is set, preserve existing behavior and overwrite any existing lock.
      fs.writeFileSync(lockFile, '');
      return true;
    }

    try {
      // Atomically create the lock file; fail if it already exists.
      fs.writeFileSync(lockFile, '', { flag: 'wx' });
      return true;
    } catch (err) {
      if (err && (err.code === 'EEXIST' || err.code === 'EISDIR')) {
        utils.log(
          'Another instance is already running or has not properly terminated. Remove lock file to continue.',
        );
        return false;
      }
      throw err;
    }
  },

  releaseLock(lockFile) {
    try {
      fs.unlinkSync(lockFile);
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        // Lock file already removed; treat as success.
        return;
      }
      throw err;
    }
  },

  areFilesIdentical(fileA, fileB) {
    return (
      fs.existsSync(fileA) && fs.existsSync(fileB) && md5File.sync(fileA) === md5File.sync(fileB)
    );
  },
};

export default utils;
