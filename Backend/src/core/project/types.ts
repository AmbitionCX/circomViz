// Type defination of circom project parsing

export interface ProjectConfig {
  repoName: string;
  entryPath: string;
  rootComponent?: string;
  basePath: string;
}

export interface ResolvedFile {
  path: string;
  content: string;
  relativePath: string;
}

export interface ProjectFile {
  id: string;
  path: string;
  content: string;
  includes: string[];
  lineCount: number;
}

export interface RepoInfo {
  name: string;
  path: string;
  exists: boolean;
  mainEntry?: string;
}
