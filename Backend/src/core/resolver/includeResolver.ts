// Include file parser

import * as path from 'path';
import { IncludeNode } from '../parser/ast.js';
import { PathGuard } from '../project/pathGuard.js';
import { FsUtils } from '../../utils/fs.js';
import { ErrorCollector } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

export interface IncludePath {
  original: string;
  resolved: string;
  type: 'relative' | 'circomlib' | 'npm' | 'absolute';
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

    if (this.resolvedIncludes.has(originalPath)) {
      const cached = this.resolvedIncludes.get(originalPath)!;
      return cached.exists ? cached.resolved : null;
    }

    const result = await this.resolvePath(originalPath);
    this.resolvedIncludes.set(originalPath, result);

    if (!result.exists) {
      this.errorCollector.error(
        `Cannot resolve include: ${originalPath}`,
        this.currentFile,
        includeNode.line
      );
    }

    return result.exists ? result.resolved : null;
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
      const result = this.resolveCircomlibPath(originalPath);
      if (result) {
        resolved = result;
        exists = await FsUtils.fileExists(result);
      } else {
        exists = false;
      }
    } else if (originalPath.startsWith('./') || originalPath.startsWith('../') || path.isAbsolute(originalPath)) {
      // Explicit relative or absolute path
      if (originalPath.startsWith('./') || originalPath.startsWith('../')) {
        type = 'relative';
        const result = this.resolveRelativePath(originalPath);
        resolved = result;
        exists = await FsUtils.fileExists(result);
      } else {
        type = 'absolute';
        resolved = originalPath;
        exists = await FsUtils.fileExists(originalPath);
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
        // Try npm package path
        type = 'npm';
        const result = await this.resolveNpmPath(originalPath);
        if (result) {
          resolved = result;
          exists = await FsUtils.fileExists(result);
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

  private async resolveNpmPath(pkgPath: string): Promise<string | null> {
    const parts = pkgPath.split('/');

    if (!pkgPath.startsWith('@')) {
      // Non-scoped package
      const pkgName = parts[0];
      const subPath = parts.slice(1).join('/');

      const npmPath = this.pathGuard.getNpmPackagePath(pkgName, subPath);
      if (npmPath && await FsUtils.fileExists(npmPath)) {
        logger.debug(`Resolved npm package: ${pkgPath} -> ${npmPath}`);
        return npmPath;
      }

      const submodulePath = path.join(
        this.pathGuard['submodulesRoot'],
        'node_modules',
        pkgName,
        subPath
      );

      if (await FsUtils.fileExists(submodulePath)) {
        logger.debug(`Resolved from submodules: ${pkgPath} -> ${submodulePath}`);
        return submodulePath;
      }

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
        this.pathGuard['submodulesRoot'],
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
      const npmPath = this.pathGuard.getNpmPackagePath(foundPkgName, foundSubPath);
      if (npmPath && await FsUtils.fileExists(npmPath)) {
        logger.debug(`Resolved npm package: ${pkgPath} -> ${npmPath}`);
        return npmPath;
      }

      const submodulePath = path.join(
        this.pathGuard['submodulesRoot'],
        'node_modules',
        foundPkgName,
        foundSubPath
      );

      if (await FsUtils.fileExists(submodulePath)) {
        logger.debug(`Resolved from submodules: ${pkgPath} -> ${submodulePath}`);
        return submodulePath;
      }
    }

    return null;
  }

  private resolveCircomlibPath(libPath: string): string | null {
    const result = this.pathGuard.getCircomlibPath(
      this.currentRepoPath,
      libPath.replace('circomlib/', '')
    );
    logger.debug(`Resolved circomlib: ${libPath} -> ${result}`);
    return result;
  }

  private resolveRelativePath(relPath: string): string {
    const currentDir = path.dirname(this.currentFile);
    const result = path.resolve(currentDir, relPath);
    logger.debug(`Resolved relative path: ${relPath} -> ${result}`);
    return result;
  }

  getResolvedIncludes(): Map<string, IncludePath> {
    return new Map(this.resolvedIncludes);
  }

  clearCache(): void {
    this.resolvedIncludes.clear();
  }
}
