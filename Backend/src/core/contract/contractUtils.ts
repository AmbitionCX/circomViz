import type { ConstraintObject } from '../../types/constraint.js';
import type { ConstraintIndexData } from '../../types/slicerTypes.js';
import type { TemplateContract } from '../../types/contractTypes.js';

export function partitionConstraints(
  constraints: ConstraintObject[],
  indexData: ConstraintIndexData,
  childContracts: TemplateContract[]
): {
  glueConstraints: ConstraintObject[];
  childConstraintMap: Map<string, number[]>;
  interfaceConstraints: ConstraintObject[];
} {
  const childSignalSets = new Map<string, Set<number>>();
  for (const contract of childContracts) {
    childSignalSets.set(contract.instancePath, new Set(contract.coveredSignals));
  }

  const childConstraintMap = new Map<string, number[]>();
  const glueConstraints: ConstraintObject[] = [];
  const interfaceConstraints: ConstraintObject[] = [];

  for (let ci = 0; ci < constraints.length; ci++) {
    const sigIndices = indexData.constraintToSignals[String(ci)];
    if (!sigIndices) continue;

    const involvedComponents = new Set<string>();
    for (const sig of sigIndices) {
      const comp = indexData.signalToComponent[String(sig)];
      if (comp) involvedComponents.add(comp);
    }

    let belongsToChild: string | null = null;
    for (const [childPath, childSigs] of childSignalSets) {
      if (sigIndices.every(s => childSigs.has(s))) {
        belongsToChild = childPath;
        break;
      }
    }

    if (belongsToChild) {
      if (!childConstraintMap.has(belongsToChild)) {
        childConstraintMap.set(belongsToChild, []);
      }
      childConstraintMap.get(belongsToChild)!.push(ci);
    } else if (involvedComponents.size > 1) {
      interfaceConstraints.push(constraints[ci]);
    } else {
      glueConstraints.push(constraints[ci]);
    }
  }

  return { glueConstraints, childConstraintMap, interfaceConstraints };
}

export function buildContractAssertions(
  indexData: ConstraintIndexData,
  contract: TemplateContract
): ConstraintObject[] {
  const assertions: ConstraintObject[] = [];
  for (const assumption of contract.assumptions) {
    if (!assumption.signal) continue;
    const sigIdx = indexData.nameToSignal[assumption.signal];
    if (sigIdx === undefined) continue;
    const key = String(sigIdx);

    switch (assumption.kind) {
      case 'boolean':
      case 'range':
      case 'equality':
      case 'hash':
      case 'commitment':
      case 'custom':
        assertions.push([{ [key]: '1' }, { [key]: '-1' }, {}] as ConstraintObject);
        break;
    }
  }

  for (const guarantee of contract.guarantees) {
    if (!guarantee.signal) continue;
    const sigIdx = indexData.nameToSignal[guarantee.signal];
    if (sigIdx === undefined) continue;
    const key = String(sigIdx);

    switch (guarantee.kind) {
      case 'equality':
        assertions.push([{ [key]: '1' }, { [key]: '1' }, { [key]: '-1' }] as ConstraintObject);
        break;
      case 'hash':
      case 'commitment':
      case 'custom':
        if (guarantee.smt2Representation) {
          assertions.push([{ [key]: '1' }, { [key]: '1' }, { [key]: '-1' }] as ConstraintObject);
        }
        break;
    }
  }

  for (const inv of contract.invariants) {
    if (!inv.signals || inv.signals.length === 0) continue;
    const sigIdx = indexData.nameToSignal[inv.signals[0]];
    if (sigIdx === undefined) continue;
    const key = String(sigIdx);
    if (inv.kind === 'boolean') {
      assertions.push([{ [key]: '1' }, { [key]: '-1' }, {}] as ConstraintObject);
    }
  }
  return assertions;
}
