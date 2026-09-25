import * as sea from 'node:sea';

const SAMPLE_CONFIG_ASSET_KEY = 'config.sample.js';

export function getBundledSampleConfigContent() {
  return getSeaAssetText(SAMPLE_CONFIG_ASSET_KEY);
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
