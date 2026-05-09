import path from 'node:path';

import config from './config.sample.js';

const FIXTURES_DIR = path.resolve(process.cwd(), 'test', '_fixtures_');

export default Object.assign({}, config, {
  aws: path.resolve(process.cwd(), 'test', '_mocks_', 'aws-mock.js'),
  compressLeavesPatterns: [`${FIXTURES_DIR}${path.sep}ham`],
  dbSQLite: 'data/db-test.sqlite',
  encryptionPassphrase: 'password',
  ignorePatterns: [...config.ignorePatterns, '/.gitignore'],
  logTimestamp: false,
  maxSessionFailures: 2,
  maxSessionRemovals: 3,
  maxSessionSize: 1 * 1024,
  prefixRemove: [FIXTURES_DIR, '/foo', process.cwd()],
  scanInterval: 1000,
  slackHook: null,
  sources: [
    `${FIXTURES_DIR}${path.sep}foo`,
    `${FIXTURES_DIR}${path.sep}bar`,
    `${FIXTURES_DIR}${path.sep}ham`,
    `${FIXTURES_DIR}${path.sep}empty`,
  ],
  storageClassIAMinimumSize: 128 * 1024,
  s3bucket: 'test-bucket',
  tempDir: path.resolve(process.cwd(), 'tmp', 'test'),
});
