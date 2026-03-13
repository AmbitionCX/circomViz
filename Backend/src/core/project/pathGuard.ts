// 路径验证和规范化

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PathGuard {
  private backendRoot: string;
  private submodulesRoot: string;

  constructor() {
    this.backendRoot = path.resolve(__dirname, '../..');
    this.submodulesRoot = path.resolve(__dirname, '../../../../submodules');
    logger.info(`PathGuard initialized: backendRoot=${this.backendRoot}, submodulesRoot=${this.submodulesRoot}`);
  }

  validateRepoPath(repoName: string): { valid: boolean; path?: string; error?: string } {
    const repoPath = path.join(this.submodulesRoot, repoName);
    logger.info(`validateRepoPath: repoName=${repoName}, repoPath=${repoPath}, exists=${fs.existsSync(repoPath)}`);
    
    if (!fs.existsSync(repoPath)) {
      return {
        valid: false,
        error: `Repository '${repoName}' not found in submodules`
      };
    }

    return {
      valid: true,
      path: repoPath
    };
  }

  validateEntryPath(repoPath: string, entryPath: string): { valid: boolean; path?: string; error?: string } {
    const fullPath = path.join(repoPath, entryPath);
    
    if (!fs.existsSync(fullPath)) {
      return {
        valid: false,
        error: `Entry file '${entryPath}' not found in repository`
      };
    }

    if (!fullPath.endsWith('.circom')) {
      return {
        valid: false,
        error: `Entry file must be a .circom file`
      };
    }

    return {
      valid: true,
      path: fullPath
    };
  }

  getSubmodulePath(repoName: string, subPath: string): string {
    return path.join(this.submodulesRoot, repoName, subPath);
  }

  getCircomlibPath(subPath: string): string {
    return path.join(path.resolve(this.backendRoot, '..'), 'circomlib', subPath);
  }

  getNpmPackagePath(packageName: string, subPath: string): string | null {
    const frontendNodeModules = path.join(this.backendRoot, '../Frontend/node_modules', packageName);
    const submoduleNodeModules = path.join(this.submodulesRoot, 'node_modules', packageName);

    if (fs.existsSync(frontendNodeModules)) {
      return path.join(frontendNodeModules, subPath);
    } else if (fs.existsSync(submoduleNodeModules)) {
      return path.join(submoduleNodeModules, subPath);
    }

    return null;
  }

  normalizePath(filePath: string): string {
    return path.normalize(filePath).replace(/\\/g, '/');
  }

  getRelativePath(from: string, to: string): string {
    return path.relative(from, to).replace(/\\/g, '/');
  }
}
