module.exports = {
	// The path to the `aws` binary to use for backup
	aws: '/usr/bin/aws',
	// Leaves folders of paths matching these patterns will:
	// - compress their files before backup
	// - uncompress the contents after restore
	compressLeavesPatterns: [],
	// File scan data and info about uploaded files is stored here
	dbSQLite: 'data/db.sqlite',
	// The files are encrypted locally using this passphrase using `gpg`
	encryptionPassphrase: 'REPLACE-ME-OR-ELSE',
	// The path to the `gpg` binary to use for encryption
	gpg: '/usr/bin/gpg',
	// Files matching these ignore patterns are not backed up
	ignorePatterns: [
		'/Thumbs.db',
		'/.DS_Store',
		'/desktop.ini',
		'/.@__thumb/',
		'/@Recycle/',
		'/.git/',
		'/.svn/',
		'/node_modules/',
	],
	// Whether to use timestamps for logs
	logTimestamp: true,
	// After this threshold, an upload session is stopped
	maxSessionFailures: 10,
	// After this threshold (in bytes), an upload session is stopped
	maxSessionSize: 50 * 1024 * 1024,
	// These prefixes will be removed from the remote object path
	prefixRemove: [
		// '/home/foo'
	],
	// The file system will be scanned to find new or changed files
	// with this interval (in milliseconds)
	scanInterval: 7 * 24 * 3600 * 1000,
	// The Slack webhook URL for posting notifications
	slackHook: '',
	// The main backup sources
	sources: [
		// '/home/foo',
		// '/mnt/nas',
		// '/media/nas',
	],
	// The S3 bucket name to use for backup
	// Note: the bucket needs to be created before
	s3bucket: 'REPLACE-ME-WITH-YOUR-BUCKET-NAME',
	// The path to the `gpg` binary to use for encryption
	tar: '/bin/tar',
};
