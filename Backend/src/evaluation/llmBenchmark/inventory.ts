import { promises as fs } from 'fs';
import path from 'path';
import { BENCHMARK_SCHEMA_VERSION } from './types.js';
import type { PendingBenchmarkCase } from './types.js';
import { readJsonFile, sha256, writeCsv, writeJsonFile, writeJsonl } from './io.js';

type UnknownRecord = Record<string, unknown>;

export interface InventoryCandidate {
  caseId: string;
  project: string;
  projectCommit: string;
  bugFamily: string;
  vulnerableFile: string;
  vulnerableLines: string;
  selectedTemplate: string;
  directEntrypoint: string;
  codebasePath: string;
  codebasePresent: boolean;
  fixAvailable: boolean;
  compiledDirect: boolean;
  compiledOriginal: boolean;
  executed: boolean;
  directWrapperPresent: boolean;
  metadataEligible: boolean;
  exclusionReasons: string[];
  similarBugs: string[];
  dedupGroupId: string;
  selectionStatus: 'metadata-selected' | 'reserve' | 'duplicate' | 'ineligible';
  split?: 'development' | 'test';
  configPath: string;
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

function bool(value: unknown): boolean {
  return value === true;
}

async function findFiles(root: string, name: string): Promise<string[]> {
  const files: string[] = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop()!;
    let entries: import('fs').Dirent[] = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const resolved = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(resolved);
      else if (entry.isFile() && entry.name === name) files.push(resolved);
    }
  }
  return files.sort();
}

function canonicalId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '/').replace(/^\/+|\/+$/g, '');
}

function projectId(value: unknown): string {
  const raw = text(value).replace(/\.git$/, '').replace(/\/$/, '');
  try {
    const parsed = new URL(raw);
    return parsed.pathname.replace(/^\/+|\/+$/g, '') || raw;
  } catch {
    return raw;
  }
}

async function loadCandidate(configPath: string, zkbugsRoot: string): Promise<InventoryCandidate> {
  const config = await readJsonFile<UnknownRecord>(configPath);
  const firstEntry = Object.values(config)[0];
  const value = record(firstEntry);
  const location = record(value.Location);
  const caseDir = path.dirname(configPath);
  const caseId = text(value.Id) || path.relative(path.join(zkbugsRoot, 'dataset', 'circom'), caseDir);
  const project = projectId(value.Project);
  const directEntrypoint = text(value['Direct Entrypoint']);
  const directPath = directEntrypoint ? path.join(caseDir, directEntrypoint) : '';
  const codebasePath = text(value.Codebase);
  const absoluteCodebase = codebasePath ? path.resolve(zkbugsRoot, codebasePath) : '';
  const selectedTemplate = text(location.Function);
  const vulnerability = text(value.Vulnerability) || 'Unknown';
  const rootCause = text(value['Root Cause']);
  const exclusionReasons: string[] = [];
  const directWrapperPresent = Boolean(directPath) && await fs.access(directPath).then(() => true, () => false);
  const codebasePresent = Boolean(absoluteCodebase) && await fs.access(absoluteCodebase).then(() => true, () => false);
  const compiledDirect = bool(value['Compiled Direct']);
  const compiledOriginal = bool(value['Compiled Original']);

  if (!project) exclusionReasons.push('missing-project');
  if (!text(value.Commit)) exclusionReasons.push('missing-project-commit');
  if (!text(location.Path)) exclusionReasons.push('missing-vulnerable-file');
  if (!text(location.Line)) exclusionReasons.push('missing-vulnerable-lines');
  if (!selectedTemplate) exclusionReasons.push('missing-vulnerable-template');
  if (!directEntrypoint || !directWrapperPresent) exclusionReasons.push('missing-direct-wrapper');
  if (!compiledDirect) exclusionReasons.push('direct-not-marked-compiled');

  const similarBugs = Array.isArray(value['Similar Bugs'])
    ? value['Similar Bugs'].map(text).filter(Boolean)
    : [];

  return {
    caseId,
    project,
    projectCommit: text(value.Commit),
    bugFamily: rootCause ? `${vulnerability} / ${rootCause}` : vulnerability,
    vulnerableFile: text(location.Path),
    vulnerableLines: text(location.Line),
    selectedTemplate,
    directEntrypoint,
    codebasePath,
    codebasePresent,
    fixAvailable: Boolean(text(value['Fix Commit'])),
    compiledDirect,
    compiledOriginal,
    executed: bool(value.Executed),
    directWrapperPresent,
    metadataEligible: exclusionReasons.length === 0,
    exclusionReasons,
    similarBugs,
    dedupGroupId: canonicalId(caseId),
    selectionStatus: exclusionReasons.length ? 'ineligible' : 'reserve',
    configPath: path.relative(zkbugsRoot, configPath),
  };
}

