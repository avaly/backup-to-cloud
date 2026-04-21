const path = require('path');

const FIXTURES_DIR = path.resolve(__dirname, 'test', '_fixtures_');

module.exports = {
  dbSQLite: 'data/db-test.sqlite',
  sources: ['/non/existing/source', `${FIXTURES_DIR}${path.sep}foo`],
};
