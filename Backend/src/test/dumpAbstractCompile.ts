/**
 * Dump the generated abstract-partial-compile wrappers for a set of
 * representative scenarios to a single human-readable text file for
 * manual inspection.
 *
 * Mirrors the pattern of dumpAnonAadhaarAST.ts.
 *
 * Build & run:
 *   pnpm run build
 *   node dist/test/dumpAbstractCompile.js
 *
 * Output: logs/abstract-compile/abstract-compile-dump.txt
 */

import * as fs from 'fs';
import * as path from 'path';

import { CircomLexer } from '../core/parser/lexer.js';
import { CircomParser } from '../core/parser/parser.js';
import type { ParsedFile, TemplateDefinitionNode } from '../core/parser/ast.js';
import { AbstractWrapperGenerator } from '../core/abstractCompile/index.js';
import type { AbstractWrapperResult } from '../core/abstractCompile/index.js';

const BACKEND_ROOT = path.resolve(process.cwd());
const OUTPUT_DIR = path.join(BACKEND_ROOT, 'logs', 'abstract-compile');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'abstract-compile-dump.txt');

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

function findTemplate(file: ParsedFile, name: string): TemplateDefinitionNode {
  const t = file.templates.find((x) => x.name === name);
  if (!t) throw new Error(`template ${name} not found in ${file.path}`);
  return t;
}

function makeParsedFilesMap(...files: ParsedFile[]): Map<string, ParsedFile> {
  const m = new Map<string, ParsedFile>();
  for (const f of files) m.set(f.path, f);
  return m;
}

// ---------------------------------------------------------------------------
// Scenarios (mirror abstractCompile.test.ts "Print" describe block)
// ---------------------------------------------------------------------------

interface Scenario {
  title: string;
  childSrc: string;
  parentSrc: string;
  confirmed: string[];
  params: { name: string; value: number }[];
  publicSignals?: string[];
}

