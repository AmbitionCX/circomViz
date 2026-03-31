import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { parseSymFile, parseConstraintsFile, type SymEntry } from '../utils/symbolParser.js';
import { normalizeConstraints } from '../utils/constraintNormalizer.js';
import type { ConstraintObject } from '../../types/constraint.js';
import type {
  ConstraintIndexData,
  IndexMetadata,
  ComponentGroup,
  ArrayFamily,
} from '../../types/slicerTypes.js';

function extractComponentPath(signalName: string): string {
  const parts = signalName.split('.');
  if (parts.length <= 1) return 'main';
  return parts.slice(0, -1).join('.');
}

function detectArrayFamily(name: string): { baseName: string; arrayIndex: number } | null {
  const match = name.match(/^(.+)\[(\d+)\]$/);
  if (match) {
    return { baseName: match[1], arrayIndex: parseInt(match[2]) };
  }
  return null;
}

function classifySignal(
  entry: SymEntry,
  inputNames: Set<string>,
  outputNames: Set<string>
): 'input' | 'output' | 'intermediate' {
  const shortName = entry.name.split('.').pop() || '';
  const plainName = shortName.replace(/\[\d+\]$/, '');
  const fullLastPart = entry.name.includes('.') ? entry.name.split('.').slice(-2).join('.') : entry.name;

  if (inputNames.has(entry.name) || inputNames.has(plainName) || inputNames.has(fullLastPart)) {
    return 'input';
  }
  if (outputNames.has(entry.name) || outputNames.has(plainName) || outputNames.has(fullLastPart)) {
    return 'output';
  }
  return 'intermediate';
}

function buildInputOutputNames(symEntries: SymEntry[]): { inputNames: Set<string>; outputNames: Set<string> } {
  const inputNames = new Set<string>();
  const outputNames = new Set<string>();

  const mainSignals = symEntries.filter(e => {
    const parts = e.name.split('.');
    return parts.length === 2 && parts[0] === 'main';
  });

  for (const sig of mainSignals) {
    const name = sig.name.replace('main.', '');
    if (sig.witness >= 0) {
      if (name.startsWith('out') || name.startsWith('output') || name.startsWith('result') ||
          name.startsWith('hash') || name.startsWith('digest') || name.startsWith('commit') ||
          name.startsWith('nullifier') || name.startsWith('root')) {
        outputNames.add(sig.name);
        outputNames.add(name);
      } else {
        inputNames.add(sig.name);
        inputNames.add(name);
      }
    }
  }

  return { inputNames, outputNames };
}

export class ConstraintIndexer {
  async buildIndex(
    symPath: string,
    constraintsJsonPath: string
  ): Promise<{ index: ConstraintIndexData; symEntries: SymEntry[]; constraints: ConstraintObject[] }> {
    const startTime = performance.now();
    const symEntries = await parseSymFile(symPath);
    const constraints = await parseConstraintsFile(constraintsJsonPath);
    const { invariants } = normalizeConstraints(constraints, symEntries);

    const signalToConstraints = new Map<number, Set<number>>();
    const constraintToSignals = new Map<number, Set<number>>();
    const signalToName = new Map<number, string>();
    const nameToSignal = new Map<string, number>();
    const componentToSignals = new Map<string, Set<number>>();
    const signalToComponent = new Map<number, string>();
    const signalClassification = new Map<number, 'input' | 'output' | 'intermediate'>();

    for (const entry of symEntries) {
      if (entry.index === 0) continue;
      signalToName.set(entry.index, entry.name);
      nameToSignal.set(entry.name, entry.index);

      const compPath = extractComponentPath(entry.name);
      if (!componentToSignals.has(compPath)) {
        componentToSignals.set(compPath, new Set());
      }
      componentToSignals.get(compPath)!.add(entry.index);
      signalToComponent.set(entry.index, compPath);
    }

    for (let ci = 0; ci < constraints.length; ci++) {
      const sigs = new Set<number>();
      const [a, b, c] = constraints[ci];
      for (const expr of [a, b, c]) {
        for (const key of Object.keys(expr)) {
          if (key === '0' || key === '1') continue;
          const idx = parseInt(key);
          sigs.add(idx);
          if (!signalToConstraints.has(idx)) {
            signalToConstraints.set(idx, new Set());
          }
          signalToConstraints.get(idx)!.add(ci);
        }
      }
      constraintToSignals.set(ci, sigs);
    }

    const { inputNames, outputNames } = buildInputOutputNames(symEntries);
    for (const entry of symEntries) {
      signalClassification.set(entry.index, classifySignal(entry, inputNames, outputNames));
    }

    const arrayFamilies = buildArrayFamilies(symEntries);

    const { componentGroups, maxComponentDepth } = buildComponentGroups(
      componentToSignals,
      signalToConstraints,
      invariants,
      signalClassification
    );

    let inputCount = 0;
    let outputCount = 0;
    for (const cls of signalClassification.values()) {
      if (cls === 'input') inputCount++;
      else if (cls === 'output') outputCount++;
    }

    const buildTimeMs = performance.now() - startTime;
    const metadata: IndexMetadata = {
      signalCount: signalToName.size,
      constraintCount: constraints.length,
      componentCount: componentGroups.length,
      arrayFamilyCount: arrayFamilies.length,
      inputCount,
      outputCount,
      intermediateCount: signalToName.size - inputCount - outputCount,
      maxComponentDepth,
      componentGroups,
      buildTimeMs,
    };

    const index: ConstraintIndexData = {
      signalToConstraints: serializeMapOfSets(signalToConstraints),
      constraintToSignals: serializeMapOfSets(constraintToSignals),
      signalToName: Object.fromEntries(signalToName),
      nameToSignal: Object.fromEntries(nameToSignal),
      componentToSignals: serializeMapOfSets(componentToSignals),
      signalToComponent: Object.fromEntries(signalToComponent),
      arrayFamilies,
      signalClassification: Object.fromEntries(signalClassification),
      metadata,
    };

    return { index, symEntries, constraints };
  }

