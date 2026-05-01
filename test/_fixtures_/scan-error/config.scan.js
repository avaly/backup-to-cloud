import path from 'node:path';

const FIXTURES_DIR = path.resolve(process.cwd(), 'test', '_fixtures_');

export default {
  dbSQLite: 'data/db-test.sqlite',
  sources: ['/non/existing/source', `${FIXTURES_DIR}${path.sep}foo`],
};
