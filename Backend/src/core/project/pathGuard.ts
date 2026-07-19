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
  private toyDemosRoot: string;
  private compilationsRoot: string;
  private wrappersRoot: string;
  private artifactRoots: string[];

  private repoNamePattern = /^[a-zA-Z0-9_.-]+$/;

  constructor() {
    this.backendRoot = getBackendRoot();
    this.submodulesRoot = path.resolve(this.backendRoot, '..', 'submodules');
    this.toyDemosRoot = path.resolve(this.backendRoot, '..', 'toy-demos');
    this.compilationsRoot = path.resolve(this.backendRoot, 'compilations');
    this.wrappersRoot = path.resolve(this.backendRoot, 'wrappers');
    this.artifactRoots = [this.compilationsRoot, this.wrappersRoot];

    logger.info(`PathGuard initialized: backendRoot=${this.backendRoot}, submodulesRoot=${this.submodulesRoot}, toyDemosRoot=${this.toyDemosRoot}`);
  }

  private isSubPath(candidate: string, base: string): boolean {
    const rel = path.relative(base, candidate);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  }

  private resolveAndNormalize(p: string): string {
    return path.resolve(p);
  }

  private toCanonicalPath(p: string): string {
    return fs.realpathSync(p);
  }

  private validateFileInRoots(
    filePath: string,
    allowedExtensions: string[],
    allowedRoots: string[]
  ): { valid: boolean; path?: string; error?: string } {
    if (!filePath || typeof filePath !== 'string') {
      return { valid: false, error: 'Invalid file path' };
    }

    if (filePath.includes('\u0000')) {
      return { valid: false, error: 'File path contains null byte' };
    }

    const normalized = this.resolveAndNormalize(filePath);

    let canonical = '';
    try {
      canonical = this.toCanonicalPath(normalized);
    } catch {
      return { valid: false, error: `Path does not exist: ${normalized}` };
    }

    if (!allowedExtensions.includes(path.extname(canonical))) {
      return {
        valid: false,
        error: `Invalid extension. Expected one of: ${allowedExtensions.join(', ')}`,
      };
    }

    const underRoot = allowedRoots.some((root) => this.isSubPath(canonical, root));
    if (!underRoot) {
      return {
        valid: false,
        error: `Path outside allowed roots: ${canonical}`,
      };
    }

    try {
      const stat = fs.statSync(canonical);
      if (!stat.isFile()) {
        return { valid: false, error: `Not a file: ${canonical}` };
      }
    } catch {
      return { valid: false, error: `Unable to access: ${canonical}` };
    }

    return { valid: true, path: canonical };
  }

  validateRepoPath(repoName: string): { valid: boolean; path?: string; error?: string } {
    if (typeof repoName !== 'string' || !repoName) {
      return { valid: false, error: 'Repository name must be a non-empty string' };
    }

    if (repoName.includes('\u0000') || !this.repoNamePattern.test(repoName) || repoName === '.' || repoName === '..') {
      return { valid: false, error: `Invalid repository name: ${repoName}` };
    }

    const isToyDemosRepo = repoName === 'toy-demos';
    const repoRoot = isToyDemosRepo ? path.dirname(this.toyDemosRoot) : this.submodulesRoot;
    const repoPathCandidate = isToyDemosRepo ? this.toyDemosRoot : path.join(this.submodulesRoot, repoName);
    let repoPath = '';
    try {
      repoPath = this.toCanonicalPath(this.resolveAndNormalize(repoPathCandidate));
    } catch {
      return {
        valid: false,
        error: isToyDemosRepo ? `Repository '${repoName}' not found` : `Repository '${repoName}' not found in submodules`,
      };
    }

    if (!this.isSubPath(repoPath, repoRoot)) {
      return {
        valid: false,
        error: isToyDemosRepo ? `Repository path escapes workspace demos directory` : `Repository path escapes submodules directory`,
      };
    }

    try {
      const stat = fs.statSync(repoPath);
      if (!stat.isDirectory()) {
        return { valid: false, error: `Repository '${repoName}' is not a directory` };
      }
    } catch {
      return {
        valid: false,
        error: isToyDemosRepo ? `Repository '${repoName}' not found` : `Repository '${repoName}' not found in submodules`,
      };
    }

    logger.info(`validateRepoPath: repoName=${repoName}, repoPath=${repoPath}, exists=true`);
    return {
      valid: true,
      path: repoPath,
    };
  }

  validateEntryPath(repoPath: string, entryPath: string): { valid: boolean; path?: string; error?: string } {
    if (typeof entryPath !== 'string' || !entryPath) {
      return { valid: false, error: 'Entry path must be a non-empty string' };
    }

    if (entryPath.includes('\u0000')) {
      return { valid: false, error: 'Entry path contains null byte' };
    }

    if (path.isAbsolute(entryPath)) {
      return { valid: false, error: 'Entry path must be relative to repository root' };
    }

    if (entryPath.startsWith('..') || entryPath.includes('/../') || entryPath.includes('\\..\\')) {
      return { valid: false, error: `Entry path escapes repository: ${entryPath}` };
    }

    const candidate = this.resolveAndNormalize(path.join(repoPath, entryPath));

    if (!this.isSubPath(candidate, repoPath)) {
      return { valid: false, error: `Entry path escapes repository: ${entryPath}` };
    }

    let canonical = '';
    try {
      canonical = this.toCanonicalPath(candidate);
    } catch {
      return {
        valid: false,
        error: `Entry file '${entryPath}' not found in repository`,
      };
    }

    if (!this.isSubPath(canonical, repoPath)) {
      return { valid: false, error: `Entry path escapes repository: ${entryPath}` };
    }

    try {
      const stat = fs.statSync(canonical);
      if (!stat.isFile()) {
        return { valid: false, error: `Entry path is not a file: ${entryPath}` };
      }
    } catch {
      return {
        valid: false,
        error: `Entry file '${entryPath}' not found in repository`,
      };
    }

    if (!canonical.endsWith('.circom')) {
      return {
        valid: false,
        error: `Entry file must be a .circom file`,
      };
    }

    return {
      valid: true,
      path: canonical,
    };
  }

  validateGeneratedSymPath(symPath: string): { valid: boolean; path?: string; error?: string } {
    return this.validateFileInRoots(symPath, ['.sym'], this.artifactRoots);
  }

  validateGeneratedConstraintsPath(constraintsJsonPath: string): { valid: boolean; path?: string; error?: string } {
    return this.validateFileInRoots(constraintsJsonPath, ['.json'], this.artifactRoots);
  }

  validateGeneratedArtifactPaths(
    symPath: string,
    constraintsJsonPath: string
  ): { valid: boolean; symPath?: string; constraintsJsonPath?: string; error?: string } {
    const symCheck = this.validateGeneratedSymPath(symPath);
    if (!symCheck.valid) {
      return { valid: false, error: symCheck.error };
    }

    const constraintsCheck = this.validateGeneratedConstraintsPath(constraintsJsonPath);
    if (!constraintsCheck.valid) {
      return { valid: false, error: constraintsCheck.error };
    }

    if (!this.isSubPath(path.dirname(symCheck.path!), path.dirname(constraintsCheck.path!)) &&
      !this.isSubPath(path.dirname(constraintsCheck.path!), path.dirname(symCheck.path!))) {
      return {
        valid: false,
        error: 'symPath and constraintsJsonPath must be under the same artifact directory',
      };
    }

    return {
      valid: true,
      symPath: symCheck.path,
      constraintsJsonPath: constraintsCheck.path,
    };
  }

  validateSubmoduleFilePath(filePath: string): { valid: boolean; path?: string; error?: string } {
    if (!filePath || typeof filePath !== 'string') {
      return { valid: false, error: 'File path is required' };
    }

    if (filePath.includes('\u0000')) {
      return { valid: false, error: 'File path contains null byte' };
    }

    const candidate = this.resolveAndNormalize(filePath);

    let canonical = '';
    try {
      canonical = this.toCanonicalPath(candidate);
    } catch {
      return { valid: false, error: `Path not found: ${candidate}` };
    }

    if (!canonical.endsWith('.circom')) {
      return { valid: false, error: 'Only .circom files can be requested' };
    }

    if (!this.isSubPath(canonical, this.submodulesRoot) && !this.isSubPath(canonical, this.toyDemosRoot)) {
      return {
        valid: false,
        error: `File is outside allowed circuit roots: ${canonical}`,
      };
    }

    try {
      const stat = fs.statSync(canonical);
      if (!stat.isFile()) {
        return { valid: false, error: `Not a file: ${canonical}` };
      }
    } catch {
      return { valid: false, error: `Unable to access path: ${canonical}` };
    }

    return { valid: true, path: canonical };
  }

  getSubmodulePath(repoName: string, subPath: string): string {
    const repoValidation = this.validateRepoPath(repoName);
    if (!repoValidation.valid || !repoValidation.path) {
      throw new Error(`Invalid repository name: ${repoName}`);
    }

    const relativeSubpath = path.normalize(subPath);
    const candidate = path.join(repoValidation.path, relativeSubpath);
    return candidate;
  }

  private findWorkspaceRoot(startPath: string): string | null {
    let currentDir = path.normalize(startPath);
    const rootPath = path.parse(currentDir).root;

    while (currentDir !== rootPath && currentDir !== path.dirname(currentDir)) {
      const packageJsonPath = path.join(currentDir, 'package.json');

      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

          // Check if this is a workspace root (has workspaces field)
          if (packageJson.workspaces) {
            logger.debug(`Found workspace root at: ${currentDir}`);
            return currentDir;
          }
        } catch (err) {
          // Invalid package.json, continue searching
        }
      }

      // Move up one directory
      currentDir = path.dirname(currentDir);
    }

    return null;
  }

  getCircomlibPath(repoPath: string, subPath: string): string | null {
    const normalizedRepoPath = path.normalize(repoPath);

    // 1. Check in local node_modules (packages/circuits/node_modules/circomlib)
    const localCircomlibPath = path.join(normalizedRepoPath, 'node_modules', 'circomlib', subPath);
    if (fs.existsSync(localCircomlibPath)) {
      logger.debug(`Found circomlib in local node_modules: ${localCircomlibPath}`);
      return localCircomlibPath;
    }

    // 2. Find workspace root and check there (workspace root node_modules/circomlib)
    const workspaceRoot = this.findWorkspaceRoot(normalizedRepoPath);
    if (workspaceRoot) {
      const workspaceCircomlibPath = path.join(workspaceRoot, 'node_modules', 'circomlib', subPath);
      if (fs.existsSync(workspaceCircomlibPath)) {
        logger.debug(`Found circomlib in workspace root: ${workspaceCircomlibPath}`);
        return workspaceCircomlibPath;
      }
    }

    // 3. Check common parent directories (for cases where workspace detection fails)
    const parentDir = path.dirname(normalizedRepoPath);
    const parentCircomlibPath = path.join(parentDir, 'node_modules', 'circomlib', subPath);
    if (fs.existsSync(parentCircomlibPath)) {
      logger.debug(`Found circomlib in parent node_modules: ${parentCircomlibPath}`);
      return parentCircomlibPath;
    }

    logger.warn(`circomlib not found at any of these locations:`);
    logger.warn(`  - Local: ${localCircomlibPath}`);
    if (workspaceRoot) {
      logger.warn(`  - Workspace root: ${path.join(workspaceRoot, 'node_modules', 'circomlib', subPath)}`);
    }
    logger.warn(`  - Parent: ${parentCircomlibPath}`);

    return null;
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

  getSubmodulesRoot(): string {
    return this.submodulesRoot;
  }

  getWrappersRoot(): string {
    return this.wrappersRoot;
  }

  getCompilationsRoot(): string {
    return this.compilationsRoot;
  }

  normalizePath(filePath: string): string {
    return path.normalize(filePath).replace(/\\/g, '/');
  }

  getRelativePath(from: string, to: string): string {
    return path.relative(from, to).replace(/\\/g, '/');
  }
}
