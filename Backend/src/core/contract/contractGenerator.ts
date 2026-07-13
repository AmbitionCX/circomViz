import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { parseSymFile, parseConstraintsFile } from '../utils/symbolParser.js';
import { normalizeConstraints } from '../utils/constraintNormalizer.js';
import { SpecTranslator } from '../solver/specTranslator.js';
import { GROTH16_PRIME } from '../utils/fieldConstants.js';
import type { ConstraintObject } from '../../types/constraint.js';
import type { ConstraintIndexData } from '../../types/slicerTypes.js';
import type {
  TemplateContract,
  ContractClause,
  ContractInvariant,
  ContractVerificationSummary,
} from '../../types/contractTypes.js';
import { ConstraintIndexer } from '../indexer/constraintIndex.js';

export class ContractGenerator {

  async generate(
    symPath: string,
    constraintsJsonPath: string,
    templateName: string,
    instancePath: string,
    constraintIndices?: number[],
    soundnessResult?: any,
    intentResult?: any,
    formalResult?: any,
  ): Promise<TemplateContract> {
    const indexer = new ConstraintIndexer();
    const { index, symEntries, constraints } = await indexer.loadOrBuild(symPath, constraintsJsonPath);
    const { invariants } = normalizeConstraints(constraints, symEntries);

    const componentPrefix = instancePath === 'main'
      ? 'main'
      : instancePath.startsWith('main.')
        ? instancePath
        : `main.${instancePath}`;

    const componentSignals = this.getComponentSignals(index, componentPrefix);
    let componentConstraintIndices = this.getComponentConstraintIndices(
      index, constraints, componentPrefix, componentSignals
    );

    if (constraintIndices && constraintIndices.length > 0) {
      const indexSet = new Set(constraintIndices);
      const before = componentConstraintIndices.length;
      componentConstraintIndices = componentConstraintIndices.filter(ci => indexSet.has(ci));
      const after = componentConstraintIndices.length;
      if (before !== after) {
        const filteredSigs = new Set<number>();
        for (const ci of componentConstraintIndices) {
          const sigs = index.constraintToSignals[String(ci)];
          if (sigs) for (const s of sigs) filteredSigs.add(s);
        }
        for (const sigIdx of componentSignals) {
          if (!filteredSigs.has(sigIdx)) componentSignals.delete(sigIdx);
        }
      }
    }

    const componentConstraints = componentConstraintIndices.map(ci => constraints[ci]);
    const componentInvariants = componentConstraintIndices
      .filter(ci => ci < invariants.length)
      .map(ci => invariants[ci]);

    const iface = this.buildInterface(index, symEntries, componentSignals);

    const specTranslator = new SpecTranslator(GROTH16_PRIME, symEntries);

    const assumptions = this.extractAssumptions(
      index, symEntries, constraints, componentPrefix, componentSignals,
      componentInvariants, formalResult, specTranslator
    );

    const guarantees = this.extractGuarantees(
      index, symEntries, componentPrefix, componentSignals, componentInvariants,
      formalResult, specTranslator
    );

    const contractInvariants = this.extractInvariants(
      componentInvariants, specTranslator
    );

    const verification = this.buildVerificationSummary(
      soundnessResult, intentResult, formalResult
    );

    const contract: TemplateContract = {
      templateName,
      instancePath,
      compiledAt: Date.now(),
      assumptions,
      guarantees,
      invariants: contractInvariants,
      verification,
      coveredConstraints: componentConstraintIndices,
      coveredSignals: Array.from(componentSignals),
      interface: iface,
    };

    await this.persistContract(symPath, instancePath, contract);

    return contract;
  }

  private getComponentSignals(
    index: ConstraintIndexData,
    componentPrefix: string
  ): Set<number> {
    const signals = new Set<number>();
    const directSignals = index.componentToSignals[componentPrefix];
    if (directSignals) {
      for (const sigIdx of directSignals) {
        signals.add(sigIdx);
      }
    }
    for (const prefix of Object.keys(index.componentToSignals)) {
      if (prefix.startsWith(componentPrefix + '.') && prefix !== componentPrefix) {
        for (const sigIdx of index.componentToSignals[prefix]) {
          signals.add(sigIdx);
        }
      }
    }
    return signals;
  }

