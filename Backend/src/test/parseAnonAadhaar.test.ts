/**
 * Parser tests for the anon-aadhaar submodule.
 *
 * These tests exercise the circom lexer + parser (and the full include-resolution
 * pipeline) against real-world circom source from:
 *   submodules/anon-aadhaar/packages/circuits/
 *
 * Run after building:
 *   pnpm run build
 *   node --test dist/test/parseAnonAadhaar.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

import { CircomLexer } from '../core/parser/lexer.js';
import { CircomParser } from '../core/parser/parser.js';
import { ProjectLoader } from '../core/project/loadProject.js';
import { IncludeResolver } from '../core/resolver/includeResolver.js';
import { DependencyGraph } from '../core/resolver/dependencyGraph.js';
import { ErrorCollector } from '../utils/errors.js';
import type {
  ASTNode,
  TemplateDefinitionNode,
  FunctionDefinitionNode,
} from '../core/parser/ast.js';

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const BACKEND_ROOT = path.resolve(process.cwd());
const SUBMODULE_ROOT = path.resolve(BACKEND_ROOT, '..', 'submodules', 'anon-aadhaar');

/** Relative paths of every local (non-node_modules) .circom file. */
const LOCAL_FILES = [
  'packages/circuits/src/aadhaar-verifier.circom',
  'packages/circuits/src/aadhaar-qr-verifier.circom',
  'packages/circuits/src/helpers/constants.circom',
  'packages/circuits/src/helpers/extractor.circom',
  'packages/circuits/src/helpers/nullifier.circom',
  'packages/circuits/src/helpers/signature.circom',
  'packages/circuits/src/utils/pack.circom',
  'packages/circuits/test/circuits/extractor-test.circom',
  'packages/circuits/test/circuits/timestamp-test.circom',
] as const;

/** Expected template / function / top-level-component counts per file. */
const EXPECTED: Record<string, { templates: string[]; functions: string[]; components: string[] }> = {
  'packages/circuits/src/aadhaar-verifier.circom': {
    templates: [],
    functions: [],
    components: ['main'],
  },
  'packages/circuits/src/aadhaar-qr-verifier.circom': {
    templates: ['AadhaarQRVerifier'],
    functions: [],
    components: [],
  },
  'packages/circuits/src/helpers/constants.circom': {
    templates: [],
    functions: [
      'referenceIdPosition', 'namePosition', 'dobPosition', 'genderPosition',
      'pinCodePosition', 'statePosition', 'photoPosition', 'maxFieldByteSize',
      'photoPackSize',
    ],
    components: [],
  },
  'packages/circuits/src/helpers/extractor.circom': {
    templates: [
      'ExtractAndPackAsInt', 'TimestampExtractor', 'AgeExtractor',
      'GenderExtractor', 'PinCodeExtractor', 'PhotoExtractor', 'QRDataExtractor',
    ],
    functions: [],
    components: [],
  },
  'packages/circuits/src/helpers/nullifier.circom': {
    templates: ['Nullifier'],
    functions: [],
    components: [],
  },
  'packages/circuits/src/helpers/signature.circom': {
    templates: ['SignatureVerifier'],
    functions: [],
    components: [],
  },
  'packages/circuits/src/utils/pack.circom': {
    templates: ['DigitBytesToTimestamp'],
    functions: [],
    components: [],
  },
  'packages/circuits/test/circuits/extractor-test.circom': {
    templates: [],
    functions: [],
    components: ['main'],
  },
  'packages/circuits/test/circuits/timestamp-test.circom': {
    templates: [],
    functions: [],
    components: ['main'],
  },
};

/** Parse raw circom source code, returning the AST node array. */
function parseSource(content: string, filePath: string = 'test.circom'): ASTNode[] {
  const lexer = new CircomLexer(content);
  const parser = new CircomParser(lexer, filePath);
  return parser.parse(content, filePath);
}

