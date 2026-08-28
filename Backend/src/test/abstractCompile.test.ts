/**
 * Abstract Partial Compile tests.
 *
 * Validates the backend pipeline that takes a selected template + a set of
 * "confirmed" child template names, and produces a rewritten wrapper where
 * confirmed children are replaced with interface-only mock templates
 * (Mode A), so the resulting R1CS ignores the children's internal constraints.
 *
 * Run after building:
 *   pnpm run build
 *   node --test dist/test/abstractCompile.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CircomLexer } from '../core/parser/lexer.js';
import { CircomParser } from '../core/parser/parser.js';
import type { ASTNode, ParsedFile, TemplateDefinitionNode } from '../core/parser/ast.js';

import { InterfaceExtractor } from '../core/abstractCompile/interfaceExtractor.js';
import { MockTemplateGenerator } from '../core/abstractCompile/mockTemplateGenerator.js';
import { ParentRewriter } from '../core/abstractCompile/parentRewriter.js';
import { AbstractWrapperGenerator } from '../core/abstractCompile/abstractWrapperGenerator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSource(content: string, filePath = 'test.circom'): ParsedFile {
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

function findTemplate(file: ParsedFile, name: string): TemplateDefinitionNode {
  const t = file.templates.find((x) => x.name === name);
  if (!t) throw new Error(`template ${name} not found`);
  return t;
}

// ---------------------------------------------------------------------------
// InterfaceExtractor
// ---------------------------------------------------------------------------

describe('InterfaceExtractor', () => {
  it('extracts input/output ports for a simple template', () => {
    const file = parseSource(`
      template Square() {
        signal input x;
        signal output y;
        y <== x * x;
      }
    `);
    const ext = new InterfaceExtractor(makeParsedFilesMap(file));
    const iface = ext.extract('Square');
    assert.ok(iface);
    assert.equal(iface!.inputs.length, 1);
    assert.equal(iface!.outputs.length, 1);
    assert.equal(iface!.inputs[0].name, 'x');
    assert.equal(iface!.outputs[0].name, 'y');
    assert.equal(iface!.outputs[0].isArray, false);
  });

  it('handles array outputs with parameter-driven size', () => {
    const file = parseSource(`
      template Child(N) {
        signal input in[N];
        signal output out[2];
      }
    `);
    const ext = new InterfaceExtractor(makeParsedFilesMap(file));
    const iface = ext.extract('Child');
    assert.ok(iface);
    assert.equal(iface!.inputs[0].name, 'in');
    assert.equal(iface!.inputs[0].isArray, true);
    assert.deepEqual(iface!.inputs[0].arraySizes, ['N']);
    assert.equal(iface!.outputs[0].isArray, true);
    assert.deepEqual(iface!.outputs[0].arraySizes, [2]);
  });

  it('keeps local constants required by interface dimensions', () => {
    const file = parseSource(`
      template Batch(levels) {
        var ARITY = 5;
        var WIDTH = ARITY - 1;
        signal input path[levels][WIDTH];
      }
    `);
    const ext = new InterfaceExtractor(makeParsedFilesMap(file));
    const iface = ext.extract('Batch');
    assert.ok(iface);
    assert.deepEqual(iface!.variables, [
      { name: 'ARITY', value: '5' },
      { name: 'WIDTH', value: 'ARITY - 1' },
    ]);
    const mock = new MockTemplateGenerator().generate(iface!);
    assert.match(mock.source, /var ARITY = 5;/);
    assert.match(mock.source, /var WIDTH = ARITY - 1;/);
    assert.match(mock.source, /signal input path\[levels\]\[WIDTH\];/);
  });

  it('returns null for unknown template', () => {
    const ext = new InterfaceExtractor(new Map());
    assert.equal(ext.extract('Nope'), null);
  });
});

// ---------------------------------------------------------------------------
// MockTemplateGenerator
// ---------------------------------------------------------------------------

describe('MockTemplateGenerator', () => {
  it('produces a mock with mock-input feeder + equality assignment', () => {
    const gen = new MockTemplateGenerator();
    const iface = {
      templateName: 'Square',
      parameters: [],
      inputs: [{ name: 'x', kind: 'input' as const, isArray: false, arraySizes: [] }],
      outputs: [{ name: 'y', kind: 'output' as const, isArray: false, arraySizes: [] }],
    };
    const result = gen.generate(iface);
    assert.equal(result.templateName, 'Square_mocked');
    assert.equal(result.isValidator, false);
    assert.ok(result.source.includes('signal input x;'));
    assert.ok(result.source.includes('signal output y;'));
    assert.ok(result.source.includes('signal input __mock_y;'));
    assert.ok(result.source.includes('y <== __mock_y;'));
  });

  it('flags validator templates (no outputs) and emits empty body', () => {
    const gen = new MockTemplateGenerator();
    const iface = {
      templateName: 'RangeCheck',
      parameters: [{ name: 'n', isArray: false }],
      inputs: [{ name: 'in', kind: 'input' as const, isArray: false, arraySizes: [] }],
      outputs: [],
    };
    const result = gen.generate(iface);
    assert.equal(result.isValidator, true);
    assert.ok(result.source.includes('signal input in;'));
    assert.ok(!result.source.includes('__mock'));
  });

  it('emits a for-loop feeder for array outputs', () => {
    const gen = new MockTemplateGenerator();
    const iface = {
      templateName: 'Pair',
      parameters: [],
      inputs: [],
      outputs: [{ name: 'out', kind: 'output' as const, isArray: true, arraySizes: [2] }],
    };
    const result = gen.generate(iface);
    assert.ok(result.source.includes('signal output out[2];'));
    assert.ok(result.source.includes('signal input __mock_out[2];'));
    assert.ok(result.source.includes('for (var __mock_out_i0 = 0; __mock_out_i0 < 2; __mock_out_i0++)'));
    assert.ok(result.source.includes('out[__mock_out_i0] <== __mock_out[__mock_out_i0];'));
  });
});

// ---------------------------------------------------------------------------
// ParentRewriter
// ---------------------------------------------------------------------------

describe('ParentRewriter', () => {
  it('eliminates confirmed child, replaces output references with boundary signals', () => {
    const childFile = parseSource(`
      template Square() {
        signal input x;
        signal output y;
        y <== x * x;
      }
    `, 'child.circom');
    const parentFile = parseSource(`
      template Parent() {
        signal input a;
        signal output z;
        component s = Square();
        s.x <== a;
        z <== s.y + 1;
      }
    `, 'parent.circom');
    const parsedFiles = makeParsedFilesMap(childFile, parentFile);
    const ext = new InterfaceExtractor(parsedFiles);
    const iface = ext.extract('Square')!;
    const interfaceMap = new Map([['Square', iface]]);
    const rewriter = new ParentRewriter(new Set(['Square']), interfaceMap);
    const parent = findTemplate(parentFile, 'Parent');
    const out = rewriter.rewrite(parent, parentFile.content);

    assert.equal(out.templateName, 'Parent_Partial');
    assert.equal(out.mockedInstances.length, 1);
    assert.equal(out.mockedInstances[0].name, 's');
    assert.equal(out.mockedInstances[0].templateName, 'Square');

    assert.ok(out.source.includes('component s = Square_mocked();'), 'component shell preserved');
    assert.ok(out.source.includes('s.x <== a;'), 'original input wiring preserved');
    assert.ok(out.source.includes('signal input __mock_s_y;'), 'synthetic boundary input declared');
    assert.ok(out.source.includes('s.__mock_y <== __mock_s_y;'), 'synthetic child input wired');
    assert.ok(out.source.includes('z <== s.y + 1;'), 'original output wiring preserved');
  });

  it('leaves unconfirmed children fully expanded', () => {
    const childFile = parseSource(`
      template Unconfirmed() {
        signal input x;
        signal output y;
        y <== x + 1;
      }
    `, 'child.circom');
    const parentFile = parseSource(`
      template Parent() {
        signal input a;
        signal output z;
        component c = Unconfirmed();
        c.x <== a;
        z <== c.y;
      }
    `, 'parent.circom');
    const parsedFiles = makeParsedFilesMap(childFile, parentFile);
    const ext = new InterfaceExtractor(parsedFiles);
    const interfaceMap = new Map([['Unconfirmed', ext.extract('Unconfirmed')!]]);
    const rewriter = new ParentRewriter(new Set(), interfaceMap);
    const parent = findTemplate(parentFile, 'Parent');
    const out = rewriter.rewrite(parent, parentFile.content);

    assert.equal(out.mockedInstances.length, 0);
    assert.ok(out.source.includes('component c = Unconfirmed();'));
    assert.ok(!out.source.includes('Unconfirmed_mocked'));
  });

  it('warns on validator-style confirmed child (no outputs)', () => {
    const childFile = parseSource(`
      template RangeCheck(n) {
        signal input in;
      }
    `, 'child.circom');
    const parentFile = parseSource(`
      template Parent() {
        signal input a;
        component rc = RangeCheck(8);
        rc.in <== a;
      }
    `, 'parent.circom');
    const parsedFiles = makeParsedFilesMap(childFile, parentFile);
    const ext = new InterfaceExtractor(parsedFiles);
    const interfaceMap = new Map([['RangeCheck', ext.extract('RangeCheck')!]]);
    const rewriter = new ParentRewriter(new Set(['RangeCheck']), interfaceMap);
    const parent = findTemplate(parentFile, 'Parent');
    const out = rewriter.rewrite(parent, parentFile.content);

    assert.equal(out.validatorWarnings.length, 1);
    assert.equal(out.validatorWarnings[0].templateName, 'RangeCheck');
    assert.equal(out.mockedInstances.length, 1);
    assert.equal(out.boundaryInputs.length, 0);
  });
});

// ---------------------------------------------------------------------------
// AbstractWrapperGenerator (end-to-end)
// ---------------------------------------------------------------------------

describe('AbstractWrapperGenerator', () => {
  it('assembles pragma + include + rewritten parent + main (no mock templates)', () => {
    const childFile = parseSource(`
      template Square() {
        signal input x;
        signal output y;
        y <== x * x;
      }
    `, '/repo/square.circom');
    const parentFile = parseSource(`
      template Parent() {
        signal input a;
        signal output z;
        component s = Square();
        s.x <== a;
        z <== s.y + 1;
      }
    `, '/repo/parent.circom');
    const parsedFiles = makeParsedFilesMap(childFile, parentFile);

    const gen = new AbstractWrapperGenerator(parsedFiles);
    const parent = findTemplate(parentFile, 'Parent');
    const result = gen.build(parent, ['Square'], [], [], {
      originalFilePath: '/repo/parent.circom',
    });

    assert.ok(result.wrapperCode.includes('pragma circom 2.2.3;'));
    assert.ok(result.wrapperCode.includes('include "/repo/parent.circom";'));
    assert.ok(result.wrapperCode.includes('template Square_mocked()'), 'mock shell emitted');
    assert.ok(result.wrapperCode.includes('template Parent_Partial()'));
    assert.ok(result.wrapperCode.includes('component main = Parent_Partial();'));
    assert.ok(result.wrapperCode.includes('signal input __mock_s_y;'), 'synthetic boundary input');
    assert.ok(result.wrapperCode.includes('component s = Square_mocked();'), 'mock shell instantiated');
    assert.ok(result.wrapperCode.includes('s.x <== a;'), 'input wiring retained');
    assert.ok(result.wrapperCode.includes('s.__mock_y <== __mock_s_y;'), 'synthetic output routed');
    assert.ok(result.wrapperCode.includes('z <== s.y + 1;'), 'output wiring retained');
    assert.deepEqual(result.mockedChildren, ['Square']);
    assert.equal(result.boundaryInputs.length, 1);
    assert.equal(result.boundaryInputs[0].instance, 's');
    assert.equal(result.boundaryInputs[0].signal, '__mock_s_y');
  });

  it('eliminates child and replaces output references', () => {
    const childFile = parseSource(`
      template Doubler() {
        signal input x;
        signal output y;
        signal tmp;
        tmp <== x + x;
        y <== tmp + x;
      }
    `, 'child.circom');
    const parentFile = parseSource(`
      template Parent() {
        signal input a;
        signal output z;
        component d = Doubler();
        d.x <== a;
        z <== d.y;
      }
    `, 'parent.circom');
    const parsedFiles = makeParsedFilesMap(childFile, parentFile);
    const gen = new AbstractWrapperGenerator(parsedFiles);
    const parent = findTemplate(parentFile, 'Parent');
    const result = gen.build(parent, ['Doubler'], [], []);

    assert.ok(result.mockedChildren.includes('Doubler'));
    assert.ok(result.wrapperCode.includes('template Doubler_mocked()'), 'mock shell emitted');
    assert.ok(result.wrapperCode.includes('component d = Doubler_mocked();'), 'component shell preserved');
    assert.ok(result.wrapperCode.includes('d.x <== a;'), 'input assignment preserved');
    assert.ok(result.wrapperCode.includes('__mock_d_y'), 'synthetic boundary signal');
    assert.ok(result.wrapperCode.includes('d.__mock_y <== __mock_d_y;'), 'synthetic output routed');
    assert.ok(result.wrapperCode.includes('z <== d.y;'), 'output reference preserved');
  });

  it('handles backward-compatible empty confirmation (no mocks emitted)', () => {
    const file = parseSource(`
      template Parent() {
        signal input a;
        signal output z;
        z <== a + 1;
      }
    `);
    const parsedFiles = makeParsedFilesMap(file);
    const gen = new AbstractWrapperGenerator(parsedFiles);
    const parent = findTemplate(file, 'Parent');
    const result = gen.build(parent, [], [], []);

    assert.deepEqual(result.mockedChildren, []);
    assert.deepEqual(result.boundaryInputs, []);
    assert.ok(result.wrapperCode.includes('component main = Parent_Partial();'));
  });
});

// ---------------------------------------------------------------------------
// Print: mocked templates for manual inspection
//
// These tests print the generated wrapper source so a human can eyeball
// the rewrite for bugs. They use trivial assertions (the print IS the test).
//
//   pnpm run build && node --test dist/test/abstractCompile.test.js
//
// ---------------------------------------------------------------------------

describe('Print: mocked templates (manual inspection)', () => {
  function banner(title: string) {
    const bar = '='.repeat(72);
    console.log('\n' + bar);
    console.log(title);
    console.log(bar);
  }

  function printWrapper(title: string, wrapperCode: string, meta?: any) {
    banner(title);
    if (meta) {
      console.log('--- meta ---');
      console.log(JSON.stringify(meta, null, 2));
    }
    console.log('--- generated wrapper.circom ---');
    console.log(wrapperCode);
    console.log('--- end ---\n');
  }

  it('scenario 1: simple Square + Parent (user section 2 example)', () => {
    const childFile = parseSource(`
      template Square() {
        signal input x;
        signal output y;
        y <== x * x;
      }
    `, 'child.circom');
    const parentFile = parseSource(`
      template Parent() {
        signal input a;
        signal output z;
        component s = Square();
        s.x <== a;
        z <== s.y + 1;
      }
    `, 'parent.circom');

    const gen = new AbstractWrapperGenerator(makeParsedFilesMap(childFile, parentFile));
    const parent = findTemplate(parentFile, 'Parent');
    const result = gen.build(parent, ['Square'], [], [], {
      originalFilePath: '/repo/parent.circom',
    });

    printWrapper('SCENARIO 1: simple Square (confirmed) + Parent', result.wrapperCode, {
      mockedChildren: result.mockedChildren,
      boundaryInputs: result.boundaryInputs,
      validatorWarnings: result.validatorWarnings,
    });
    assert.ok(result.wrapperCode.length > 0);
  });

  it('scenario 2: child with multiple outputs', () => {
    const childFile = parseSource(`
      template Splitter() {
        signal input x;
        signal output even;
        signal output odd;
        even <== x * 2;
        odd <== x * 2 + 1;
      }
    `, 'child.circom');
    const parentFile = parseSource(`
      template Parent() {
        signal input a;
        signal output z;
        component sp = Splitter();
        sp.x <== a;
        z <== sp.even + sp.odd;
      }
    `, 'parent.circom');

    const gen = new AbstractWrapperGenerator(makeParsedFilesMap(childFile, parentFile));
    const parent = findTemplate(parentFile, 'Parent');
    const result = gen.build(parent, ['Splitter'], [], [], {
      originalFilePath: '/repo/parent.circom',
    });

    printWrapper('SCENARIO 2: Splitter with TWO outputs (even, odd)', result.wrapperCode, {
      boundaryInputs: result.boundaryInputs,
    });
    assert.ok(result.wrapperCode.length > 0);
  });

  it('scenario 3: child with array output', () => {
    const childFile = parseSource(`
      template Multiplier(N) {
        signal input in[N];
        signal output out[N];
        signal tmp;
        for (var i = 0; i < N; i++) {
          out[i] <== in[i] * in[i];
        }
      }
    `, 'child.circom');
    const parentFile = parseSource(`
      template Parent(N) {
        signal input a[N];
        signal output z;
        component m = Multiplier(N);
        for (var i = 0; i < N; i++) {
          m.in[i] <== a[i];
        }
        z <== m.out[0] + m.out[1];
      }
    `, 'parent.circom');

    const gen = new AbstractWrapperGenerator(makeParsedFilesMap(childFile, parentFile));
    const parent = findTemplate(parentFile, 'Parent');
    const result = gen.build(parent, ['Multiplier'], [{ name: 'N', value: 2 }], [], {
      originalFilePath: '/repo/parent.circom',
    });

    printWrapper('SCENARIO 3: Multiplier(N) with array output out[N]', result.wrapperCode, {
      boundaryInputs: result.boundaryInputs,
    });
    assert.ok(result.wrapperCode.length > 0);
  });

  it('scenario 4: validator-style child (no outputs)', () => {
    const childFile = parseSource(`
      template RangeCheck(n) {
        signal input in;
        signal input upper;
      }
    `, 'child.circom');
    const parentFile = parseSource(`
      template Parent() {
        signal input a;
        signal output z;
        component rc = RangeCheck(8);
        rc.in <== a;
        rc.upper <== 255;
        z <== a + 1;
      }
    `, 'parent.circom');

    const gen = new AbstractWrapperGenerator(makeParsedFilesMap(childFile, parentFile));
    const parent = findTemplate(parentFile, 'Parent');
    const result = gen.build(parent, ['RangeCheck'], [], [], {
      originalFilePath: '/repo/parent.circom',
    });

    printWrapper('SCENARIO 4: RangeCheck validator child (no outputs) — should warn', result.wrapperCode, {
      validatorWarnings: result.validatorWarnings,
      boundaryInputs: result.boundaryInputs,
    });
    assert.ok(result.validatorWarnings.length > 0);
  });

  it('scenario 5: mix of confirmed + unconfirmed children', () => {
    const childFile = parseSource(`
      template Square() {
        signal input x;
        signal output y;
        y <== x * x;
      }
      template Doubler() {
        signal input x;
        signal output y;
        y <== x + x;
      }
    `, 'child.circom');
    const parentFile = parseSource(`
      template Parent() {
        signal input a;
        signal output z;
        component s = Square();
        component d = Doubler();
        s.x <== a;
        d.x <== a;
        z <== s.y + d.y;
      }
    `, 'parent.circom');

    const gen = new AbstractWrapperGenerator(makeParsedFilesMap(childFile, parentFile));
    const parent = findTemplate(parentFile, 'Parent');
    const result = gen.build(parent, ['Square'], [], [], {
      originalFilePath: '/repo/parent.circom',
    });

    printWrapper(
      'SCENARIO 5: Square (confirmed) + Doubler (NOT confirmed — kept expanded)',
      result.wrapperCode,
      {
        mockedChildren: result.mockedChildren,
        unmockedChildren: result.unmockedChildren,
      },
    );
    assert.ok(result.mockedChildren.includes('Square'));
    assert.ok(result.wrapperCode.includes('component d = Doubler();'), 'unconfirmed Doubler kept');
  });

  it('scenario 6: two instances of the same confirmed template', () => {
    const childFile = parseSource(`
      template Square() {
        signal input x;
        signal output y;
        y <== x * x;
      }
    `, 'child.circom');
    const parentFile = parseSource(`
      template Parent() {
        signal input a;
        signal input b;
        signal output z;
        component s1 = Square();
        component s2 = Square();
        s1.x <== a;
        s2.x <== b;
        z <== s1.y + s2.y;
      }
    `, 'parent.circom');

    const gen = new AbstractWrapperGenerator(makeParsedFilesMap(childFile, parentFile));
    const parent = findTemplate(parentFile, 'Parent');
    const result = gen.build(parent, ['Square'], [], [], {
      originalFilePath: '/repo/parent.circom',
    });

    printWrapper(
      'SCENARIO 6: two instances s1, s2 of Square (each gets its own boundary input)',
      result.wrapperCode,
      { boundaryInputs: result.boundaryInputs },
    );
    assert.ok(result.wrapperCode.includes('__mock_s1_y'));
    assert.ok(result.wrapperCode.includes('__mock_s2_y'));
  });

  it('scenario 7: no children confirmed (backward compatible)', () => {
    const childFile = parseSource(`
      template Square() {
        signal input x;
        signal output y;
        y <== x * x;
      }
    `, 'child.circom');
    const parentFile = parseSource(`
      template Parent() {
        signal input a;
        signal output z;
        component s = Square();
        s.x <== a;
        z <== s.y + 1;
      }
    `, 'parent.circom');

    const gen = new AbstractWrapperGenerator(makeParsedFilesMap(childFile, parentFile));
    const parent = findTemplate(parentFile, 'Parent');
    const result = gen.build(parent, [], [], [], {
      originalFilePath: '/repo/parent.circom',
    });

    printWrapper('SCENARIO 7: empty confirm set (should still produce Parent_Partial, no mocks)', result.wrapperCode, {
      mockedChildren: result.mockedChildren,
    });
    assert.deepEqual(result.mockedChildren, []);
  });
});


describe('Component shell mock contract', () => {
  it('preserves DonorRecord signals and ToyCommit2 component boundaries', () => {
    const file = parseSource(`
      template ToyCommit2() {
        signal input x;
        signal input secret;
        signal output commitment;
        commitment <== x * 13 + secret * 17;
      }
      template DonorRecord() {
        signal input donorId;
        signal input donorSecret;
        signal output donorCommit;
        component c = ToyCommit2();
        c.x <== donorId;
        c.secret <== donorSecret;
        donorCommit <== c.commitment;
      }
    `, 'donor.circom');
    const generator = new AbstractWrapperGenerator(makeParsedFilesMap(file));
    const result = generator.build(findTemplate(file, 'DonorRecord'), ['ToyCommit2'], [], []);

    assert.ok(result.wrapperCode.includes('template ToyCommit2_mocked()'));
    assert.ok(result.wrapperCode.includes('signal input x;'));
    assert.ok(result.wrapperCode.includes('signal input secret;'));
    assert.ok(result.wrapperCode.includes('signal output commitment;'));
    assert.ok(result.wrapperCode.includes('signal input __mock_commitment;'));
    assert.ok(result.wrapperCode.includes('commitment <== __mock_commitment;'));
    assert.ok(result.wrapperCode.includes('signal input donorId;'));
    assert.ok(result.wrapperCode.includes('signal input donorSecret;'));
    assert.ok(result.wrapperCode.includes('signal output donorCommit;'));
    assert.ok(result.wrapperCode.includes('signal input __mock_c_commitment;'));
    assert.ok(result.wrapperCode.includes('component c = ToyCommit2_mocked();'));
    assert.ok(result.wrapperCode.includes('c.x <== donorId;'));
    assert.ok(result.wrapperCode.includes('c.secret <== donorSecret;'));
    assert.ok(result.wrapperCode.includes('c.__mock_commitment <== __mock_c_commitment;'));
    assert.ok(result.wrapperCode.includes('donorCommit <== c.commitment;'));
    assert.ok(result.wrapperCode.indexOf('c.__mock_commitment <== __mock_c_commitment;') < result.wrapperCode.indexOf('donorCommit <== c.commitment;'));
  });

  it('clones ancestors and routes synthetic inputs along a nested instance path', () => {
    const file = parseSource(`
      template ToyCommit2() {
        signal input x;
        signal output commitment;
        commitment <== x * x;
      }
      template DonorLayer() {
        signal input donorId;
        signal output donorCommit;
        component c = ToyCommit2();
        c.x <== donorId;
        donorCommit <== c.commitment;
      }
      template Parent() {
        signal input id;
        signal output result;
        component donor = DonorLayer();
        donor.donorId <== id;
        result <== donor.donorCommit;
      }
    `, 'nested.circom');
    const generator = new AbstractWrapperGenerator(makeParsedFilesMap(file));
    const result = generator.build(findTemplate(file, 'Parent'), ['ToyCommit2'], [], []);

    assert.ok(result.wrapperCode.includes('template ToyCommit2_mocked()'));
    assert.ok(result.wrapperCode.includes('template DonorLayer_Partial()'));
    assert.ok(result.wrapperCode.includes('component c = ToyCommit2_mocked();'));
    assert.ok(result.wrapperCode.includes('signal input __mock_c_commitment;'));
    assert.ok(result.wrapperCode.includes('template Parent_Partial()'));
    assert.ok(result.wrapperCode.includes('component donor = DonorLayer_Partial();'));
    assert.ok(result.wrapperCode.includes('signal input __mock_donor_c_commitment;'));
    assert.ok(result.wrapperCode.includes('donor.__mock_c_commitment <== __mock_donor_c_commitment;'));
    assert.ok(result.wrapperCode.includes('result <== donor.donorCommit;'));
  });
});
