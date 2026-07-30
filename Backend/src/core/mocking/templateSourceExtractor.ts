import { existsSync, realpathSync } from 'fs';
import { dirname, isAbsolute, join } from 'path';
import type { FunctionDefinitionNode, ParsedFile, TemplateDefinitionNode } from '../parser/ast.js';

export interface ExtractedDefinition {
  kind: 'template' | 'function';
  name: string;
  line: number;
  source: string;
}

export interface StandaloneTemplateSource {
  pragma: string;
  includes: string[];
  selectedTemplateName: string;
  selectedSource: string;
  dependencies: ExtractedDefinition[];
}

export function extractDefinitionBlock(source: string, startLine: number): string {
  const lines = source.split('\n');
  const start = Math.max(0, startLine - 1);
  let braces = 0;
  let opened = false;
  let inBlockComment = false;
  let end = start;

  for (let lineIndex = start; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    let inString: string | null = null;
    for (let index = 0; index < line.length; index++) {
      const char = line[index];
      const next = line[index + 1];
      if (inBlockComment) {
        if (char === '*' && next === '/') { inBlockComment = false; index++; }
        continue;
      }
      if (!inString && char === '/' && next === '*') { inBlockComment = true; index++; continue; }
      if (!inString && char === '/' && next === '/') break;
      if (char === '"' || char === "'") {
        if (line[index - 1] !== '\\') inString = inString === char ? null : inString ?? char;
        continue;
      }
      if (inString) continue;
      if (char === '{') { braces++; opened = true; }
      if (char === '}') braces--;
    }
    end = lineIndex;
    if (opened && braces === 0) break;
  }

  return lines.slice(start, end + 1).join('\n').trim();
}

function findOwningFile(parsedFiles: Map<string, ParsedFile>, selected: TemplateDefinitionNode): ParsedFile {
  for (const file of parsedFiles.values()) {
    if (file.templates.includes(selected) || file.path === selected.sourceFile || file.path.replace(/\\/g, '/') === selected.sourceFile.replace(/\\/g, '/')) return file;
  }
  throw new Error(`Unable to locate source file for template ${selected.name}`);
}

function collectReferences(node: unknown, templateNames: Set<string>, functionNames: Set<string>): { templates: Set<string>; functions: Set<string> } {
  const templates = new Set<string>();
  const functions = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const record = value as Record<string, unknown>;
    if (typeof record.templateName === 'string' && templateNames.has(record.templateName)) templates.add(record.templateName);
    if (record.type === 'ComponentCall' && typeof record.template === 'string' && templateNames.has(record.template)) templates.add(record.template);
    if (record.type === 'FunctionCall' && typeof record.function === 'string') {
      if (templateNames.has(record.function)) templates.add(record.function);
      if (functionNames.has(record.function)) functions.add(record.function);
    }
    for (const [key, child] of Object.entries(record)) if (key !== 'sourceFile') visit(child);
  };
  visit(node);
  return { templates, functions };
}

function resolveInclude(sourceFile: string, includePath: string): string {
  if (isAbsolute(includePath)) return includePath.replace(/\\/g, '/');
  const localCandidate = join(dirname(sourceFile), includePath);
  if (existsSync(localCandidate)) return realpathSync(localCandidate).replace(/\\/g, '/');
  return includePath.replace(/\\/g, '/');
}

export function buildStandaloneTemplateSource(parsedFiles: Map<string, ParsedFile>, selected: TemplateDefinitionNode): StandaloneTemplateSource {
  const file = findOwningFile(parsedFiles, selected);
  const templates = new Map(file.templates.map((definition) => [definition.name, definition]));
  const functions = new Map(file.functions.map((definition) => [definition.name, definition]));
  const templateNames = new Set(templates.keys());
  const functionNames = new Set(functions.keys());
  const requiredTemplates = new Set<string>();
  const requiredFunctions = new Set<string>();
  const templateQueue: TemplateDefinitionNode[] = [selected];
  const functionQueue: FunctionDefinitionNode[] = [];

  while (templateQueue.length) {
    const definition = templateQueue.shift()!;
    const refs = collectReferences(definition, templateNames, functionNames);
    for (const name of refs.templates) {
      if (name === selected.name || requiredTemplates.has(name)) continue;
      requiredTemplates.add(name);
      const dependency = templates.get(name);
      if (dependency) templateQueue.push(dependency);
    }
    for (const name of refs.functions) {
      if (requiredFunctions.has(name)) continue;
      requiredFunctions.add(name);
      const dependency = functions.get(name);
      if (dependency) functionQueue.push(dependency);
    }
  }

  while (functionQueue.length) {
    const definition = functionQueue.shift()!;
    const refs = collectReferences(definition, templateNames, functionNames);
    for (const name of refs.functions) {
      if (requiredFunctions.has(name)) continue;
      requiredFunctions.add(name);
      const dependency = functions.get(name);
      if (dependency) functionQueue.push(dependency);
    }
  }

  const dependencies: ExtractedDefinition[] = [
    ...Array.from(requiredFunctions).map((name) => ({ kind: 'function' as const, definition: functions.get(name)! })),
    ...Array.from(requiredTemplates).map((name) => ({ kind: 'template' as const, definition: templates.get(name)! })),
  ].filter((entry) => entry.definition).map((entry) => ({
    kind: entry.kind,
    name: entry.definition.name,
    line: entry.definition.line,
    source: extractDefinitionBlock(file.content, entry.definition.line),
  })).sort((left, right) => left.line - right.line);

  const pragmaNode = file.ast.find((node) => node.type === 'Pragma');
  const pragma = pragmaNode?.type === 'Pragma' ? `pragma circom ${pragmaNode.version};` : 'pragma circom 2.2.3;';
  const includes = Array.from(new Set(file.includes.map((include) => resolveInclude(file.path, include.path))));
  return {
    pragma,
    includes,
    selectedTemplateName: selected.name,
    selectedSource: extractDefinitionBlock(file.content, selected.line),
    dependencies,
  };
}

function header(bundle: StandaloneTemplateSource): string[] {
  return [bundle.pragma, ...bundle.includes.map((includePath) => `include "${includePath}";`), ''];
}

export function assembleOriginSource(bundle: StandaloneTemplateSource): string {
  return [...header(bundle), ...bundle.dependencies.map((definition) => definition.source), bundle.selectedSource, ''].join('\n\n');
}

export function assembleMockedSource(options: {
  bundle: StandaloneTemplateSource;
  selectedSource: string;
  entryTemplateName: string;
  params: Array<{ name: string; value: number }>;
  publicSignals: string[];
  eliminatedTemplateNames?: string[];
}): string {
  const eliminated = new Set(options.eliminatedTemplateNames ?? []);
  const dependencies = options.bundle.dependencies.filter((definition) => definition.kind !== 'template' || !eliminated.has(definition.name));
  const publicBlock = options.publicSignals.length ? ` { public [${options.publicSignals.join(', ')}] }` : '';
  const args = options.params.map((param) => String(param.value)).join(', ');
  return [
    ...header(options.bundle),
    ...dependencies.map((definition) => definition.source),
    options.selectedSource,
    `component main${publicBlock} = ${options.entryTemplateName}(${args});`,
    '',
  ].join('\n\n');
}
