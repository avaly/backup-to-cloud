import { readFileSync } from 'node:fs';

let filePkg = {
  name: 'backup-to-cloud',
  version: '0.0.0',
  description: 'A simple backup tool which uploads encrypted files to S3',
};

try {
  filePkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
} catch (err) {
  if (err && err.code === 'ENOENT') {
    // SEA bundles and other packaged runtimes may not ship package.json beside the entry file.
  } else {
    throw err;
  }
}

const pkg = {
  ...filePkg,
  name: process.env.BACKUP_TO_CLOUD_NAME || filePkg.name,
  version: process.env.BACKUP_TO_CLOUD_VERSION || filePkg.version,
  description: process.env.BACKUP_TO_CLOUD_DESCRIPTION || filePkg.description,
};

export default pkg;
