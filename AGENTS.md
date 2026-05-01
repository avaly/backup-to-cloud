# Repository Guidelines

## Project Structure & Module Organization

`lib/` contains the core ESM modules for backup, restore, verify, scan, config, encryption, and DB access.
`bin/` holds the single executable entrypoint `backup-to-cloud`, which exposes `backup`, `check-config`, `decrypt`, `init`, `restore`, `scan` and `verify` subcommands via `commander`.
`test/` contains Node test runner suites plus `_fixtures_/` and `_mocks_/` data used by integration-style tests.

## High-level architecture

- `bin/backup-to-cloud backup` is main flow: acquire lock, load env-specific config, initialize SQLite, run `Scanner`, then run `Backuper`, then upload DB snapshot if session changed anything.
- `bin/backup-to-cloud scan` acquires its own lock, loads env-specific config, initializes SQLite, and runs `Scanner` without uploading files.
- `lib/DB.js` stores three tables: `settings`, `locals`, and `remotes`. `locals` is latest scan of source files; `remotes` is last known uploaded state, including encrypted size and upload timestamp.
- `lib/Scanner.js` scans configured sources with `find`, hashes each file from remote path + size + mtime, and records synthetic `.tar` entries for directories matched by `compressLeavesPatterns`. Missing files are first marked with `DELETED`, then pruned once they no longer exist remotely.
- `lib/Backuper.js` compares `locals` against `remotes`, encrypts files with GPG, uploads them to S3 with file hash in object metadata, removes remote files for locally deleted entries, and enforces per-session size/failure/removal limits.
- `bin/backup-to-cloud restore` / `lib/Restorer.js` restore by downloading remote SQLite DB first, filtering restore candidates from DB state, then downloading, decrypting, and optionally untarring each object.
- `bin/backup-to-cloud verify` / `lib/Verifier.js` compares current S3 listing against DB `remotes` and can delete stale DB rows when not in dry mode.
- `bin/backup-to-cloud decrypt` / `lib/Crypter.js` to decrypt a downloaded encrypted object to a local file.
- `bin/backup-to-cloud check-config` / `lib/ConfigChecker.js` to check the config file for valid options.

## Build, Test, and Development Commands

Use Node.js `>=22`.

- `npm ci`: install exact dependencies.
- `npm test`: run the Node test suite.
- `npm run lint`: check all JS and CLI files with ESLint.
- `npm run pretty`: format the repo with Prettier.

For manual CLI checks, prefer the binary directly with subcommands, for example `bin/backup-to-cloud check-config` or `bin/backup-to-cloud verify --dry`.

## Coding Style & Naming Conventions

This project uses ESM (`import`, `export`) with explicit `.js` specifiers. Follow `.editorconfig` and ESLint: 2-space indentation for JS, LF line endings, single quotes, semicolons. Prettier is configured with `useTabs: false` and `printWidth: 100`. Use PascalCase for main class-like modules in `lib/` (`Backuper.js`, `Verifier.js`) and kebab-case for the CLI entrypoint in `bin/`.

## Testing Guidelines

Tests are written with the Node test runner and the native `assert` module. Add new tests under `test/` with `*-test.js` names that mirror the module or command under test, for example `test/backuper-test.js`. Reuse fixtures under `test/_fixtures_/` when possible rather than creating ad hoc temp files. Run `npm test` before opening a PR.

## Commit & Pull Request Guidelines

Commits are validated by Husky and `commitlint`. Follow Conventional Commits with sentence-case subjects, e.g. `fix: Scan removes deleted local files from DB` or `chore: Modernize syntax`. Pre-commit runs `lint-staged`, which formats and auto-fixes staged JS/JSON files.

## Configuration & Safety Notes

Start from `config.sample.js`; keep secrets out of git. Local runs depend on external tools such as `awscli`, `gpg`, `find`, and `tar`, so mention any environment assumptions when changing backup behavior. CLI flag parsing is centralized in `bin/backup-to-cloud`; runtime flag state for `dry` and `verbose` is initialized there and consumed lazily via `lib/utils.js` accessors.
