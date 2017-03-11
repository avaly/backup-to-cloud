const path = require('path');

const config = require('./config.sample');

module.exports = Object.assign({}, config, {
	aws: path.resolve(__dirname, 'test', 'aws-mock.js'),
	db: 'data/db-test.json',
	encryptionPassphrase: 'password',
	logTimestamp: false,
	maxSessionSize: 1 * 1024,
	scanInterval: 1 * 1000,
	sources: [
		path.resolve(__dirname, 'test', '_fixtures_', 'foo'),
		path.resolve(__dirname, 'test', '_fixtures_', 'bar'),
	],
	s3bucket: 'test-bucket'
});