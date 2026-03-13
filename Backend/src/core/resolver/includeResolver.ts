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

  constructor(errorCollector: ErrorCollector) {
    this.pathGuard = new PathGuard();
    this.errorCollector = errorCollector;
  }

  setCurrentFile(filePath: string): void {
    this.currentFile = path.normalize(filePath);
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
      resolved = result;
      exists = await FsUtils.fileExists(result);
    } else if (originalPath.startsWith('./') || originalPath.startsWith('../')) {
      type = 'relative';
      const result = this.resolveRelativePath(originalPath);
      resolved = result;
      exists = await FsUtils.fileExists(result);
    } else if (path.isAbsolute(originalPath)) {
      type = 'absolute';
      resolved = originalPath;
      exists = await FsUtils.fileExists(originalPath);
    } else {
      type = 'npm';
      const result = await this.resolveNpmPath(originalPath);
      if (result) {
        resolved = result;
        exists = await FsUtils.fileExists(result);
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
    let pkgName: string;
    let subPath: string;

    if (pkgPath.startsWith('@')) {
      pkgName = `${parts[0]}/${parts[1]}`;
      subPath = parts.slice(2).join('/');
    } else {
      pkgName = parts[0];
      subPath = parts.slice(1).join('/');
    }

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

  private resolveCircomlibPath(libPath: string): string {
    const result = this.pathGuard.getCircomlibPath(libPath.replace('circomlib/', ''));
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
