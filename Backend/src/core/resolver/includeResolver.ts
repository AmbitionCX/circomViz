// Include file parser

import * as path from 'path';
import { IncludeNode } from '../parser/ast.js';
import { PathGuard } from '../project/pathGuard.js';
import { FsUtils } from '../../utils/fs.js';
import { ErrorCollector } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import * as fs from 'fs';

export interface IncludePath {
  original: string;
  resolved: string;
  type: 'relative' | 'circomlib' | 'npm' | 'absolute' | 'circomkit';
  exists: boolean;
}

export class IncludeResolver {
  private pathGuard: PathGuard;
  private errorCollector: ErrorCollector;
  private resolvedIncludes = new Map<string, IncludePath>();
  private currentFile: string = '';
  private currentRepoPath: string = '';

  constructor(errorCollector: ErrorCollector) {
    this.pathGuard = new PathGuard();
    this.errorCollector = errorCollector;
  }

  setCurrentFile(filePath: string): void {
    this.currentFile = path.normalize(filePath);
  }

  setCurrentRepoPath(repoPath: string): void {
    this.currentRepoPath = path.normalize(repoPath);
  }

  async resolveInclude(includeNode: IncludeNode): Promise<string | null> {
    const originalPath = includeNode.path;
    const cacheKey = this.getCacheKey(originalPath);

    if (this.resolvedIncludes.has(cacheKey)) {
      const cached = this.resolvedIncludes.get(cacheKey)!;
      return cached.exists ? cached.resolved : null;
    }

    const result = await this.resolvePath(originalPath);
    this.resolvedIncludes.set(cacheKey, result);

    if (!result.exists) {
      this.errorCollector.error(
        `Cannot resolve include: ${originalPath}`,
        this.currentFile,
        includeNode.line
      );
    }

    return result.exists ? result.resolved : null;
  }

  private getCacheKey(originalPath: string): string {
    const repoKey = this.currentRepoPath ? path.normalize(this.currentRepoPath) : '';
    const fileDir = this.currentFile ? path.dirname(path.normalize(this.currentFile)) : '';
    return [repoKey, fileDir, originalPath].join('::');
  }

  private async resolvePath(originalPath: string): Promise<IncludePath> {
    let resolved = '';
    let type: IncludePath['type'];
    let exists = false;

    if (originalPath.startsWith('@')) {
      type = 'npm';
      const result = await this.resolveNpmPath(originalPath);
      if (result) {
        resolved = result;
        exists = await FsUtils.fileExists(result);
      }
    } else if (originalPath.startsWith('circomlib')) {
      type = 'circomlib';
      const result = await this.resolveCircomlibPath(originalPath);
      if (result) {
        resolved = result;
        exists = await FsUtils.fileExists(result);
      } else {
        exists = false;
      }
    } else if (originalPath.startsWith('./') || originalPath.startsWith('../') || path.isAbsolute(originalPath)) {
      // Explicit relative or absolute path
      if (path.isAbsolute(originalPath)) {
        type = 'absolute';
        resolved = this.resolveAbsolutePath(originalPath);
      } else {
        type = 'relative';
        resolved = this.resolveRelativePath(originalPath);
      }

      if (resolved) {
        exists = await FsUtils.fileExists(resolved);
      }
    } else {
      // Try relative path first (for circomlib internal includes)
      const relativeResult = this.resolveRelativePath(originalPath);
      if (await FsUtils.fileExists(relativeResult)) {
        type = 'relative';
        resolved = relativeResult;
        exists = true;
        logger.debug(`Resolved as relative path: ${originalPath} -> ${resolved}`);
      } else {
        const circomkitResult = await this.resolveCircomkitIncludePath(originalPath);
        if (circomkitResult) {
          type = 'circomkit';
          resolved = circomkitResult;
          exists = true;
          logger.debug(`Resolved from CircomKit include path: ${originalPath} -> ${resolved}`);
        } else {
          // Includes written as node_modules/<pkg>/... are common in Circom
          // projects. After the literal relative lookup fails, resolve them as
          // package paths so package lookup starts at the package name.
          const packagePath = originalPath.startsWith('node_modules/')
            ? originalPath.slice('node_modules/'.length)
            : originalPath;

          // Try npm package path
          type = 'npm';
          const result = await this.resolveNpmPath(packagePath);
          if (result) {
            resolved = result;
            exists = await FsUtils.fileExists(result);
          }
        }
      }
    }

    return {
      original: originalPath,
      resolved,
      type,
      exists
    };
  }


