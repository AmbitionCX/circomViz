import { parseSymFile, parseConstraintsFile, type SymEntry } from '../utils/symbolParser.js';
import { normalizeConstraints } from '../utils/constraintNormalizer.js';
import { VerificationEngine } from '../solver/verificationEngine.js';
import type { ConstraintObject } from '../../types/constraint.js';
import type { ConstraintIndexData } from '../../types/slicerTypes.js';
import type { TemplateContract } from '../../types/contractTypes.js';

const GROTH16_PRIME = '21888242871839275222246405745257275088548364400416034343698204186575808495617';

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
      this.partitionConstraints(childContracts);

    const abstractConstraints = this.buildAbstractConstraints(
      glueConstraints,
      interfaceConstraints,
      childContracts
    );

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
      let isChildConstraint = false;

      for (const [childPath, childSigs] of childSignalSets) {
        const allInChild = sigIndices.every(s => childSigs.has(s));
        if (allInChild) {
          belongsToChild = childPath;
          isChildConstraint = true;
          break;
        }
      }

      if (isChildConstraint && belongsToChild) {
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

  private buildAbstractConstraints(
    glueConstraints: ConstraintObject[],
    interfaceConstraints: ConstraintObject[],
    childContracts: TemplateContract[]
  ): ConstraintObject[] {
    const abstractConstraints: ConstraintObject[] = [
      ...glueConstraints,
      ...interfaceConstraints,
    ];

    for (const contract of childContracts) {
      const contractConstraints = this.buildContractAssertions(contract);
      abstractConstraints.push(...contractConstraints);
    }

    return abstractConstraints;
  }

  private buildContractAssertions(contract: TemplateContract): ConstraintObject[] {
    const assertions: ConstraintObject[] = [];

    for (const assumption of contract.assumptions) {
      if (!assumption.signal) continue;
      const sigIdx = this.indexData.nameToSignal[assumption.signal];
      if (sigIdx === undefined) continue;
      const key = String(sigIdx);

      switch (assumption.kind) {
        case 'boolean':
          assertions.push([
            { [key]: '1' },
            { [key]: '-1' },
            {},
          ] as ConstraintObject);
          break;
        case 'range':
          assertions.push([
            { [key]: '1' },
            { [key]: '-1' },
            {},
          ] as ConstraintObject);
          break;
        case 'equality':
          if (assumption.smt2Representation) {
            assertions.push([
              { [key]: '1' },
              { '0': '-1' },
              {},
            ] as ConstraintObject);
          }
          break;
        case 'hash':
        case 'commitment':
        case 'custom':
          assertions.push([
            { [key]: '1' },
            { [key]: '-1' },
            {},
          ] as ConstraintObject);
          break;
      }
    }

    for (const guarantee of contract.guarantees) {
      if (!guarantee.signal) continue;
      const sigIdx = this.indexData.nameToSignal[guarantee.signal];
      if (sigIdx === undefined) continue;
      const key = String(sigIdx);

      switch (guarantee.kind) {
        case 'equality':
          assertions.push([
            { [key]: '1' },
            { [key]: '1' },
            { [key]: '-1' },
          ] as ConstraintObject);
          break;
        case 'hash':
        case 'commitment':
        case 'custom':
          if (guarantee.smt2Representation) {
            assertions.push([
              { [key]: '1' },
              { [key]: '1' },
              { [key]: '-1' },
            ] as ConstraintObject);
          }
          break;
      }
    }

    for (const inv of contract.invariants) {
      if (!inv.signals || inv.signals.length === 0) continue;
      const sigIdx = this.indexData.nameToSignal[inv.signals[0]];
      if (sigIdx === undefined) continue;
      const key = String(sigIdx);

      if (inv.kind === 'boolean') {
        assertions.push([
          { [key]: '1' },
          { [key]: '-1' },
          {},
        ] as ConstraintObject);
      }
    }

    return assertions;
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
