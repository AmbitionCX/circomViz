import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs/promises';

import { CircomLexer } from '../core/parser/lexer.js';
import { CircomParser } from '../core/parser/parser.js';
import { ProjectLoader } from '../core/project/loadProject.js';
import { DependencyGraph } from '../core/resolver/dependencyGraph.js';
import { IncludeResolver } from '../core/resolver/includeResolver.js';
import { buildTemplateTree } from '../server/routes/parseCircuit.js';
import { ErrorCollector } from '../utils/errors.js';

function parseFile(source: string, filePath: string): any {
  const parser = new CircomParser(new CircomLexer(source), filePath);
  const ast = parser.parse(source, filePath);
  return {
    templates: ast.filter((node) => node.type === 'TemplateDefinition'),
    components: ast.filter((node) => node.type === 'ComponentInstantiationNode'),
  };
}

function collectTreeComponents(tree: any): any[] {
  const components: any[] = [];
  const pending = [tree];

  while (pending.length > 0) {
    const current = pending.pop();
    for (const component of current?.components || []) {
      components.push(component);
      if (component.template) pending.push(component.template);
    }
  }

  return components;
}

describe('buildTemplateTree recursion handling', () => {
  it('terminates recursive edges without suppressing repeated siblings', () => {
    const source = `
      pragma circom 2.1.6;

      template Leaf() {
        signal output out;
        out <== 1;
      }

      template Recursive(n) {
        component child = Recursive(n - 1);
      }

      template Parent() {
        component first = Leaf();
        component second = Leaf();
        component recursive = Recursive(3);
      }
    `;
    const parsedFile = parseFile(source, '/test/recursive.circom');
    const parsedFiles = new Map([['/test/recursive.circom', parsedFile]]);
    const parent = parsedFile.templates.find((template: any) => template.name === 'Parent');
    const tree = buildTemplateTree(
      parent,
      parsedFiles,
      new DependencyGraph(new ErrorCollector()),
    );

    const leafInstances = tree.components.filter((component: any) => component.templateName === 'Leaf');
    assert.equal(leafInstances.length, 2);
    assert.ok(leafInstances.every((component: any) => component.template !== null));
    assert.ok(leafInstances.every((component: any) => !component.isRecursiveReference));

    const recursive = tree.components.find((component: any) => component.templateName === 'Recursive');
    assert.ok(recursive?.template);
    assert.equal(recursive.template.components.length, 1);
    assert.equal(recursive.template.components[0].templateName, 'Recursive');
    assert.equal(recursive.template.components[0].isRecursiveReference, true);
    assert.equal(recursive.template.components[0].template, null);
  });

  it('builds the complete zk-email tree with a terminal MultiAND reference', async () => {
    const errorCollector = new ErrorCollector();
    const projectLoader = new ProjectLoader();
    const includeResolver = new IncludeResolver(errorCollector);
    const dependencyGraph = new DependencyGraph(errorCollector);
    const loadResult = await projectLoader.loadProject({
      repoName: 'zk-email-verify',
      entryPath: 'packages/circuits/email-verifier.circom',
      rootComponent: 'EmailVerifier',
      basePath: '',
    });

    assert.ok(!loadResult.error, loadResult.error);
    includeResolver.setCurrentRepoPath(loadResult.repoPath!);

    const parsedFiles = new Map<string, any>();
    const pending = [loadResult.entryFile];
    const processed = new Set<string>();

    while (pending.length > 0) {
      const current = pending.shift()!;
      const normalizedPath = current.path.replace(/\\/g, '/');
      if (processed.has(normalizedPath)) continue;
      processed.add(normalizedPath);

      const parsedFile = await projectLoader.parseFile(current.path);
      parsedFiles.set(normalizedPath, parsedFile);

      for (const include of parsedFile.includes) {
        includeResolver.setCurrentFile(normalizedPath);
        const resolvedPath = await includeResolver.resolveInclude(include);
        if (!resolvedPath || processed.has(resolvedPath.replace(/\\/g, '/'))) continue;
        pending.push({
          path: resolvedPath,
          content: await fs.readFile(resolvedPath, 'utf-8'),
          relativePath: include.path,
        });
      }
    }

    const rootTemplate = [...parsedFiles.values()]
      .flatMap((file) => file.templates)
      .find((template) => template.name === 'EmailVerifier');
    assert.ok(rootTemplate);

    const tree = buildTemplateTree(rootTemplate, parsedFiles, dependencyGraph);
    assert.equal(tree.components.length, 17);

    const allComponents = collectTreeComponents(tree);
    const recursiveReferences = allComponents.filter((component) => component.isRecursiveReference);
    assert.deepEqual(recursiveReferences.map((component) => component.templateName), ['MultiAND']);
    assert.ok(recursiveReferences.every((component) => component.template === null));
  });
});