  private async resolveCircomkitIncludePath(includePath: string): Promise<string | null> {
    if (!this.currentFile || !this.currentRepoPath || includePath.includes('/')) {
      return null;
    }

    const circomkitConfigs = this.getCircomkitConfigs();
    if (circomkitConfigs.length === 0) {
      return null;
    }

    for (const { configPath, includeDirs } of circomkitConfigs) {
      const configDir = path.dirname(configPath);

      for (const includeDir of includeDirs) {
        const candidate = path.resolve(configDir, includeDir, includePath);
        const normalized = path.normalize(candidate);
        if (!this.isWithinRepo(normalized, path.normalize(this.currentRepoPath))) {
          continue;
        }

        if (await FsUtils.fileExists(normalized)) {
          return normalized;
        }
      }
    }

    return null;
  }


  private getCircomkitConfigs(): Array<{ configPath: string; includeDirs: string[] }> {
    const nearest = this.findNearestCircomkitConfig();
    if (nearest) {
      return [nearest];
    }

    return this.findRepoCircomkitConfigs();
  }

  private findRepoCircomkitConfigs(): Array<{ configPath: string; includeDirs: string[] }> {
    if (!this.currentRepoPath) {
      return [];
    }

    const configs: Array<{ configPath: string; includeDirs: string[] }> = [];
    const repoPath = path.normalize(path.resolve(this.currentRepoPath));
    const pending = [repoPath];

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

      const configPath = path.join(currentDir, 'circomkit.json');
      if (!fs.existsSync(configPath)) continue;

      const config = this.readCircomkitConfig(configPath);
      if (config) {
        configs.push(config);
      }
    }