function applyDedupGroups(candidates: InventoryCandidate[]): void {
  for (const candidate of candidates) {
    const exactBugKey = [
      canonicalId(candidate.project),
      canonicalId(candidate.vulnerableFile),
      canonicalId(candidate.selectedTemplate),
      canonicalId(candidate.vulnerableLines),
      canonicalId(candidate.bugFamily),
    ].join('|');
    candidate.dedupGroupId = 'dedup:' + sha256(exactBugKey).slice(0, 12);
  }
}

function selectCandidates(candidates: InventoryCandidate[], target: number): InventoryCandidate[] {
  const eligible = candidates.filter((candidate) => candidate.metadataEligible);
  const representatives = new Map<string, InventoryCandidate>();
  for (const candidate of eligible) {
    const current = representatives.get(candidate.dedupGroupId);
    const score = (item: InventoryCandidate) => Number(item.executed) * 4 + Number(item.fixAvailable) * 2 + Number(item.compiledOriginal);
    if (!current || score(candidate) > score(current) || (score(candidate) === score(current) && candidate.caseId < current.caseId)) {
      representatives.set(candidate.dedupGroupId, candidate);
    }
  }

  for (const candidate of eligible) {
    if (representatives.get(candidate.dedupGroupId) !== candidate) candidate.selectionStatus = 'duplicate';
  }

  const byProject = new Map<string, InventoryCandidate[]>();
  for (const candidate of representatives.values()) {
    const bucket = byProject.get(candidate.project) ?? [];
    bucket.push(candidate);
    byProject.set(candidate.project, bucket);
  }
  const projectOrder = [...byProject.keys()].sort((left, right) => sha256(left).localeCompare(sha256(right)));
  for (const bucket of byProject.values()) {
    bucket.sort((left, right) =>
      left.bugFamily.localeCompare(right.bugFamily) || sha256(left.caseId).localeCompare(sha256(right.caseId)));
  }

  const selected: InventoryCandidate[] = [];
  let round = 0;
  while (selected.length < target) {
    let added = false;
    for (const project of projectOrder) {
      const candidate = byProject.get(project)?.[round];
      if (!candidate) continue;
      candidate.selectionStatus = 'metadata-selected';
      selected.push(candidate);
      added = true;
      if (selected.length >= target) break;
    }
    if (!added) break;
    round += 1;
  }
  return selected;
}

function assignSplits(selected: InventoryCandidate[], developmentRatio = 0.2): Record<string, 'development' | 'test'> {
  const projects = new Map<string, InventoryCandidate[]>();
  selected.forEach((candidate) => {
    const bucket = projects.get(candidate.project) ?? [];
    bucket.push(candidate);
    projects.set(candidate.project, bucket);
  });
  const ordered = [...projects.entries()].sort(([left], [right]) => sha256('split:' + left).localeCompare(sha256('split:' + right)));
  const developmentTarget = Math.max(1, Math.round(selected.length * developmentRatio));
  const assignments: Record<string, 'development' | 'test'> = {};
  let developmentCount = 0;
  for (const [project, cases] of ordered) {
    const useDevelopment = developmentCount < developmentTarget
      && Math.abs(developmentTarget - (developmentCount + cases.length)) <= Math.abs(developmentTarget - developmentCount);
    assignments[project] = useDevelopment ? 'development' : 'test';
    if (useDevelopment) developmentCount += cases.length;
  }
  if (!Object.values(assignments).includes('development') && ordered[0]) assignments[ordered[0][0]] = 'development';
  selected.forEach((candidate) => { candidate.split = assignments[candidate.project]; });
  return assignments;
}

