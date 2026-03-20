// 路径验证和规范化

import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Calculate backend root by going up to the Backend directory
// Works from both source (src/core/project) and compiled (dist/core/project) paths
const getBackendRoot = (): string => {
  const dirParts = __dirname.split(path.sep);
  const backendIndex = dirParts.lastIndexOf('Backend');
  
  if (backendIndex !== -1) {
    return dirParts.slice(0, backendIndex + 1).join(path.sep);
  }
  
  // Fallback: go up until we find package.json
  let currentDir = __dirname;
  while (currentDir !== path.sep && currentDir !== path.dirname(currentDir)) {
    if (fs.existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  
  // Ultimate fallback
  return path.resolve(__dirname, '../..');
};

export class PathGuard {
  private backendRoot: string;
  private submodulesRoot: string;

  constructor() {
    this.backendRoot = getBackendRoot();
    this.submodulesRoot = path.resolve(this.backendRoot, '..', 'submodules');
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
    return path.join(this.backendRoot, 'circomlib', subPath);
  }

  getNpmPackagePath(packageName: string, subPath: string): string | null {
    const frontendNodeModules = path.join(this.backendRoot, '../Frontend/node_modules', packageName);
    const submoduleNodeModules = path.join(this.submodulesRoot, 'node_modules', packageName);

    let packageRoot: string | null = null;

    if (fs.existsSync(frontendNodeModules)) {
      packageRoot = frontendNodeModules;
    } else if (fs.existsSync(submoduleNodeModules)) {
      packageRoot = submoduleNodeModules;
    } else {
      // Search in each submodule's node_modules
      const submodules = this.listSubmodules();
      for (const submod of submodules) {
        const submodNodeModules = path.join(this.submodulesRoot, submod, 'node_modules', packageName);
        if (fs.existsSync(submodNodeModules)) {
          packageRoot = submodNodeModules;
          logger.debug(`Found package in submodule: ${submod}, package: ${packageName}`);
          break;
        }
      }
    }

    if (packageRoot) {
      return path.join(packageRoot, subPath);
    }

    return null;
  }

  private listSubmodules(): string[] {
    try {
      return fs.readdirSync(this.submodulesRoot).filter(item => {
        const itemPath = path.join(this.submodulesRoot, item);
        return fs.statSync(itemPath).isDirectory() && !item.startsWith('.');
      });
    } catch (error) {
      logger.error(`Failed to list submodules: ${error}`);
      return [];
    }
  }

  normalizePath(filePath: string): string {
    return path.normalize(filePath).replace(/\\/g, '/');
  }

  getRelativePath(from: string, to: string): string {
    return path.relative(from, to).replace(/\\/g, '/');
  }
}
