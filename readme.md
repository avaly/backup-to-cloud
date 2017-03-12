# backup-to-cloud

[![Travis branch](https://img.shields.io/travis/avaly/backup-to-cloud/master.svg?style=flat-square)](https://travis-ci.org/avaly/backup-to-cloud)
[![Codecov branch](https://img.shields.io/codecov/c/github/avaly/backup-to-cloud/master.svg?style=flat-square)](https://codecov.io/gh/avaly/backup-to-cloud)

A simple backup tool which uploads encrypted files to S3, in batches.

Ideally, it should be setup to run in a crontab entry.

## Features

- Encrypts files locally with `gpg`
- Uploads files to S3 in batches of customizable size
- Rescans sources at specific intervals to find new or updated files
- Removes files from S3 if they are removed locally

## Requirements

- OS: Linux, MacOS (untested)
- node.js 6+
- [`awscli`](http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-welcome.html) 1.8.6+ (for support of `STANDARD_IA` storage class)
- `find`
- `gpg`

## Install

- `cp config.sample.js config.default.js`
- Modify your new config file
- Double check your config file: `bin/backup-to-cloud --check-config`
- Try it out first with: `bin/backup-to-cloud --dry`
- Set up a crontab entry for it, for example:
  - run every hour with verbose logging:

  ```
  0 * * * * cd /path/to/this && ./bin/backup-to-cloud --verbose >> cron.log 2>&1
  ```
  - run every 12 hours:

  ```
  0 */12 * * * cd /path/to/this && ./bin/backup-to-cloud >> cron.log 2>&1
  ```