  private getComponentConstraintIndices(
    index: ConstraintIndexData,
    constraints: ConstraintObject[],
    componentPrefix: string,
    componentSignals: Set<number>
  ): number[] {
    const constraintIndices = new Set<number>();
    for (const sigIdx of componentSignals) {
      const cIndices = index.signalToConstraints[String(sigIdx)] || [];
      for (const ci of cIndices) {
        const depSignals = index.constraintToSignals[String(ci)] || [];
        const allInComponent = depSignals.every((s: number) => componentSignals.has(s));
        if (allInComponent) {
          constraintIndices.add(ci);
        }
      }
    }
    return Array.from(constraintIndices).sort((a, b) => a - b);
  }

  private buildInterface(
    index: ConstraintIndexData,
    _symEntries: any[],
    componentSignals: Set<number>
  ): { inputs: Array<{ name: string; index: number; kind: 'input' }>; outputs: Array<{ name: string; index: number; kind: 'output' }> } {
    const inputs: Array<{ name: string; index: number; kind: 'input' }> = [];
    const outputs: Array<{ name: string; index: number; kind: 'output' }> = [];

    for (const sigIdx of componentSignals) {
      const name = index.signalToName[String(sigIdx)];
      if (!name) continue;
      const cls = index.signalClassification[String(sigIdx)];

      if (cls === 'output') {
        outputs.push({ name, index: sigIdx, kind: 'output' });
      } else if (cls === 'input') {
        inputs.push({ name, index: sigIdx, kind: 'input' });
      }
    }

    return { inputs, outputs };
  }

  private extractAssumptions(
    index: ConstraintIndexData,
    symEntries: any[],
    _constraints: ConstraintObject[],
    componentPrefix: string,
    componentSignals: Set<number>,
    componentInvariants: any[],
    formalResult: any,
    specTranslator: SpecTranslator
  ): ContractClause[] {
    const assumptions: ContractClause[] = [];

    for (const inv of componentInvariants) {
      if (inv.kind === 'boolean' && inv.signals.length > 0) {
        const sigName = inv.signals[0];
        const sigIdx = specTranslator.resolveSignal(sigName);
        if (sigIdx !== null) {
          assumptions.push({
            signal: sigName,
            kind: 'boolean',
            smt2Representation: `(assert (or (= s_${sigIdx} 0) (= s_${sigIdx} 1)))`,
            description: inv.description,
          });
        }
      }
    }

    for (const inv of componentInvariants) {
      if (inv.kind === 'range_check' && inv.signals.length > 0) {
        const sigName = inv.signals[0];
        const sigIdx = specTranslator.resolveSignal(sigName);
        if (sigIdx !== null) {
          assumptions.push({
            signal: sigName,
            kind: 'range',
            smt2Representation: `(assert (and (>= s_${sigIdx} 0) (< s_${sigIdx} ${BigInt(GROTH16_PRIME)})))`,
            description: inv.description,
          });
        }
      }
    }

    if (formalResult?.specTranslation?.assumptions) {
      for (const assumption of formalResult.specTranslation.assumptions) {
        if (assumption.kind === 'constant') continue;
        if (assumption.signal && componentSignals.has(
          index.nameToSignal[assumption.signal] ?? -1
        )) {
          assumptions.push({
            signal: assumption.signal,
            kind: assumption.kind === 'boolean' ? 'boolean' : assumption.kind === 'range' ? 'range' : 'custom',
            smt2Representation: assumption.smt2Lines.join('\n'),
            description: assumption.raw,
          });
        }
      }
    }

    return assumptions;
  }

  private extractGuarantees(
    index: ConstraintIndexData,
    _symEntries: any[],
    componentPrefix: string,
    componentSignals: Set<number>,
    componentInvariants: any[],
    formalResult: any,
    specTranslator: SpecTranslator
  ): ContractClause[] {
    const guarantees: ContractClause[] = [];

    const outputSignalNames = new Set<string>();
    for (const sigIdx of componentSignals) {
      const name = index.signalToName[String(sigIdx)];
      if (name) {
        const cls = index.signalClassification[String(sigIdx)];
        if (cls === 'output') {
          outputSignalNames.add(name);
          outputSignalNames.add(name.split('.').pop() || name);
        }
      }
    }

    for (const inv of componentInvariants) {
      if (inv.kind === 'multiplication' || inv.kind === 'selector_gate') {
        const involvedOutputs = inv.signals.filter((s: string) => outputSignalNames.has(s) || outputSignalNames.has(s.split('.').pop() || s));
        if (involvedOutputs.length > 0) {
          guarantees.push({
            signal: involvedOutputs[0],
            kind: 'equality',
            smt2Representation: `; ${inv.description}`,
            description: inv.description,
          });
        }
      }
    }

    if (formalResult?.specTranslation?.posts) {
      for (const post of formalResult.specTranslation.posts) {
        if (post.kind === 'equality' && post.lhsSignals && post.lhsSignals.length > 0) {
          const lhsName = post.lhsSignals[0];
          const sigIdx = specTranslator.resolveSignal(lhsName);
          if (sigIdx !== null && componentSignals.has(sigIdx)) {
            guarantees.push({
              signal: lhsName,
              kind: 'equality',
              smt2Representation: post.smt2Lines.join('\n'),
              description: post.raw,
            });
          }
        }
        if (post.kind === 'hash' || post.kind === 'selector' || post.kind === 'boolean_gating') {
          if (post.lhsSignals && post.lhsSignals.length > 0) {
            const lhsName = post.lhsSignals[0];
            const sigIdx = specTranslator.resolveSignal(lhsName);
            if (sigIdx !== null && componentSignals.has(sigIdx)) {
              guarantees.push({
                signal: lhsName,
                kind: post.kind === 'hash' ? 'hash' : post.kind === 'selector' ? 'custom' : 'custom',
                smt2Representation: post.smt2Lines.join('\n'),
                description: post.raw,
              });
            }
          }
        }
      }
    }

    return guarantees;
  }

