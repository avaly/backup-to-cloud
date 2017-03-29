const assert = require('chai').assert;
const fs = require('fs');
const utils = require('./utils');

describe('cli', () => {
	beforeEach(() => {
		utils.clean();
	});

	it('shows help', () => {
		return utils.run(['--help'])
			.then((result) => {
				assert.include(result, 'Usage:');
				assert.isFalse(
					fs.existsSync(utils.DATA_FILE),
					'data file was not created'
				);
			});
	});
});
