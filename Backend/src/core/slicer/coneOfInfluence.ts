import { parseSymFile, parseConstraintsFile, resolveConstraintsWithNames } from '../utils/symbolParser.js';
import { normalizeConstraints } from '../utils/constraintNormalizer.js';
import type { SymEntry } from '../utils/symbolParser.js';
import type { ConstraintObject } from '../../types/constraint.js';
import type {
  ConstraintIndexData,
  SliceResult,
  ResolvedSliceConstraint,
  ComponentGroup,
  SignalRef,
  SliceDirection,
  SliceCandidate,
} from '../../types/slicerTypes.js';

export class ConeOfInfluenceSlicer {
  private index: ConstraintIndexData;

  constructor(index: ConstraintIndexData) {
    this.index = index;
  }

  backwardSlice(targetSignalNames: string[], maxDepth?: number): SliceResult {
    const targetIndices = this.resolveSignalNames(targetSignalNames);
    const { visitedSignals, visitedConstraints, depthReached } = this.traverseBackward(targetIndices, maxDepth);

    return this.buildResult(visitedSignals, visitedConstraints, targetSignalNames, depthReached);
  }

  forwardSlice(sourceSignalNames: string[], maxDepth?: number): SliceResult {
    const sourceIndices = this.resolveSignalNames(sourceSignalNames);
    const { visitedSignals, visitedConstraints, depthReached } = this.traverseForward(sourceIndices, maxDepth);

    return this.buildResult(visitedSignals, visitedConstraints, sourceSignalNames, depthReached);
  }

  bidirectionalSlice(
    sourceSignalNames: string[],
    targetSignalNames: string[],
    maxDepth?: number
  ): SliceResult {
    const sourceIndices = this.resolveSignalNames(sourceSignalNames);
    const targetIndices = this.resolveSignalNames(targetSignalNames);

    const forwardResult = this.traverseForward(sourceIndices, maxDepth);
    const backwardResult = this.traverseBackward(targetIndices, maxDepth);

    const intersectSignals = new Set<number>();
    for (const s of forwardResult.visitedSignals) {
      if (backwardResult.visitedSignals.has(s)) {
        intersectSignals.add(s);
      }
    }

    const intersectConstraints = new Set<number>();
    for (const c of forwardResult.visitedConstraints) {
      if (backwardResult.visitedConstraints.has(c)) {
        intersectConstraints.add(c);
      }
    }

    return this.buildResult(
      intersectSignals,
      intersectConstraints,
      [...sourceSignalNames, ...targetSignalNames],
      Math.max(forwardResult.depthReached, backwardResult.depthReached)
    );
  }

  slice(request: SliceDirection, targetSignals: string[], sourceSignals?: string[], maxDepth?: number): SliceResult {
    switch (request) {
      case 'backward':
        return this.backwardSlice(targetSignals, maxDepth);
      case 'forward':
        return sourceSignals && sourceSignals.length > 0
          ? this.forwardSlice(sourceSignals, maxDepth)
          : this.backwardSlice(targetSignals, maxDepth);
      case 'bidirectional':
        return sourceSignals && sourceSignals.length > 0
          ? this.bidirectionalSlice(sourceSignals, targetSignals, maxDepth)
          : this.backwardSlice(targetSignals, maxDepth);
      default:
        return this.backwardSlice(targetSignals, maxDepth);
    }
  }

  private traverseBackward(
    startIndices: number[],
    maxDepth?: number
  ): { visitedSignals: Set<number>; visitedConstraints: Set<number>; depthReached: number } {
    const visitedSignals = new Set<number>();
    const visitedConstraints = new Set<number>();
    const worklist: Array<{ signal: number; depth: number }> = [];
    let depthReached = 0;

    for (const idx of startIndices) {
      if (!visitedSignals.has(idx)) {
        worklist.push({ signal: idx, depth: 0 });
      }
    }

    while (worklist.length > 0) {
      const { signal, depth } = worklist.shift()!;
      if (maxDepth !== undefined && depth > maxDepth) continue;
      if (depth > depthReached) depthReached = depth;
      if (visitedSignals.has(signal)) continue;
      visitedSignals.add(signal);

      const constraintIndices = this.index.signalToConstraints[signal];
      if (!constraintIndices) continue;

      for (const ci of constraintIndices) {
        visitedConstraints.add(ci);
        const depSignals = this.index.constraintToSignals[ci];
        if (!depSignals) continue;
        for (const depIdx of depSignals) {
          if (!visitedSignals.has(depIdx)) {
            worklist.push({ signal: depIdx, depth: depth + 1 });
          }
        }
      }
    }

    return { visitedSignals, visitedConstraints, depthReached };
  }

