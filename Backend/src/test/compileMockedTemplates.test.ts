/**
 * Compilation tests for mocked (abstract partial compile) wrappers.
 *
 * Each scenario:
 *   1. Constructs child + parent circom source (inline, no circomlib dependency)
 *   2. Generates a mocked wrapper via AbstractWrapperGenerator
 *   3. Compiles both the mocked wrapper AND the origin wrapper with circom
 *   4. Asserts the mocked wrapper compiles successfully and (where applicable)
 *      has fewer constraints than the origin
 *
 * Run after building:
 *   pnpm run build
 *   node --test dist/test/compileMockedTemplates.test.js
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { CircomLexer } from '../core/parser/lexer.js';
import { CircomParser } from '../core/parser/parser.js';
import type { ParsedFile, TemplateDefinitionNode } from '../core/parser/ast.js';
import { AbstractWrapperGenerator } from '../core/abstractCompile/index.js';

const execAsync = promisify(exec);

// ---------------------------------------------------------------------------
// Precondition: circom must be installed
// ---------------------------------------------------------------------------

let circomAvailable = false;
before(() => {
  try {
    execSync('circom --version', { stdio: 'pipe' });
    circomAvailable = true;
  } catch {
    circomAvailable = false;
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSource(content: string, filePath: string): ParsedFile {
  const lexer = new CircomLexer(content);
  const parser = new CircomParser(lexer, filePath);
  const ast = parser.parse(content, filePath);
  const includes: any[] = [];
  const templates: any[] = [];
  const functions: any[] = [];
  const components: any[] = [];
  for (const node of ast) {
    if (node.type === 'Include') includes.push(node);
    else if (node.type === 'TemplateDefinition') templates.push(node);
    else if (node.type === 'FunctionDefinition') functions.push(node);
    else if (node.type === 'ComponentInstantiationNode') components.push(node as any);
  }
  return { path: filePath, content, ast, includes, templates, functions, components };
}

function makeParsedFilesMap(...files: ParsedFile[]): Map<string, ParsedFile> {
  const m = new Map<string, ParsedFile>();
  for (const f of files) m.set(f.path, f);
  return m;
}

interface CompileResult {
  success: boolean;
  constraintCount: number;
  quadraticConstraintCount: number;
  output: string;
}

async function compileToR1CS(
  wrapperCode: string,
  includeDirs: string[],
): Promise<CompileResult> {
  const dir = path.join(os.tmpdir(), `circom-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.promises.mkdir(dir, { recursive: true });
  const wrapperPath = path.join(dir, 'wrapper.circom');
  await fs.promises.writeFile(wrapperPath, wrapperCode, 'utf-8');

  const includeFlags = includeDirs.map((d) => `-l "${d}"`).join(' ');
  const cmd = `circom ${includeFlags} "${wrapperPath}" --r1cs --json --sym --O0 -o "${dir}"`;

  try {
    const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 1024 * 1024 * 10, cwd: dir });
    let constraintCount = 0;
    let quadraticConstraintCount = 0;
    try {
      const json = JSON.parse(await fs.promises.readFile(path.join(dir, 'wrapper_constraints.json'), 'utf-8'));
      const constraints = json.constraints ?? [];
      constraintCount = constraints.length;
      quadraticConstraintCount = constraints.filter((c: any[]) => {
        const aKeys = Object.keys(c[0] ?? {});
        const bKeys = Object.keys(c[1] ?? {});
        return aKeys.length > 0 && bKeys.length > 0;
      }).length;
    } catch { /* empty */ }
    return { success: true, constraintCount, quadraticConstraintCount, output: stdout + stderr };
  } catch (e: any) {
    return { success: false, constraintCount: 0, quadraticConstraintCount: 0, output: (e.stderr ?? e.message ?? String(e)).slice(0, 2000) };
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

interface ScenarioOptions {
  confirmedTemplateNames: string[];
  params?: { name: string; value: number }[];
  publicSignals?: string[];
}

interface ScenarioResult {
  mockedWrapperCode: string;
  mockedCompile: CompileResult;
  originCompile: CompileResult;
  mockedChildren: string[];
  boundaryInputs: Array<{ instance: string; signal: string; isArray: boolean }>;
}

async function runScenario(
  childSources: Record<string, string>,
  parentSource: string,
  parentFilename: string,
  opts: ScenarioOptions,
): Promise<ScenarioResult> {
  const dir = path.join(os.tmpdir(), `scenario-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.promises.mkdir(dir, { recursive: true });

  for (const [filename, content] of Object.entries(childSources)) {
    await fs.promises.writeFile(path.join(dir, filename), content, 'utf-8');
  }
  const parentPath = path.join(dir, parentFilename);
  await fs.promises.writeFile(parentPath, parentSource, 'utf-8');

  const files: ParsedFile[] = [];
  for (const filename of Object.keys(childSources)) {
    files.push(parseSource(childSources[filename], path.join(dir, filename)));
  }
  files.push(parseSource(parentSource, parentPath));
  const parsedFiles = makeParsedFilesMap(...files);

  const parent = files[files.length - 1].templates.find((t) => t.name === 'Parent') as TemplateDefinitionNode;
  if (!parent) throw new Error('Template "Parent" not found in parent source');

  const gen = new AbstractWrapperGenerator(parsedFiles);
  const abstractResult = gen.build(
    parent,
    opts.confirmedTemplateNames,
    opts.params ?? [],
    opts.publicSignals ?? [],
    { originalFilePath: parentPath },
  );

  // Generate origin wrapper (simple, non-mocked)
  const originWrapperCode = `pragma circom 2.2.3;\ninclude "${parentPath}";\ncomponent main = Parent(${(opts.params ?? []).map((p) => p.value).join(', ')});`;

  const [mockedCompile, originCompile] = await Promise.all([
    compileToR1CS(abstractResult.wrapperCode, [dir]),
    compileToR1CS(originWrapperCode, [dir]),
  ]);

  await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});

  return {
    mockedWrapperCode: abstractResult.wrapperCode,
    mockedCompile,
    originCompile,
    mockedChildren: abstractResult.mockedChildren,
    boundaryInputs: abstractResult.boundaryInputs,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Compile mocked templates', () => {
  before(function (this: any) {
    if (!circomAvailable) this.skip();
  });

  // ---- Scenario 1: simple single child ----

  it('scenario 1: simple single child (Square)', async () => {
    const result = await runScenario(
      { 'children.circom': `template Square() {
  signal input x;
  signal output y;
  y <== x * x;
}` },
      `pragma circom 2.2.3;
include "children.circom";
template Parent() {
  signal input a;
  signal output z;
  component s = Square();
  s.x <== a;
  z <== s.y + 1;
}`,
      'parent.circom',
      { confirmedTemplateNames: ['Square'] },
    );

    assert.ok(result.mockedCompile.success, `Mocked compile failed:\n${result.mockedCompile.output}`);
    assert.ok(result.originCompile.success, `Origin compile failed:\n${result.originCompile.output}`);
    assert.deepEqual(result.mockedChildren, ['Square']);
    assert.ok(
      result.mockedCompile.quadraticConstraintCount < result.originCompile.quadraticConstraintCount,
      `Mocked quadratic (${result.mockedCompile.quadraticConstraintCount}) should be < origin quadratic (${result.originCompile.quadraticConstraintCount})`,
    );
  });

  // ---- Scenario 2: multiple different children ----

  it('scenario 2: multiple different children (Square + Doubler)', async () => {
    const result = await runScenario(
      { 'children.circom': `template Square() {
  signal input x;
  signal output y;
  y <== x * x;
}
template Doubler() {
  signal input x;
  signal output y;
  y <== x + x;
}` },
      `pragma circom 2.2.3;
include "children.circom";
template Parent() {
  signal input a;
  signal output z;
  component s = Square();
  component d = Doubler();
  s.x <== a;
  d.x <== a;
  z <== s.y + d.y;
}`,
      'parent.circom',
      { confirmedTemplateNames: ['Square', 'Doubler'] },
    );

    assert.ok(result.mockedCompile.success, `Mocked compile failed:\n${result.mockedCompile.output}`);
    assert.ok(result.originCompile.success, `Origin compile failed:\n${result.originCompile.output}`);
    assert.deepEqual(result.mockedChildren.sort(), ['Doubler', 'Square']);
    assert.ok(
      result.mockedCompile.quadraticConstraintCount < result.originCompile.quadraticConstraintCount,
      `Mocked quadratic (${result.mockedCompile.quadraticConstraintCount}) should be < origin quadratic (${result.originCompile.quadraticConstraintCount})`,
    );
  });

  // ---- Scenario 3: partial confirmed ----

  it('scenario 3: partial confirmed (Square confirmed, Doubler not)', async () => {
    const result = await runScenario(
      { 'children.circom': `template Square() {
  signal input x;
  signal output y;
  y <== x * x;
}
template Doubler() {
  signal input x;
  signal output y;
  y <== x + x;
}` },
      `pragma circom 2.2.3;
include "children.circom";
template Parent() {
  signal input a;
  signal output z;
  component s = Square();
  component d = Doubler();
  s.x <== a;
  d.x <== a;
  z <== s.y + d.y;
}`,
      'parent.circom',
      { confirmedTemplateNames: ['Square'] },
    );

    assert.ok(result.mockedCompile.success, `Mocked compile failed:\n${result.mockedCompile.output}`);
    assert.deepEqual(result.mockedChildren, ['Square']);
    assert.ok(result.mockedWrapperCode.includes('component d = Doubler();'), 'Doubler should NOT be mocked');
    assert.ok(result.mockedWrapperCode.includes('__s_y'), 'Square eliminated, boundary signal present');
  });

  // ---- Scenario 4: component array ----

  it('scenario 4: component array (IsEqual via arr[i] = IsEqual())', async () => {
    const result = await runScenario(
      { 'children.circom': `template IsEqual() {
  signal input in[2];
  signal output out;
  out <== (in[0] - in[1]) * (1 - (in[0] - in[1]));
}` },
      `pragma circom 2.2.3;
include "children.circom";
template Parent() {
  signal input a[4];
  signal output z;
  component checkers[4];
  for (var i = 0; i < 4; i++) {
    checkers[i] = IsEqual();
    checkers[i].in[0] <== a[i];
    checkers[i].in[1] <== i;
  }
  z <== checkers[0].out + checkers[1].out + checkers[2].out + checkers[3].out;
}`,
      'parent.circom',
      { confirmedTemplateNames: ['IsEqual'] },
    );

    assert.ok(result.mockedCompile.success, `Mocked compile failed:\n${result.mockedCompile.output}`);
    assert.ok(result.originCompile.success, `Origin compile failed:\n${result.originCompile.output}`);
    assert.deepEqual(result.mockedChildren, ['IsEqual']);
    const arrayBoundary = result.boundaryInputs.find((b) => b.instance === 'checkers');
    assert.ok(arrayBoundary, 'Should have boundary for checkers array');
    assert.ok(arrayBoundary!.isArray, 'Boundary should be array');
  });

  // ---- Scenario 5: parameterized array size ----

  it('scenario 5: parameterized array size (Compare(n) via arr[i] = Compare(n))', async () => {
    const result = await runScenario(
      { 'children.circom': `template Compare(n) {
  signal input in[2];
  signal output out;
  out <== (in[0] - in[1]) * (1 - (in[0] - in[1]));
}` },
      `pragma circom 2.2.3;
include "children.circom";
template Parent(N) {
  signal input a[N];
  signal output z;
  var half = N \\ 2;
  component cmps[half];
  for (var i = 0; i < half; i++) {
    cmps[i] = Compare(N);
    cmps[i].in[0] <== a[i];
    cmps[i].in[1] <== a[i + half];
  }
  z <== cmps[0].out;
}`,
      'parent.circom',
      { confirmedTemplateNames: ['Compare'], params: [{ name: 'N', value: 4 }] },
    );

    assert.ok(result.mockedCompile.success, `Mocked compile failed:\n${result.mockedCompile.output}`);
    assert.ok(result.originCompile.success, `Origin compile failed:\n${result.originCompile.output}`);
    assert.deepEqual(result.mockedChildren, ['Compare']);
  });

  // ---- Scenario 6: validator child (no output) ----

  it('scenario 6: validator child (no output)', async () => {
    const result = await runScenario(
      { 'children.circom': `template RangeCheck(n) {
  signal input in;
  signal intermediate;
  intermediate <== in * in;
}` },
      `pragma circom 2.2.3;
include "children.circom";
template Parent() {
  signal input a;
  signal output z;
  component rc = RangeCheck(8);
  rc.in <== a;
  z <== a + 1;
}`,
      'parent.circom',
      { confirmedTemplateNames: ['RangeCheck'] },
    );

    assert.ok(result.mockedCompile.success, `Mocked compile failed:\n${result.mockedCompile.output}`);
    assert.deepEqual(result.mockedChildren, ['RangeCheck']);
    assert.ok(result.boundaryInputs.length === 0, 'Validator child should have no boundary inputs');
  });

  // ---- Scenario 7: multiple instances of same template ----

  it('scenario 7: multiple instances of same template (s1, s2)', async () => {
    const result = await runScenario(
      { 'children.circom': `template Square() {
  signal input x;
  signal output y;
  y <== x * x;
}` },
      `pragma circom 2.2.3;
include "children.circom";
template Parent() {
  signal input a;
  signal input b;
  signal output z;
  component s1 = Square();
  component s2 = Square();
  s1.x <== a;
  s2.x <== b;
  z <== s1.y + s2.y;
}`,
      'parent.circom',
      { confirmedTemplateNames: ['Square'] },
    );

    assert.ok(result.mockedCompile.success, `Mocked compile failed:\n${result.mockedCompile.output}`);
    assert.ok(result.originCompile.success, `Origin compile failed:\n${result.originCompile.output}`);
    assert.ok(result.mockedWrapperCode.includes('__s1_y'), 'Should have boundary for s1');
    assert.ok(result.mockedWrapperCode.includes('__s2_y'), 'Should have boundary for s2');
    assert.ok(
      result.mockedCompile.quadraticConstraintCount < result.originCompile.quadraticConstraintCount,
      `Mocked quadratic (${result.mockedCompile.quadraticConstraintCount}) should be < origin quadratic (${result.originCompile.quadraticConstraintCount})`,
    );
  });

  // ---- Scenario 8: array + simple mix ----

  it('scenario 8: array + simple mix (IsEqual array + Square simple)', async () => {
    const result = await runScenario(
      { 'children.circom': `template IsEqual() {
  signal input in[2];
  signal output out;
  out <== (in[0] - in[1]) * (1 - (in[0] - in[1]));
}
template Square() {
  signal input x;
  signal output y;
  y <== x * x;
}` },
      `pragma circom 2.2.3;
include "children.circom";
template Parent() {
  signal input a;
  signal output z;
  component sq = Square();
  sq.x <== a;
  component checkers[3];
  for (var i = 0; i < 3; i++) {
    checkers[i] = IsEqual();
    checkers[i].in[0] <== a;
    checkers[i].in[1] <== i;
  }
  z <== sq.y + checkers[0].out + checkers[1].out + checkers[2].out;
}`,
      'parent.circom',
      { confirmedTemplateNames: ['IsEqual', 'Square'] },
    );

    assert.ok(result.mockedCompile.success, `Mocked compile failed:\n${result.mockedCompile.output}`);
    assert.ok(result.originCompile.success, `Origin compile failed:\n${result.originCompile.output}`);
    assert.deepEqual(result.mockedChildren.sort(), ['IsEqual', 'Square']);
    assert.ok(result.mockedWrapperCode.includes('__sq_y'), 'Simple component boundary');
    assert.ok(result.mockedWrapperCode.includes('__checkers_out'), 'Array component boundary');
  });

  // ---- Scenario 9: realistic multi-component with loops ----

  it('scenario 9: realistic multi-component with loops (Add + Mul)', async () => {
    const result = await runScenario(
      { 'children.circom': `template Add() {
  signal input in[2];
  signal output out;
  out <== in[0] + in[1];
}
template Mul() {
  signal input in[2];
  signal output out;
  out <== in[0] * in[1];
}` },
      `pragma circom 2.2.3;
include "children.circom";
template Parent() {
  signal input a[4];
  signal output z;
  component adders[2];
  component mulers[2];
  for (var i = 0; i < 2; i++) {
    adders[i] = Add();
    adders[i].in[0] <== a[i * 2];
    adders[i].in[1] <== a[i * 2 + 1];
    mulers[i] = Mul();
    mulers[i].in[0] <== a[i];
    mulers[i].in[1] <== a[i + 2];
  }
  z <== adders[0].out + adders[1].out + mulers[0].out + mulers[1].out;
}`,
      'parent.circom',
      { confirmedTemplateNames: ['Add', 'Mul'] },
    );

    assert.ok(result.mockedCompile.success, `Mocked compile failed:\n${result.mockedCompile.output}`);
    assert.ok(result.originCompile.success, `Origin compile failed:\n${result.originCompile.output}`);
    assert.deepEqual(result.mockedChildren.sort(), ['Add', 'Mul']);
    assert.ok(
      result.mockedCompile.quadraticConstraintCount < result.originCompile.quadraticConstraintCount,
      `Mocked quadratic (${result.mockedCompile.quadraticConstraintCount}) should be < origin quadratic (${result.originCompile.quadraticConstraintCount})`,
    );
  });
});
