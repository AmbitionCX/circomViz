// 依赖图构建器

import * as path from 'path';
import type { IncludeNode, ParsedFile } from '../parser/ast.js';
import { PathGuard } from '../project/pathGuard.js';
import { FsUtils } from '../../utils/fs.js';
import { ErrorCollector } from '../../utils/errors.js';
import { IncludeResolver } from './includeResolver.js';
import { CircomLexer, CircomParser } from '../parser/index.js';
import { logger } from '../../utils/logger.js';

export interface DependencyNode {
  path: string;
  content: string;
  includes: DependencyEdge[];
  dependents: string[];
  parsed?: ParsedFile;
}

export interface DependencyEdge {
  fromPath: string;
  toPath: string;
  includePath: string;
  line: number;
}

export class DependencyGraph {
  private nodes = new Map<string, DependencyNode>();
  private pathGuard: PathGuard;
  private errorCollector: ErrorCollector;
  private includeResolver: IncludeResolver;

  constructor(errorCollector: ErrorCollector) {
    this.pathGuard = new PathGuard();
    this.errorCollector = errorCollector;
    this.includeResolver = new IncludeResolver(errorCollector);
  }

  async build(entryPath: string): Promise<DependencyNode[]> {
    this.nodes.clear();
    await this.processFile(entryPath, []);

    const sortedNodes = this.topologicalSortNodes();
    return sortedNodes;
  }

  private async processFile(
    filePath: string,
    visited: string[]
  ): Promise<void> {
    const normalizedPath = this.pathGuard.normalizePath(filePath);

    if (visited.includes(normalizedPath)) {
      this.errorCollector.warning(
        `Circular dependency detected: ${filePath}`,
        filePath
      );
      return;
    }

    if (this.nodes.has(normalizedPath)) {
      return;
    }

    const content = await FsUtils.readFileSafe(filePath);
    if (!content.content) {
      this.errorCollector.error(
        content.error || `Failed to read file: ${filePath}`,
        filePath
      );
      return;
    }

    const node: DependencyNode = {
      path: normalizedPath,
      content: content.content,
      includes: [],
      dependents: []
    };

    this.nodes.set(normalizedPath, node);
    this.includeResolver.setCurrentFile(normalizedPath);

    const lexer = new CircomLexer(content.content);
    const parser = new CircomParser(lexer);
    const ast = parser.parse(content.content, normalizedPath);

    const includes = ast.filter((n: any) => n.type === 'Include') as IncludeNode[];

    for (const includeNode of includes) {
      const resolvedPath = await this.includeResolver.resolveInclude(includeNode);
      
      if (resolvedPath) {
        const edge: DependencyEdge = {
          fromPath: normalizedPath,
          toPath: resolvedPath,
          includePath: includeNode.path,
          line: includeNode.line
        };
        node.includes.push(edge);

        const depNode = this.nodes.get(resolvedPath);
        if (depNode && !depNode.dependents.includes(normalizedPath)) {
          depNode.dependents.push(normalizedPath);
        }

        await this.processFile(resolvedPath, [...visited, normalizedPath]);
      }
    }
  }

  topologicalSort(): string[] {
    const inDegree = new Map<string, number>();
    const queue: string[] = [];
    const result: string[] = [];
    const addedToResult = new Set<string>();

    for (const [path, node] of this.nodes.entries()) {
      inDegree.set(path, node.includes.length);
      if (node.includes.length === 0) {
        queue.push(path);
      }
    }

    while (queue.length > 0) {
      const currentPath = queue.shift()!;

      if (!addedToResult.has(currentPath)) {
        result.push(currentPath);
        addedToResult.add(currentPath);

        const node = this.nodes.get(currentPath)!;
        for (const dependent of node.dependents) {
          const degree = inDegree.get(dependent)! - 1;
          inDegree.set(dependent, degree);

          if (degree === 0) {
            queue.push(dependent);
          }
        }
      }
    }

    if (result.length !== this.nodes.size) {
      const remainingNodes = Array.from(this.nodes.keys()).filter(p => !result.includes(p));
      const cycle = this.findCircularDependency();
      
      if (cycle) {
        logger.debug(`Circular dependency detected: ${cycle.join(' -> ')}`);
        this.errorCollector.warning(
          `Circular dependency detected:\n  ${cycle.join(' -> ')}`,
          cycle[0]
        );
        
        // Add all nodes in the cycle to result
        for (const cyclePath of cycle) {
          if (!addedToResult.has(cyclePath)) {
            result.push(cyclePath);
            addedToResult.add(cyclePath);
          }
        }
      }

      // Add any remaining nodes
      for (const remainingPath of remainingNodes) {
        if (!addedToResult.has(remainingPath)) {
          result.push(remainingPath);
          addedToResult.add(remainingPath);
        }
      }
    }

    return result;
  }