/** Parse a file from the anon-aadhaar submodule by relative path. */
function parseSubmoduleFile(relPath: string): ASTNode[] {
  const fullPath = path.join(SUBMODULE_ROOT, relPath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  return parseSource(content, fullPath);
}

/** Extract template nodes from an AST. */
function getTemplates(ast: ASTNode[]): TemplateDefinitionNode[] {
  return ast.filter((n): n is TemplateDefinitionNode => n.type === 'TemplateDefinition');
}

/** Extract function nodes from an AST. */
function getFunctions(ast: ASTNode[]): FunctionDefinitionNode[] {
  return ast.filter((n): n is FunctionDefinitionNode => n.type === 'FunctionDefinition');
}

/** Extract top-level component instantiation names from an AST. */
function getTopLevelComponents(ast: ASTNode[]): string[] {
  return ast
    .filter((n: any) => n.type === 'ComponentInstantiationNode')
    .map((n: any) => n.name);
}

/** Recursively collect all values of a given node type anywhere in the AST. */
function collectNodes(ast: ASTNode[], nodeType: string): any[] {
  const results: any[] = [];

  const visit = (node: any): void => {
    if (!node || typeof node !== 'object') return;
    if (node.type === nodeType) results.push(node);

    for (const value of Object.values(node) as any[]) {
      if (Array.isArray(value)) {
        value.forEach((item: any) => visit(item));
      } else if (value && typeof value === 'object' && value.type) {
        visit(value);
      }
    }
  };

  ast.forEach(visit);
  return results;
}

// ---------------------------------------------------------------------------
// Section 1 — Per-file parsing (lexer + parser → AST)
// ---------------------------------------------------------------------------

describe('Per-file parsing of anon-aadhaar local circom files', () => {
  for (const relPath of LOCAL_FILES) {
    const expected = EXPECTED[relPath];

    describe(relPath, () => {
      let ast: ASTNode[];

      it('should parse without throwing', () => {
        ast = parseSubmoduleFile(relPath);
        assert.ok(ast !== undefined, 'parse() returned undefined');
      });

      it(`should find ${expected.templates.length} template(s)`, () => {
        ast = parseSubmoduleFile(relPath);
        const templates = getTemplates(ast);
        const names = templates.map((t) => t.name);
        assert.deepEqual(
          names.sort(),
          [...expected.templates].sort(),
          `Template mismatch. Got: ${names.join(', ')}`,
        );
      });

      it(`should find ${expected.functions.length} function(s)`, () => {
        ast = parseSubmoduleFile(relPath);
        const functions = getFunctions(ast);
        const names = functions.map((f) => f.name);
        assert.deepEqual(
          names.sort(),
          [...expected.functions].sort(),
          `Function mismatch. Got: ${names.join(', ')}`,
        );
      });

      if (expected.components.length > 0) {
        it(`should find top-level component(s): ${expected.components.join(', ')}`, () => {
          ast = parseSubmoduleFile(relPath);
          const components = getTopLevelComponents(ast);
          assert.deepEqual(
            components.sort(),
            [...expected.components].sort(),
            `Component mismatch. Got: ${components.join(', ')}`,
          );
        });
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Section 2 — Structural assertions on key templates
// ---------------------------------------------------------------------------

describe('AadhaarQRVerifier template structure', () => {
  let template: TemplateDefinitionNode;

  it('should locate the AadhaarQRVerifier template', () => {
    const ast = parseSubmoduleFile('packages/circuits/src/aadhaar-qr-verifier.circom');
    const templates = getTemplates(ast);
    template = templates.find((t) => t.name === 'AadhaarQRVerifier')!;
    assert.ok(template, 'AadhaarQRVerifier template not found');
  });

  it('should have 3 parameters: n, k, maxDataLength', () => {
    const ast = parseSubmoduleFile('packages/circuits/src/aadhaar-qr-verifier.circom');
    template = getTemplates(ast).find((t) => t.name === 'AadhaarQRVerifier')!;
    const paramNames = template.parameters.map((p) => p.name);
    assert.deepEqual(paramNames, ['n', 'k', 'maxDataLength']);
  });

  it('should have 11 input signals', () => {
    const ast = parseSubmoduleFile('packages/circuits/src/aadhaar-qr-verifier.circom');
    template = getTemplates(ast).find((t) => t.name === 'AadhaarQRVerifier')!;
    const inputs = template.signals.filter((s) => s.kind === 'input');
    assert.equal(inputs.length, 11, `Expected 11 inputs, got ${inputs.length}`);
  });

  it('should have 7 output signals', () => {
    const ast = parseSubmoduleFile('packages/circuits/src/aadhaar-qr-verifier.circom');
    template = getTemplates(ast).find((t) => t.name === 'AadhaarQRVerifier')!;
    const outputs = template.signals.filter((s) => s.kind === 'output');
    assert.equal(outputs.length, 7, `Expected 7 outputs, got ${outputs.length}`);
  });

  it('should have named component instantiations', () => {
    const ast = parseSubmoduleFile('packages/circuits/src/aadhaar-qr-verifier.circom');
    template = getTemplates(ast).find((t) => t.name === 'AadhaarQRVerifier')!;
    const compNames = template.components.map((c: any) => c.name);
    assert.ok(
      compNames.includes('signatureVerifier'),
      `Expected 'signatureVerifier' in components: ${compNames.join(', ')}`,
    );
    assert.ok(
      compNames.includes('qrDataExtractor'),
      `Expected 'qrDataExtractor' in components: ${compNames.join(', ')}`,
    );
    assert.ok(
      compNames.includes('n2bHeaderLength'),
      `Expected 'n2bHeaderLength' in components: ${compNames.join(', ')}`,
    );
  });

  it('should detect anonymous components in components array (AssertZeroPadding, Nullifier)', () => {
    const ast = parseSubmoduleFile('packages/circuits/src/aadhaar-qr-verifier.circom');
    template = getTemplates(ast).find((t) => t.name === 'AadhaarQRVerifier')!;
    const anonComps = template.components.filter((c: any) => c.isAnonymous);
    const templateNames = anonComps.map((c: any) => c.templateName);
    assert.ok(
      templateNames.includes('AssertZeroPadding'),
      `Expected anonymous component AssertZeroPadding. Got: ${templateNames.join(', ')}`,
    );
    assert.ok(
      templateNames.includes('Nullifier'),
      `Expected anonymous component Nullifier. Got: ${templateNames.join(', ')}`,
    );
  });
});

describe('QRDataExtractor template structure', () => {
  it('should have component array declarations (is255, indexBeforePhoto)', () => {
    const ast = parseSubmoduleFile('packages/circuits/src/helpers/extractor.circom');
    const template = getTemplates(ast).find((t) => t.name === 'QRDataExtractor')!;
    const compDecls = template.components.filter(
      (c: any) => c.type === 'ComponentDeclaration' || c.type === 'ComponentArrayInit',
    );
    const declNames = compDecls.map((c: any) => c.name);
    assert.ok(
      declNames.includes('is255'),
      `Expected component array 'is255'. Got: ${declNames.join(', ')}`,
    );
    assert.ok(
      declNames.includes('indexBeforePhoto'),
      `Expected component array 'indexBeforePhoto'. Got: ${declNames.join(', ')}`,
    );
  });

  it('should have a for loop in its body', () => {
    const ast = parseSubmoduleFile('packages/circuits/src/helpers/extractor.circom');
    const template = getTemplates(ast).find((t) => t.name === 'QRDataExtractor')!;
    const forLoops = collectNodes([template], 'ForLoop');
    assert.ok(forLoops.length >= 1, 'Expected at least one for loop');
  });

  it('should have named component instantiations inside the body', () => {
    const ast = parseSubmoduleFile('packages/circuits/src/helpers/extractor.circom');
    const template = getTemplates(ast).find((t) => t.name === 'QRDataExtractor')!;
    const namedComps = template.components
      .filter((c: any) => c.type === 'ComponentInstantiationNode')
      .map((c: any) => c.name);
    const expectedNames = [
      'timestampExtractor', 'ageExtractor', 'ageAbove18Checker',
      'genderExtractor', 'pinCodeExtractor', 'stateExtractor', 'photoExtractor',
    ];
    for (const name of expectedNames) {
      assert.ok(
        namedComps.includes(name),
        `Expected component '${name}' in QRDataExtractor. Got: ${namedComps.join(', ')}`,
      );
    }
  });
});

describe('TimestampExtractor inline signal initialization', () => {
  it('should parse signals with inline anonymous-component-call initialization', () => {
    const ast = parseSubmoduleFile('packages/circuits/src/helpers/extractor.circom');
    const template = getTemplates(ast).find((t) => t.name === 'TimestampExtractor')!;
    // signal output year <== DigitBytesToInt(4)([...]);
    const yearSignal = template.signals.find((s) => s.name === 'year');
    assert.ok(yearSignal, 'Signal "year" not found');
    assert.ok(yearSignal!.initialValue, 'Signal "year" should have an initialValue');
    assert.equal(yearSignal!.kind, 'output');
  });
});

describe('Nullifier template structure', () => {
  it('should have anonymous component in components array (Poseidon)', () => {
    const ast = parseSubmoduleFile('packages/circuits/src/helpers/nullifier.circom');
    const template = getTemplates(ast).find((t) => t.name === 'Nullifier')!;
    const anonComps = template.components.filter((c: any) => c.isAnonymous);
    const templateNames = anonComps.map((c: any) => c.templateName);
    assert.ok(
      templateNames.includes('Poseidon'),
      `Expected anonymous component Poseidon. Got: ${templateNames.join(', ')}`,
    );
  });

  it('should have signal input with function-call array size', () => {
    const ast = parseSubmoduleFile('packages/circuits/src/helpers/nullifier.circom');
    const template = getTemplates(ast).find((t) => t.name === 'Nullifier')!;
    const photoSignal = template.signals.find((s) => s.name === 'photo');
    assert.ok(photoSignal, 'Signal "photo" not found');
    assert.equal(photoSignal!.kind, 'input');
    assert.ok(photoSignal!.isArray, 'Signal "photo" should be an array');
  });
});

describe('constants.circom functions', () => {
  it('should parse all 9 functions with return statements', () => {
    const ast = parseSubmoduleFile('packages/circuits/src/helpers/constants.circom');
    const functions = getFunctions(ast);
    assert.equal(functions.length, 9);

    for (const fn of functions) {
      const returns = collectNodes([fn as any], 'Return');
      assert.ok(
        returns.length >= 1,
        `Function ${fn.name} should have a return statement`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Section 3 — Full pipeline integration test
// ---------------------------------------------------------------------------

describe('Full pipeline: parse anon-aadhaar with include resolution', () => {
  it('should load, resolve includes, and build the component tree', async () => {
    const repo = 'anon-aadhaar';
    const entry = 'packages/circuits/src/aadhaar-verifier.circom';
    const rootComponent = 'main';

    const errorCollector = new ErrorCollector();
    const projectLoader = new ProjectLoader();
    const includeResolver = new IncludeResolver(errorCollector);
    const dependencyGraph = new DependencyGraph(errorCollector);

    const loadResult = await projectLoader.loadProject({
      repoName: repo,
      entryPath: entry,
      rootComponent,
      basePath: '',
    });

    assert.ok(!loadResult.error, `loadProject failed: ${loadResult.error}`);
    assert.ok(loadResult.entryFile, 'entryFile should exist');

    const entryFile = loadResult.entryFile;
    const repoPath = loadResult.repoPath!;

    if (repoPath) {
      includeResolver.setCurrentRepoPath(repoPath);
    }
    includeResolver.setCurrentFile(entryFile.path);

    const parsedFiles = new Map<string, any>();
    const filesToProcess = [entryFile];
    const processedPaths = new Set<string>();

    while (filesToProcess.length > 0) {
      const currentFile = filesToProcess.shift()!;
      const normalizedPath = currentFile.path.replace(/\\/g, '/');

      if (processedPaths.has(normalizedPath)) continue;
      processedPaths.add(normalizedPath);

      try {
        const parsedFile = await projectLoader.parseFile(currentFile.path);
        parsedFiles.set(normalizedPath, parsedFile);
        dependencyGraph.addFile(normalizedPath);

        for (const include of parsedFile.includes) {
          includeResolver.setCurrentFile(normalizedPath);
          const resolvedPath = await includeResolver.resolveInclude(include);

          if (resolvedPath) {
            const normalizedIncludePath = resolvedPath.replace(/\\/g, '/');
            dependencyGraph.addDependency(normalizedPath, normalizedIncludePath);

            if (!processedPaths.has(normalizedIncludePath)) {
              const content = await fs.promises.readFile(resolvedPath, 'utf-8');
              filesToProcess.push({
                path: resolvedPath,
                content,
                relativePath: include.path,
              });
            }
          }
        }
      } catch (error: any) {
        errorCollector.error(`Failed to parse file: ${error.message}`, currentFile.path);
      }
    }

    // At least the 9 local files should be parsed
    assert.ok(
      parsedFiles.size >= 9,
      `Expected at least 9 parsed files, got ${parsedFiles.size}`,
    );

    // Find the root template
    const rootTemplate = findTemplateInFiles(parsedFiles, rootComponent);
    assert.ok(rootTemplate, `Root component '${rootComponent}' not found`);

    // The main component should instantiate AadhaarQRVerifier
    assert.equal(
      rootTemplate.type,
      'ComponentInstantiationNode',
      'main should be a ComponentInstantiationNode',
    );

    // Build the tree
    const tree = buildTree(rootTemplate, parsedFiles);
    assert.ok(tree, 'Tree should be built');
    assert.equal(tree.templateName, 'AadhaarQRVerifier');

    // The tree should have multiple child components
    assert.ok(
      tree.components.length >= 3,
      `Expected at least 3 top-level components in tree, got ${tree.components.length}`,
    );

    // Log errors for visibility (not assertions — these help find parser bugs)
    const errors = errorCollector.getAll().filter((e) => e.level === 'error');
    if (errors.length > 0) {
      console.log(
        `[INFO] ${errors.length} parse errors during full pipeline (potential parser bugs):`,
      );
      for (const err of errors) {
        console.log(`  [${err.level}] ${err.file}: ${err.message}`);
      }
    }
  });

  it('should resolve circomlib and @zk-email includes', async () => {
    const errorCollector = new ErrorCollector();
    const projectLoader = new ProjectLoader();
    const includeResolver = new IncludeResolver(errorCollector);

    const loadResult = await projectLoader.loadProject({
      repoName: 'anon-aadhaar',
      entryPath: 'packages/circuits/src/helpers/extractor.circom',
      rootComponent: '',
      basePath: '',
    });

    assert.ok(!loadResult.error);

    includeResolver.setCurrentRepoPath(loadResult.repoPath!);
    includeResolver.setCurrentFile(loadResult.entryFile.path);

    const parsedFile = await projectLoader.parseFile(loadResult.entryFile.path);

    const resolvedIncludes: string[] = [];
    const missingIncludes: string[] = [];

    for (const include of parsedFile.includes) {
      const resolved = await includeResolver.resolveInclude(include);
      if (resolved) {
        resolvedIncludes.push(include.path);
      } else {
        missingIncludes.push(include.path);
      }
    }

    assert.ok(
      resolvedIncludes.some((p) => p.includes('comparators')),
      `circomlib comparators include should resolve. Resolved: ${resolvedIncludes.join(', ')}`,
    );
    assert.ok(
      resolvedIncludes.some((p) => p.includes('bitify')),
      `circomlib bitify include should resolve. Resolved: ${resolvedIncludes.join(', ')}`,
    );
    assert.ok(
      resolvedIncludes.some((p) => p.startsWith('@zk-email')),
      `@zk-email include should resolve. Resolved: ${resolvedIncludes.join(', ')}`,
    );

    if (missingIncludes.length > 0) {
      console.log(`[INFO] Unresolved includes: ${missingIncludes.join(', ')}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Tree-building helpers (mirrors parseCircuit.ts logic for testing)
// ---------------------------------------------------------------------------

function findTemplateInFiles(parsedFiles: Map<string, any>, name: string): any | null {
  for (const [, file] of parsedFiles.entries()) {
    const template = file.templates.find((t: any) => t.name === name);
    if (template) return template;

    const component = file.components.find((c: any) => c.name === name);
    if (component) return component;
  }
  return null;
}

function extractComponentCalls(statements: any[]): any[] {
  const calls: any[] = [];
  let idx = 0;

  function visit(node: any): void {
    if (!node) return;

    if (node.type === 'ComponentCall') {
      calls.push({
        type: 'ComponentInstantiationNode',
        name: `Anonymous_${idx++}`,
        templateName: node.template,
        arguments: node.callArgs || [],
        isAnonymous: true,
      });
    }

    if (node.left) visit(node.left);
    if (node.right) visit(node.right);
    if (node.condition) visit(node.condition);
    if (node.thenExpr) visit(node.thenExpr);
    if (node.elseExpr) visit(node.elseExpr);
    if (node.operand) visit(node.operand);

    if (node.type === 'ComponentArrayInit' && node.initStatements) {
      node.initStatements.forEach((s: any) => visit(s));
    }
    if (node.elements) node.elements.forEach((e: any) => visit(e));
    if (node.array) visit(node.array);
    if (node.index) visit(node.index);
    if (node.object) visit(node.object);
    if (node.value) visit(node.value);

    if (node.type === 'Assignment') {
      visit(node.left);
      visit(node.right);
    }
    if (node.type === 'IfStatement') {
      node.thenBranch?.forEach((s: any) => visit(s));
      node.elseBranch?.forEach((s: any) => visit(s));
    }
    if (node.type === 'ForLoop' || node.type === 'WhileLoop') {
      node.body?.forEach((s: any) => visit(s));
    }
    if (node.type === 'Return') visit(node.value);
    if (node.type === 'Assert') {
      visit(node.condition);
      visit(node.message);
    }
    if (node.type === 'ExpressionStatement') visit(node.expression);
    if (node.type === 'BlockStatement') node.body?.forEach((s: any) => visit(s));
  }

  statements.forEach((s) => visit(s));
  return calls;
}

function buildTree(
  templateOrComponent: any,
  parsedFiles: Map<string, any>,
): any {
  const isComponent = templateOrComponent.type === 'ComponentInstantiationNode';

  const template = isComponent
    ? findTemplateInFiles(parsedFiles, templateOrComponent.templateName)
    : templateOrComponent;

  if (!template) return null;

  const tree: any = {
    name: templateOrComponent.name,
    templateName: isComponent ? templateOrComponent.templateName : template.name,
    parameters: template.parameters,
    signals: template.signals,
    components: [],
  };

  for (const component of template.components) {
    if (component.type === 'ComponentDeclaration' ||
        component.type === 'ComponentArrayInit' ||
        component.type === 'ComponentInstantiationWithInitNode') {
      continue;
    }
    if (!component.templateName) continue;

    const childTemplate = findTemplateInFiles(parsedFiles, component.templateName);
    tree.components.push({
      name: component.name,
      templateName: component.templateName,
      arguments: component.arguments,
      template: childTemplate ? buildTree(childTemplate, parsedFiles) : null,
    });
  }

  // Extract anonymous calls from statements
  const anonCalls = extractComponentCalls(template.statements);
  for (const anon of anonCalls) {
    if (!anon.templateName) continue;
    const childTemplate = findTemplateInFiles(parsedFiles, anon.templateName);
    tree.components.push({
      name: anon.name,
      templateName: anon.templateName,
      arguments: anon.arguments,
      isAnonymous: true,
      template: childTemplate ? buildTree(childTemplate, parsedFiles) : null,
    });
  }

  return tree;
}
