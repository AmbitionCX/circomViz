import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join, resolve, sep } from 'path';
import { spawn } from 'child_process';
import type { ParseCompilationFailure, ParseCompilationStatus } from '../../types/circuitParser.js';
import { resolveCompilerIncludePaths } from '../../core/resolver/compilerIncludePaths.js';

interface TemplateLocation {
  name: string;
  sourceFile: string;
  line: number;
}

interface StartParseCompilationOptions {
  repo: string;
  entry: string;
  rootComponent: string;
  rootArguments: number[];
  entryFilePath: string;
  repoPath: string;
  hasMainComponent: boolean;
  tree: any;
  templates: TemplateLocation[];
}

interface StoredParseCompilation extends ParseCompilationStatus {
  timestamp: string;
  repo: string;
  entry: string;
  rootComponent: string;
  folderPath: string;
  sourcePath: string;
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  generatedArtifacts: string[];
}

const compilationsRoot = () => join(process.cwd(), 'compilations');
const statusFileName = 'compile-output.json';
const ansiPattern = /\u001b\[[0-?]*[ -/]*[@-~]/g;

const sanitize = (value: string) => value.replace(/[^a-zA-Z0-9_.-]/g, '_');
const normalizePath = (value: string) => resolve(value).replace(/\\/g, '/');
const samePath = (left: string, right: string) => normalizePath(left) === normalizePath(right);

function templatePaths(tree: any, targetName: string): string[][] {
  const matches: string[][] = [];
  const visit = (node: any, path: string[]) => {
    if (!node) return;
    const currentName = node.templateName ?? node.name;
    const currentPath = currentName ? [...path, currentName] : path;
    if (currentName === targetName) matches.push(currentPath);
    for (const component of node.components ?? []) {
      if (component.template) visit(component.template, currentPath);
    }
  };
  visit(tree, []);
  return matches;
}

function pathEndsWith(path: string[], suffix: string[]) {
  return suffix.length <= path.length
    && suffix.every((value, index) => path[path.length - suffix.length + index] === value);
}

function templateAtLocation(templates: TemplateLocation[], file: string, line: number) {
  return templates
    .filter((template) => samePath(template.sourceFile, file) && template.line <= line)
    .sort((left, right) => right.line - left.line)[0];
}

export function parseCompilationFailure(
  stderr: string,
  tree: any,
  templates: TemplateLocation[],
): { message: string; failedComponents: ParseCompilationFailure[] } {
  const clean = stderr.replace(ansiPattern, '');
  const errorMatch = clean.match(/error\[([^\]]+)\]\s*:\s*([^\n]+)/);
  const message = errorMatch
    ? `${errorMatch[1]}: ${errorMatch[2].trim()}`
    : clean.split('\n').map((line) => line.trim()).find(Boolean) ?? 'Circom compilation failed';
  const errorCode = errorMatch?.[1];
  const trace = [...clean.matchAll(/^\s*->\s*([A-Za-z_][A-Za-z0-9_]*)(?:\([^)]*\))?\s*$/gm)]
    .map((match) => match[1]);
  const locations = [...clean.matchAll(/┌─\s*"([^"]+)":(\d+):(\d+)/g)]
    .map((match) => ({ file: match[1], line: Number(match[2]), column: Number(match[3]) }));
  const failures: ParseCompilationFailure[] = [];

  if (trace.length) {
    const targetName = trace[trace.length - 1];
    const matchingPaths = templatePaths(tree, targetName).filter((path) => pathEndsWith(path, trace));
    const location = locations[0];
    for (const templatePath of matchingPaths.length ? matchingPaths : templatePaths(tree, targetName)) {
      failures.push({
        templateName: targetName,
        templatePath,
        sourceFile: location?.file,
        line: location?.line,
        column: location?.column,
        errorCode,
      });
    }
  }

  for (const location of locations) {
    const template = templateAtLocation(templates, location.file, location.line);
    if (!template) continue;
    for (const templatePath of templatePaths(tree, template.name)) {
      failures.push({
        templateName: template.name,
        templatePath,
        sourceFile: location.file,
        line: location.line,
        column: location.column,
        errorCode,
      });
    }
  }

  if (!failures.length) {
    const rootName = tree?.templateName ?? tree?.name ?? 'main';
    failures.push({ templateName: rootName, templatePath: [rootName], errorCode });
  }

  const unique = new Map(failures.map((failure) => [
    `${failure.templatePath.join('>')}:${failure.sourceFile ?? ''}:${failure.line ?? ''}`,
    failure,
  ]));
  return { message, failedComponents: [...unique.values()] };
}

