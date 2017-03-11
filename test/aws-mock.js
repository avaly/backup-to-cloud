#!/usr/bin/env node
/**
 * Mock AWS CLI used for tests
 */

const childProcess = require('child_process');
const path = require('path');
const fs = require('fs');

const execFileSync = childProcess.execFileSync;

const DATA_DIR = path.resolve(__dirname, '..', 'data') + path.sep;
const LOG_FILE = DATA_DIR + 'aws.json';

function main() {
	const args = process.argv.slice(2);

	let log = [];
	if (fs.existsSync(LOG_FILE)) {
		log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
	}
	log.push(args);
	fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));

	// Copy temp files for encryption verification
	if (args[1] === 'cp') {
		const fileName = args[3].split('/').pop();
		const filePath = DATA_DIR + fileName;
		console.log('fileName', fileName);
		if (fileName === '1-small.dat') {
			console.log(
				'aws-mock: This file is supposed to fail under test environment!'
			);
			process.exit(1);
		}

		execFileSync('cp', [args[2], filePath], {
			encoding: 'utf-8'
		});
		console.log(`aws-mock: Copied temp file to ${filePath}`);
	}
}

main();
