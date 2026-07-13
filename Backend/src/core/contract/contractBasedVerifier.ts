import { parseSymFile, parseConstraintsFile, type SymEntry } from '../utils/symbolParser.js';
import { normalizeConstraints } from '../utils/constraintNormalizer.js';
import { VerificationEngine } from '../solver/verificationEngine.js';
import { GROTH16_PRIME } from '../utils/fieldConstants.js';
import { partitionConstraints, buildContractAssertions } from './contractUtils.js';
import type { ConstraintObject } from '../../types/constraint.js';
import type { ConstraintIndexData } from '../../types/slicerTypes.js';
import type { TemplateContract } from '../../types/contractTypes.js';

export class ContractBasedVerifier {
  private indexData: ConstraintIndexData;
  private symEntries: SymEntry[] = [];
  private constraints: ConstraintObject[] = [];

  constructor(indexData: ConstraintIndexData) {
    this.indexData = indexData;
  }

  async verify(
    symPath: string,
    constraintsJsonPath: string,
    templateName: string,
    childContracts: TemplateContract[],
    queries: { checkSatisfiability?: boolean; checkDeterminism?: boolean; checkCoverage?: boolean },
    constraintIndices?: number[],
  ): Promise<{
    results: { satisfiability?: any; determinism?: any; coverage?: any };
    suspectChildren: string[];
    refinementNeeded: boolean;
  }> {
    this.symEntries = await parseSymFile(symPath);
    let allConstraints = await parseConstraintsFile(constraintsJsonPath);

    if (constraintIndices && constraintIndices.length > 0) {
      const indexSet = new Set(constraintIndices);
      allConstraints = allConstraints.filter((_, i) => indexSet.has(i));
    }
    this.constraints = allConstraints;

    const { glueConstraints, childConstraintMap, interfaceConstraints } =
      partitionConstraints(this.constraints, this.indexData, childContracts);

    const abstractConstraints: ConstraintObject[] = [
      ...glueConstraints,
      ...interfaceConstraints,
    ];

    for (const contract of childContracts) {
      abstractConstraints.push(...buildContractAssertions(this.indexData, contract));
    }

    const engine = new VerificationEngine(GROTH16_PRIME);
    const results: any = {};

    try {
      if (queries.checkSatisfiability) {
        results.satisfiability = await engine.checkSatisfiability(abstractConstraints, this.symEntries);
      }

      if (queries.checkDeterminism) {
        const inputIndices = this.getIndicesForSignals(
          this.getMainInputNames()
        );
        const outputIndices = this.getIndicesForSignals(
          this.getMainOutputNames()
        );
        if (inputIndices.length > 0 && outputIndices.length > 0) {
          results.determinism = await engine.checkDeterminism(
            abstractConstraints, inputIndices, outputIndices, this.symEntries
          );
        }
      }

      if (queries.checkCoverage) {
        const outputIndices = this.getIndicesForSignals(
          this.getMainOutputNames()
        );
        if (outputIndices.length > 0) {
          results.coverage = await engine.checkCoverage(
            abstractConstraints, outputIndices, {}, this.symEntries
          );
        }
      }
    } catch (e: any) {
      return {
        results,
        suspectChildren: this.identifySuspectChildren(results, childContracts),
        refinementNeeded: true,
      };
    }

    const suspectChildren = this.identifySuspectChildren(results, childContracts);
    const refinementNeeded = suspectChildren.length > 0 ||
      results.satisfiability?.satisfiable === true ||
      results.determinism?.deterministic === false;

    return { results, suspectChildren, refinementNeeded };
  }

  private identifySuspectChildren(
    results: any,
    childContracts: TemplateContract[]
  ): string[] {
    const suspects: string[] = [];

    if (results.determinism?.deterministic === false && results.determinism?.counterexample) {
      const ce = results.determinism.counterexample;
      const allOutputValues = { ...ce.output1, ...ce.output2 };
      for (const signalName of Object.keys(allOutputValues)) {
        const component = this.indexData.signalToComponent[String(
          this.indexData.nameToSignal[signalName]
        )];
        if (component) {
          const matchingChild = childContracts.find(c => component.startsWith(c.instancePath));
          if (matchingChild && !suspects.includes(matchingChild.instancePath)) {
            suspects.push(matchingChild.instancePath);
          }
        }
      }
    }

    if (results.satisfiability?.satisfiable === true && results.satisfiability?.model) {
      for (const sigStr of Object.keys(results.satisfiability.model)) {
        const sigName = this.indexData.signalToName[sigStr];
        if (sigName) {
          const component = this.indexData.signalToComponent[sigStr];
          if (component) {
            const matchingChild = childContracts.find(c => component.startsWith(c.instancePath));
            if (matchingChild && !suspects.includes(matchingChild.instancePath)) {
              suspects.push(matchingChild.instancePath);
            }
          }
        }
      }
    }

    return suspects;
  }

  private getMainInputNames(): string[] {
    return Object.entries(this.indexData.signalClassification)
      .filter(([, cls]) => cls === 'input')
      .map(([idx]) => this.indexData.signalToName[idx])
      .filter(Boolean);
  }

  private getMainOutputNames(): string[] {
    return Object.entries(this.indexData.signalClassification)
      .filter(([, cls]) => cls === 'output')
      .map(([idx]) => this.indexData.signalToName[idx])
      .filter(Boolean);
  }

  private getIndicesForSignals(names: string[]): number[] {
    return names
      .map(n => this.indexData.nameToSignal[n])
      .filter((idx): idx is number => idx !== undefined);
  }
}
