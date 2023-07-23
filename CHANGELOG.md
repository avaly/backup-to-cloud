# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [4.3.0](https://github.com/avaly/backup-to-cloud/compare/v4.2.1...v4.3.0) (2023-07-23)


### Features

* Save file hash as S3 metadata ([#45](https://github.com/avaly/backup-to-cloud/issues/45)) ([ffed47b](https://github.com/avaly/backup-to-cloud/commit/ffed47b))
* Upgrade sqlite ([#44](https://github.com/avaly/backup-to-cloud/issues/44)) ([f44fc65](https://github.com/avaly/backup-to-cloud/commit/f44fc65))

### [4.2.1](https://github.com/avaly/backup-to-cloud/compare/v4.2.0...v4.2.1) (2020-11-01)


### Bug Fixes

* Support large file lists ([30875b2](https://github.com/avaly/backup-to-cloud/commit/30875b2))

## [4.2.0](https://github.com/avaly/backup-to-cloud/compare/v4.1.0...v4.2.0) (2019-08-28)


### Features

* Restore confirmation ([3de3b08](https://github.com/avaly/backup-to-cloud/commit/3de3b08))
* Restore test ([90cfcfc](https://github.com/avaly/backup-to-cloud/commit/90cfcfc))

## [4.1.0](https://github.com/avaly/backup-to-cloud/compare/v4.0.2...v4.1.0) (2019-08-19)


### Features

* Configurable temporary directory ([25bbfd7](https://github.com/avaly/backup-to-cloud/commit/25bbfd7))

### [4.0.2](https://github.com/avaly/backup-to-cloud/compare/v4.0.1...v4.0.2) (2019-08-18)


### Bug Fixes

* Archives only contain immediate files in folder ([88599e3](https://github.com/avaly/backup-to-cloud/commit/88599e3))
* Decrypt binary files correctly ([b84320d](https://github.com/avaly/backup-to-cloud/commit/b84320d))

### [4.0.1](https://github.com/avaly/backup-to-cloud/compare/v4.0.0...v4.0.1) (2019-08-17)


### Bug Fixes

* Remove temporary archive file after upload ([d17ce9c](https://github.com/avaly/backup-to-cloud/commit/d17ce9c))

## [4.0.0](https://github.com/avaly/backup-to-cloud/compare/v3.1.0...v4.0.0) (2019-08-17)


### ⚠ BREAKING CHANGES

* file hashing algorithm is changed - files will be
re-uploaded to cloud storage

### Features

* File hash uses remote file path ([988f918](https://github.com/avaly/backup-to-cloud/commit/988f918))

## [3.1.0](https://github.com/avaly/backup-to-cloud/compare/v3.0.1...v3.1.0) (2019-08-17)


### Features

* Delete one file after uploading files in a session ([fc71892](https://github.com/avaly/backup-to-cloud/commit/fc71892))

### [3.0.1](https://github.com/avaly/backup-to-cloud/compare/v3.0.0...v3.0.1) (2019-08-17)


### Bug Fixes

* Upgrade all dependencies, require node>=10 ([d3b8181](https://github.com/avaly/backup-to-cloud/commit/d3b8181))

<a name="3.0.0"></a>
# [3.0.0](https://github.com/avaly/backup-to-cloud/compare/v2.5.1...v3.0.0) (2018-07-11)


### Bug Fixes

* Slacker promise rejection ([94832cd](https://github.com/avaly/backup-to-cloud/commit/94832cd))


### Features

* Drop milliseconds from modified time on scan ([8d6b1b0](https://github.com/avaly/backup-to-cloud/commit/8d6b1b0)), closes [#13](https://github.com/avaly/backup-to-cloud/issues/13)


### BREAKING CHANGES

* file hashing algorithm is changed - files will be
re-uploaded to cloud storage



<a name="2.5.1"></a>
## [2.5.1](https://github.com/avaly/backup-to-cloud/compare/v2.5.0...v2.5.1) (2018-07-11)


### Bug Fixes

* Use batch flag for gpg calls ([738e42e](https://github.com/avaly/backup-to-cloud/commit/738e42e))



<a name="2.5.0"></a>
# [2.5.0](https://github.com/avaly/backup-to-cloud/compare/v2.4.2...v2.5.0) (2018-07-09)


### Features

* Bump minimum node to v8 ([258aad5](https://github.com/avaly/backup-to-cloud/commit/258aad5))
* Switch to sqlite library ([3615b2e](https://github.com/avaly/backup-to-cloud/commit/3615b2e)), closes [#12](https://github.com/avaly/backup-to-cloud/issues/12)



<a name="2.4.2"></a>
## [2.4.2](https://github.com/avaly/backup-to-cloud/compare/v2.4.1...v2.4.2) (2017-11-13)



<a name="2.4.1"></a>
## [2.4.1](https://github.com/avaly/backup-to-cloud/compare/v2.4.0...v2.4.1) (2017-11-03)


### Bug Fixes

* Scanner does not halt on permission errors :bug: ([8f09ebf](https://github.com/avaly/backup-to-cloud/commit/8f09ebf))



<a name="2.4.0"></a>
# [2.4.0](https://github.com/avaly/backup-to-cloud/compare/v2.3.1...v2.4.0) (2017-05-13)


### Features

* Slack notifications :tada: ([4006663](https://github.com/avaly/backup-to-cloud/commit/4006663))



<a name="2.3.1"></a>
## [2.3.1](https://github.com/avaly/backup-to-cloud/compare/v2.3.0...v2.3.1) (2017-05-02)


### Bug Fixes

* Dry mode on backup :bug: ([d44e044](https://github.com/avaly/backup-to-cloud/commit/d44e044))
* verify with prefixes support :bug: ([c59bb03](https://github.com/avaly/backup-to-cloud/commit/c59bb03))



<a name="2.3.0"></a>
# [2.3.0](https://github.com/avaly/backup-to-cloud/compare/v2.2.0...v2.3.0) (2017-04-30)


### Bug Fixes

* Support special characters in filenames :truck: ([46e9057](https://github.com/avaly/backup-to-cloud/commit/46e9057))


### Features

* backup-verify tool :wrench: ([bc3bd1b](https://github.com/avaly/backup-to-cloud/commit/bc3bd1b))
* Removed --reset-synced flag :heavy_minus_sign: ([41f32f5](https://github.com/avaly/backup-to-cloud/commit/41f32f5))
* Upgrade better-sqlite3 :arrow_up: ([f79d959](https://github.com/avaly/backup-to-cloud/commit/f79d959))



<a name="2.2.0"></a>
# [2.2.0](https://github.com/avaly/backup-to-cloud/compare/v2.1.0...v2.2.0) (2017-04-15)


### Bug Fixes

* Use progress conditional for archives scanning also :zap: ([88ce6f0](https://github.com/avaly/backup-to-cloud/commit/88ce6f0))


### Features

* Pipe output from aws CLI in real time :lipstick: ([992c0bb](https://github.com/avaly/backup-to-cloud/commit/992c0bb))
* Support for backing up files in random order :tada: ([a4b6d89](https://github.com/avaly/backup-to-cloud/commit/a4b6d89))



<a name="2.1.0"></a>
# [2.1.0](https://github.com/avaly/backup-to-cloud/compare/v2.0.1...v2.1.0) (2017-04-09)


### Features

* Support for compressing leaves folders :tada: ([a592eb6](https://github.com/avaly/backup-to-cloud/commit/a592eb6)), closes [#4](https://github.com/avaly/backup-to-cloud/issues/4)



<a name="2.0.1"></a>
## [2.0.1](https://github.com/avaly/backup-to-cloud/compare/v2.0.0...v2.0.1) (2017-04-09)


### Bug Fixes

* Config check support for custom shell commands :bug: ([bab5707](https://github.com/avaly/backup-to-cloud/commit/bab5707))



<a name="2.0.0"></a>
# [2.0.0](https://github.com/avaly/backup-to-cloud/compare/v1.6.0...v2.0.0) (2017-04-09)


### Features

* Switch DB format to SQLite :boom: ([4f2be74](https://github.com/avaly/backup-to-cloud/commit/4f2be74))


### BREAKING CHANGES

* DB format switch to SQLite. See README for upgrade.



<a name="1.6.0"></a>
# [1.6.0](https://github.com/avaly/backup-to-cloud/compare/v1.5.0...v1.6.0) (2017-03-30)


### Bug Fixes

* Warning on missing config file ([a356c59](https://github.com/avaly/backup-to-cloud/commit/a356c59))


### Features

* Restore tool :tada: ([a9be687](https://github.com/avaly/backup-to-cloud/commit/a9be687))



<a name="1.5.1"></a>
## [1.5.1](https://github.com/avaly/backup-to-cloud/compare/v1.5.0...v1.5.1) (2017-03-30)



# Change Log

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.