export async function generateInventory(options: {
  zkbugsRoot: string;
  outputDir: string;
  target: number;
}): Promise<{ candidates: InventoryCandidate[]; selected: InventoryCandidate[] }> {
  const circomRoot = path.join(options.zkbugsRoot, 'dataset', 'circom');
  const configPaths = await findFiles(circomRoot, 'zkbugs_config.json');
  const candidates = await Promise.all(configPaths.map((configPath) => loadCandidate(configPath, options.zkbugsRoot)));
  applyDedupGroups(candidates);
  const selected = selectCandidates(candidates, options.target);
  const projectSplits = assignSplits(selected);

  const selectedIds = new Set(selected.map((candidate) => candidate.caseId));
  const reserves = candidates
    .filter((candidate) => candidate.metadataEligible && candidate.selectionStatus === 'reserve')
    .sort((left, right) => sha256('reserve:' + left.caseId).localeCompare(sha256('reserve:' + right.caseId)));
  const buildPool = [...selected, ...reserves];
  const pendingCases: PendingBenchmarkCase[] = buildPool.map((candidate, selectionPriority) => ({
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    status: 'pending-bundle',
    caseId: candidate.caseId,
    project: candidate.project,
    projectCommit: candidate.projectCommit,
    bugFamily: candidate.bugFamily,
    vulnerableFile: candidate.vulnerableFile,
    vulnerableLines: candidate.vulnerableLines,
    selectedTemplate: candidate.selectedTemplate,
    split: candidate.split,
    dedupGroupId: candidate.dedupGroupId,
    directEntrypoint: candidate.directEntrypoint,
    codebasePath: candidate.codebasePath,
    configPath: candidate.configPath,
    inventorySelection: selectedIds.has(candidate.caseId) ? 'metadata-selected' : 'reserve',
    selectionPriority,
    pendingReason: candidate.codebasePresent
      ? 'partial-debugging-bundle-not-generated'
      : 'pinned-upstream-codebase-not-downloaded',
  }));

  const headers = [
    'case_id', 'project', 'project_commit', 'bug_family', 'vulnerable_file',
    'vulnerable_lines', 'selected_template', 'direct_entrypoint', 'fix_available',
    'compiled_direct', 'compiled_original', 'executed', 'codebase_present',
    'dedup_group_id', 'selection_status', 'split', 'exclusion_reasons', 'config_path',
  ];
  await writeCsv(path.join(options.outputDir, 'candidates.csv'), headers, candidates.map((candidate) => ({
    case_id: candidate.caseId,
    project: candidate.project,
    project_commit: candidate.projectCommit,
    bug_family: candidate.bugFamily,
    vulnerable_file: candidate.vulnerableFile,
    vulnerable_lines: candidate.vulnerableLines,
    selected_template: candidate.selectedTemplate,
    direct_entrypoint: candidate.directEntrypoint,
    fix_available: candidate.fixAvailable,
    compiled_direct: candidate.compiledDirect,
    compiled_original: candidate.compiledOriginal,
    executed: candidate.executed,
    codebase_present: candidate.codebasePresent,
    dedup_group_id: candidate.dedupGroupId,
    selection_status: candidate.selectionStatus,
    split: candidate.split ?? '',
    exclusion_reasons: candidate.exclusionReasons,
    config_path: candidate.configPath,
  })));
  await writeJsonl(path.join(options.outputDir, 'cases.jsonl'), pendingCases);
  await writeJsonFile(path.join(options.outputDir, 'splits.json'), {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    strategy: 'project-grouped-development-test',
    projectAssignments: projectSplits,
    development: selected.filter((candidate) => candidate.split === 'development').map((candidate) => candidate.caseId),
    test: selected.filter((candidate) => candidate.split === 'test').map((candidate) => candidate.caseId),
    provisional: true,
    note: 'Rewritten from successfully built cases by the build command.',
  });
  return { candidates, selected };
}
