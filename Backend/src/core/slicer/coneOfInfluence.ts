import * as fs from 'fs/promises';
import type { ConstraintIndexData, SliceDirection, SliceResult, ComponentGroup } from '../../types/slicerTypes.js';
import type { ConstraintObject } from '../../types/constraint.js';
import type { SymEntry } from '../utils/symbolParser.js';
import { parseSymFile, parseConstraintsFile, resolveConstraintsWithNames } from '../utils/symbolParser.js';

export class ConeOfInfluenceSlicer {
  private indexData: ConstraintIndexData;

  constructor(indexData: ConstraintIndexData) {
    this.indexData = indexData;
  }

  resolveSignalNames(names: string[]): number[] {
    const indices: number[] = [];
    for (const name of names) {
      const idx = this.indexData.nameToSignal[name];
      if (idx !== undefined) {
        indices.push(idx);
      } else {
        for (const [sigName, sigIdx] of Object.entries(this.indexData.nameToSignal)) {
          if (sigName.endsWith(`.${name}`)) {
            indices.push(sigIdx);
            break;
          }
        }
      }
    }
    return [...new Set(indices)];
  }

  backwardSlice(targetSignalIndices: number[], maxDepth?: number): { constraintIndices: Set<number>; signalIndices: Set<number> } {
    const visitedSignals = new Set<number>();
    const visitedConstraints = new Set<number>();
    const worklist = [...targetSignalIndices];

    let depth = 0;
    while (worklist.length > 0 && (maxDepth === undefined || depth < maxDepth)) {
      const batchSize = worklist.length;
      const nextWorklist: number[] = [];

      for (let i = 0; i < batchSize; i++) {
        const sig = worklist.pop()!;
        if (visitedSignals.has(sig)) continue;
        visitedSignals.add(sig);

        const constraintIds = this.indexData.signalToConstraints[String(sig)];
        if (!constraintIds) continue;

        for (const ci of constraintIds) {
          if (visitedConstraints.has(ci)) continue;
          visitedConstraints.add(ci);

          const depSignals = this.indexData.constraintToSignals[String(ci)];
          if (depSignals) {
            for (const ds of depSignals) {
              if (!visitedSignals.has(ds)) {
                nextWorklist.push(ds);
              }
            }
          }
        }
      }

      worklist.push(...nextWorklist);
      depth++;
    }

    return { constraintIndices: visitedConstraints, signalIndices: visitedSignals };
  }

  forwardSlice(sourceSignalIndices: number[], maxDepth?: number): { constraintIndices: Set<number>; signalIndices: Set<number> } {
    const visitedSignals = new Set<number>();
    const visitedConstraints = new Set<number>();
    const worklist = [...sourceSignalIndices];

    let depth = 0;
    while (worklist.length > 0 && (maxDepth === undefined || depth < maxDepth)) {
      const batchSize = worklist.length;
      const nextWorklist: number[] = [];

      for (let i = 0; i < batchSize; i++) {
        const sig = worklist.pop()!;
        if (visitedSignals.has(sig)) continue;
        visitedSignals.add(sig);

        const constraintIds = this.indexData.signalToConstraints[String(sig)];
        if (!constraintIds) continue;

        for (const ci of constraintIds) {
          if (visitedConstraints.has(ci)) continue;
          visitedConstraints.add(ci);

          const depSignals = this.indexData.constraintToSignals[String(ci)];
          if (depSignals) {
            for (const ds of depSignals) {
              if (!visitedSignals.has(ds)) {
                nextWorklist.push(ds);
              }
            }
          }
        }
      }

      worklist.push(...nextWorklist);
      depth++;
    }

    return { constraintIndices: visitedConstraints, signalIndices: visitedSignals };
  }

