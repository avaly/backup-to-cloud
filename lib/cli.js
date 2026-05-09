import fs from 'node:fs';
import path from 'node:path';

import { Command } from 'commander';

import Backuper from './Backuper.js';
import ConfigChecker from './ConfigChecker.js';
import Crypter from './Crypter.js';
import DB from './DB.js';
import pkg from './package.js';
import Restorer from './Restorer.js';
import { getCliName, getLockFilePath, getSampleConfigContent } from './runtime.js';
import Scanner from './Scanner.js';
import {
  acquireLock,
  debug,
  initializeProcess,
  isDry,
  isTest,
  loadConfigFromFile,
  log,
  releaseLock,
} from './utils.js';
import Verifier from './Verifier.js';

function initRuntime(options = {}) {
  initializeProcess({
    dryRun: Boolean(options.dry),
    ignoreLock: Boolean(options.ignoreLock),
    verbose: Boolean(options.verbose),
  });

  log(`${pkg.name} v${pkg.version}`);
}

function addSharedOptions(command, hasLock = false) {
  if (hasLock) {
    command.option('--ignore-lock', 'ignore existing lock file');
  }
  return command
    .option('--verbose', 'enable verbose logging')
    .option('--dry', 'run without changing files or remote state');
}

async function withLock(lockName, action) {
  const lockFile = getLockFilePath(lockName);

  if (!acquireLock(lockFile)) {
    return;
  }

  try {
    await action();
  } finally {
    releaseLock(lockFile);
  }
}

async function runBackup(options) {
  initRuntime(options);

  await withLock('backup', async () => {
    let db;
    try {
      log('Starting...');
      if (isDry()) {
        log('This is a DRY run! No changes/uploads will be made.');
      }

      db = new DB();
      db.initialize();

      const backuper = new Backuper(db, {
        random: options.randomOrder,
      });

      try {
        const result = await backuper.start();
        log('Backup result', result);
      } catch (err) {
        log('Backup error', err);
      }

      await backuper.finish();
    } finally {
      if (db) {
        db.close();
        log('Finished!');
      }
    }
  });
}

async function runCheckConfig(options) {
  initRuntime(options);

  const configChecker = new ConfigChecker();

  try {
    await configChecker.check();
    log('Config seems in order!');
  } catch (err) {
    log('Config check failed:');
    log(err.message || err);
    process.exitCode = 1;
  }
}

async function runDecrypt(inputFile, options) {
  initRuntime(options);

  const fileInput = path.resolve(inputFile);
  const fileOutput = path.resolve(options.output);

  if (!fs.existsSync(fileInput)) {
    log(`Input file does not exist: ${fileInput}`);
    process.exitCode = 1;
    return;
  }

  try {
    await Crypter.decrypt(fileInput, fileOutput);
    log(`Decrypted: ${fileInput} > ${fileOutput}`);
  } catch (err) {
    log('Decrypt error', err);
    process.exitCode = 1;
  }
}

async function runInit(options) {
  initRuntime(options);

  const targetDirectory = path.resolve(options.directory || process.cwd());
  const targetPath = path.join(targetDirectory, 'config.default.js');

  if (fs.existsSync(targetPath) && !options.force) {
    log(`Config file already exists: ${targetPath}`);
    log('Use --force to overwrite it.');
    process.exitCode = 1;
    return;
  }

  if (isDry()) {
    log('This is a DRY run! No changes will be made.');
    return;
  }

  try {
    fs.mkdirSync(targetDirectory, { recursive: true });
    fs.writeFileSync(targetPath, getSampleConfigContent(process.cwd()));
  } catch (err) {
    log(err.message || err);
    process.exitCode = 1;
    return;
  }

  try {
    const config = await loadConfigFromFile(targetPath);

    const configChecker = new ConfigChecker(config);
    configChecker.variables();
  } catch (err) {
    log('Config validation failed after initialization:');
    log(err.message || err);
    process.exitCode = 1;
    return;
  }

  log('Created config.default.js');
}

