import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { AbstractWrapperGenerator } from '../../core/abstractCompile/abstractWrapperGenerator.js';
import { prepareTemplateAttentionRequest } from '../../core/llm/templateAttentionAnalyzer.js';
import { assembleMockedSource, assembleOriginSource, buildStandaloneTemplateSource } from '../../core/mocking/templateSourceExtractor.js';
import { buildPartialDebuggingBundle } from '../../core/partialDebugging/build.js';
import { ProjectLoader } from '../../core/project/loadProject.js';
import { resolveCompilerIncludePaths } from '../../core/resolver/compilerIncludePaths.js';
import type {
  ComponentInstantiationNode,
  ExpressionNode,
  ParsedFile,
  TemplateDefinitionNode,
} from '../../core/parser/ast.js';
import { compileDebug, getCircomArtifactPaths } from '../../server/compilations/compileDebug.js';
import type { MockManifest } from '../../types/partialDebugging.js';
import { BENCHMARK_SCHEMA_VERSION, NEUTRAL_INTENT } from './types.js';
import type {
  AnnotationInput,
  BuiltBundleCase,
  PendingBenchmarkCase,
  SerializedAnchorCatalog,
} from './types.js';
import { readJsonFile, readJsonl, sha256, writeCsv, writeJsonFile, writeJsonl } from './io.js';

const execFileAsync = promisify(execFile);
type UnknownRecord = Record<string, unknown>;
let remoteFixFetchAvailable = true;
const MAX_BENCHMARK_CONSTRAINTS = 100_000;

export interface BundleBuildStatus {
  caseId: string;
  project: string;
  status: 'built' | 'skipped' | 'failed';
  reason: string;
  viewTemplate?: string;
  mappingMode?: BuiltBundleCase['mappingMode'];
  constraints?: number;
}

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(';');
  return typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : String(value);
}