const SCENARIOS: Scenario[] = [
  {
    title: 'SCENARIO 1: simple Square (confirmed) + Parent (user section 2 example)',
    childSrc: `
      template Square() {
        signal input x;
        signal output y;
        y <== x * x;
      }
    `,
    parentSrc: `
      template Parent() {
        signal input a;
        signal output z;
        component s = Square();
        s.x <== a;
        z <== s.y + 1;
      }
    `,
    confirmed: ['Square'],
    params: [],
  },
  {
    title: 'SCENARIO 2: Splitter with TWO outputs (even, odd)',
    childSrc: `
      template Splitter() {
        signal input x;
        signal output even;
        signal output odd;
        even <== x * 2;
        odd <== x * 2 + 1;
      }
    `,
    parentSrc: `
      template Parent() {
        signal input a;
        signal output z;
        component sp = Splitter();
        sp.x <== a;
        z <== sp.even + sp.odd;
      }
    `,
    confirmed: ['Splitter'],
    params: [],
  },
  {
    title: 'SCENARIO 3: Multiplier(N) with array output out[N]',
    childSrc: `
      template Multiplier(N) {
        signal input in[N];
        signal output out[N];
        signal tmp;
        for (var i = 0; i < N; i++) {
          out[i] <== in[i] * in[i];
        }
      }
    `,
    parentSrc: `
      template Parent(N) {
        signal input a[N];
        signal output z;
        component m = Multiplier(N);
        for (var i = 0; i < N; i++) {
          m.in[i] <== a[i];
        }
        z <== m.out[0] + m.out[1];
      }
    `,
    confirmed: ['Multiplier'],
    params: [{ name: 'N', value: 2 }],
  },
  {
    title: 'SCENARIO 4: RangeCheck validator child (no outputs) — should warn',
    childSrc: `
      template RangeCheck(n) {
        signal input in;
        signal input upper;
      }
    `,
    parentSrc: `
      template Parent() {
        signal input a;
        signal output z;
        component rc = RangeCheck(8);
        rc.in <== a;
        rc.upper <== 255;
        z <== a + 1;
      }
    `,
    confirmed: ['RangeCheck'],
    params: [],
  },
  {
    title: 'SCENARIO 5: Square (confirmed) + Doubler (NOT confirmed — kept expanded)',
    childSrc: `
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
    `,
    parentSrc: `
      template Parent() {
        signal input a;
        signal output z;
        component s = Square();
        component d = Doubler();
        s.x <== a;
        d.x <== a;
        z <== s.y + d.y;
      }
    `,
    confirmed: ['Square'],
    params: [],
  },
  {
    title: 'SCENARIO 6: two instances s1, s2 of Square (each gets its own boundary input)',
    childSrc: `
      template Square() {
        signal input x;
        signal output y;
        y <== x * x;
      }
    `,
    parentSrc: `
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
    `,
    confirmed: ['Square'],
    params: [],
  },
  {
    title: 'SCENARIO 7: empty confirm set (backward compatible, no mocks)',
    childSrc: `
      template Square() {
        signal input x;
        signal output y;
        y <== x * x;
      }
    `,
    parentSrc: `
      template Parent() {
        signal input a;
        signal output z;
        component s = Square();
        s.x <== a;
        z <== s.y + 1;
      }
    `,
    confirmed: [],
    params: [],
  },
];

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatScenario(title: string, result: AbstractWrapperResult, scenario: Scenario): string {
  const bar = '='.repeat(100);
  const lines: string[] = [];

  lines.push(bar);
  lines.push(title);
  lines.push(bar);
  lines.push('');

  lines.push('--- inputs ---');
  lines.push(`  confirmed:     [${scenario.confirmed.join(', ')}]`);
  lines.push(`  params:        ${JSON.stringify(scenario.params)}`);
  lines.push(`  publicSignals: ${JSON.stringify(scenario.publicSignals ?? [])}`);
  lines.push('');

  lines.push('--- meta ---');
  lines.push(JSON.stringify({
    partialTemplateName: result.partialTemplateName,
    mockedChildren: result.mockedChildren,
    unmockedChildren: result.unmockedChildren,
    validatorWarnings: result.validatorWarnings,
    boundaryInputs: result.boundaryInputs,
  }, null, 2));
  lines.push('');

  lines.push('--- generated wrapper.circom ---');
  lines.push(result.wrapperCode);
  lines.push('--- end ---');
  lines.push('');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const headerLines = [
    '╔' + '═'.repeat(98) + '╗',
    '║  Abstract Partial Compile — Mock Template Dump' + ' '.repeat(48) + '║',
    '║  Generated: ' + new Date().toISOString() + ' '.repeat(57) + '║',
    '╚' + '═'.repeat(98) + '╝',
    '',
    'Each scenario shows:',
    '  - inputs:    the confirmed template names + parent params',
    '  - meta:      structured result (mocked/unmocked children, warnings, boundary inputs)',
    '  - generated: the full wrapper.circom source (what circom would compile)',
    '',
    '',
  ];

  const sections: string[] = [headerLines.join('\n')];

  let passCount = 0;
  let failCount = 0;

  for (const scenario of SCENARIOS) {
    try {
      const childFile = parseSource(scenario.childSrc, '/repo/child.circom');
      const parentFile = parseSource(scenario.parentSrc, '/repo/parent.circom');
      const parsedFiles = makeParsedFilesMap(childFile, parentFile);

      const gen = new AbstractWrapperGenerator(parsedFiles);
      const parent = findTemplate(parentFile, 'Parent');
      const result = gen.build(
        parent,
        scenario.confirmed,
        scenario.params,
        scenario.publicSignals ?? [],
        { originalFilePath: '/repo/parent.circom' },
      );

      sections.push(formatScenario(scenario.title, result, scenario));
      passCount++;
    } catch (err: any) {
      const bar = '='.repeat(100);
      sections.push(`${bar}\n${scenario.title}\n${bar}\n\n  ERROR: ${err.message}\n${err.stack ?? ''}\n\n`);
      failCount++;
    }
  }

  const footer = [
    '',
    '═'.repeat(100),
    `Summary: ${passCount}/${SCENARIOS.length} scenarios succeeded, ${failCount} failed.`,
    '═'.repeat(100),
    '',
  ].join('\n');
  sections.push(footer);

  fs.writeFileSync(OUTPUT_FILE, sections.join('\n'), 'utf-8');

  console.log(`Abstract compile dump written to: ${OUTPUT_FILE}`);
  console.log(`File size: ${Math.round(fs.statSync(OUTPUT_FILE).size / 1024)} KB`);
  console.log(`Scenarios: ${passCount} ok, ${failCount} failed`);
}

main();
