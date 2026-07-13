import { FastifyRequest, FastifyReply } from 'fastify';
import { Cvc5Solver } from '../../core/solver/cvc5Solver.js';
import { SpecTranslator } from '../../core/solver/specTranslator.js';
import { OutputSignalIdentifier } from '../../core/soundness/outputIdentifier.js';
import { ProjectLoader } from '../../core/project/loadProject.js';
import { parseSymFile, parseConstraintsFile } from '../../core/utils/symbolParser.js';
import { logger } from '../../utils/logger.js';
import type {
  formal_conformance_request,
  formal_conformance_response,
  SpecTranslation,
  SoundnessConformanceResult,
  CompletenessConformanceResult,
  DeterminismConformanceResult,
  TotalityConformanceResult,
} from '../../types/formalConformanceTypes.js';
import type { SymbolObject, ConstraintObject } from '../../types/constraint.js';

function extractAllSignalIndices(constraints: ConstraintObject[], symbols: SymbolObject[]): number[] {
  const indexSet = new Set<number>();
  for (const [a, b, c] of constraints) {
    for (const expr of [a, b, c]) {
      for (const key of Object.keys(expr)) {
        indexSet.add(parseInt(key));
      }
    }
  }
  for (const sym of symbols) {
    if (sym.witness >= 0) {
      indexSet.add(sym.index);
    }
  }
  return Array.from(indexSet).sort((a, b) => a - b);
}

function parseFirstLine(output: string): string {
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === 'sat' || trimmed === 'unsat' || trimmed === 'unknown') return trimmed;
  }
  return '';
}

function extractModelFromOutput(output: string): string {
  const lines = output.split('\n');
  let depth = 0;
  let modelLines: string[] = [];
  let inModel = false;
  let foundContent = false;
  for (const line of lines) {
    if (line.includes('(model') || line.includes('define-fun')) inModel = true;
    if (inModel) {
      modelLines.push(line);
      for (const ch of line) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
      }
      if (line.includes('define-fun')) foundContent = true;
      if (depth === 0 && modelLines.length > 1 && foundContent) break;
    }
  }
  return modelLines.join('\n');
}

function parseModel(modelOutput: string): Record<string, string> {
  const model: Record<string, string> = {};
  const regex = /\(define-fun\s+s_(\d+)\s+\(\)\s+Int\s+([^\)]+)\)/g;
  let match;
  while ((match = regex.exec(modelOutput)) !== null) {
    let value = match[2].trim();
    const negMatch = value.match(/^\(\s*-\s+(\d+)\s*\)$/);
    if (negMatch) value = `-${negMatch[1]}`;
    model[match[1]] = value;
  }
  return model;
}

