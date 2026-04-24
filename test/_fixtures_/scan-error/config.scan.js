import path from 'node:path';
import { ROOT_DIR } from './lib/root.js';

const FIXTURES_DIR = path.resolve(ROOT_DIR, 'test', '_fixtures_');

export default {
  dbSQLite: 'data/db-test.sqlite',
  sources: ['/non/existing/source', `${FIXTURES_DIR}${path.sep}foo`],
};
