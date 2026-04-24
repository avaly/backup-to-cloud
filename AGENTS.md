# Repository Guidelines

## Project Structure & Module Organization

`lib/` contains the core CommonJS modules for backup, restore, verify, scan, config, encryption, and DB access.
`bin/` holds the executable entrypoints (`backup-to-cloud`, `backup-restore`, `backup-verify`, `backup-decrypt`).
`test/` contains Node test runner suites plus `_fixtures_/` and `_mocks_/` data used by integration-style tests.
Generated artifacts such as `coverage/`, `.nyc_output/`, `data/`, and `tmp/` should not be treated as source.

## High-level architecture

- `bin/backup-to-cloud` is main flow: acquire lock, load env-specific config, initialize SQLite, run `Scanner` unless skipped, then run `Backuper`, then upload DB snapshot if session changed anything.
- `lib/DB.js` stores three tables: `settings`, `locals`, and `remotes`. `locals` is latest scan of source files; `remotes` is last known uploaded state, including encrypted size and upload timestamp.
- `lib/Scanner.js` scans configured sources with `find`, hashes each file from remote path + size + mtime, and records synthetic `.tar` entries for directories matched by `compressLeavesPatterns`. Missing files are first marked with `DELETED`, then pruned once they no longer exist remotely.
- `lib/Backuper.js` compares `locals` against `remotes`, encrypts files with GPG, uploads them to S3 with file hash in object metadata, removes remote files for locally deleted entries, and enforces per-session size/failure/removal limits.
- `bin/backup-restore` / `lib/Restorer.js` restore by downloading remote SQLite DB first, filtering restore candidates from DB state, then downloading, decrypting, and optionally untarring each object.
- `bin/backup-verify` / `lib/Verifier.js` compares current S3 listing against DB `remotes` and can delete stale DB rows when not in dry mode.

## Build, Test, and Development Commands

Use Node.js `>=22`.

- `npm ci`: install exact dependencies.
- `npm test`: run the Node test suite.
- `npm run lint`: check all JS and CLI files with ESLint.
- `npm run pretty`: format the repo with Prettier.

For manual CLI checks, prefer the binaries directly, for example `bin/backup-to-cloud --check-config` or `bin/backup-verify --dry`.

## Coding Style & Naming Conventions

This project uses CommonJS (`require`, `module.exports`). Follow `.editorconfig` and ESLint: 2-space indentation for JS, LF line endings, single quotes, semicolons. Prettier is configured with `useTabs: false` and `printWidth: 100`. Use PascalCase for main class-like modules in `lib/` (`Backuper.js`, `Verifier.js`) and kebab-case for CLI entrypoints in `bin/`.

## Testing Guidelines

Tests are written with the Node test runner and the native `assert` module. Add new tests under `test/` with `*-test.js` names that mirror the module or command under test, for example `test/backuper-test.js`. Reuse fixtures under `test/_fixtures_/` when possible rather than creating ad hoc temp files. Run `npm test` before opening a PR; run `npm run coverage` for changes affecting scan, restore, verify, or archival flows.

## Commit & Pull Request Guidelines

Commits are validated by Husky and `commitlint`. Follow Conventional Commits with sentence-case subjects, e.g. `fix: Scan removes deleted local files from DB` or `chore: Modernize syntax`. Pre-commit runs `lint-staged`, which formats and auto-fixes staged JS/JSON files.

## Configuration & Safety Notes

Start from `config.sample.js`; keep secrets out of git. Local runs depend on external tools such as `awscli`, `gpg`, `find`, and `tar`, so mention any environment assumptions when changing backup behavior.
