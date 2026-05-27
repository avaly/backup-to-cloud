# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [6.0.1](https://github.com/avaly/backup-to-cloud/compare/v6.0.0...v6.0.1) (2026-05-27)


### Bug Fixes

* Escape file names in archiver ([#144](https://github.com/avaly/backup-to-cloud/issues/144)) ([bc0122c](https://github.com/avaly/backup-to-cloud/commit/bc0122c750024aa15df9f2b29e3353efbf214114))

## [6.0.0](https://github.com/avaly/backup-to-cloud/compare/v5.0.0...v6.0.0) (2026-05-09)


### ⚠ BREAKING CHANGES

* Install new binaries from [Github Releases](https://github.com/avaly/backup-to-cloud/releases)

### Features

* Publish native binaries ([#134](https://github.com/avaly/backup-to-cloud/issues/134)) ([9deaa41](https://github.com/avaly/backup-to-cloud/commit/9deaa41d0f08edf8125d8613bf3639f8e8652320))


### Bug Fixes

* Safer verify command ([2d0077b](https://github.com/avaly/backup-to-cloud/commit/2d0077bc661b088528ef0098489080130ed34b47))

## [5.0.0](https://github.com/avaly/backup-to-cloud/compare/v4.8.0...v5.0.0) (2026-05-01)


### ⚠ BREAKING CHANGES

* Previous individual CLI scripts are now combined into a single CLI with subcommands.
* Config files need to be in ESM format

### Features

* Add check-config command ([#127](https://github.com/avaly/backup-to-cloud/issues/127)) ([9c92cc4](https://github.com/avaly/backup-to-cloud/commit/9c92cc4864814b6c79ce4fd72f7d1313621002c2))
* Add init command ([#126](https://github.com/avaly/backup-to-cloud/issues/126)) ([89ada70](https://github.com/avaly/backup-to-cloud/commit/89ada70e8edd97ced5479bc5d9a82c5490724bac))
* Add scan command ([#128](https://github.com/avaly/backup-to-cloud/issues/128)) ([82c3284](https://github.com/avaly/backup-to-cloud/commit/82c32843095e101b5b6758dfce974b6bbabad410))
* Expose a single CLI with subcommands ([#121](https://github.com/avaly/backup-to-cloud/issues/121)) ([79a8e07](https://github.com/avaly/backup-to-cloud/commit/79a8e071b962609ee9b1899c48a2e0636ec562dd))


### Code Refactoring

* convert repository to full ESM ([#116](https://github.com/avaly/backup-to-cloud/issues/116)) ([c40b3e1](https://github.com/avaly/backup-to-cloud/commit/c40b3e16fcea701a443af1ee6e99de4cfd571b8f))

## [4.8.0](https://github.com/avaly/backup-to-cloud/compare/v4.7.1...v4.8.0) (2026-04-22)


### Features

* Use better-sqlite3 package ([#112](https://github.com/avaly/backup-to-cloud/issues/112)) ([5e23d6f](https://github.com/avaly/backup-to-cloud/commit/5e23d6fdf731ffc9adec57e209e4e3ab5b79f9df))

## [4.7.1](https://github.com/avaly/backup-to-cloud/compare/v4.7.0...v4.7.1) (2026-04-21)


### Bug Fixes

* Better backup archive cleanup ([#110](https://github.com/avaly/backup-to-cloud/issues/110)) ([c2f56ea](https://github.com/avaly/backup-to-cloud/commit/c2f56eaf160a883a041b7fbe802000646b8415c0))
* Handle crypter errors ([#109](https://github.com/avaly/backup-to-cloud/issues/109)) ([245340a](https://github.com/avaly/backup-to-cloud/commit/245340a122f9db2ae2adb3795eef752c5cfc6821))
* Scan removes deleted local files from DB ([#104](https://github.com/avaly/backup-to-cloud/issues/104)) ([7c760dc](https://github.com/avaly/backup-to-cloud/commit/7c760dcd10aa94759f0c5145289dcbaaacac4945))

## [4.7.0](https://github.com/avaly/backup-to-cloud/compare/v4.6.0...v4.7.0) (2026-03-23)


### Features

* Add session removals limit config option ([#93](https://github.com/avaly/backup-to-cloud/issues/93)) ([91c4d8c](https://github.com/avaly/backup-to-cloud/commit/91c4d8c0012ce3a89df5fed02f524df7b94f5be0))

## [4.6.0](https://github.com/avaly/backup-to-cloud/compare/v4.5.1...v4.6.0) (2026-03-18)


### Features

* Remove all extra remote files in one session ([#89](https://github.com/avaly/backup-to-cloud/issues/89)) ([15d9904](https://github.com/avaly/backup-to-cloud/commit/15d99043987f8b56ad2087dfea1e3b25738235e7))
* Remove the DB upgrade code ([3b8cc2c](https://github.com/avaly/backup-to-cloud/commit/3b8cc2c34fc2d297a067ed573bd06011d25a3589))

### [4.5.1](https://github.com/avaly/backup-to-cloud/compare/v4.5.0...v4.5.1) (2026-03-17)


### Bug Fixes

* Restore test respects max-size flag ([#79](https://github.com/avaly/backup-to-cloud/issues/79)) ([9846fca](https://github.com/avaly/backup-to-cloud/commit/9846fcac3ac29f1cc5ec9a5c5f4def182043fcb2))

## [4.5.0](https://github.com/avaly/backup-to-cloud/compare/v4.4.0...v4.5.0) (2026-03-16)


### Features

* Add max-size option to restore tool ([#76](https://github.com/avaly/backup-to-cloud/issues/76)) ([d7621a3](https://github.com/avaly/backup-to-cloud/commit/d7621a3239ec473753b8007c0d44ebaffcb28134))

## [4.4.0](https://github.com/avaly/backup-to-cloud/compare/v4.3.0...v4.4.0) (2026-03-05)


### Features

* Storage class IA file size config ([#60](https://github.com/avaly/backup-to-cloud/issues/60)) ([b767e77](https://github.com/avaly/backup-to-cloud/commit/b767e774c7b8b4d991ad68f6ef17de9e768b6893))

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
