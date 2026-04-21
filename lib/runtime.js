const fs = require('fs');
const path = require('path');

const DEFAULT_ENV = process.env.BACKUP_ENV || 'default';
const SOURCE_ROOT = path.resolve(__dirname, '..');

const configCache = new Map();

function commandPath() {
  return path.resolve(process.argv[1] || process.execPath);
}

function commandDir() {
  return path.dirname(commandPath());
}

function sourceScriptDir() {
  const dir = commandDir();
  const root = path.dirname(dir);
  if (path.basename(dir) === 'bin' && fs.existsSync(path.join(root, 'package.json'))) {
    return dir;
  }
  return null;
}

function configFileName(env = DEFAULT_ENV) {
  return `config.${env}.js`;
}

function configSearchDirs() {
  return [...new Set([process.cwd(), commandDir(), path.dirname(commandDir()), SOURCE_ROOT])];
}

function findConfigFile(env = DEFAULT_ENV) {
  const cacheKey = env;
  if (configCache.has(cacheKey)) {
    return configCache.get(cacheKey);
  }

  if (process.env.BACKUP_CONFIG_FILE) {
    const explicitPath = path.resolve(process.env.BACKUP_CONFIG_FILE);
    configCache.set(cacheKey, explicitPath);
    return explicitPath;
  }

  const fileName = configFileName(env);
  const configFile = configSearchDirs()
    .map((dir) => path.resolve(dir, fileName))
    .find((file) => fs.existsSync(file));

  configCache.set(cacheKey, configFile || null);
  return configFile || null;
}

function resolveAppRoot(env = DEFAULT_ENV) {
  const configFile = findConfigFile(env);
  if (configFile) {
    return path.dirname(configFile);
  }

  const binDir = sourceScriptDir();
  if (binDir) {
    return path.dirname(binDir);
  }

  return process.cwd();
}

function resolveAppPath(filePath, env = DEFAULT_ENV) {
  return path.resolve(resolveAppRoot(env), filePath);
}

function resolveLockFile(fileName, env = DEFAULT_ENV) {
  const binDir = sourceScriptDir();
  if (binDir) {
    return path.join(binDir, fileName);
  }

  return path.join(resolveAppRoot(env), fileName);
}

function displayCommand() {
  return process.argv[1] || process.execPath;
}

module.exports = {
  commandDir,
  commandPath,
  displayCommand,
  findConfigFile,
  resolveAppPath,
  resolveAppRoot,
  resolveLockFile,
};