    return configs;
  }

  private readCircomkitConfig(configPath: string): { configPath: string; includeDirs: string[] } | null {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const includeDirs = Array.isArray(config.include)
        ? config.include.filter((entry: unknown): entry is string => typeof entry === 'string')
        : [];
      if (includeDirs.length > 0) {
        return { configPath, includeDirs };
      }
    } catch {
      // Ignore invalid CircomKit config files while resolving includes.
    }

    return null;
  }

  private findNearestCircomkitConfig(): { configPath: string; includeDirs: string[] } | null {
    if (!this.currentFile || !this.currentRepoPath) {
      return null;
    }

    const repoPath = path.resolve(this.currentRepoPath);
    const normalizedRepo = path.normalize(repoPath);
    let currentDir = path.dirname(path.normalize(this.currentFile));

    while (this.isWithinRepo(currentDir, normalizedRepo)) {
      const configPath = path.join(currentDir, 'circomkit.json');
      if (fs.existsSync(configPath)) {
        const config = this.readCircomkitConfig(configPath);
        if (config) {
          return config;
        }
      }

      if (currentDir === normalizedRepo) {
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

  private async resolveNpmPath(pkgPath: string): Promise<string | null> {
    const parts = pkgPath.split('/');

    if (!pkgPath.startsWith('@')) {
      // Non-scoped package
      const pkgName = parts[0];
      const subPath = parts.slice(1).join('/');

      const localPath = await this.resolveLocalNodeModulePath(pkgName, subPath);
      if (localPath) {
        logger.debug(`Resolved local npm package: ${pkgPath} -> ${localPath}`);
        return localPath;
      }

      const npmPath = this.pathGuard.getNpmPackagePath(pkgName, subPath);
      if (npmPath && await FsUtils.fileExists(npmPath)) {
        logger.debug(`Resolved npm package: ${pkgPath} -> ${npmPath}`);
        return npmPath;
      }

      const submodulePath = path.join(
        this.pathGuard.getSubmodulesRoot(),
        'node_modules',
        pkgName,
        subPath
      );

      if (await FsUtils.fileExists(submodulePath)) {
        logger.debug(`Resolved from submodules: ${pkgPath} -> ${submodulePath}`);
        return submodulePath;
      }

      this.logDeclaredButMissingPackage(pkgName, pkgPath);
      return null;
    }

    // Scoped package: try to find the actual package by checking which scope exists
    // For example: @zk-email/circuits/lib/sha.circom
    // The package could be @zk-email or @zk-email/circuits

    let foundPkgName: string | null = null;
    let foundSubPath: string = '';

    // Try @zk-email, @zk-email/circuits, @zk-email/circuits/lib, etc.
    for (let i = 2; i <= parts.length; i++) {
      const potentialPkgName = parts.slice(0, i).join('/');
      const potentialSubPath = parts.slice(i).join('/');

      const localPath = await this.resolveLocalNodeModulePath(potentialPkgName, potentialSubPath);
      if (localPath) {
        foundPkgName = potentialPkgName;
        foundSubPath = potentialSubPath;
        logger.debug(`Found local package: ${potentialPkgName}, subPath: ${potentialSubPath}`);
        break;
      }

      // Check if this package exists in node_modules
      const npmPath = this.pathGuard.getNpmPackagePath(potentialPkgName, '');
      if (npmPath && await FsUtils.fileExists(npmPath)) {
        foundPkgName = potentialPkgName;
        foundSubPath = potentialSubPath;
        logger.debug(`Found package: ${potentialPkgName}, subPath: ${potentialSubPath}`);
        break;
      }

      // Also check in submodules node_modules
      const submodulePath = path.join(
        this.pathGuard.getSubmodulesRoot(),
        'node_modules',
        potentialPkgName
      );

      if (await FsUtils.fileExists(submodulePath)) {
        foundPkgName = potentialPkgName;
        foundSubPath = potentialSubPath;
        logger.debug(`Found package in submodules: ${potentialPkgName}, subPath: ${potentialSubPath}`);
        break;
      }
    }

    if (foundPkgName) {
      const localPath = await this.resolveLocalNodeModulePath(foundPkgName, foundSubPath);
      if (localPath) {
        logger.debug(`Resolved local npm package: ${pkgPath} -> ${localPath}`);
        return localPath;
      }

      const npmPath = this.pathGuard.getNpmPackagePath(foundPkgName, foundSubPath);
      if (npmPath && await FsUtils.fileExists(npmPath)) {
        logger.debug(`Resolved npm package: ${pkgPath} -> ${npmPath}`);
        return npmPath;
      }

      const submodulePath = path.join(
        this.pathGuard.getSubmodulesRoot(),
        'node_modules',
        foundPkgName,
        foundSubPath
      );

      if (await FsUtils.fileExists(submodulePath)) {
        logger.debug(`Resolved from submodules: ${pkgPath} -> ${submodulePath}`);
        return submodulePath;
      }
    }

    if (parts.length >= 2) {
      this.logDeclaredButMissingPackage(parts.slice(0, 2).join('/'), pkgPath);
    }
    return null;
  }

  private async resolveCircomlibPath(libPath: string): Promise<string | null> {
    const subPath = libPath.replace('circomlib/', '');
    const localPath = await this.resolveLocalNodeModulePath('circomlib', subPath);
    if (localPath) {
      logger.debug(`Resolved local circomlib: ${libPath} -> ${localPath}`);
      return localPath;
    }

    const result = this.pathGuard.getCircomlibPath(
      this.currentRepoPath,
      subPath
    );
    logger.debug(`Resolved circomlib: ${libPath} -> ${result}`);
    if (!result) {
      this.logDeclaredButMissingPackage('circomlib', libPath);
    }
    return result;
  }

  private async resolveLocalNodeModulePath(pkgName: string, subPath: string): Promise<string | null> {
    if (!this.currentFile || !this.currentRepoPath) {
      return null;
    }

    const repoPath = path.resolve(this.currentRepoPath);
    const normalizedRepo = path.normalize(repoPath);
    let currentDir = path.dirname(path.normalize(this.currentFile));

    while (this.isWithinRepo(currentDir, normalizedRepo)) {
      const candidate = path.join(currentDir, 'node_modules', pkgName, subPath);
      if (await FsUtils.fileExists(candidate)) {
        return candidate;
      }

      if (currentDir === normalizedRepo) {
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

  private logDeclaredButMissingPackage(pkgName: string, includePath: string): void {
    const packageJsonPath = this.findNearestPackageJsonDeclaring(pkgName);
    if (packageJsonPath) {
      logger.warn(
        `Cannot resolve include ${includePath}: package ${pkgName} is declared in ${packageJsonPath}, but no matching node_modules entry was found`
      );
    }
  }

  private findNearestPackageJsonDeclaring(pkgName: string): string | null {
    if (!this.currentFile || !this.currentRepoPath) {
      return null;
    }

    const repoPath = path.resolve(this.currentRepoPath);
    const normalizedRepo = path.normalize(repoPath);
    let currentDir = path.dirname(path.normalize(this.currentFile));

    while (this.isWithinRepo(currentDir, normalizedRepo)) {
      const packageJsonPath = path.join(currentDir, 'package.json');
      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          if (
            packageJson.dependencies?.[pkgName] ||
            packageJson.devDependencies?.[pkgName] ||
            packageJson.peerDependencies?.[pkgName] ||
            packageJson.optionalDependencies?.[pkgName]
          ) {
            return packageJsonPath;
          }
        } catch {
          // Ignore invalid package.json files while resolving includes.
        }
      }

      if (currentDir === normalizedRepo) {
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

  private resolveRelativePath(relPath: string): string {
    const currentDir = path.dirname(this.currentFile);
    const candidate = path.resolve(currentDir, relPath);
    const repoPath = path.resolve(this.currentRepoPath || '');
    const normalized = path.normalize(candidate);

    if (!this.currentRepoPath) {
      logger.warn(`Current repo path not set while resolving include path: ${relPath}`);
      return normalized;
    }

    const normalizedRepo = path.normalize(repoPath);
    const allowedRoots = this.getRelativeIncludeRoots(normalizedRepo);
    if (!this.isWithinAnyRoot(normalized, allowedRoots)) {
      return '';
    }

    const canonicalRoots = allowedRoots.map((root) => {
      try {
        return fs.realpathSync(root);
      } catch {
        return root;
      }
    });

    let canonical = '';
    try {
      canonical = fs.realpathSync(candidate);
    } catch {
      canonical = normalized;
    }

    if (!this.isWithinAnyRoot(canonical, canonicalRoots)) {
      return '';
    }

    const result = canonical;

    logger.debug(`Resolved relative path: ${relPath} -> ${result}`);
    return result;
  }

  private resolveAbsolutePath(absPath: string): string {
    const normalizedRepo = path.resolve(this.currentRepoPath || '');
    const normalized = path.normalize(absPath);

    if (!this.currentRepoPath) {
      logger.warn(`Current repo path not set while resolving include path: ${absPath}`);
      return normalized;
    }

    if (!this.isWithinRepo(normalized, normalizedRepo)) {
      return '';
    }

    let canonical = '';
    try {
      canonical = fs.realpathSync(absPath);
    } catch {
      canonical = normalized;
    }

    if (!this.isWithinRepo(canonical, normalizedRepo)) {
      return '';
    }

    return canonical;
  }

  private getRelativeIncludeRoots(normalizedRepo: string): string[] {
    const roots = [normalizedRepo];
    const packageRoot = this.getNodeModulePackageRoot(path.normalize(this.currentFile));
    if (packageRoot && !roots.includes(packageRoot)) {
      roots.push(packageRoot);
    }
    return roots;
  }

  private getNodeModulePackageRoot(filePath: string): string | null {
    const parts = filePath.split(path.sep);
    const nodeModulesIndex = parts.lastIndexOf('node_modules');
    if (nodeModulesIndex === -1 || nodeModulesIndex + 1 >= parts.length) {
      return null;
    }

    let packageEndIndex = nodeModulesIndex + 2;
    if (parts[nodeModulesIndex + 1].startsWith('@') && nodeModulesIndex + 2 < parts.length) {
      packageEndIndex = nodeModulesIndex + 3;
    }

    return parts.slice(0, packageEndIndex).join(path.sep) || path.sep;
  }

  private isWithinAnyRoot(candidate: string, roots: string[]): boolean {
    return roots.some((root) => this.isWithinRepo(candidate, root));
  }

  private isWithinRepo(candidate: string, repoPath: string): boolean {
    const rel = path.relative(repoPath, candidate);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  }

  getResolvedIncludes(): Map<string, IncludePath> {
    return new Map(this.resolvedIncludes);
  }

  clearCache(): void {
    this.resolvedIncludes.clear();
  }
}