function runCommand(command: string, args: string[], cwd: string) {
  return new Promise<{ exitCode: number | null; stdout: string; stderr: string; error?: string }>((done) => {
    const child = spawn(command, args, { cwd });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result: { exitCode: number | null; stdout: string; stderr: string; error?: string }) => {
      if (settled) return;
      settled = true;
      done(result);
    };
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => finish({ exitCode: null, stdout, stderr, error: error.message }));
    child.on('close', (code) => finish({
      exitCode: code,
      stdout,
      stderr,
      error: code === 0 ? undefined : `circom exited with code ${code}`,
    }));
  });
}

async function writeStatus(folderPath: string, status: StoredParseCompilation) {
  await fs.writeFile(join(folderPath, statusFileName), JSON.stringify(status, null, 2), 'utf-8');
}

async function executeCompilation(
  initial: StoredParseCompilation,
  tree: any,
  templates: TemplateLocation[],
) {
  const result = await runCommand(initial.command, initial.args, initial.folderPath);
  let generatedArtifacts: string[] = [];
  try {
    generatedArtifacts = (await fs.readdir(initial.folderPath)).map((file) => join(initial.folderPath, file));
  } catch {
    generatedArtifacts = [];
  }
  const failure = result.exitCode === 0
    ? { message: undefined, failedComponents: [] }
    : parseCompilationFailure(result.stderr || result.error || '', tree, templates);
  await writeStatus(initial.folderPath, {
    ...initial,
    status: result.exitCode === 0 ? 'success' : 'failure',
    exitCode: result.exitCode,
    message: failure.message,
    failedComponents: failure.failedComponents,
    stdout: result.stdout,
    stderr: result.stderr,
    generatedArtifacts,
  });
}

export async function startParseCompilation(
  options: StartParseCompilationOptions,
): Promise<ParseCompilationStatus> {
  const id = `${sanitize(options.repo)}_${sanitize(options.rootComponent)}_${Date.now()}_${randomUUID()}`;
  const folderPath = join(compilationsRoot(), id);
  await fs.mkdir(folderPath, { recursive: true });

  let sourcePath = options.entryFilePath;
  if (!options.hasMainComponent) {
    sourcePath = join(folderPath, 'main.circom');
    const wrapper = [
      'pragma circom 2.2.3;',
      '',
      `include "${options.entryFilePath.replace(/\\/g, '/')}";`,
      '',
      `component main = ${options.rootComponent}(${options.rootArguments.join(', ')});`,
      '',
    ].join('\n');
    await fs.writeFile(sourcePath, wrapper, 'utf-8');
  }

  const includePaths = resolveCompilerIncludePaths(options.repoPath, options.entryFilePath);
  const args = [
    sourcePath,
    '--sym',
    '--json',
    '--simplification_substitution',
    '--O2',
    ...includePaths.flatMap((includePath) => ['-l', includePath]),
    '-o',
    folderPath,
  ];
  const initial: StoredParseCompilation = {
    id,
    status: 'compiling',
    failedComponents: [],
    timestamp: new Date().toISOString(),
    repo: options.repo,
    entry: options.entry,
    rootComponent: options.rootComponent,
    folderPath,
    sourcePath,
    command: 'circom',
    args,
    stdout: '',
    stderr: '',
    generatedArtifacts: [],
  };
  await writeStatus(folderPath, initial);
  void executeCompilation(initial, options.tree, options.templates).catch(async (error: any) => {
    const rootName = options.tree?.templateName ?? options.rootComponent;
    await writeStatus(folderPath, {
      ...initial,
      status: 'failure',
      message: error.message || 'Compilation job failed',
      exitCode: null,
      failedComponents: [{ templateName: rootName, templatePath: [rootName] }],
      stderr: error.message || '',
    });
  });
  return { id, status: 'compiling', failedComponents: [] };
}

export async function readParseCompilationStatus(id: string): Promise<ParseCompilationStatus | null> {
  if (!/^[a-zA-Z0-9_.-]+$/.test(id)) return null;
  const root = resolve(compilationsRoot());
  const folderPath = resolve(root, id);
  if (folderPath !== root && !folderPath.startsWith(`${root}${sep}`)) return null;
  try {
    const stored = JSON.parse(await fs.readFile(join(folderPath, statusFileName), 'utf-8'));
    return {
      id: stored.id,
      status: stored.status,
      message: stored.message,
      exitCode: stored.exitCode,
      failedComponents: stored.failedComponents ?? [],
    };
  } catch {
    return null;
  }
}
