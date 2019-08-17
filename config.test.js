const path = require('path');

const config = require('./config.sample');

const FIXTURES_DIR = path.resolve(__dirname, 'test', '_fixtures_');

module.exports = Object.assign({}, config, {
	aws: path.resolve(__dirname, 'test', '_mocks_', 'aws-mock.js'),
	compressLeavesPatterns: [FIXTURES_DIR + path.sep + 'ham'],
	// Deprecated
	db: 'data/db-test.json',
	dbSQLite: 'data/db-test.sqlite',
	encryptionPassphrase: 'password',
	logTimestamp: false,
	maxSessionFailures: 2,
	maxSessionSize: 1 * 1024,
	prefixRemove: ['/foo', __dirname],
	scanInterval: 1000,
	slackHook: null,
	sources: [
		FIXTURES_DIR + path.sep + 'foo',
		FIXTURES_DIR + path.sep + 'bar',
		FIXTURES_DIR + path.sep + 'ham',
	],
	s3bucket: 'test-bucket',
});
