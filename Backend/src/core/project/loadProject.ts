// Loading project

import * as fs from 'fs/promises';
import * as path from 'path';
import { PathGuard } from './pathGuard.js';
import { ProjectConfig, ResolvedFile, RepoInfo } from './types.js';
import { CircomParser } from '../parser/index.js';
import { CircomLexer } from '../parser/lexer.js';
import type { ParsedFile } from '../parser/ast.js';

export class ProjectLoader {
  private pathGuard: PathGuard;
  private parsedFiles = new Map<string, ParsedFile>();

  constructor() {
    this.pathGuard = new PathGuard();
  }

  async loadProject(config: ProjectConfig): Promise<{
    entryFile: ResolvedFile;
    repoPath?: string;
    error?: string;
  }> {
    const { repoName, entryPath } = config;

    const repoValidation = this.pathGuard.validateRepoPath(repoName);
    if (!repoValidation.valid) {
      return {
        entryFile: null as any,
        error: repoValidation.error
      };
    }

    const repoPath = repoValidation.path!;
    const entryValidation = this.pathGuard.validateEntryPath(repoPath, entryPath);
    if (!entryValidation.valid) {
      return {
        entryFile: null as any,
        error: entryValidation.error
      };
    }

    const entryFilePath = entryValidation.path!;
    const content = await fs.readFile(entryFilePath, 'utf-8');

    const entryFile: ResolvedFile = {
      path: entryFilePath,
      content,
      relativePath: entryPath
    };

    return { entryFile, repoPath };
  }

  async parseFile(filePath: string): Promise<ParsedFile> {
    const normalizedPath = this.pathGuard.normalizePath(filePath);

    if (this.parsedFiles.has(normalizedPath)) {
      return this.parsedFiles.get(normalizedPath)!;
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const lexer = new CircomLexer(content);
    const parser = new CircomParser(lexer);
    const ast = parser.parse(content, filePath);

    const includes: any[] = [];
    const templates: any[] = [];
    const functions: any[] = [];
    const components: any[] = [];

    for (const node of ast) {
      if (node.type === 'Include') {
        includes.push(node);
      } else if (node.type === 'TemplateDefinition') {
        templates.push(node);
      } else if (node.type === 'FunctionDefinition') {
        functions.push(node);
      } else if (node.type === 'ComponentInstantiationNode') {
        // CRITICAL: Validate templateName field exists
        if (!node.templateName || node.templateName === undefined) {
          logger.error(`Invalid component instantiation: file=${filePath}, line=${node.line}, component=${node.name}, templateName is missing`);
        }
        components.push(node);
      } else if ((node as any).type === 'ComponentArrayInit') {
        // Component array initialization - this contains init statements
        const arrayInitNode = node as any;
        console.log(`[Parser INFO] ComponentArrayInit found: ${arrayInitNode.name} with ${arrayInitNode.initStatements.length} init statements`);
        // Don't add to components - init statements are in the file's AST
      }
    }

    const parsedFile: ParsedFile = {
      path: normalizedPath,
      content,
      ast,
      includes,
      templates,
      functions,
      components
    };

    this.parsedFiles.set(normalizedPath, parsedFile);
    return parsedFile;
  }

  async getRepoInfo(repoName: string): Promise<RepoInfo> {
    const validation = this.pathGuard.validateRepoPath(repoName);
    
    if (!validation.valid) {
      return {
        name: repoName,
        path: '',
        exists: false
      };
    }

    const repoPath = validation.path!;
    let mainEntry: string | undefined;

    try {
      const files = await fs.readdir(repoPath, { recursive: true });
      const circomFiles = files.filter(f => f.endsWith('.circom'));

      for (const file of circomFiles) {
        const filePath = path.join(repoPath, file);
        const parsedFile = await this.parseFile(filePath);
        
        for (const node of parsedFile.ast) {
          if (node.type === 'ComponentInstantiationNode' && node.name === 'main') {
            mainEntry = this.pathGuard.getRelativePath(repoPath, filePath);
            break;
          }
        }

        if (mainEntry) break;
      }
    } catch (error) {
    }

    return {
      name: repoName,
      path: repoPath,
      exists: true,
      mainEntry
    };
  }

  getAllParsedFiles(): Map<string, ParsedFile> {
    return new Map(this.parsedFiles);
  }

  clearCache(): void {
    this.parsedFiles.clear();
  }
}
import { logger } from '../../utils/logger.js';