  private findCircularDependency(): string[] | null {
    const visited = new Set<string>();
    const path: string[] = [];

    const findCycle = (nodePath: string) => {
      if (path.includes(nodePath)) {
        return true;
      }

      path.push(nodePath);
      visited.add(nodePath);

      const node = this.nodes.get(nodePath);
      if (node) {
        for (const edge of node.includes) {
          if (!visited.has(edge.toPath) || path.includes(edge.toPath)) {
            if (findCycle(edge.toPath)) {
              return true;
            }
          }
        }
      }

      path.pop();
      return false;
    };

    for (const [nodePath] of this.nodes.entries()) {
      if (!visited.has(nodePath)) {
        if (findCycle(nodePath)) {
          const cycleIndex = path.indexOf(path[path.length - 1]);
          return cycleIndex >= 0 ? path.slice(cycleIndex) : [...path];
        }
      }
    }

    return null;
  }

  private topologicalSortNodes(): DependencyNode[] {
    const inDegree = new Map<string, number>();
    const queue: DependencyNode[] = [];
    const result: DependencyNode[] = [];

    for (const [path, node] of this.nodes.entries()) {
      inDegree.set(path, node.includes.length);
      if (node.includes.length === 0) {
        queue.push(node);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      for (const dependent of current.dependents) {
        const degree = inDegree.get(dependent)! - 1;
        inDegree.set(dependent, degree);

        if (degree === 0) {
          const depNode = this.nodes.get(dependent)!;
          queue.push(depNode);
        }
      }
    }

    if (result.length !== this.nodes.size) {
      this.errorCollector.error(
        'Circular dependency detected in the project',
        '',
        0
      );
    }

    return result;
  }

  getAllNodes(): Map<string, DependencyNode> {
    return new Map(this.nodes);
  }

  addFile(filePath: string): void {
    const normalizedPath = this.pathGuard.normalizePath(filePath);
    if (!this.nodes.has(normalizedPath)) {
      this.nodes.set(normalizedPath, {
        path: normalizedPath,
        content: '',
        includes: [],
        dependents: []
      });
    }
  }

  addDependency(fromPath: string, toPath: string): void {
    const normalizedFrom = this.pathGuard.normalizePath(fromPath);
    const normalizedTo = this.pathGuard.normalizePath(toPath);

    let fromNode = this.nodes.get(normalizedFrom);
    if (!fromNode) {
      fromNode = {
        path: normalizedFrom,
        content: '',
        includes: [],
        dependents: []
      };
      this.nodes.set(normalizedFrom, fromNode);
    }

    let toNode = this.nodes.get(normalizedTo);
    if (!toNode) {
      toNode = {
        path: normalizedTo,
        content: '',
        includes: [],
        dependents: []
      };
      this.nodes.set(normalizedTo, toNode);
    }

    if (!fromNode.includes.some(edge => edge.toPath === normalizedTo)) {
      fromNode.includes.push({
        fromPath: normalizedFrom,
        toPath: normalizedTo,
        includePath: '',
        line: 0
      });
    }

    if (!toNode.dependents.includes(normalizedFrom)) {
      toNode.dependents.push(normalizedFrom);
    }
  }

  getDependencies(filePath: string): DependencyNode | undefined {
    return this.nodes.get(this.pathGuard.normalizePath(filePath));
  }

  getDependents(filePath: string): string[] {
    const node = this.nodes.get(this.pathGuard.normalizePath(filePath));
    return node?.dependents || [];
  }

  clear(): void {
    this.nodes.clear();
    this.includeResolver.clearCache();
  }

  getStatistics(): {
    totalFiles: number;
    totalIncludes: number;
    avgIncludesPerFile: number;
    maxDepth: number;
  } {
    const nodes = Array.from(this.nodes.values());
    const totalIncludes = nodes.reduce((sum, n) => sum + n.includes.length, 0);

    return {
      totalFiles: nodes.length,
      totalIncludes,
      avgIncludesPerFile: totalIncludes / nodes.length || 0,
      maxDepth: this.getMaxDepth()
    };
  }

  getMaxDepth(): number {
    let maxDepth = 0;

    for (const [filePath] of this.nodes.entries()) {
      const depth = this.calculateDepth(filePath, new Set());
      maxDepth = Math.max(maxDepth, depth);
    }

    return maxDepth;
  }

  private calculateDepth(filePath: string, visited: Set<string>): number {
    if (visited.has(filePath)) {
      return 0;
    }

    visited.add(filePath);
    const node = this.nodes.get(filePath);

    if (!node || node.includes.length === 0) {
      return 1;
    }

    let maxChildDepth = 0;
    for (const edge of node.includes) {
      const childDepth = this.calculateDepth(edge.toPath, new Set(visited));
      maxChildDepth = Math.max(maxChildDepth, childDepth);
    }

    return maxChildDepth + 1;
  }
}