  private traverseForward(
    startIndices: number[],
    maxDepth?: number
  ): { visitedSignals: Set<number>; visitedConstraints: Set<number>; depthReached: number } {
    const visitedSignals = new Set<number>();
    const visitedConstraints = new Set<number>();
    const worklist: Array<{ signal: number; depth: number }> = [];
    let depthReached = 0;

    for (const idx of startIndices) {
      if (!visitedSignals.has(idx)) {
        worklist.push({ signal: idx, depth: 0 });
      }
    }

    const signalToConstraintsReverse = new Map<number, Set<number>>();
    for (const ciStr of Object.keys(this.index.constraintToSignals)) {
      const ci = parseInt(ciStr);
      const sigs = this.index.constraintToSignals[ci];
      if (!sigs) continue;
      for (const sigIdx of sigs) {
        if (!signalToConstraintsReverse.has(sigIdx)) {
          signalToConstraintsReverse.set(sigIdx, new Set());
        }
        signalToConstraintsReverse.get(sigIdx)!.add(ci);
      }
    }

    while (worklist.length > 0) {
      const { signal, depth } = worklist.shift()!;
      if (maxDepth !== undefined && depth > maxDepth) continue;
      if (depth > depthReached) depthReached = depth;
      if (visitedSignals.has(signal)) continue;
      visitedSignals.add(signal);

      const constraintIndices = signalToConstraintsReverse.get(signal);
      if (!constraintIndices) continue;

      for (const ci of constraintIndices) {
        visitedConstraints.add(ci);
        const depSignals = this.index.constraintToSignals[ci];
        if (!depSignals) continue;
        for (const depIdx of depSignals) {
          if (!visitedSignals.has(depIdx)) {
            worklist.push({ signal: depIdx, depth: depth + 1 });
          }
        }
      }
    }

    return { visitedSignals, visitedConstraints, depthReached };
  }

  private resolveSignalNames(names: string[]): number[] {
    const indices: number[] = [];
    for (const name of names) {
      const trimmed = name.trim();

      if (this.index.nameToSignal[trimmed] !== undefined) {
        indices.push(this.index.nameToSignal[trimmed]);
        continue;
      }

      if (this.index.nameToSignal[`main.${trimmed}`] !== undefined) {
        indices.push(this.index.nameToSignal[`main.${trimmed}`]);
        continue;
      }

      const matchingKeys = Object.keys(this.index.nameToSignal).filter(k => {
        const shortName = k.split('.').pop() || '';
        return shortName === trimmed || k.endsWith(`.${trimmed}`);
      });

      if (matchingKeys.length === 1) {
        indices.push(this.index.nameToSignal[matchingKeys[0]]);
      } else if (matchingKeys.length > 1) {
        indices.push(...matchingKeys.map(k => this.index.nameToSignal[k]));
      }
    }

    return [...new Set(indices)];
  }

  private buildResult(
    visitedSignals: Set<number>,
    visitedConstraints: Set<number>,
    targetSignalNames: string[],
    _depthReached: number
  ): SliceResult {
    const signalIndices = Array.from(visitedSignals).sort((a, b) => a - b);
    const constraintIndices = Array.from(visitedConstraints).sort((a, b) => a - b);

    const componentSliceGroups = this.buildSliceComponentGroups(visitedSignals, visitedConstraints);

    const signals: SignalRef[] = signalIndices.map(idx => ({
      index: idx,
      name: this.index.signalToName[idx] || `s_${idx}`,
      witness: -1,
      component: this.index.signalToComponent[idx] || 'unknown',
      classification: this.index.signalClassification[idx] || 'intermediate',
    }));

    return {
      constraintIndices,
      signalIndices,
      constraintCount: constraintIndices.length,
      signalCount: signalIndices.length,
      resolvedConstraints: [],
      componentGroups: componentSliceGroups,
      signals,
    };
  }

  private buildSliceComponentGroups(
    visitedSignals: Set<number>,
    visitedConstraints: Set<number>
  ): ComponentGroup[] {
    const sliceComponents = new Map<string, Set<number>>();

    for (const sigIdx of visitedSignals) {
      const comp = this.index.signalToComponent[sigIdx];
      if (comp) {
        if (!sliceComponents.has(comp)) {
          sliceComponents.set(comp, new Set());
        }
        sliceComponents.get(comp)!.add(sigIdx);
      }
    }

    const groups: ComponentGroup[] = [];
    for (const [prefix, sigSet] of sliceComponents) {
      let inputCount = 0;
      let outputCount = 0;
      let intermediateCount = 0;
      const sliceConstraintSet = new Set<number>();

      for (const sigIdx of sigSet) {
        const cls = this.index.signalClassification[sigIdx] || 'intermediate';
        if (cls === 'input') inputCount++;
        else if (cls === 'output') outputCount++;
        else intermediateCount++;

        const cIndices = this.index.signalToConstraints[sigIdx];
        if (cIndices) {
          for (const ci of cIndices) {
            if (visitedConstraints.has(ci)) {
              sliceConstraintSet.add(ci);
            }
          }
        }
      }

      groups.push({
        prefix,
        signalCount: sigSet.size,
        constraintCount: sliceConstraintSet.size,
        inputCount,
        outputCount,
        intermediateCount,
        kindCounts: {},
        childComponents: [],
      });
    }

    return groups.sort((a, b) => a.prefix.localeCompare(b.prefix));
  }
}

