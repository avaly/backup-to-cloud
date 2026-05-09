import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const cwd = process.cwd();
const appPkg = JSON.parse(fs.readFileSync(path.resolve(cwd, 'package.json'), 'utf8'));
const distDir = path.resolve(cwd, 'dist', 'sea');
const bundlePath = path.join(distDir, 'backup-to-cloud.mjs');
const configPath = path.join(distDir, 'sea-config.json');
const outputPath = path.join(distDir, 'backup-to-cloud');

function resolveBetterSqlite3AddonPath() {
  const packagePath = require.resolve('better-sqlite3/package.json');
  const packageDirectory = path.dirname(packagePath);
  const addonPath = path.join(packageDirectory, 'build', 'Release', 'better_sqlite3.node');

  if (!fs.existsSync(addonPath)) {
    throw new Error(`Missing better-sqlite3 native addon: ${addonPath}`);
  }

  return addonPath;
}

async function main() {
  fs.mkdirSync(distDir, { recursive: true });

  await build({
    entryPoints: [path.resolve(cwd, 'lib', 'sea-entry.js')],
    outfile: bundlePath,
    banner: {
      js: "#!/usr/bin/env node\nimport { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);",
    },
    bundle: true,
    define: {
      'process.env.BACKUP_TO_CLOUD_NAME': JSON.stringify(appPkg.name),
      'process.env.BACKUP_TO_CLOUD_VERSION': JSON.stringify(appPkg.version),
      'process.env.BACKUP_TO_CLOUD_DESCRIPTION': JSON.stringify(appPkg.description),
    },
    format: 'esm',
    platform: 'node',
    target: 'node26',
  });

  const seaConfig = {
    main: bundlePath,
    mainFormat: 'module',
    output: outputPath,
    executable: process.execPath,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
    execArgvExtension: 'env',
    assets: {
      'config.sample.js': path.resolve(cwd, 'config.sample.js'),
      'better_sqlite3.node': resolveBetterSqlite3AddonPath(),
    },
  };

  fs.writeFileSync(configPath, JSON.stringify(seaConfig, null, 2) + '\n');

  console.log(`SEA bundle written: ${bundlePath}`);
  console.log(`SEA config written: ${configPath}`);
  console.log('Build executable with:');
  console.log(`  node --build-sea ${path.relative(cwd, configPath)}`);
}

await main();
