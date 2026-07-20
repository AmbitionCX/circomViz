import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

import { collectDirectComponents } from '../core/parser/componentCollector.js';
import { CircomLexer } from '../core/parser/lexer.js';
import { CircomParser } from '../core/parser/parser.js';
import type { TemplateDefinitionNode } from '../core/parser/ast.js';

function parseTemplate(source: string, name: string): TemplateDefinitionNode {
  const parser = new CircomParser(new CircomLexer(source), 'component-collector.test.circom');
  const ast = parser.parse(source, 'component-collector.test.circom');
  const template = ast.find(
    (node): node is TemplateDefinitionNode => node.type === 'TemplateDefinition' && node.name === name,
  );

  assert.ok(template, `Template ${name} was not parsed`);
  return template;
}

describe('collectDirectComponents', () => {
  it('collects inline, tuple, nested, anonymous, and array component sites', () => {
    const template = parseTemplate(`
      pragma circom 2.1.6;

      template Parent(n) {
        signal input source;
        signal values[2] <== Single(n)(source);
        signal (ok, revealed[2]) <== Tuple(n)(values);
        component calc = Num2Bits(log2Ceil(n));
        signal output forwarded <== calc.out;

        if (n > 0) {
          component named = Named(n);
          Anonymous(n)(values);
          component items[2];
          for (var i = 0; i < 2; i++) {
            items[i] = ArrayChild(n);
          }
        }
      }
    `, 'Parent');

    const components = collectDirectComponents(template);
    const templateNames = components.map((component) => component.templateName).sort();

    assert.deepEqual(templateNames, [
      'Anonymous',
      'ArrayChild',
      'Named',
      'Num2Bits',
      'Single',
      'Tuple',
    ]);
    assert.equal(components.find((component) => component.templateName === 'Single')?.name, 'values');
    assert.equal(components.find((component) => component.templateName === 'Tuple')?.name, 'ok');
    assert.equal(components.find((component) => component.templateName === 'ArrayChild')?.isArray, true);
    assert.ok(!templateNames.includes('log2Ceil'));
    assert.ok(!components.some((component) => component.name === 'forwarded'));
  });

  it('finds all direct EmailVerifier instantiation sites', () => {
    const sourcePath = path.resolve(
      process.cwd(),
      '..',
      'submodules',
      'zk-email-verify',
      'packages',
      'circuits',
      'email-verifier.circom',
    );
    const source = fs.readFileSync(sourcePath, 'utf-8');
    const template = parseTemplate(source, 'EmailVerifier');
    const components = collectDirectComponents(template);

    const counts = new Map<string, number>();
    for (const component of components) {
      counts.set(component.templateName, (counts.get(component.templateName) || 0) + 1);
    }

    assert.equal(components.length, 17);
    assert.deepEqual(Object.fromEntries([...counts.entries()].sort()), {
      AssertZeroPadding: 2,
      Base64Decode: 1,
      Bits2Num: 2,
      BodyHashRegex: 1,
      ByteMask: 2,
      Num2Bits: 2,
      PackBits: 1,
      PoseidonLarge: 1,
      RSAVerifier65537: 1,
      RemoveSoftLineBreaks: 1,
      SelectRegexReveal: 1,
      Sha256Bytes: 1,
      Sha256BytesPartial: 1,
    });

    const sha = components.find((component) => component.templateName === 'Sha256Bytes');
    assert.equal(sha?.name, 'sha');
    assert.equal(sha?.arguments.length, 1);
    assert.equal(sha?.callArgs?.length, 2);
    assert.ok(!components.some((component) => component.name === 'shaHi'));
    assert.ok(!components.some((component) => component.templateName === 'log2Ceil'));
  });
});
