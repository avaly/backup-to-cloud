# backup-to-cloud

[![Github Actions](https://github.com/avaly/backup-to-cloud/actions/workflows/tests.yaml/badge.svg)](https://github.com/avaly/backup-to-cloud/actions)
[![NPM version](https://img.shields.io/npm/v/backup-to-cloud.svg?style=flat)](https://www.npmjs.com/package/backup-to-cloud)
[![Install size](https://packagephobia.now.sh/badge?p=backup-to-cloud)](https://packagephobia.now.sh/result?p=backup-to-cloud)

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
- node.js v22+
- [`awscli`](http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-welcome.html) 1.8.6+ (for support of `STANDARD_IA` storage class)
- `find`
- `gpg`
- `tar`

## Install

- `aws configure`
- `npm ci`
- `bin/backup-to-cloud init`
- Modify your new config file
- Check your config file: `bin/backup-to-cloud backup --check-config`
- Try it out first with: `bin/backup-to-cloud backup --dry`
- Set up a crontab entry for it, for example:
  - run every hour with verbose logging:

  ```
  0 * * * * cd /path/to/this && ./bin/backup-to-cloud backup --verbose >> cron.log 2>&1
  ```

  - run every 12 hours:

  ```
  0 */12 * * * cd /path/to/this && ./bin/backup-to-cloud backup >> cron.log 2>&1
  ```

## Commands

### `init`

Create a default config file from the sample:

```
./bin/backup-to-cloud init
```

### `backup`

```
./bin/backup-to-cloud --help
./bin/backup-to-cloud backup --help
./bin/backup-to-cloud backup --check-config
./bin/backup-to-cloud backup --dry
./bin/backup-to-cloud backup
```

### `restore`

Restore a file or folder and decrypt:

```
./bin/backup-to-cloud restore --help
./bin/backup-to-cloud restore --output OUTPUT_DIR_OR_FILE REMOTE_DIR_OR_FILE
```

Schedule a restore test:

```
0 1 * * * cd /path/to/this && ./bin/backup-to-cloud restore --max-size 1000000 --output TEMPORARY_DIR --test 0 / >> restore-test.log 2>&1
```

### `decrypt`

Decrypt a downloaded encrypted file:

```
./bin/backup-to-cloud decrypt --help
./bin/backup-to-cloud decrypt --output OUTPUT_FILE INPUT_FILE
```

### `verify`

Verify that the DB and remote files are in sync:

```
./bin/backup-to-cloud verify --help
./bin/backup-to-cloud verify --dry
./bin/backup-to-cloud verify
```