function parseModelWithSuffix(modelOutput: string, suffix: string): Record<string, string> {
  const model: Record<string, string> = {};
  const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\(define-fun\\s+s_(\\d+)${escapedSuffix}\\s+\\(\\)\\s+Int\\s+([^\\)]+)\\)`, 'g');
  let match;
  while ((match = regex.exec(modelOutput)) !== null) {
    let value = match[2].trim();
    const negMatch = value.match(/^\(\s*-\s+(\d+)\s*\)$/);
    if (negMatch) value = `-${negMatch[1]}`;
    model[match[1]] = value;
  }
  return model;
}

async function runCvc5(smt2Script: string): Promise<string> {
  const solver = new Cvc5Solver();
  try {
    return await solver.executeSMT2(smt2Script);
  } finally {
    await solver.close();
  }
}

async function checkSoundness(
  constraints: ConstraintObject[],
  symbols: SymbolObject[],
  translation: SpecTranslation,
  inputIndices: number[],
  outputIndices: number[],
  indexToName: Map<number, string>,
): Promise<SoundnessConformanceResult> {
  const startTime = performance.now();
  const allIndices = extractAllSignalIndices(constraints, symbols);
  const spec = new SpecTranslator(process.env.P!, symbols);
  const baseLines = spec.generateBaseSMT2(constraints, allIndices);

  const specLines: string[] = [];
  const postClauses: string[] = [];

  for (const assumption of translation.assumptions) {
    if (assumption.kind !== 'constant') {
      specLines.push(...assumption.smt2Lines);
    }
  }
  for (const inv of translation.invariants) {
    if (inv.parseable) {
      specLines.push(...inv.smt2Lines);
    }
  }

  const negatedPostClauses: string[] = [];
  for (const post of translation.posts) {
    if (post.parseable && post.smt2Lines.length > 0) {
      for (const line of post.smt2Lines) {
        const assertMatch = line.match(/^\(assert\s+(.+)\)$/);
        if (assertMatch) {
          negatedPostClauses.push(`(assert (not ${assertMatch[1]}))`);
          postClauses.push(assertMatch[1]);
        }
      }
    }
  }

  if (negatedPostClauses.length === 0) {
    return {
      conformant: false,
      noVerifiableSpec: true,
      violation: {
        inputValues: {},
        outputValues: {},
        violatedSpec: '',
      },
      solverOutput: 'Skipped: no parseable post-conditions in spec DSL. The LLM-generated spec could not be translated to SMT2.',
      executionTimeMs: performance.now() - startTime,
      translatedSpecLines: specLines.length,
      parseErrors: translation.parseErrors,
    };
  }

  const allSmt2 = [...baseLines, ...specLines, ...negatedPostClauses, '(check-sat)', '(get-model)'].join('\n');
  const output = await runCvc5(allSmt2);
  const executionTimeMs = performance.now() - startTime;
  const satResult = parseFirstLine(output);

  if (satResult === 'unsat') {
    return {
      conformant: true,
      solverOutput: output,
      executionTimeMs,
      translatedSpecLines: specLines.length + negatedPostClauses.length,
    };
  }

  if (satResult === 'sat') {
    const modelStr = extractModelFromOutput(output);
    const model = parseModel(modelStr);
    const inputValues: Record<string, string> = {};
    const outputValues: Record<string, string> = {};
    for (const idx of inputIndices) {
      const name = indexToName.get(idx);
      if (name && model[String(idx)] !== undefined) inputValues[name] = model[String(idx)];
    }
    for (const idx of outputIndices) {
      const name = indexToName.get(idx);
      if (name && model[String(idx)] !== undefined) outputValues[name] = model[String(idx)];
    }
    return {
      conformant: false,
      violation: {
        inputValues,
        outputValues,
        violatedSpec: negatedPostClauses.slice(0, 3).join('; '),
      },
      solverOutput: output,
      executionTimeMs,
      translatedSpecLines: specLines.length + negatedPostClauses.length,
    };
  }

  return {
    conformant: false,
    solverOutput: output,
    executionTimeMs,
    translatedSpecLines: specLines.length + negatedPostClauses.length,
  };
}

async function checkCompleteness(
  constraints: ConstraintObject[],
  symbols: SymbolObject[],
  translation: SpecTranslation,
  inputIndices: number[],
  outputIndices: number[],
  indexToName: Map<number, string>,
): Promise<CompletenessConformanceResult> {
  const startTime = performance.now();
  const allIndices = extractAllSignalIndices(constraints, symbols);
  const spec = new SpecTranslator(process.env.P!, symbols);
  const baseLines = spec.generateBaseSMT2(constraints, allIndices);

  const specAssumptionLines: string[] = [];
  for (const assumption of translation.assumptions) {
    if (assumption.kind !== 'constant') {
      specAssumptionLines.push(...assumption.smt2Lines);
    }
  }
  for (const inv of translation.invariants) {
    if (inv.parseable) specAssumptionLines.push(...inv.smt2Lines);
  }

  const postClauses: string[] = [];
  for (const post of translation.posts) {
    if (post.parseable && post.smt2Lines.length > 0) {
      for (const line of post.smt2Lines) {
        const assertMatch = line.match(/^\(assert\s+(.+)\)$/);
        if (assertMatch) postClauses.push(assertMatch[1]);
      }
    }
  }

  const allSmt2 = [...baseLines, ...specAssumptionLines, ...postClauses.map(c => `(assert ${c})`), '(check-sat)', '(get-model)'].join('\n');
  const output = await runCvc5(allSmt2);
  const executionTimeMs = performance.now() - startTime;
  const satResult = parseFirstLine(output);

  if (satResult === 'sat') {
    return {
      complete: true,
      solverOutput: output,
      executionTimeMs,
    };
  }

  return {
    complete: false,
    solverOutput: output,
    executionTimeMs,
  };
}

async function checkDeterminism(
  constraints: ConstraintObject[],
  symbols: SymbolObject[],
  translation: SpecTranslation,
  inputIndices: number[],
  outputIndices: number[],
  indexToName: Map<number, string>,
): Promise<DeterminismConformanceResult> {
  const startTime = performance.now();
  const allIndices = extractAllSignalIndices(constraints, symbols);
  const spec = new SpecTranslator(process.env.P!, symbols);

  const lines: string[] = [];
  lines.push('(set-logic ALL)');
  lines.push(`(define-const P Int ${process.env.P})`);

  for (const idx of allIndices) {
    if (idx === 0) continue;
    lines.push(`(declare-fun s_${idx}_1 () Int)`);
    lines.push(`(declare-fun s_${idx}_2 () Int)`);
    lines.push(`(assert (and (>= s_${idx}_1 0) (< s_${idx}_1 P)))`);
    lines.push(`(assert (and (>= s_${idx}_2 0) (< s_${idx}_2 P)))`);
  }

  const baseLines = spec.generateBaseSMT2(constraints, allIndices);
  for (const line of baseLines) {
    if (line.startsWith('(set-logic') || line.startsWith('(define-const P') || line.startsWith('(declare-fun') || line.match(/^\(assert \(and \(>=/)) continue;
    const withSuffix1 = line.replace(/s_(\d+)\b/g, (_m: string, idx: string) => `s_${idx}_1`);
    lines.push(withSuffix1);
    const withSuffix2 = line.replace(/s_(\d+)\b/g, (_m: string, idx: string) => `s_${idx}_2`);
    lines.push(withSuffix2);
  }

  for (const assumption of translation.assumptions) {
    if (assumption.kind !== 'constant') {
      for (const smtLine of assumption.smt2Lines) {
        const withSuffix1 = smtLine.replace(/s_(\d+)\b/g, (_m: string, idx: string) => `s_${idx}_1`);
        const withSuffix2 = smtLine.replace(/s_(\d+)\b/g, (_m: string, idx: string) => `s_${idx}_2`);
        lines.push(withSuffix1);
        lines.push(withSuffix2);
      }
    }
  }

  for (const idx of inputIndices) {
    if (idx === 0) continue;
    lines.push(`(assert (= s_${idx}_1 s_${idx}_2))`);
  }

  if (outputIndices.length > 0) {
    const diffs = outputIndices.filter(idx => idx !== 0).map(idx => `(not (= s_${idx}_1 s_${idx}_2))`);
    lines.push(`(assert (or ${diffs.join(' ')}))`);
  }

  lines.push('(check-sat)');
  lines.push('(get-model)');

  const output = await runCvc5(lines.join('\n'));
  const executionTimeMs = performance.now() - startTime;
  const satResult = parseFirstLine(output);

  if (satResult === 'unsat') {
    return { deterministic: true, solverOutput: output, executionTimeMs };
  }

  if (satResult === 'sat') {
    const modelStr = extractModelFromOutput(output);
    const model1 = parseModelWithSuffix(modelStr, '_1');
    const model2 = parseModelWithSuffix(modelStr, '_2');
    const counterexample = {
      input: {} as Record<string, string>,
      output1: {} as Record<string, string>,
      output2: {} as Record<string, string>,
    };
    for (const idx of inputIndices) {
      const name = indexToName.get(idx);
      if (name && model1[String(idx)] !== undefined) counterexample.input[name] = model1[String(idx)];
    }
    for (const idx of outputIndices) {
      const name = indexToName.get(idx);
      if (name) {
        if (model1[String(idx)] !== undefined) counterexample.output1[name] = model1[String(idx)];
        if (model2[String(idx)] !== undefined) counterexample.output2[name] = model2[String(idx)];
      }
    }
    return { deterministic: false, counterexample, solverOutput: output, executionTimeMs };
  }

  return { deterministic: false, solverOutput: output, executionTimeMs };
}

async function checkTotality(
  constraints: ConstraintObject[],
  symbols: SymbolObject[],
  translation: SpecTranslation,
  inputIndices: number[],
  indexToName: Map<number, string>,
): Promise<TotalityConformanceResult> {
  const startTime = performance.now();
  const allIndices = extractAllSignalIndices(constraints, symbols);
  const spec = new SpecTranslator(process.env.P!, symbols);
  const baseLines = spec.generateBaseSMT2(constraints, allIndices);

  const specLines: string[] = [];
  for (const assumption of translation.assumptions) {
    if (assumption.kind !== 'constant') specLines.push(...assumption.smt2Lines);
  }
  for (const inv of translation.invariants) {
    if (inv.parseable) specLines.push(...inv.smt2Lines);
  }

  const allSmt2 = [...baseLines, ...specLines, '(check-sat)', '(get-model)'].join('\n');
  const output = await runCvc5(allSmt2);
  const executionTimeMs = performance.now() - startTime;
  const satResult = parseFirstLine(output);

  if (satResult === 'unsat') {
    const noWitnessInputs: Array<Record<string, string>> = [];
    const assumptionLines: string[] = [];
    for (const assumption of translation.assumptions) {
      if (assumption.kind !== 'constant') assumptionLines.push(...assumption.smt2Lines);
    }
    for (const inv of translation.invariants) {
      if (inv.parseable) assumptionLines.push(...inv.smt2Lines);
    }

    const witnessCheck = [...assumptionLines, '(check-sat)', '(get-model)'].join('\n');
    const witnessOutput = await runCvc5(witnessCheck);
    const witnessSat = parseFirstLine(witnessOutput);

    if (witnessSat === 'sat') {
      const modelStr = extractModelFromOutput(witnessOutput);
      const model = parseModel(modelStr);
      const inputs: Record<string, string> = {};
      for (const idx of inputIndices) {
        const name = indexToName.get(idx);
        if (name && model[String(idx)] !== undefined) inputs[name] = model[String(idx)];
      }
      noWitnessInputs.push(inputs);
    }

    return {
      total: false,
      noWitnessInputs: noWitnessInputs.length > 0 ? noWitnessInputs : undefined,
      solverOutput: output,
      executionTimeMs,
      checkedInputs: inputIndices.length,
    };
  }

  return {
    total: true,
    solverOutput: output,
    executionTimeMs,
    checkedInputs: inputIndices.length,
  };
}

export async function formalConformanceHandler(
  request: FastifyRequest<{ Body: formal_conformance_request }>,
  reply: FastifyReply
) {
  try {
    const { repo, entry, symPath, constraintsJsonPath, constraintIndices, candidateSpecDSL, queries } = request.body;

    logger.info(`Running formal conformance: repo=${repo}, entry=${entry}`);

    const primeField = process.env.P;
    if (!primeField) {
      return reply.code(500).send({
        success: false,
        error: 'Prime field P not configured in .env',
      } as formal_conformance_response);
    }

    const symbols = await parseSymFile(symPath);
    let constraints = await parseConstraintsFile(constraintsJsonPath);

    if (constraintIndices && constraintIndices.length > 0) {
      const indexSet = new Set(constraintIndices);
      const originalLen = constraints.length;
      constraints = constraints.filter((_, i) => indexSet.has(i));
      logger.info(`Filtered constraints: ${constraints.length}/${originalLen} (slice scope)`);
    }

    logger.info(`Loaded ${symbols.length} symbols, ${constraints.length} constraints`);

    const projectLoader = new ProjectLoader();
    const loadResult = await projectLoader.loadProject({
      repoName: repo,
      entryPath: entry,
      rootComponent: 'main',
      basePath: '',
    });

    if (loadResult.error) {
      return reply.code(400).send({
        success: false,
        error: `Failed to load project: ${loadResult.error}`,
      } as formal_conformance_response);
    }

    const absoluteEntryPath = loadResult.entryFile.path;

    const specTranslator = new SpecTranslator(primeField, symbols);
    const translation = specTranslator.translateSpec(candidateSpecDSL);

    logger.info(`Spec translation: ${translation.assumptions.length} assumptions, ${translation.posts.length} posts, ${translation.invariants.length} invariants, ${translation.parseErrors.length} errors`);

    const identifier = new OutputSignalIdentifier();
    const classification = await identifier.classifySignals(repo, absoluteEntryPath, symbols);
    const inputIndices = classification.inputIndices;
    const outputIndices = classification.outputIndices;
    const indexToName = new Map<number, string>();
    for (const sym of symbols) {
      indexToName.set(sym.index, sym.name);
    }

    const results: NonNullable<formal_conformance_response['results']> = {};

    if (queries.soundness) {
      logger.info('Running formal soundness check...');
      results.soundness = await checkSoundness(
        constraints, symbols, translation, inputIndices, outputIndices, indexToName
      );
      logger.info(`Soundness: ${results.soundness.conformant ? 'CONFORMANT' : 'VIOLATION'} (${results.soundness.executionTimeMs.toFixed(0)}ms)`);
    }

    if (queries.completeness) {
      logger.info('Running completeness check...');
      results.completeness = await checkCompleteness(
        constraints, symbols, translation, inputIndices, outputIndices, indexToName
      );
      logger.info(`Completeness: ${results.completeness.complete ? 'COMPLETE' : 'INCOMPLETE'} (${results.completeness.executionTimeMs.toFixed(0)}ms)`);
    }

    if (queries.determinism) {
      logger.info('Running determinism check...');
      results.determinism = await checkDeterminism(
        constraints, symbols, translation, inputIndices, outputIndices, indexToName
      );
      logger.info(`Determinism: ${results.determinism.deterministic ? 'DETERMINISTIC' : 'NON-DETERMINISTIC'} (${results.determinism.executionTimeMs.toFixed(0)}ms)`);
    }

    if (queries.totality) {
      logger.info('Running totality check...');
      results.totality = await checkTotality(
        constraints, symbols, translation, inputIndices, indexToName
      );
      logger.info(`Totality: ${results.totality.total ? 'TOTAL' : 'PARTIAL'} (${results.totality.executionTimeMs.toFixed(0)}ms)`);
    }

    const response: formal_conformance_response = {
      success: true,
      specTranslation: {
        assumptions: translation.assumptions.map(a => ({
          raw: a.raw,
          signal: a.signal,
          kind: a.kind,
          smt2Lines: a.smt2Lines,
        })),
        posts: translation.posts.map(p => ({
          raw: p.raw,
          kind: p.kind,
          lhsSignals: p.lhsSignals,
          rhsSignals: p.rhsSignals,
          smt2Lines: p.smt2Lines,
          parseable: p.parseable,
        })),
        invariants: translation.invariants.map(inv => ({
          raw: inv.raw,
          kind: inv.kind,
          smt2Lines: inv.smt2Lines,
          parseable: inv.parseable,
        })),
        parseErrors: translation.parseErrors,
      },
      results,
    };

    reply.send(response);
  } catch (error: any) {
    logger.error(`Formal conformance failed: ${error.message}`);
    reply.code(500).send({
      success: false,
      error: error.message,
    } as formal_conformance_response);
  }
}
