import { parseSymFile, parseConstraintsFile } from '../utils/symbolParser.js';
import { normalizeConstraints } from '../utils/constraintNormalizer.js';
import { VerificationEngine } from '../solver/verificationEngine.js';
import { GROTH16_PRIME } from '../utils/fieldConstants.js';
import { partitionConstraints, buildContractAssertions } from './contractUtils.js';
import type { ConstraintObject } from '../../types/constraint.js';
import type { ConstraintIndexData } from '../../types/slicerTypes.js';
import type { TemplateContract } from '../../types/contractTypes.js';

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
    queries: { checkSatisfiability?: boolean; checkDeterminism?: boolean; checkCoverage?: boolean },
    constraintIndices?: number[],
  ): Promise<{
    results: { satisfiability?: any; determinism?: any; coverage?: any };
    suspectChildren: string[];
    refinementNeeded: boolean;
  }> {
    const symEntries = await parseSymFile(symPath);
    let allConstraints = await parseConstraintsFile(constraintsJsonPath);

    if (constraintIndices && constraintIndices.length > 0) {
      const indexSet = new Set(constraintIndices);
      allConstraints = allConstraints.filter((_, i) => indexSet.has(i));
    }
    this.constraints = allConstraints;

    const expandedSet = new Set(expandedChildren);

    const { glueConstraints, childConstraintMap, interfaceConstraints } =
      partitionConstraints(this.constraints, this.indexData, childContracts);

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
        const contractConstraints = buildContractAssertions(this.indexData, contract);
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
