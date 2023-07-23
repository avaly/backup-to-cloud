# backup-to-cloud

[![Github Actions](https://github.com/avaly/backup-to-cloud/actions/workflows/tests.yaml/badge.svg)](https://github.com/avaly/backup-to-cloud/actions)
[![NPM version](https://img.shields.io/npm/v/backup-to-cloud.svg?style=flat)](https://www.npmjs.com/package/backup-to-cloud)
[![Install size](https://packagephobia.now.sh/badge?p=backup-to-cloud)](https://packagephobia.now.sh/result?p=backup-to-cloud)
[![Codecov branch](https://img.shields.io/codecov/c/github/avaly/backup-to-cloud/master.svg?style=flat-square)](https://codecov.io/gh/avaly/backup-to-cloud)

A simple backup tool which uploads encrypted files to S3, in batches.

Ideally, it should be setup to run in a crontab entry.

## Features

- Encrypts files locally with `gpg`
- Uploads files to S3 in batches of customizable size
- Support for uploading a `tar` archive of files in certain folders, useful for sources with thousands of files (e.g. photo library)
- Rescans sources at specific intervals to find new or updated files
- Removes files from S3 if they are removed locally

## Requirements

- OS: Linux, MacOS (untested)
- node.js 10+
- [`awscli`](http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-welcome.html) 1.8.6+ (for support of `STANDARD_IA` storage class)
- `find`
- `gpg`
- `tar`

## Install

- `aws configure`
- `yarn install --production` OR `npm install --production`
- `cp config.sample.js config.default.js`
- Modify your new config file
- Check your config file: `bin/backup-to-cloud --check-config`
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

## Tools

### backup-to-cloud

```
./bin/backup-to-cloud --help
./bin/backup-to-cloud --check-config
./bin/backup-to-cloud --dry
./bin/backup-to-cloud
```

### backup-restore

Restore a file or folder and decrypt:

```
./bin/backup-restore --help
./bin/backup-restore --output OUTPUT_DIR_OR_FILE REMOTE_DIR_OR_FILE
```

Schedule a restore test:

```
0 1 * * * cd /path/to/this && ./bin/backup-restore --output TEMPORARY_DIR --test / >> restore-test.log 2>&1
```

### backup-decrypt

Decrypt a downloaded encrypted file:

```
./bin/backup-decrypt --help
./bin/backup-decrypt --output OUTPUT_FILE INPUT_FILE
```

## backup-verify

Verify that the DB and remote files are in sync:

```
./bin/backup-verify --help
./bin/backup-verify --dry
./bin/backup-verify
```

## Upgrade

### `1.6.0` -> `2.0.0`

The DB format has switched from JSON to SQLite. To upgrade existing DB, run:

```
./bin/backup-upgrade-db
```