async function runRestore(remotePath, options) {
  initRuntime(options);

  await withLock('restore', async () => {
    if (isDry()) {
      log('This is a DRY run! No changes/uploads will be made.');
    }

    const restorer = new Restorer();
    let finalResult;

    try {
      const result = await restorer.start(remotePath, path.resolve(options.output));
      debug('Restorer result:', result);
      finalResult = result;
    } catch (err) {
      log('Restorer error:', err);
      finalResult = 'FAIL';
    }

    restorer.finish();

    if (finalResult && finalResult.includes('FAIL')) {
      process.exitCode = 1;
    }
  });
}

async function runScan(options) {
  initRuntime(options);

  await withLock('scan', async () => {
    let db;
    try {
      log('Starting scan...');
      if (isDry()) {
        log('This is a DRY run! No changes will be made.');
      }

      db = new DB();
      db.initialize();

      const scanner = new Scanner(db);
      scanner.scan();
    } finally {
      if (db) {
        db.close();
        log('Finished!');
      }
    }
  });
}

async function runVerify(options) {
  initRuntime(options);

  await withLock('verify', async () => {
    if (isDry()) {
      log('This is a DRY run! No changes/uploads will be made.');
    }

    const verifier = new Verifier();

    try {
      await verifier.start(isTest() ? options.awsLsMock || null : null);
    } catch (err) {
      log('Verifier error:', err);
      await verifier.stop();
      process.exitCode = 1;
    }
  });
}

export function createProgram(argv = process.argv) {
  const name = getCliName(argv);
  const program = new Command();

  program.name(name).description(pkg.description).version(pkg.version).showHelpAfterError();

  addSharedOptions(
    program
      .command('backup')
      .description('Scan sources and upload encrypted files to S3')
      .option('--random-order', 'process files in random order')
      .action(runBackup),
    true,
  );

  addSharedOptions(
    program
      .command('check-config')
      .description('Validate configuration and required external binaries')
      .action(runCheckConfig),
  );

  addSharedOptions(
    program
      .command('decrypt')
      .description('Decrypt a downloaded encrypted file')
      .requiredOption('--output <path>', 'output file path (required)')
      .argument('<inputFile>', 'encrypted input file (required)')
      .action(runDecrypt),
  );

  addSharedOptions(
    program
      .command('init')
      .description('Copy the sample config file to config.default.js')
      .option('--directory <path>', 'directory where to create config.default.js')
      .option('--force', 'overwrite config.default.js if it already exists')
      .action(runInit),
  );

  addSharedOptions(
    program
      .command('restore')
      .description('Restore and decrypt a remote file or prefix')
      .requiredOption('--output <path>', 'output directory or file path (required)')
      .option('--max-size <bytes>', 'restore only files up to this size in bytes')
      .option('--test <index>', 'restore only one file by index in test mode')
      .option('--yes', 'skip confirmation prompt')
      .argument('<remotePath>', 'remote file or prefix to restore (required)')
      .action(runRestore),
    true,
  );

  addSharedOptions(
    program.command('scan').description('Scan sources and update the local DB').action(runScan),
    true,
  );

  addSharedOptions(
    program
      .command('verify')
      .description('Verify remote S3 contents against the local DB')
      .option('--aws-ls-mock <path>', 'test-only path for mocked aws s3 ls output')
      .action(runVerify),
    true,
  );

  program.addHelpText(
    'after',
    `

Examples:
  ${name} init
  ${name} check-config
  ${name} scan --dry
  ${name} backup --dry
  ${name} restore --output ./restore /
  ${name} verify --dry
  ${name} decrypt --output ./file.txt ./file.txt.gpg
`,
  );

  return program;
}

export async function main(argv = process.argv) {
  const program = createProgram(argv);
  await program.parseAsync(argv);
}