  private extractInvariants(
    componentInvariants: any[],
    specTranslator: SpecTranslator
  ): ContractInvariant[] {
    const contractInvariants: ContractInvariant[] = [];

    for (const inv of componentInvariants) {
      const signals = inv.signals || [];
      const smt2Lines: string[] = [];

      if (inv.kind === 'boolean' && signals.length > 0) {
        const sigIdx = specTranslator.resolveSignal(signals[0]);
        if (sigIdx !== null) {
          smt2Lines.push(`(assert (or (= s_${sigIdx} 0) (= s_${sigIdx} 1)))`);
        }
      } else if (inv.kind === 'linear_equality' && signals.length > 0) {
        const sigIdx = specTranslator.resolveSignal(signals[0]);
        if (sigIdx !== null) {
          smt2Lines.push(`; ${inv.description}`);
        }
      } else if (inv.kind === 'range_check' && signals.length > 0) {
        const sigIdx = specTranslator.resolveSignal(signals[0]);
        if (sigIdx !== null) {
          smt2Lines.push(`(assert (and (>= s_${sigIdx} 0) (< s_${sigIdx} ${BigInt(GROTH16_PRIME)})))`);
        }
      } else {
        smt2Lines.push(`; [${inv.kind}] ${inv.description}`);
      }

      contractInvariants.push({
        kind: inv.kind,
        description: inv.description,
        smt2Representation: smt2Lines.join('\n'),
        signals,
      });
    }

    return contractInvariants;
  }

  private buildVerificationSummary(
    soundnessResult?: any,
    intentResult?: any,
    formalResult?: any
  ): ContractVerificationSummary {
    const summary: ContractVerificationSummary = {
      soundnessPassed: false,
      intentAligned: false,
      formalConformancePassed: false,
    };

    if (soundnessResult?.results?.satisfiability) {
      summary.soundnessPassed = !soundnessResult.results.satisfiability.satisfiable;
    } else if (soundnessResult?.staticAnalysis?.findings) {
      summary.soundnessPassed = !soundnessResult.staticAnalysis.findings.some(
        (f: any) => f.severity === 'high'
      );
    }

    if (intentResult?.groups) {
      const allGroups = Array.isArray(intentResult.groups) ? intentResult.groups : [];
      summary.intentAligned = allGroups.length > 0 && allGroups.every((g: any) =>
        g.llmResult && g.llmResult.candidateSpecDSL && g.llmResult.candidateSpecDSL.length > 0
      );
    }

    if (formalResult?.results) {
      const results = formalResult.results;
      if (results.soundness?.conformant === false) {
        summary.formalConformancePassed = false;
      } else if (results.completeness?.complete === true) {
        summary.formalConformancePassed = true;
      }
    }

    return summary;
  }

  private async persistContract(
    symPath: string,
    instancePath: string,
    contract: TemplateContract
  ): Promise<void> {
    try {
      const cacheDir = join(dirname(symPath), 'contracts');
      await fs.mkdir(cacheDir, { recursive: true });
      const safeFileName = instancePath.replace(/[/.]/g, '_');
      const cachePath = join(cacheDir, `contract_${safeFileName}.json`);
      await fs.writeFile(cachePath, JSON.stringify(contract, null, 2), 'utf-8');
    } catch {
      // non-critical, contract is still returned in the response
    }
  }
}
