import { parseSymFile, parseConstraintsFile } from '../utils/symbolParser.js';
import { normalizeConstraints } from '../utils/constraintNormalizer.js';
import { VerificationEngine } from '../solver/verificationEngine.js';
import type { ConstraintObject } from '../../types/constraint.js';
import type { ConstraintIndexData } from '../../types/slicerTypes.js';
import type { TemplateContract } from '../../types/contractTypes.js';

const GROTH16_PRIME = '21888242871839275222246405745257275088548364400416034343698204186575808495617';

export class RefinementExpander {
  private indexData: ConstraintIndexData;
  private constraints: ConstraintObject[] = [];

  constructor(indexData: ConstraintIndexData) {
    this.indexData = indexData;
  }

  async refine(
    symPath: string,
    constraintsJsonPath: string,
    templateName: string,
    childContracts: TemplateContract[],
    expandedChildren: string[],
    queries: { checkSatisfiability?: boolean; checkDeterminism?: boolean; checkCoverage?: boolean }
  ): Promise<{
    results: { satisfiability?: any; determinism?: any; coverage?: any };
    suspectChildren: string[];
    refinementNeeded: boolean;
  }> {
    const symEntries = await parseSymFile(symPath);
    this.constraints = await parseConstraintsFile(constraintsJsonPath);

    const expandedSet = new Set(expandedChildren);

    const { glueConstraints, childConstraintMap, interfaceConstraints } =
      this.partitionConstraints(childContracts);

    const mixedConstraints: ConstraintObject[] = [
      ...glueConstraints,
      ...interfaceConstraints,
    ];

    for (const contract of childContracts) {
      if (expandedSet.has(contract.instancePath)) {
        const realConstraints = (childConstraintMap.get(contract.instancePath) || [])
          .map(ci => this.constraints[ci])
          .filter(Boolean);
        mixedConstraints.push(...realConstraints);
      } else {
        const contractConstraints = this.buildContractAssertions(contract);
        mixedConstraints.push(...contractConstraints);
      }
    }

    const engine = new VerificationEngine(GROTH16_PRIME);
    const results: any = {};

    try {
      if (queries.checkSatisfiability) {
        results.satisfiability = await engine.checkSatisfiability(mixedConstraints, symEntries);
      }

      if (queries.checkDeterminism) {
        const inputIndices = this.getIndicesForClassification('input');
        const outputIndices = this.getIndicesForClassification('output');
        if (inputIndices.length > 0 && outputIndices.length > 0) {
          results.determinism = await engine.checkDeterminism(
            mixedConstraints, inputIndices, outputIndices, symEntries
          );
        }
      }

      if (queries.checkCoverage) {
        const outputIndices = this.getIndicesForClassification('output');
        if (outputIndices.length > 0) {
          results.coverage = await engine.checkCoverage(
            mixedConstraints, outputIndices, {}, symEntries
          );
        }
      }
    } catch (e: any) {
      return {
        results,
        suspectChildren: expandedChildren,
        refinementNeeded: true,
      };
    }

    const suspectChildren = this.identifySuspectChildren(results, childContracts, expandedSet);
    const refinementNeeded = suspectChildren.length > 0 ||
      results.satisfiability?.satisfiable === true ||
      results.determinism?.deterministic === false;

    return { results, suspectChildren, refinementNeeded };
  }

  private partitionConstraints(childContracts: TemplateContract[]): {
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

    for (let ci = 0; ci < this.constraints.length; ci++) {
      const sigIndices = this.indexData.constraintToSignals[String(ci)];
      if (!sigIndices) continue;

      const involvedComponents = new Set<string>();
      for (const sig of sigIndices) {
        const comp = this.indexData.signalToComponent[String(sig)];
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
        interfaceConstraints.push(this.constraints[ci]);
      } else {
        glueConstraints.push(this.constraints[ci]);
      }
    }

    return { glueConstraints, childConstraintMap, interfaceConstraints };
  }

  private buildContractAssertions(contract: TemplateContract): ConstraintObject[] {
    const assertions: ConstraintObject[] = [];
    for (const assumption of contract.assumptions) {
      if (assumption.kind === 'boolean' && assumption.signal) {
        const sigIdx = this.indexData.nameToSignal[assumption.signal];
        if (sigIdx !== undefined) {
          assertions.push([
            { [String(sigIdx)]: '1' },
            { '0': '-1' },
            {},
          ] as ConstraintObject);
        }
      }
    }
    return assertions;
  }

  private identifySuspectChildren(
    results: any,
    childContracts: TemplateContract[],
    alreadyExpanded: Set<string>
  ): string[] {
    const suspects: string[] = [];

    if (results.determinism?.deterministic === false && results.determinism?.counterexample) {
      const ce = results.determinism.counterexample;
      const allOutputValues = { ...ce.output1, ...ce.output2 };
      for (const signalName of Object.keys(allOutputValues)) {
        const sigIdx = this.indexData.nameToSignal[signalName];
        if (sigIdx !== undefined) {
          const component = this.indexData.signalToComponent[String(sigIdx)];
          if (component) {
            const matchingChild = childContracts.find(c => component.startsWith(c.instancePath));
            if (matchingChild && !alreadyExpanded.has(matchingChild.instancePath) && !suspects.includes(matchingChild.instancePath)) {
              suspects.push(matchingChild.instancePath);
            }
          }
        }
      }
    }

    return suspects;
  }

  private getIndicesForClassification(cls: 'input' | 'output'): number[] {
    return Object.entries(this.indexData.signalClassification)
      .filter(([, c]) => c === cls)
      .map(([idx]) => parseInt(idx))
      .filter(idx => !isNaN(idx));
  }
}
