# backup-to-cloud

A simple backup tool which uploads encrypted files to S3, in batches.

Ideally, it should be setup to run in a crontab entry.

## Features

- Encrypts files locally with `gpg`
- Uploads files to S3 in batches of customizable sizes
- Rescans sources at specific intervals to find new or updated files
- Removes files from S3 if they are removed locally

## Requirements

- OS: Linux, MacOS (untested)
- node.js 6+
- `awscli`
- `find`
- `gpg`

## Install

- `cp config.sample.js config.default.js`
- Modify your new config file
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
