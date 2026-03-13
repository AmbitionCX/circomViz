// 文件系统工具

import * as fs from 'fs/promises';
import * as path from 'path';

export class FsUtils {
  static async readFileSafe(filePath: string): Promise<{ content?: string; error?: string }> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return { content };
    } catch (error) {
      return {
        error: `Failed to read file ${filePath}: ${(error as Error).message}`
      };
    }
  }

  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  static async ensureDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
  }

  static async copyFile(source: string, target: string): Promise<void> {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  }

  static async copyDir(source: string, target: string): Promise<void> {
    await fs.mkdir(target, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        await this.copyDir(srcPath, destPath);
      } else {
        await this.copyFile(srcPath, destPath);
      }
    }
  }

  static async listFiles(dirPath: string, extension?: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        files.push(...await this.listFiles(fullPath, extension));
      } else if (!extension || entry.name.endsWith(extension)) {
        files.push(fullPath);
      }
    }

    return files;
  }

  static getLineCount(content: string): number {
    return content.split('\n').length;
  }

  static normalizePath(filePath: string): string {
    return path.normalize(filePath).replace(/\\/g, '/');
  }

  static join(...paths: string[]): string {
    return this.normalizePath(path.join(...paths));
  }
}
