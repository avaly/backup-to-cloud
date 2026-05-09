import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as sea from 'node:sea';

import pkg from './package.js';

const SAMPLE_CONFIG_ASSET_KEY = 'config.sample.js';
const SQLITE_ADDON_ASSET_KEY = 'better_sqlite3.node';

export function getBundledSampleConfigContent() {
  return getSeaAssetText(SAMPLE_CONFIG_ASSET_KEY);
}

export function getBundledBetterSqlite3BindingPath() {
  return materializeSeaAsset(SQLITE_ADDON_ASSET_KEY, 'better_sqlite3.node');
}

function getSeaAssetText(assetKey) {
  if (!isSeaBinary()) {
    return null;
  }

  return sea.getAsset(assetKey, 'utf8');
}

export function isSeaBinary() {
  return typeof sea.isSea === 'function' && sea.isSea();
}

function materializeSeaAsset(assetKey, fileName) {
  if (!isSeaBinary()) {
    return null;
  }

  const targetDirectory = path.join(
    os.tmpdir(),
    pkg.name,
    pkg.version,
    `abi-${process.versions.modules}`,
    `${process.platform}-${process.arch}`,
  );

  const targetPath = path.join(targetDirectory, fileName);

  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetDirectory, { recursive: true });
    fs.writeFileSync(targetPath, new Uint8Array(sea.getRawAsset(assetKey)));
  }

  return targetPath;
}
