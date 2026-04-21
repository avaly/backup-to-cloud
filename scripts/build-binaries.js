#!/usr/bin/env node

const childProcess = require('child_process');
const fs = require('fs');
const path = require('path');

const esbuild = require('esbuild');

const ROOT_DIR = path.resolve(__dirname, '..');
const WORK_DIR = path.resolve(ROOT_DIR, 'dist', '.sea-build');
const OUTPUT_DIR = path.resolve(
  process.env.BACKUP_EXECUTABLES_DIR || path.join(ROOT_DIR, 'dist', 'executables'),
);
const IS_WINDOWS = process.platform === 'win32';

const BINARIES = ['backup-to-cloud', 'backup-restore', 'backup-verify', 'backup-decrypt'];

const EXTERNAL_MODULES = ['sqlite3', 'bindings', 'file-uri-to-path'];
const SEA_ASSET_FILES = [
  'node_modules/sqlite3/package.json',
  'node_modules/sqlite3/lib/sqlite3.js',
  'node_modules/sqlite3/lib/sqlite3-binding.js',
  'node_modules/sqlite3/lib/trace.js',
  'node_modules/sqlite3/build/Release/node_sqlite3.node',
  'node_modules/bindings/package.json',
  'node_modules/bindings/bindings.js',
  'node_modules/file-uri-to-path/package.json',
  'node_modules/file-uri-to-path/index.js',
];

function assertBuildSeaSupport() {
  const result = childProcess.spawnSync(process.execPath, ['--help'], {
    encoding: 'utf-8',
  });
  const helpText = result.stdout || '';

  if (!helpText.includes('--build-sea')) {
    throw new Error(
      'This command requires a Node.js build that supports --build-sea (Node.js 25.5+).',
    );
  }
}

function ensureFileExists(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Required build file is missing: ${file}`);
  }
}

function resetDir(dir) {
  fs.rmSync(dir, { force: true, recursive: true });
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

async function bundle(binaryName) {
  const entryFile = path.resolve(ROOT_DIR, 'bin', binaryName);
  const outputFile = path.resolve(WORK_DIR, 'assets', 'bundles', `${binaryName}.cjs`);

  await esbuild.build({
    bundle: true,
    entryPoints: [entryFile],
    external: EXTERNAL_MODULES,
    format: 'cjs',
    outfile: outputFile,
    platform: 'node',
    target: 'node22',
  });

  return outputFile;
}

function seaOutputFile(binaryName) {
  return path.resolve(OUTPUT_DIR, IS_WINDOWS ? `${binaryName}.exe` : binaryName);
}

function createSeaConfig(binaryName, mainFile, assets) {
  return {
    assets,
    disableExperimentalSEAWarning: true,
    main: mainFile,
    output: seaOutputFile(binaryName),
    useCodeCache: false,
    useSnapshot: false,
  };
}

const ASSET_MANIFEST = 'sea-assets.json';

function stageAssets() {
  for (const file of SEA_ASSET_FILES) {
    const sourceFile = path.resolve(ROOT_DIR, file);
    const targetFile = path.resolve(WORK_DIR, 'assets', file);
    ensureFileExists(sourceFile);
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.copyFileSync(sourceFile, targetFile);
  }
}

function writeBootstrap(binaryName) {
  const bootstrapFile = path.resolve(WORK_DIR, 'bootstrap', `${binaryName}.js`);
  const bundleFile = `bundles/${binaryName}.cjs`;
  const bootstrapSource = `const fs = require('fs');
const Module = require('module');
const os = require('os');
const path = require('path');
const sea = require('node:sea');

const manifest = JSON.parse(sea.getAsset('${ASSET_MANIFEST}', 'utf8'));
const executableTimestamp = Math.trunc(fs.statSync(process.execPath).mtimeMs);
const installBaseDir = path.join(
  os.tmpdir(),
  'backup-to-cloud-sea',
  manifest.version,
  \`\${process.platform}-\${process.arch}\`,
);
const installName = \`\${path.basename(process.execPath)}-\${executableTimestamp}\`;
const rootDir = path.join(installBaseDir, installName);

if (fs.existsSync(installBaseDir)) {
  for (const entry of fs.readdirSync(installBaseDir)) {
    if (entry !== installName && entry.startsWith(\`\${path.basename(process.execPath)}-\`)) {
      fs.rmSync(path.join(installBaseDir, entry), { force: true, recursive: true });
    }
  }
}

for (const file of manifest.files) {
  const targetFile = path.join(rootDir, file);
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, Buffer.from(sea.getAsset(file)));
}

const externalRequire = Module.createRequire(path.join(rootDir, 'bootstrap.js'));
externalRequire('./${bundleFile}');
`;

  fs.mkdirSync(path.dirname(bootstrapFile), { recursive: true });
  fs.writeFileSync(bootstrapFile, bootstrapSource);
  return bootstrapFile;
}

function buildAssets(bundleFile) {
  const bundleRelativeFile = path.relative(path.resolve(WORK_DIR, 'assets'), bundleFile);
  const assetFiles = SEA_ASSET_FILES.concat([bundleRelativeFile]);
  const manifestFile = path.resolve(WORK_DIR, 'assets', ASSET_MANIFEST);

  writeJson(manifestFile, {
    files: assetFiles,
    version: require(path.resolve(ROOT_DIR, 'package.json')).version,
  });

  return assetFiles.concat([ASSET_MANIFEST]).reduce((assets, file) => {
    assets[file] = path.resolve(WORK_DIR, 'assets', file);
    return assets;
  }, {});
}

function buildExecutable(configFile) {
  const result = childProcess.spawnSync(process.execPath, ['--build-sea', configFile], {
    cwd: ROOT_DIR,
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    const output = [];
    if (result.stderr && result.stderr.trim()) {
      output.push(`stderr:\n${result.stderr.trim()}`);
    }
    if (result.stdout && result.stdout.trim()) {
      output.push(`stdout:\n${result.stdout.trim()}`);
    }
    throw new Error(
      output.join('\n\n') || `node --build-sea failed with exit code ${result.status}`,
    );
  }
}

async function main() {
  assertBuildSeaSupport();
  resetDir(WORK_DIR);
  resetDir(OUTPUT_DIR);

  stageAssets();

  const requestedBinaries = process.argv.slice(2);
  const binaries = requestedBinaries.length
    ? BINARIES.filter((name) => requestedBinaries.includes(name))
    : BINARIES;

  if (!binaries.length) {
    throw new Error(`No known binaries were requested. Expected one of: ${BINARIES.join(', ')}`);
  }

  for (const binaryName of binaries) {
    const bundleFile = await bundle(binaryName);
    const assets = buildAssets(bundleFile);
    const mainFile = writeBootstrap(binaryName);
    const configFile = path.resolve(WORK_DIR, 'configs', `${binaryName}.json`);
    writeJson(configFile, createSeaConfig(binaryName, mainFile, assets));
    buildExecutable(configFile);
  }

  console.log(`Built ${binaries.length} executable(s) in ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
