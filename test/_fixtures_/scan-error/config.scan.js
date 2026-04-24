import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, 'test', '_fixtures_');

export default {
  dbSQLite: 'data/db-test.sqlite',
  sources: ['/non/existing/source', `${FIXTURES_DIR}${path.sep}foo`],
};
