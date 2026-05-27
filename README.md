# backup-to-cloud

[![Github Actions](https://github.com/avaly/backup-to-cloud/actions/workflows/tests.yaml/badge.svg)](https://github.com/avaly/backup-to-cloud/actions)

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
- [`awscli`](http://docs.aws.amazon.com/cli/latest/userguide/cli-chap-welcome.html) 1.8.6+ (for support of `STANDARD_IA` storage class)
- `find`
- `gpg`
- `tar`

The binary depends on these external tools available in `PATH`.

## Install

Install from GitHub Releases.

- Download the archive matching your platform from the [Releases page](https://github.com/avaly/backup-to-cloud/releases)
- Extract the binary on your system, e.g. `/usr/local/bin/backup-to-cloud`
- Make sure it is executable
- Run `aws configure`
- Run `backup-to-cloud init`
- Modify your new config file
- Check your config file: `backup-to-cloud check-config`
- Try a scan first with: `backup-to-cloud scan --dry`
- Try it out first with: `backup-to-cloud backup --dry`
- Set up some crontab entries for it, for example:
  - run every hour with verbose logging:

  ```
  0 * * * * cd /path/to/backup-config && backup-to-cloud backup --verbose >> cron-backup.log 2>&1
  ```

  - run backup every 12 hours:

  ```
  0 */12 * * * cd /path/to/backup-config && backup-to-cloud backup >> cron-backup.log 2>&1
  ```

  - run scan every day:

  ```
  0 7 * * * cd /path/to/backup-config && backup-to-cloud scan >> cron-scan.log 2>&1
  ```

You can also install a specific release locally with the helper script in this repo.

```bash
bash scripts/install-release.sh --version 6.0.0
bash scripts/install-release.sh --version v6.0.0 --dir /usr/local/bin
```

## Commands

### `init`

Create a default config file from the sample:

```
backup-to-cloud init
```

### `backup`

```
backup-to-cloud backup --help
backup-to-cloud backup --dry
backup-to-cloud backup
```

### `scan`

Scan sources and update the local DB without uploading files:

```
backup-to-cloud scan --dry
backup-to-cloud scan
```

### `check-config`

Validate your config file and required binaries:

```
backup-to-cloud check-config
```

### `restore`

Restore a file or folder and decrypt:

```
backup-to-cloud restore --output OUTPUT_DIR_OR_FILE REMOTE_DIR_OR_FILE
```

Schedule a restore test:

```
0 1 * * * cd /path/to/backup-config && backup-to-cloud restore --max-size 1000000 --output TEMPORARY_DIR --test 0 / >> restore-test.log 2>&1
```

### `decrypt`

Decrypt a downloaded encrypted file:

```
backup-to-cloud decrypt --output OUTPUT_FILE INPUT_FILE
```

### `verify`

Verify that the DB and remote files are in sync:

```
backup-to-cloud verify
```