  async loadOrBuild(
    symPath: string,
    constraintsJsonPath: string
  ): Promise<{ index: ConstraintIndexData; symEntries: SymEntry[]; constraints: ConstraintObject[]; cachePath: string }> {
    const cachePath = join(dirname(symPath), 'constraint_index.json');

    try {
      const cached = await fs.readFile(cachePath, 'utf-8');
      const parsed = JSON.parse(cached) as ConstraintIndexData;
      if (parsed.metadata && parsed.signalToConstraints && parsed.constraintToSignals) {
        const symEntries = await parseSymFile(symPath);
        const constraints = await parseConstraintsFile(constraintsJsonPath);
        return { index: parsed, symEntries, constraints, cachePath };
      }
    } catch {
      // cache miss or invalid, rebuild
    }

    const result = await this.buildIndex(symPath, constraintsJsonPath);
    await fs.writeFile(cachePath, JSON.stringify(result.index), 'utf-8');
    return { ...result, cachePath };
  }
}

function buildArrayFamilies(symEntries: SymEntry[]): ArrayFamily[] {
  const familyMap = new Map<string, { indices: number[]; signalIndices: number[] }>();

  for (const entry of symEntries) {
    const family = detectArrayFamily(entry.name);
    if (family) {
      if (!familyMap.has(family.baseName)) {
        familyMap.set(family.baseName, { indices: [], signalIndices: [] });
      }
      const fam = familyMap.get(family.baseName)!;
      fam.indices.push(family.arrayIndex);
      fam.signalIndices.push(entry.index);
    }
  }

  const families: ArrayFamily[] = [];
  for (const [baseName, fam] of familyMap) {
    if (fam.signalIndices.length > 1) {
      families.push({
        baseName,
        indices: fam.indices.sort((a, b) => a - b),
        signalIndices: fam.signalIndices.sort((a, b) => a - b),
      });
    }
  }
  return families;
}

function buildComponentGroups(
  componentToSignals: Map<string, Set<number>>,
  signalToConstraints: Map<number, Set<number>>,
  invariants: Array<{ kind: string }>,
  signalClassification: Map<number, 'input' | 'output' | 'intermediate'>
): { componentGroups: ComponentGroup[]; maxComponentDepth: number } {
  const groups: ComponentGroup[] = [];
  let maxDepth = 1;

  const parentToChildren = new Map<string, string[]>();
  const allPrefixes = Array.from(componentToSignals.keys()).sort();

  for (const prefix of allPrefixes) {
    const depth = prefix.split('.').length - 1;
    if (depth > maxDepth) maxDepth = depth;

    if (depth >= 2) {
      const parent = prefix.split('.').slice(0, depth).join('.');
      if (!parentToChildren.has(parent)) {
        parentToChildren.set(parent, []);
      }
      parentToChildren.get(parent)!.push(prefix);
    }
  }

  for (const prefix of allPrefixes) {
    if (prefix === 'main') continue;

    const sigSet = componentToSignals.get(prefix)!;
    const constraintSet = new Set<number>();
    let inputCount = 0;
    let outputCount = 0;
    let intermediateCount = 0;

    for (const sigIdx of sigSet) {
      const cls = signalClassification.get(sigIdx) || 'intermediate';
      if (cls === 'input') inputCount++;
      else if (cls === 'output') outputCount++;
      else intermediateCount++;

      const cSet = signalToConstraints.get(sigIdx);
      if (cSet) {
        for (const ci of cSet) constraintSet.add(ci);
      }
    }

    const kindCounts: Record<string, number> = {};
    for (const ci of constraintSet) {
      if (ci < invariants.length) {
        const kind = invariants[ci].kind;
        kindCounts[kind] = (kindCounts[kind] || 0) + 1;
      }
    }

    const children = parentToChildren.get(prefix) || [];

    groups.push({
      prefix,
      signalCount: sigSet.size,
      constraintCount: constraintSet.size,
      inputCount,
      outputCount,
      intermediateCount,
      kindCounts,
      childComponents: children,
    });
  }

  return { componentGroups: groups, maxComponentDepth: maxDepth };
}

function serializeMapOfSets<K extends number | string>(m: Map<K, Set<number>>): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  for (const [key, set] of m) {
    result[String(key)] = Array.from(set).sort((a, b) => a - b);
  }
  return result;
}
