import * as fs from 'fs/promises';
import * as path from 'path';
import { parseSymFile, parseConstraintsFile, type SymEntry } from '../utils/symbolParser.js';
import { normalizeConstraints } from '../utils/constraintNormalizer.js';
import type { ConstraintObject } from '../../types/constraint.js';
import type {
  ConstraintIndexData,
  IndexMetadata,
  SignalRef,
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
  if (entry.witness >= 0) {
    return 'intermediate';
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
  async buildIndex(symPath: string, constraintsJsonPath: string): Promise<{
    index: ConstraintIndexData;
    symEntries: SymEntry[];
    constraints: ConstraintObject[];
  }> {
    const symEntries = await parseSymFile(symPath);
    const constraints = await parseConstraintsFile(constraintsJsonPath);

    const signalToConstraints = new Map<number, Set<number>>();
    const constraintToSignals = new Map<number, Set<number>>();
    const signalToName = new Map<number, string>();
    const nameToSignal = new Map<string, number>();
    const componentToSignals = new Map<string, Set<number>>();
    const signalToComponent = new Map<number, string>();
    const signalClassification = new Map<number, 'input' | 'output' | 'intermediate'>();

    for (const entry of symEntries) {
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

    const arrayFamilyMap = new Map<string, Map<number, number[]>>();
    for (const entry of symEntries) {
      const family = detectArrayFamily(entry.name);
      if (family) {
        if (!arrayFamilyMap.has(family.baseName)) {
          arrayFamilyMap.set(family.baseName, new Map());
        }
        const fam = arrayFamilyMap.get(family.baseName)!;
        if (!fam.has(family.arrayIndex)) {
          fam.set(family.arrayIndex, []);
        }
        fam.get(family.arrayIndex)!.push(entry.index);
      }
    }

    const arrayFamilies: ArrayFamily[] = [];
    for (const [baseName, indexMap] of arrayFamilyMap) {
      const indices = Array.from(indexMap.keys()).sort((a, b) => a - b);
      const signalIndices = indices.flatMap(i => indexMap.get(i) || []);
      arrayFamilies.push({ baseName, indices, signalIndices });
    }

    const index: ConstraintIndexData = {
      signalToConstraints: Object.fromEntries(
        Array.from(signalToConstraints.entries()).map(([k, v]) => [k, Array.from(v)])
      ),
      constraintToSignals: Object.fromEntries(
        Array.from(constraintToSignals.entries()).map(([k, v]) => [k, Array.from(v)])
      ),
      signalToName: Object.fromEntries(signalToName),
      nameToSignal: Object.fromEntries(nameToSignal),
      componentToSignals: Object.fromEntries(
        Array.from(componentToSignals.entries()).map(([k, v]) => [k, Array.from(v)])
      ),
      signalToComponent: Object.fromEntries(signalToComponent),
      arrayFamilies,
      signalClassification: Object.fromEntries(signalClassification),
      totalSignals: symEntries.length,
      totalConstraints: constraints.length,
    };

    return { index, symEntries, constraints };
  }

  async buildAndCache(symPath: string, constraintsJsonPath: string): Promise<{
    index: ConstraintIndexData;
    symEntries: SymEntry[];
    constraints: ConstraintObject[];
    cachePath: string;
  }> {
    const wrapperDir = path.dirname(path.dirname(symPath));
    const cachePath = path.join(wrapperDir, 'index.json');

    try {
      const cached = await fs.readFile(cachePath, 'utf-8');
      const parsed = JSON.parse(cached);
      const symEntries = await parseSymFile(symPath);
      const constraints = await parseConstraintsFile(constraintsJsonPath);
      return {
        index: parsed as ConstraintIndexData,
        symEntries,
        constraints,
        cachePath,
      };
    } catch {
      const result = await this.buildIndex(symPath, constraintsJsonPath);
      await fs.writeFile(cachePath, JSON.stringify(result.index, null, 2), 'utf-8');
      return { ...result, cachePath };
    }
  }

  getComponentGroups(index: ConstraintIndexData): ComponentGroup[] {
    const groups: ComponentGroup[] = [];
    const constraintSignalSet = new Map<string, Set<number>>();

    for (const [, sigs] of Object.entries(index.constraintToSignals)) {
      for (const sigIdx of sigs) {
        const comp = index.signalToComponent[sigIdx];
        if (!constraintSignalSet.has(comp)) {
          constraintSignalSet.set(comp, new Set());
        }
        constraintSignalSet.get(comp)!.add(sigIdx);
      }
    }

    for (const [prefix, sigIndices] of Object.entries(index.componentToSignals)) {
      let inputCount = 0;
      let outputCount = 0;
      let intermediateCount = 0;
      for (const si of sigIndices) {
        const cls = index.signalClassification[si] || 'intermediate';
        if (cls === 'input') inputCount++;
        else if (cls === 'output') outputCount++;
        else intermediateCount++;
      }

      const constrainedSignals = constraintSignalSet.get(prefix);
      groups.push({
        prefix,
        signalCount: sigIndices.length,
        constraintCount: constrainedSignals ? constrainedSignals.size : 0,
        inputCount,
        outputCount,
        intermediateCount,
      });
    }

    return groups.sort((a, b) => a.prefix.localeCompare(b.prefix));
  }

  getBoundarySignals(index: ConstraintIndexData): SignalRef[] {
    const signals: SignalRef[] = [];
    const topLevelSignals = index.componentToSignals['main'] || [];

    for (const sigIdx of topLevelSignals) {
      signals.push({
        index: sigIdx,
        name: index.signalToName[sigIdx] || `s_${sigIdx}`,
        witness: 0,
        component: 'main',
        classification: index.signalClassification[sigIdx] || 'intermediate',
      });
    }

    const directChildPrefixes = new Set<string>();
    for (const prefix of Object.keys(index.componentToSignals)) {
      if (prefix === 'main') continue;
      const parts = prefix.split('.');
      if (parts.length === 2) {
        directChildPrefixes.add(prefix);
      }
    }

    for (const childPrefix of directChildPrefixes) {
      const childSignals = index.componentToSignals[childPrefix] || [];
      const childCompName = childPrefix.split('.').pop() || '';

      for (const sigIdx of childSignals) {
        const name = index.signalToName[sigIdx] || `s_${sigIdx}`;
        const shortName = name.split('.').pop() || '';
        if (shortName.startsWith('out') || shortName === 'output' || shortName === 'result') {
          signals.push({
            index: sigIdx,
            name,
            witness: 0,
            component: childPrefix,
            classification: index.signalClassification[sigIdx] || 'intermediate',
          });
        }
      }

      const mainSignals = index.componentToSignals['main'] || [];
      for (const sigIdx of mainSignals) {
        const name = index.signalToName[sigIdx] || `s_${sigIdx}`;
        if (name.includes(`.${childCompName}.`) || name.includes(`.${childCompName}[`)) {
          const alreadyExists = signals.some(s => s.index === sigIdx);
          if (!alreadyExists) {
            signals.push({
              index: sigIdx,
              name,
              witness: 0,
              component: 'main',
              classification: index.signalClassification[sigIdx] || 'intermediate',
            });
          }
        }
      }
    }

    return signals;
  }
}
