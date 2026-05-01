#!/usr/bin/env node
/**
 * Mock AWS CLI used for tests
 */

import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data') + path.sep;
const TEMP_DIR = path.resolve(process.cwd(), 'tmp') + path.sep;
const RESTORE_FIXTURES_DIR = path.resolve(process.cwd(), 'test', '_fixtures_', 'restore');
const LOG_FILE = `${DATA_DIR}aws.json`;

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to);
}

function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--output') {
    args.shift(); // --output
    args.shift(); // json
  }

  let log = [];
  if (fs.existsSync(LOG_FILE)) {
    log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
  }
  log.push(args);
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));

  if (args[0] === 's3' && args[1] === 'cp') {
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    // s3 cp /local/bar s3://bucket/foo
    if (args[3].match(/^s3:\/\//)) {
      // Copy temp files for encryption verification
      const fileName = args[3].split('/').pop();
      if (fileName.indexOf('fail') > -1) {
        console.log('aws-mock: This file is supposed to fail under test environment!');
        process.exit(1);
      }

      const filePath = TEMP_DIR + fileName;
      copy(args[2], filePath);
      console.log(`aws-mock: Copied temp file to ${filePath}`);
    }

    // s3 cp s3://bucket/foo /local/bar
    if (args[2].match(/^s3:\/\//)) {
      const fileFixture = RESTORE_FIXTURES_DIR + args[2].replace(/s3:\/\/[^/]+/, '');
      const fileName = args[2].split('/').pop();

      if (fileName.indexOf('fail') > -1) {
        console.log('aws-mock: This file is supposed to fail under test environment!');
        process.exit(1);
      }

      const fileDir = path.dirname(args[3]);
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }

      copy(fileFixture, args[3]);
      console.log(`aws-mock: Copied fixture file ${fileFixture} to ${args[3]}`);
    }
  }

  if (args[0] === 's3' && args[1] === 'ls') {
    console.log(fs.readFileSync(args.pop(), 'utf-8'));
  }
}

main();