  bidirectionalSlice(
    sourceSignalIndices: number[],
    targetSignalIndices: number[],
    maxDepth?: number
  ): { constraintIndices: Set<number>; signalIndices: Set<number> } {
    const forward = this.forwardSlice(sourceSignalIndices, maxDepth);
    const backward = this.backwardSlice(targetSignalIndices, maxDepth);

    const intersectSignals = new Set<number>();
    for (const s of forward.signalIndices) {
      if (backward.signalIndices.has(s)) intersectSignals.add(s);
    }

    const intersectConstraints = new Set<number>();
    for (const c of forward.constraintIndices) {
      if (backward.constraintIndices.has(c)) intersectConstraints.add(c);
    }

    return { constraintIndices: intersectConstraints, signalIndices: intersectSignals };
  }

  async buildSliceResult(
    sliceData: { constraintIndices: Set<number>; signalIndices: Set<number> },
    symPath: string,
    constraintsJsonPath: string
  ): Promise<SliceResult> {
    const symEntries = await parseSymFile(symPath);
    const constraints = await parseConstraintsFile(constraintsJsonPath);

    const constraintArray = Array.from(sliceData.constraintIndices).sort((a, b) => a - b);
    const signalArray = Array.from(sliceData.signalIndices).sort((a, b) => a - b);

    const slicedConstraints = constraintArray.map(i => constraints[i]).filter(Boolean);

    const slicedSymEntries = symEntries.filter(e => sliceData.signalIndices.has(e.index));
    const resolved = resolveConstraintsWithNames(slicedConstraints, slicedSymEntries);

    const componentGroups = this.buildComponentGroupsForSlice(sliceData.signalIndices);

    const total = this.indexData.totalConstraints;
    const reductionPercent = total > 0
      ? Math.round((1 - constraintArray.length / total) * 100 * 100) / 100
      : 100;

    return {
      constraintIndices: constraintArray,
      signalIndices: signalArray,
      constraintCount: constraintArray.length,
      signalCount: signalArray.length,
      totalConstraints: this.indexData.totalConstraints,
      totalSignals: this.indexData.totalSignals,
      reductionPercent,
      componentGroups,
      resolvedConstraints: resolved,
    };
  }

  slice(
    direction: SliceDirection,
    targetSignalIndices: number[],
    sourceSignalIndices?: number[],
    maxDepth?: number
  ): { constraintIndices: Set<number>; signalIndices: Set<number> } {
    switch (direction) {
      case 'backward':
        return this.backwardSlice(targetSignalIndices, maxDepth);
      case 'forward':
        return this.forwardSlice(sourceSignalIndices || targetSignalIndices, maxDepth);
      case 'bidirectional':
        return this.bidirectionalSlice(
          sourceSignalIndices || targetSignalIndices,
          targetSignalIndices,
          maxDepth
        );
    }
  }

  private buildComponentGroupsForSlice(signalIndices: Set<number>): ComponentGroup[] {
    const componentMap = new Map<string, Set<number>>();
    for (const sig of signalIndices) {
      const comp = this.indexData.signalToComponent[String(sig)] || 'unknown';
      if (!componentMap.has(comp)) componentMap.set(comp, new Set());
      componentMap.get(comp)!.add(sig);
    }

    const groups: ComponentGroup[] = [];
    for (const [prefix, sigs] of componentMap) {
      const sigArr = Array.from(sigs);
      let constraintCount = 0;
      for (const sig of sigArr) {
        constraintCount += (this.indexData.signalToConstraints[String(sig)]?.length || 0);
      }
      let inputCount = 0, outputCount = 0, intermediateCount = 0;
      for (const sig of sigArr) {
        const cls = this.indexData.signalClassification[String(sig)] || 'intermediate';
        if (cls === 'input') inputCount++;
        else if (cls === 'output') outputCount++;
        else intermediateCount++;
      }
      groups.push({ prefix, signalIndices: sigArr, constraintCount, inputCount, outputCount, intermediateCount });
    }

    return groups.sort((a, b) => a.prefix.localeCompare(b.prefix));
  }
}
