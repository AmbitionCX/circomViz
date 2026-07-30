import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  instantiateReplacementPlan,
  type ChildReplacementPlan,
} from '../core/abstractCompile/parentRewriter.js';
import type { TemplateInterface } from '../core/abstractCompile/interfaceExtractor.js';
import { AbstractWrapperGenerator } from '../core/abstractCompile/abstractWrapperGenerator.js';
import { CircomLexer } from '../core/parser/lexer.js';
import { CircomParser } from '../core/parser/parser.js';

describe('ParentRewriter parameterized mock dimensions', () => {
  it('substitutes a child parameter with its parent-scope instantiation argument', () => {
    const iface: TemplateInterface = {
      templateName: 'Num2Bits',
      parameters: [{ name: 'n', isArray: false } as any],
      inputs: [{ name: 'in', kind: 'input', isArray: false, arraySizes: [] }],
      outputs: [{ name: 'out', kind: 'output', isArray: true, arraySizes: ['n'] }],
    };
    const plan: ChildReplacementPlan = {
      originalTemplateName: 'Num2Bits',
      replacementTemplateName: 'Num2Bits_mocked',
      inputNames: ['in'],
      syntheticInputs: [{
        name: '__mock_out',
        isArray: true,
        arraySizes: ['n'],
        forOutput: 'out',
      }],
      outputs: iface.outputs,
      isMock: true,
      isValidator: false,
    };

    const resolved = instantiateReplacementPlan(
      plan,
      iface,
      [{ type: 'Identifier', name: 'bitLength' }],
    );

    assert.deepEqual(resolved.syntheticInputs[0].arraySizes, ['bitLength']);
    assert.deepEqual(resolved.outputs[0].arraySizes, ['bitLength']);
    assert.deepEqual(plan.syntheticInputs[0].arraySizes, ['n']);
  });

  it('substitutes parameters inside expressions and parenthesizes compound arguments', () => {
    const iface: TemplateInterface = {
      templateName: 'SizedChild',
      parameters: [{ name: 'n', isArray: false } as any],
      inputs: [],
      outputs: [{ name: 'out', kind: 'output', isArray: true, arraySizes: ['n+1'] }],
    };
    const plan: ChildReplacementPlan = {
      originalTemplateName: 'SizedChild',
      replacementTemplateName: 'SizedChild_mocked',
      inputNames: [],
      syntheticInputs: [{
        name: '__mock_out',
        isArray: true,
        arraySizes: ['n+1'],
        forOutput: 'out',
      }],
      outputs: iface.outputs,
      isMock: true,
      isValidator: false,
    };

    const resolved = instantiateReplacementPlan(
      plan,
      iface,
      [{
        type: 'BinaryOp',
        operator: '+',
        left: { type: 'Identifier', name: 'width' },
        right: { type: 'Literal', value: 2 },
      }],
    );

    assert.deepEqual(resolved.syntheticInputs[0].arraySizes, ['(width + 2)+1']);
  });
});

describe('AbstractWrapperGenerator parameterized child outputs', () => {
  it('uses the parent-scope argument for a mocked child output dimension', () => {
    const source = `pragma circom 2.1.6;

template Num2Bits(n) {
    signal input in;
    signal output out[n];
    for (var i = 0; i < n; i++) {
        out[i] <== in;
    }
}

template VarShiftLeft(maxArrayLen) {
    var bitLength = maxArrayLen;
    signal input in;
    signal output out;
    component n2b = Num2Bits(bitLength);
    n2b.in <== in;
    out <== n2b.out[0];
}
`;
    const filePath = '/tmp/parameterized-mock.circom';
    const parser = new CircomParser(new CircomLexer(source), filePath);
    const ast = parser.parse(source, filePath);
    const parsedFile: any = {
      path: filePath,
      content: source,
      ast,
      includes: ast.filter((node: any) => node.type === 'Include'),
      templates: ast.filter((node: any) => node.type === 'TemplateDefinition'),
      functions: ast.filter((node: any) => node.type === 'FunctionDefinition'),
      components: ast.filter((node: any) => node.type === 'ComponentInstantiationNode'),
    };
    const root = parsedFile.templates.find((template: any) => template.name === 'VarShiftLeft');
    const generator = new AbstractWrapperGenerator(new Map([[filePath, parsedFile]]));

    const result = generator.build(
      root,
      ['Num2Bits'],
      [{ name: 'maxArrayLen', value: 8 }],
      [],
      { pragmaVersion: '2.1.6' },
    );

    assert.match(result.templateSource, /signal input __mock_n2b_out\[bitLength\];/);
    assert.match(result.templateSource, /__mock_n2b___mock_out_i0 < bitLength/);
    assert.doesNotMatch(result.templateSource, /signal input __mock_n2b_out\[n\];/);
  });
});
