const assert = require('chai').assert;

const config = require('../lib/config');
const utils = require('./utils');

const FIXTURES_DIR = utils.FIXTURES_DIR;

describe('verifier', () => {
	const verify = (awsLSMock, dry) =>
		utils.run(
			['--verbose', dry ? '--dry' : '', '--aws-ls-mock', FIXTURES_DIR + 'verify/' + awsLSMock],
			'verify',
		);

	beforeEach(() => {
		utils.cp(FIXTURES_DIR + 'verify/db-test.sqlite', config.dbSQLite);
	});

	it('OK state', () => {
		return verify('ls-ok.txt').then(output => {
			assert.include(output, 'All remote files are present in the DB!');
			assert.include(output, 'All DB files are present remotely!');
		});
	});

	it('extra remote file, do nothing', () => {
		return verify('ls-extra-remote.txt').then(output => {
			assert.include(output, 'Found 2 remote file(s) not in the DB:');
			assert.include(output, '/blah/who.dat');
			assert.include(output, '/what/is/this.txt');
			assert.include(output, 'All DB files are present remotely!');
		});
	});

	it('extra DB file, do nothing', () => {
		return verify('ls-extra-db.txt', true)
			.then(output => {
				assert.include(output, 'This is a DRY run! No changes/uploads will be made.');
				assert.include(output, 'All remote files are present in the DB!');
				assert.include(output, 'Found 2 DB file(s) not present remotely:');
				assert.include(output, '/bar/3-large.txt');
				assert.include(output, '/foo/1-fail.dat');
			})
			.then(utils.getDataContent)
			.then(db => {
				assert.equal(db.remotes.length, 6);
			});
	});

	it('extra DB file, remove from DB', () => {
		return verify('ls-extra-db.txt', false)
			.then(output => {
				assert.include(output, 'All remote files are present in the DB!');
				assert.include(output, 'Found 2 DB file(s) not present remotely:');
				assert.include(output, '/bar/3-large.txt');
				assert.include(output, '/foo/1-fail.dat');
			})
			.then(utils.getDataContent)
			.then(db => {
				assert.equal(db.remotes.length, 4);
				assert.isUndefined(db.remotesByPath['/bar/3-large.txt']);
				assert.isUndefined(db.remotesByPath['/foo/1-fail.dat']);
			});
	});
});