async function exists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(() => true, () => false);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function evaluateConstantExpression(expression: ExpressionNode): number | null {
  if (expression.type === 'Literal') {
    if (typeof expression.value === 'number') return expression.value;
    if (typeof expression.value === 'boolean') return Number(expression.value);
    const parsed = Number(expression.value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (expression.type === 'UnaryOp') {
    const operand = evaluateConstantExpression(expression.operand);
    if (operand === null) return null;
    if (expression.operator === '+') return operand;
    if (expression.operator === '-') return -operand;
    if (expression.operator === '!') return Number(!operand);
    if (expression.operator === '~') return ~operand;
    return null;
  }
  if (expression.type !== 'BinaryOp') return null;
  const left = evaluateConstantExpression(expression.left);
  const right = evaluateConstantExpression(expression.right);
  if (left === null || right === null) return null;
  switch (expression.operator) {
    case '+': return left + right;
    case '-': return left - right;
    case '*': return left * right;
    case '/': return right === 0 ? null : Math.trunc(left / right);
    case '\\': return right === 0 ? null : Math.trunc(left / right);
    case '%': return right === 0 ? null : left % right;
    case '**': return left ** right;
    case '<<': return left << right;
    case '>>': return left >> right;
    case '&': return left & right;
    case '|': return left | right;
    case '^': return left ^ right;
    case '==': return Number(left === right);
    case '!=': return Number(left !== right);
    case '<': return Number(left < right);
    case '<=': return Number(left <= right);
    case '>': return Number(left > right);
    case '>=': return Number(left >= right);
    case '&&': return Number(Boolean(left) && Boolean(right));
    case '||': return Number(Boolean(left) || Boolean(right));
    default: return null;
  }
}

function resolveParams(
  definition: TemplateDefinitionNode,
  instantiation: ComponentInstantiationNode,
): Array<{ name: string; value: number }> | null {
  if (definition.parameters.length !== instantiation.arguments.length) return null;
  const values = instantiation.arguments.map(evaluateConstantExpression);
  if (values.some((value) => value === null || !Number.isSafeInteger(value))) return null;
  return definition.parameters.map((parameter, index) => ({ name: parameter.name, value: values[index]! }));
}

async function resolveInclude(
  sourceFile: string,
  includePath: string,
  roots: string[],
): Promise<string | null> {
  const packagePath = includePath.startsWith('node_modules/')
    ? includePath.slice('node_modules/'.length)
    : includePath.includes('node_modules/')
      ? includePath.slice(includePath.indexOf('node_modules/') + 'node_modules/'.length)
      : includePath;
  const candidates = path.isAbsolute(includePath)
    ? [includePath]
    : [
      path.resolve(path.dirname(sourceFile), includePath),
      ...roots.flatMap((root) => [
        path.resolve(root, includePath),
        path.resolve(root, packagePath),
        path.resolve(root, 'node_modules', packagePath),
      ]),
    ];
  for (const candidate of unique(candidates)) {
    if (await exists(candidate)) return fs.realpath(candidate);
  }
  return null;
}

async function loadCircomClosure(entryPath: string, roots: string[]): Promise<Map<string, ParsedFile>> {
  const loader = new ProjectLoader();
  const parsedFiles = new Map<string, ParsedFile>();
  const pending = [await fs.realpath(entryPath)];
  const unresolved: string[] = [];
  while (pending.length) {
    const current = pending.shift()!;
    if (parsedFiles.has(current.replace(/\\/g, '/'))) continue;
    const parsed = await loader.parseFile(current);
    parsedFiles.set(parsed.path, parsed);
    for (const include of parsed.includes) {
      const resolved = await resolveInclude(current, include.path, roots);
      if (!resolved) {
        unresolved.push(`${path.relative(process.cwd(), current)}:${include.line} -> ${include.path}`);
        continue;
      }
      include.resolvedPath = resolved;
      if (!parsedFiles.has(resolved.replace(/\\/g, '/'))) pending.push(resolved);
    }
  }
  if (unresolved.length) throw new Error(`unresolved-includes: ${unresolved.slice(0, 5).join(', ')}`);
  return parsedFiles;
}

function definitions(parsedFiles: Map<string, ParsedFile>): Map<string, TemplateDefinitionNode> {
  const result = new Map<string, TemplateDefinitionNode>();
  for (const parsed of parsedFiles.values()) {
    for (const definition of parsed.templates) if (!result.has(definition.name)) result.set(definition.name, definition);
  }
  return result;
}

function allInstantiations(parsedFiles: Map<string, ParsedFile>): ComponentInstantiationNode[] {
  const result: ComponentInstantiationNode[] = [];
  for (const parsed of parsedFiles.values()) {
    const visit = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      const candidate = value as UnknownRecord;
      if (candidate.type === 'ComponentInstantiationNode' && typeof candidate.templateName === 'string') {
        result.push(candidate as unknown as ComponentInstantiationNode);
      }
      for (const [key, child] of Object.entries(candidate)) if (key !== 'sourceFile') visit(child);
    };
    visit(parsed.ast);
  }
  return result;
}

function selectedTemplateNames(value: string): string[] {
  return value.split(/[;,]/).map((name) => name.trim()).filter(Boolean);
}

function chooseRoot(options: {
  parsedFiles: Map<string, ParsedFile>;
  entryPath: string;
  selectedTemplate: string;
}): {
  definition: TemplateDefinitionNode;
  params: Array<{ name: string; value: number }>;
  publicSignals: string[];
  mappingMode: BuiltBundleCase['mappingMode'];
  mappingReviewRequired: boolean;
  parentInterface?: string;
} {
  const byName = definitions(options.parsedFiles);
  const instantiations = allInstantiations(options.parsedFiles);
  const entry = options.parsedFiles.get(options.entryPath.replace(/\\/g, '/'));
  const entryMain = entry?.components.find((component) => component.name === 'main');
  const anyMain = entryMain ?? instantiations.find((component) => component.name === 'main');
  const wanted = selectedTemplateNames(options.selectedTemplate).find((name) => byName.has(name));

  if (wanted) {
    const definition = byName.get(wanted)!;
    const direct = anyMain?.templateName === wanted ? anyMain : undefined;
    const candidates = direct
      ? [direct]
      : instantiations.filter((component) => component.templateName === wanted);
    if (definition.parameters.length === 0 || candidates.length) {
      const params = definition.parameters.length === 0
        ? []
        : candidates.map((component) => resolveParams(definition, component)).find(Boolean) ?? null;
      if (params) {
        return {
          definition,
          params,
          publicSignals: direct?.publicSignals ?? [],
          mappingMode: direct ? 'direct-vulnerable-template' : 'located-vulnerable-template',
          mappingReviewRequired: !direct,
          parentInterface: direct
            ? `component main = ${wanted}(${params.map((parameter) => parameter.value).join(', ')});`
            : `Located ${wanted} from the direct wrapper dependency closure.`,
        };
      }
    }
  }

  if (entryMain) {
    const definition = byName.get(entryMain.templateName);
    const params = definition ? resolveParams(definition, entryMain) : null;
    if (definition && params) {
      return {
        definition,
        params,
        publicSignals: entryMain.publicSignals,
        mappingMode: 'isolated-direct-wrapper',
        mappingReviewRequired: true,
        parentInterface: `Isolated wrapper main = ${definition.name}(${params.map((parameter) => parameter.value).join(', ')});`,
      };
    }
  }
  throw new Error(`cannot-locate-instantiable-vulnerable-template: ${options.selectedTemplate}`);
}

function directChildTemplateNames(definition: TemplateDefinitionNode): string[] {
  const names: string[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const candidate = value as UnknownRecord;
    if (typeof candidate.templateName === 'string') names.push(candidate.templateName);
    if (candidate.type === 'ComponentCall' && typeof candidate.template === 'string') names.push(candidate.template);
    for (const [key, child] of Object.entries(candidate)) if (key !== 'sourceFile') visit(child);
  };
  visit(definition);
  return unique(names.filter((name) => name && name !== definition.name));
}

function serializeCatalog(catalog: {
  sourceNodes: Array<Record<string, unknown>>;
  sourceEdges: Array<Record<string, unknown>>;
  r1csNodes: Array<Record<string, unknown>>;
}): SerializedAnchorCatalog {
  return { sourceNodes: catalog.sourceNodes, sourceEdges: catalog.sourceEdges, r1csNodes: catalog.r1csNodes };
}

async function getFixDiff(config: UnknownRecord, codebaseRoot: string, caseWorkDir: string): Promise<string> {
  const commit = text(config.Commit);
  const fixCommit = text(config['Fix Commit']);
  const vulnerableFile = text(record(config.Location).Path);
  if (!commit || !fixCommit || !vulnerableFile) return '';
  if (await exists(path.join(codebaseRoot, '.git'))) {
    try {
      const result = await execFileAsync('git', ['-C', codebaseRoot, 'diff', '--no-ext-diff', commit, fixCommit, '--', vulnerableFile], {
        maxBuffer: 4 * 1024 * 1024,
      });
      return result.stdout;
    } catch {
      return '';
    }
  }

  const projectUrl = text(config.Project).replace(/\.git$/, '').replace(/\/$/, '');
  const match = projectUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/i);
  const vulnerablePath = path.resolve(codebaseRoot, vulnerableFile);
  if (!match || !await exists(vulnerablePath) || !remoteFixFetchAvailable) return '';
  try {
    const fixedUrl = `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${fixCommit}/${vulnerableFile}`;
    const response = await fetch(fixedUrl, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return '';
    const fixedPath = path.join(caseWorkDir, 'fixed-source.circom');
    await fs.writeFile(fixedPath, await response.text(), 'utf8');
    try {
      const result = await execFileAsync('git', ['diff', '--no-index', '--unified=5', '--', vulnerablePath, fixedPath], {
        maxBuffer: 4 * 1024 * 1024,
      });
      return result.stdout;
    } catch (error: any) {
      return typeof error?.stdout === 'string' ? error.stdout : '';
    }
  } catch {
    remoteFixFetchAvailable = false;
    return '';
  }
}

async function buildOne(options: {
  benchmarkCase: PendingBenchmarkCase;
  zkbugsRoot: string;
  workDir: string;
}): Promise<{ bundleCase: BuiltBundleCase; annotationInput: AnnotationInput; constraints: number }> {
  const benchmarkCase = options.benchmarkCase;
  const configPath = path.resolve(options.zkbugsRoot, benchmarkCase.configPath);
  const rawConfig = await readJsonFile<UnknownRecord>(configPath);
  const config = record(Object.values(rawConfig)[0]);
  const caseDir = path.dirname(configPath);
  const codebaseRoot = path.resolve(options.zkbugsRoot, benchmarkCase.codebasePath);
  const entryPath = path.resolve(caseDir, benchmarkCase.directEntrypoint);
  if (!await exists(entryPath)) throw new Error('direct-wrapper-not-found');
  if (!await exists(codebaseRoot)) throw new Error('pinned-upstream-codebase-not-downloaded');

  const sharedDependenciesRoot = path.join(options.zkbugsRoot, 'dataset', 'circom', 'dependencies');
  const sharedCircomlibRoot = path.join(sharedDependenciesRoot, 'circomlib');
  const includeRootCandidates = unique([
    caseDir,
    codebaseRoot,
    path.join(codebaseRoot, 'circuits'),
    path.dirname(codebaseRoot),
    path.join(codebaseRoot, 'node_modules'),
    path.join(codebaseRoot, 'circuits', 'node_modules'),
    path.join(path.dirname(codebaseRoot), 'node_modules'),
    sharedDependenciesRoot,
    sharedCircomlibRoot,
    path.join(sharedCircomlibRoot, 'circuits'),
    ...resolveCompilerIncludePaths(codebaseRoot, path.resolve(codebaseRoot, benchmarkCase.vulnerableFile)),
  ]).filter((candidate) => path.isAbsolute(candidate));
  const includeRoots = (await Promise.all(includeRootCandidates.map(async (candidate) =>
    await exists(candidate) ? candidate : undefined)))
    .filter((candidate): candidate is string => Boolean(candidate));
  const parsedFiles = await loadCircomClosure(entryPath, includeRoots);
  const root = chooseRoot({
    parsedFiles,
    entryPath: await fs.realpath(entryPath),
    selectedTemplate: benchmarkCase.selectedTemplate,
  });
  const standalone = buildStandaloneTemplateSource(parsedFiles, root.definition);
  const confirmedChildren = directChildTemplateNames(root.definition);
  let effectiveSource = standalone.selectedSource;
  let effectiveTemplateName = root.definition.name;
  let mockedChildren: string[] = [];
  let mockedTemplateNames: string[] = [];
  let boundaryInputs: Array<{ instance: string; signal: string; isArray: boolean }> = [];
  let mockManifest: MockManifest = { selectedRoot: 'main', mocks: [] };

  if (confirmedChildren.length) {
    const abstractResult = new AbstractWrapperGenerator(parsedFiles).build(
      root.definition,
      confirmedChildren,
      root.params,
      root.publicSignals,
      { originalFilePath: root.definition.sourceFile },
    );
    if (abstractResult.mockedChildren.length) {
      effectiveSource = abstractResult.templateSource;
      effectiveTemplateName = abstractResult.entryTemplateName;
      mockedChildren = abstractResult.mockedChildren;
      mockedTemplateNames = abstractResult.mockedTemplateNames;
      boundaryInputs = abstractResult.boundaryInputs;
      mockManifest = abstractResult.mockManifest;
    }
  }

  const originCode = assembleOriginSource(standalone);
  const owner = [...parsedFiles.values()].find((file) =>
    file.templates.includes(root.definition)
      || file.path === root.definition.sourceFile);
  const ownerHasMain = owner?.components.some((component) => component.name === 'main') ?? false;
  const publicBlock = root.publicSignals.length
    ? ` { public [${root.publicSignals.join(', ')}] }`
    : '';
  const rootArgs = root.params.map((parameter) => String(parameter.value)).join(', ');
  const entryFile = parsedFiles.get((await fs.realpath(entryPath)).replace(/\\/g, '/'));
  const entryIncludes = unique((entryFile?.includes ?? []).map((include) =>
    (include.resolvedPath ?? include.path).replace(/\\/g, '/')));
  const includeOriginalWrapper = [
    standalone.pragma,
    ...entryIncludes.map((includePath) => `include "${includePath}";`),
    '',
    ...(mockedChildren.length ? [effectiveSource, ''] : []),
    `component main${publicBlock} = ${effectiveTemplateName}(${rootArgs});`,
    '',
  ].join('\n');
  const mockedCode = !ownerHasMain
    ? includeOriginalWrapper
    : assembleMockedSource({
      bundle: standalone,
      selectedSource: effectiveSource,
      entryTemplateName: effectiveTemplateName,
      params: root.params,
      publicSignals: root.publicSignals,
      eliminatedTemplateNames: mockedChildren,
    });
  const safeCaseId = benchmarkCase.caseId.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const caseWorkDir = path.join(options.workDir, safeCaseId);
  const compilationDir = path.join(caseWorkDir, 'O0');
  await fs.mkdir(caseWorkDir, { recursive: true });
  const mockedPath = path.join(caseWorkDir, 'mocked.circom');
  await fs.writeFile(mockedPath, mockedCode, 'utf8');
  const loader = new ProjectLoader();
  const mockedParsed = await loader.parseFile(mockedPath);
  parsedFiles.set(mockedParsed.path, mockedParsed);
  const compiledRoot = mockedParsed.templates.find((template) => template.name === effectiveTemplateName)
    ?? (effectiveTemplateName === root.definition.name ? root.definition : undefined);
  if (!compiledRoot) throw new Error(`compiled-root-template-not-found: ${effectiveTemplateName}`);
  const compileResult = await compileDebug(mockedPath, includeRoots, compilationDir);
  if (!compileResult.success) throw new Error(`O0-compile-failed: ${compileResult.stderr.slice(0, 500)}`);
  if ((compileResult.constraints ?? 0) > MAX_BENCHMARK_CONSTRAINTS) {
    throw new Error(
      `constraint-budget-exceeded: ${compileResult.constraints} > ${MAX_BENCHMARK_CONSTRAINTS}`,
    );
  }
  const bundle = await buildPartialDebuggingBundle({
    parsedFiles,
    rootTemplate: root.definition,
    compiledRootTemplate: compiledRoot,
    params: root.params,
    selectedComponentPath: 'main',
    mockedTemplateNames,
    mockedChildren,
    boundaryInputs,
    mockManifest,
    artifacts: { O0: getCircomArtifactPaths(mockedPath, compilationDir) },
    analysisContext: { templateName: root.definition.name, originCode, mockedCode },
  });
  const prepared = prepareTemplateAttentionRequest(NEUTRAL_INTENT, bundle);
  const bundleCase: BuiltBundleCase = {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    caseId: benchmarkCase.caseId,
    project: benchmarkCase.project,
    projectCommit: benchmarkCase.projectCommit,
    bugFamily: benchmarkCase.bugFamily,
    vulnerableFile: benchmarkCase.vulnerableFile,
    vulnerableLines: benchmarkCase.vulnerableLines,
    selectedTemplate: benchmarkCase.selectedTemplate,
    split: benchmarkCase.split,
    dedupGroupId: benchmarkCase.dedupGroupId,
    directEntrypoint: benchmarkCase.directEntrypoint,
    codebasePath: benchmarkCase.codebasePath,
    configPath: benchmarkCase.configPath,
    viewTemplate: root.definition.name,
    mappingMode: root.mappingMode,
    mappingReviewRequired: root.mappingReviewRequired,
    parentInterface: root.parentInterface,
    bundle,
  };
  const source = record(config.Source);
  const annotationInput: AnnotationInput = {
    caseId: benchmarkCase.caseId,
    vulnerabilityDescription: text(config['Short Description of the Vulnerability']) || text(config.Vulnerability),
    vulnerableSource: originCode,
    fixDiff: await getFixDiff(config, codebaseRoot, caseWorkDir),
    auditEvidence: JSON.stringify({
      source,
      proposedMitigation: text(config['Proposed Mitigation']),
    }),
    candidates: serializeCatalog(prepared.catalog),
    forbiddenIntentTerms: unique([
      ...selectedTemplateNames(benchmarkCase.selectedTemplate),
      root.definition.name,
    ]),
    mappingReviewRequired: root.mappingReviewRequired,
  };
  return { bundleCase, annotationInput, constraints: bundle.constraintGraph.constraints.length };
}

export async function buildBenchmarkBundles(options: {
  casesPath: string;
  zkbugsRoot: string;
  workDir: string;
  bundleOutputPath: string;
  annotationOutputPath: string;
  statusOutputPath: string;
  splitsOutputPath: string;
  target: number;
  limit?: number;
  excludeCaseIds?: Set<string>;
}): Promise<{ bundles: BuiltBundleCase[]; annotationInputs: AnnotationInput[]; statuses: BundleBuildStatus[] }> {
  const cases = (await readJsonl<PendingBenchmarkCase>(options.casesPath))
    .filter((entry) => entry.status === 'pending-bundle')
    .sort((left, right) => (left.selectionPriority ?? 0) - (right.selectionPriority ?? 0))
    .slice(0, options.limit);
  const bundles: BuiltBundleCase[] = [];
  const annotationInputs: AnnotationInput[] = [];
  const statuses: BundleBuildStatus[] = [];
  for (const benchmarkCase of cases) {
    if (bundles.length >= options.target) break;
    if (options.excludeCaseIds?.has(benchmarkCase.caseId)) {
      statuses.push({
        caseId: benchmarkCase.caseId,
        project: benchmarkCase.project,
        status: 'skipped',
        reason: 'excluded-by-preflight',
      });
      continue;
    }
    try {
      const built = await buildOne({ benchmarkCase, zkbugsRoot: options.zkbugsRoot, workDir: options.workDir });
      bundles.push(built.bundleCase);
      annotationInputs.push(built.annotationInput);
      statuses.push({
        caseId: benchmarkCase.caseId,
        project: benchmarkCase.project,
        status: 'built',
        reason: '',
        viewTemplate: built.bundleCase.viewTemplate,
        mappingMode: built.bundleCase.mappingMode,
        constraints: built.constraints,
      });
    } catch (error: any) {
      const reason = error?.message ?? String(error);
      statuses.push({
        caseId: benchmarkCase.caseId,
        project: benchmarkCase.project,
        status: reason.includes('not-downloaded') ? 'skipped' : 'failed',
        reason,
      });
    }
  }
  const projectGroups = new Map<string, BuiltBundleCase[]>();
  for (const bundleCase of bundles) {
    const group = projectGroups.get(bundleCase.project) ?? [];
    group.push(bundleCase);
    projectGroups.set(bundleCase.project, group);
  }
  const developmentTarget = Math.max(1, Math.round(bundles.length * 0.2));
  const orderedProjects = [...projectGroups.entries()]
    .sort(([left], [right]) => sha256('split:' + left).localeCompare(sha256('split:' + right)));
  let developmentCount = 0;
  const projectAssignments: Record<string, 'development' | 'test'> = {};
  for (const [project, group] of orderedProjects) {
    const development = developmentCount < developmentTarget
      && Math.abs(developmentTarget - developmentCount - group.length) <= Math.abs(developmentTarget - developmentCount);
    projectAssignments[project] = development ? 'development' : 'test';
    if (development) developmentCount += group.length;
    group.forEach((bundleCase) => { bundleCase.split = projectAssignments[project]; });
  }
  if (bundles.length && !Object.values(projectAssignments).includes('development')) {
    const project = orderedProjects[0][0];
    projectAssignments[project] = 'development';
    projectGroups.get(project)?.forEach((bundleCase) => { bundleCase.split = 'development'; });
  }
  await writeJsonl(options.bundleOutputPath, bundles);
  await writeJsonl(options.annotationOutputPath, annotationInputs);
  await writeCsv(options.statusOutputPath,
    ['case_id', 'project', 'status', 'reason', 'view_template', 'mapping_mode', 'constraints'],
    statuses.map((status) => ({
      case_id: status.caseId,
      project: status.project,
      status: status.status,
      reason: status.reason,
      view_template: status.viewTemplate ?? '',
      mapping_mode: status.mappingMode ?? '',
      constraints: status.constraints ?? '',
    })));
  await writeJsonFile(options.splitsOutputPath, {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    strategy: 'project-grouped-development-test-after-successful-build',
    provisional: false,
    target: options.target,
    built: bundles.length,
    projectAssignments,
    development: bundles.filter((entry) => entry.split === 'development').map((entry) => entry.caseId),
    test: bundles.filter((entry) => entry.split === 'test').map((entry) => entry.caseId),
  });
  return { bundles, annotationInputs, statuses };
}
