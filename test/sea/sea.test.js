import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const cwd = process.cwd();
const binaryPath = path.resolve(cwd, 'dist', 'sea', 'backup-to-cloud');
const dataDir = path.resolve(cwd, 'data');
const lockDir = path.resolve(cwd, 'tmp', 'test', 'locks');
const dryDbPath = path.resolve(cwd, 'data', 'db-test.sqlite.dry');
const awsLogPath = path.resolve(cwd, 'data', 'aws.json');

function runBinary(args, options = {}) {
  const result = spawnSync(binaryPath, args, {
    cwd: options.cwd || cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });

  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error,
  };
}

function cleanupRepoArtifacts() {
  fs.rmSync(dryDbPath, { force: true });
  fs.rmSync(awsLogPath, { force: true });
  fs.rmSync(lockDir, { force: true, recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
}

function createWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'backup-to-cloud-sea-'));
}

function writeConfig(workspace, envName, content) {
  const configPath = path.join(workspace, `config.${envName}.js`);
  fs.writeFileSync(configPath, content);
  return configPath;
}

function assertSuccess(result, label) {
  assert.strictEqual(result.error, undefined, `${label} failed to spawn: ${result.error}`);
  assert.strictEqual(result.signal, null, `${label} exited with signal ${result.signal}`);
  assert.strictEqual(
    result.status,
    0,
    `${label} exited with status ${result.status}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
  );
}

function checkConfigSmoke() {
  const workspace = createWorkspace();
  const envName = 'sea-check-config';

  writeConfig(
    workspace,
    envName,
    `export default {
  aws: 'node',
  dbSQLite: 'data/db-test.sqlite',
  encryptionPassphrase: 'password',
  gpg: 'node',
  maxSessionSize: 1024,
  scanInterval: 1000,
  sources: ['/tmp'],
  s3bucket: 'bucket'
};
`,
  );

  const result = runBinary(['check-config'], {
    cwd: workspace,
    env: {
      BACKUP_ENV: envName,
    },
  });

  assertSuccess(result, 'SEA check-config');
  assert.match(result.stdout, /Config seems in order!/);

  fs.rmSync(workspace, { force: true, recursive: true });
}

function initSmoke() {
  const workspace = createWorkspace();
  const configPath = path.join(workspace, 'config.default.js');

  const result = runBinary(['init'], {
    cwd: workspace,
  });

  assertSuccess(result, 'SEA init');
  assert.match(result.stdout, /Created config\.default\.js/);
  assert.ok(fs.existsSync(configPath), 'SEA init did not create config.default.js');
  assert.match(fs.readFileSync(configPath, 'utf8'), /export default/);

  fs.rmSync(workspace, { force: true, recursive: true });
}

function scanDrySmoke() {
  cleanupRepoArtifacts();

  const result = runBinary(['scan', '--dry'], {
    env: {
      BACKUP_ENV: 'test',
    },
  });

  assertSuccess(result, 'SEA scan --dry');
  assert.match(result.stdout, /Starting scan\.\.\./);
  assert.match(result.stdout, /This is a DRY run!/);
  assert.ok(fs.existsSync(dryDbPath), 'SEA scan --dry did not create the dry-run SQLite DB');
}

function verifyDrySmoke() {
  cleanupRepoArtifacts();

  const result = runBinary(
    ['verify', '--dry', '--aws-ls-mock', 'test/_fixtures_/verify/ls-ok.txt'],
    {
      env: {
        BACKUP_ENV: 'test',
      },
    },
  );

  assertSuccess(result, 'SEA verify --dry');
  assert.match(result.stdout, /Verifier\.start/);
  assert.match(
    result.stdout,
    /All DB files are present remotely!|Found \d+ DB file\(s\) not present remotely:/,
  );
  assert.match(
    result.stdout,
    /All remote files are present in the DB!|Found \d+ remote file\(s\) not in the DB:/,
  );
}

assert.ok(fs.existsSync(binaryPath), `SEA binary is missing: ${binaryPath}`);

checkConfigSmoke();
initSmoke();
scanDrySmoke();
verifyDrySmoke();

console.log('SEA smoke tests passed');