export async function sliceWithConstraints(
  index: ConstraintIndexData,
  symEntries: SymEntry[],
  constraints: ConstraintObject[],
  direction: SliceDirection,
  targetSignals: string[],
  sourceSignals?: string[],
  maxDepth?: number
): Promise<SliceResult> {
  const slicer = new ConeOfInfluenceSlicer(index);
  const result = slicer.slice(direction, targetSignals, sourceSignals, maxDepth);

  const constraintSet = new Set(result.constraintIndices);
  const slicedConstraints = constraints.filter((_, idx) => constraintSet.has(idx));
  const resolved = resolveConstraintsWithNames(slicedConstraints, symEntries);
  const { invariants } = normalizeConstraints(slicedConstraints, symEntries);

  const kindCounts: Record<string, number> = {};
  for (const inv of invariants) {
    kindCounts[inv.kind] = (kindCounts[inv.kind] || 0) + 1;
  }

  const resolvedConstraints: ResolvedSliceConstraint[] = resolved.map((rc, i) => ({
    index: rc.index,
    formula: rc.formula,
    signalsUsed: rc.signalsUsed,
    kind: i < invariants.length ? invariants[i].kind : 'unknown',
    component: index.signalToComponent[parseInt(Object.keys(constraints[rc.index][0]).find(k => k !== '0' && k !== '1') || '0')] || 'unknown',
  }));

  return {
    ...result,
    resolvedConstraints,
    componentGroups: result.componentGroups.map(g => ({
      ...g,
      kindCounts: g.prefix === 'all' ? kindCounts : {},
    })),
  };
}

export function generateSliceCandidates(index: ConstraintIndexData): SliceCandidate[] {
  const candidates: SliceCandidate[] = [];

  const signalToName = index.signalToName;
  const classification = index.signalClassification;

  for (const family of index.arrayFamilies) {
    const allOutput = family.signalIndices.every(si => classification[String(si)] === 'output');
    const allInput = family.signalIndices.every(si => classification[String(si)] === 'input');

    if (allOutput && family.signalIndices.length > 0) {
      const names = family.signalIndices.map(si => signalToName[si] || `s_${si}`);
      candidates.push({
        id: `backward_${family.baseName}`,
        name: family.baseName,
        direction: 'backward',
        targetSignals: names,
        sourceSignals: [],
        groupKind: 'output_array',
        signalCount: names.length,
        priority: 1,
      });
    } else if (allInput && family.signalIndices.length > 0) {
      const names = family.signalIndices.map(si => signalToName[si] || `s_${si}`);
      candidates.push({
        id: `forward_${family.baseName}`,
        name: family.baseName,
        direction: 'forward',
        targetSignals: [],
        sourceSignals: names,
        groupKind: 'input_array',
        signalCount: names.length,
        priority: 2,
      });
    }
  }

  for (const group of index.metadata.componentGroups) {
    const sigIndices = index.componentToSignals[group.prefix] || [];
    const outputSignals = sigIndices.filter(si => classification[String(si)] === 'output');
    if (outputSignals.length === 0) continue;

    const outputNames = outputSignals.map(si => signalToName[si] || `s_${si}`);
    candidates.push({
      id: `component_${group.prefix}`,
      name: group.prefix,
      direction: 'bidirectional',
      targetSignals: outputNames,
      sourceSignals: [],
      groupKind: 'component',
      signalCount: outputNames.length,
      priority: 3,
    });
  }

  const heuristicKeywords = ['hash', 'digest', 'commit', 'nullifier', 'reveal', 'valid'];
  const heuristicSignals: string[] = [];
  const heuristicNames: string[] = [];

  for (const [sigIdxStr, name] of Object.entries(signalToName)) {
    const lower = name.toLowerCase();
    if (heuristicKeywords.some(kw => lower.includes(kw))) {
      heuristicSignals.push(sigIdxStr);
      heuristicNames.push(name);
    }
  }

  if (heuristicNames.length > 0) {
    candidates.push({
      id: 'backward_heuristic_crypto',
      name: 'Heuristic crypto signals',
      direction: 'backward',
      targetSignals: heuristicNames,
      sourceSignals: [],
      groupKind: 'heuristic',
      signalCount: heuristicNames.length,
      priority: 4,
    });
  }

  const sigKeys = Object.keys(signalToName);
  for (const key of sigKeys) {
    const name = signalToName[key];
    if (!name) continue;
    const cls = classification[key];
    if (cls === 'output') {
      candidates.push({
        id: `backward_single_${name}`,
        name,
        direction: 'backward',
        targetSignals: [name],
        sourceSignals: [],
        groupKind: 'output_single',
        signalCount: 1,
        priority: 5,
      });
    } else if (cls === 'input') {
      candidates.push({
        id: `forward_single_${name}`,
        name,
        direction: 'forward',
        targetSignals: [],
        sourceSignals: [name],
        groupKind: 'input_single',
        signalCount: 1,
        priority: 5,
      });
    }
  }

  return candidates
    .filter(c => c.signalCount > 0)
    .sort((a, b) => a.priority - b.priority);
}
