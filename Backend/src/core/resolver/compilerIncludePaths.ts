import * as fs from 'fs';
import * as path from 'path';

export interface CircomkitIncludeConfig {
  configPath: string;
  includeDirs: string[];
}

function isWithinRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function readCircomkitConfig(configPath: string): CircomkitIncludeConfig | null {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const includeDirs = Array.isArray(config.include)
      ? config.include.filter((entry: unknown): entry is string => typeof entry === 'string')
      : [];
    return includeDirs.length > 0 ? { configPath, includeDirs } : null;
  } catch {
    return null;
  }
}

function findNearestCircomkitConfig(repoPath: string, sourceFilePath: string): CircomkitIncludeConfig | null {
  const repoRoot = path.resolve(repoPath);
  let currentDir = path.dirname(path.resolve(sourceFilePath));

  if (!isWithinRoot(currentDir, repoRoot)) {
    return null;
  }

  while (isWithinRoot(currentDir, repoRoot)) {
    const config = readCircomkitConfig(path.join(currentDir, 'circomkit.json'));
    if (config) {
      return config;
    }

    if (currentDir === repoRoot) {
      break;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return null;
}

function findRepoCircomkitConfigs(repoPath: string): CircomkitIncludeConfig[] {
  const repoRoot = path.resolve(repoPath);
  const configs: CircomkitIncludeConfig[] = [];
  const pending = [repoRoot];

  while (pending.length > 0) {
    const currentDir = pending.pop()!;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      pending.push(path.join(currentDir, entry.name));
    }

    const config = readCircomkitConfig(path.join(currentDir, 'circomkit.json'));
    if (config) {
      configs.push(config);
    }
  }

  return configs;
}

export function findCircomkitIncludeConfigs(
  repoPath: string,
  sourceFilePath: string,
): CircomkitIncludeConfig[] {
  const nearest = findNearestCircomkitConfig(repoPath, sourceFilePath);
  return nearest ? [nearest] : findRepoCircomkitConfigs(repoPath);
}

function existingDirectoryWithinRepo(candidate: string, repoRoot: string): string | null {
  const normalized = path.resolve(candidate);
  if (!isWithinRoot(normalized, repoRoot)) {
    return null;
  }

  try {
    if (!fs.statSync(normalized).isDirectory()) {
      return null;
    }
    const canonicalRepo = fs.realpathSync(repoRoot);
    const canonicalCandidate = fs.realpathSync(normalized);
    return isWithinRoot(canonicalCandidate, canonicalRepo) ? normalized : null;
  } catch {
    return null;
  }
}

export function resolveCircomkitIncludePaths(repoPath: string, sourceFilePath: string): string[] {
  const repoRoot = path.resolve(repoPath);
  const includePaths: string[] = [];

  for (const { configPath, includeDirs } of findCircomkitIncludeConfigs(repoRoot, sourceFilePath)) {
    const configDir = path.dirname(configPath);
    for (const includeDir of includeDirs) {
      const resolved = existingDirectoryWithinRepo(path.resolve(configDir, includeDir), repoRoot);
      if (resolved && !includePaths.includes(resolved)) {
        includePaths.push(resolved);
      }
    }
  }

  return includePaths;
}

export function resolveCompilerIncludePaths(repoPath: string, sourceFilePath: string): string[] {
  const repoRoot = path.resolve(repoPath);
  const candidates = [
    path.dirname(path.resolve(sourceFilePath)),
    ...resolveCircomkitIncludePaths(repoRoot, sourceFilePath),
    repoRoot,
    path.join(repoRoot, 'node_modules'),
  ];
  const includePaths: string[] = [];

  for (const candidate of candidates) {
    const resolved = existingDirectoryWithinRepo(candidate, repoRoot);
    if (resolved && !includePaths.includes(resolved)) {
      includePaths.push(resolved);
    }
  }

  return includePaths;
}
