import type { ParsedFile, TemplateDefinitionNode } from '../parser/ast.js';
import type { MockManifest } from '../../types/partialDebugging.js';
import { InterfaceExtractor, type TemplateInterface } from './interfaceExtractor.js';
import { MockTemplateGenerator, type MockTemplateResult } from './mockTemplateGenerator.js';
import {
  ParentRewriter,
  type ChildReplacementPlan,
  type RewrittenParentResult,
  type ValidatorWarning as AbstractValidatorWarning,
} from './parentRewriter.js';

export interface AbstractWrapperResult {
  wrapperCode: string;
  templateSource: string;
  entryTemplateName: string;
  partialTemplateName: string;
  mockedChildren: string[];
  mockedTemplateNames: string[];
  unmockedChildren: string[];
  validatorWarnings: AbstractValidatorWarning[];
  boundaryInputs: Array<{ instance: string; signal: string; isArray: boolean }>;
  mockManifest: MockManifest;
}

export interface BuildOptions {
  partialSuffix?: string;
  pragmaVersion?: string;
  originalFilePath?: string;
}

interface RecursiveRewrite {
  rewritten: RewrittenParentResult;
  changed: boolean;
}

export class AbstractWrapperGenerator {
  private parsedFiles: Map<string, ParsedFile>;
  private extractor: InterfaceExtractor;

  constructor(parsedFiles: Map<string, ParsedFile>) {
    this.parsedFiles = parsedFiles;
    this.extractor = new InterfaceExtractor(parsedFiles);
  }

  build(
    parentDef: TemplateDefinitionNode,
    confirmedTemplateNames: string[],
    params: { name: string; value: number }[],
    publicSignals: string[],
    opts: BuildOptions = {},
  ): AbstractWrapperResult {
    const confirmSet = new Set(confirmedTemplateNames);
    const partialSuffix = opts.partialSuffix ?? '_Partial';
    const pragmaVersion = opts.pragmaVersion ?? '2.2.3';
    const originalFilePath = opts.originalFilePath ?? parentDef.sourceFile ?? '';
    const definitions = this.templateDefinitions();
    const mockGenerator = new MockTemplateGenerator();
    const mocks = new Map<string, { iface: TemplateInterface; result: MockTemplateResult }>();
    const variants = new Map<string, string>();
    const usedMocks = new Set<string>();
    const validatorWarnings: AbstractValidatorWarning[] = [];
    const unmockedChildren = new Set<string>();
    const memo = new Map<string, RecursiveRewrite | null>();
    const visiting = new Set<string>();

    const ensureMock = (templateName: string) => {
      const existing = mocks.get(templateName);
      if (existing) return existing;
      const iface = this.extractor.extract(templateName);
      if (!iface) return null;
      const result = mockGenerator.generate(iface);
      const generated = { iface, result };
      mocks.set(templateName, generated);
      variants.set(result.templateName, result.source);
      return generated;
    };

    const rewriteDefinition = (definition: TemplateDefinitionNode, isRoot = false): RecursiveRewrite | null => {
      if (!isRoot && memo.has(definition.name)) return memo.get(definition.name)!;
      if (visiting.has(definition.name)) return null;
      visiting.add(definition.name);

      const replacementPlans = new Map<string, ChildReplacementPlan>();
      const childInterfaces = new Map<string, TemplateInterface>();
      for (const childName of this.collectReferencedTemplateNames(definition)) {
        const childInterface = this.extractor.extract(childName);
        if (childInterface) childInterfaces.set(childName, childInterface);
        if (confirmSet.has(childName)) {
          const mock = ensureMock(childName);
          if (!mock) {
            unmockedChildren.add(childName);
            continue;
          }
          usedMocks.add(childName);
          replacementPlans.set(childName, {
            originalTemplateName: childName,
            replacementTemplateName: mock.result.templateName,
            inputNames: mock.iface.inputs.map((input) => input.name),
            syntheticInputs: mock.result.outputBindings.map((binding) => ({
              name: binding.mockInputName,
              isArray: binding.port.isArray,
              arraySizes: binding.port.arraySizes,
              forOutput: binding.outputName,
            })),
            outputs: mock.iface.outputs,
            isMock: true,
            isValidator: mock.result.isValidator,
          });
          continue;
        }

        const childDefinition = definitions.get(childName);
        if (!childDefinition || !childInterface) continue;
        const childRewrite = rewriteDefinition(childDefinition);
        if (!childRewrite?.changed) continue;
        replacementPlans.set(childName, {
          originalTemplateName: childName,
          replacementTemplateName: childRewrite.rewritten.templateName,
          inputNames: childInterface.inputs.map((input) => input.name),
          syntheticInputs: childRewrite.rewritten.boundaryPorts,
          outputs: childInterface.outputs,
          isMock: false,
          isValidator: false,
        });
      }

      const changed = replacementPlans.size > 0;
      if (!changed && !isRoot) {
        visiting.delete(definition.name);
        memo.set(definition.name, null);
        return null;
      }

      const rewriter = new ParentRewriter(new Set(), childInterfaces, { partialSuffix, replacementPlans });
      const rewritten = rewriter.rewrite(definition, this.getTemplateSource(definition));
      validatorWarnings.push(...rewritten.validatorWarnings);
      rewritten.unmockedInstances.forEach((instance) => unmockedChildren.add(instance.templateName));
      const result = { rewritten, changed };
      if (!isRoot) {
        memo.set(definition.name, result);
        variants.set(rewritten.templateName, rewritten.source);
      }
      visiting.delete(definition.name);
      return result;
    };

    const rootRewrite = rewriteDefinition(parentDef, true)!;
    const rewritten = rootRewrite.rewritten;
    const paramValues = params.map((param) => String(param.value)).join(', ');
    const publicBlock = publicSignals.length > 0 ? ` { public [${publicSignals.join(', ')}] }` : '';
    const headerLines = [`pragma circom ${pragmaVersion};`];
    if (originalFilePath) headerLines.push(`include "${originalFilePath}";`);
    headerLines.push(
      '',
      '/* === Abstract Partial Compile (component shell mocking) ===',
      ` * Selected template: ${parentDef.name}`,
      ` * Partial variant:   ${rewritten.templateName}`,
      ` * Mocked children:   ${[...usedMocks].join(', ') || '(none)'}`,
      ' * Parent declarations and component wiring are preserved.',
      ' * Mocked child internals are replaced by synthetic output bindings.',
      ` * Validator warnings: ${validatorWarnings.length}`,
      ' */',
      '',
    );

    const generatedDefinitions = [...variants.values()];
    const templateSource = [...generatedDefinitions, rewritten.source].join('\n\n');
    const wrapperCode = [
      headerLines.join('\n'),
      templateSource,
      '',
      `component main${publicBlock} = ${rewritten.templateName}(${paramValues});`,
      '',
    ].join('\n');

    const qualify = (path: string) => path.startsWith('main.') ? path : `main.${path}`;
    const mockManifest: MockManifest = {
      selectedRoot: 'main',
      mocks: rewritten.mockProvenance.map((mock) => ({
        ...mock,
        instancePath: qualify(mock.instancePath),
        boundaryInputs: mock.boundaryInputs.map(qualify),
        boundaryOutputs: mock.boundaryOutputs.map(qualify),
        syntheticSignals: mock.syntheticSignals.map((signal) => ({ ...signal, path: qualify(signal.path), forOutput: qualify(signal.forOutput) })),
      })),
    };

    return {
      wrapperCode,
      templateSource,
      entryTemplateName: rewritten.templateName,
      partialTemplateName: rewritten.templateName,
      mockedChildren: [...usedMocks],
      mockedTemplateNames: [...mocks.values()].map((mock) => mock.result.templateName),
      unmockedChildren: [...unmockedChildren],
      validatorWarnings,
      boundaryInputs: rewritten.boundaryInputs,
      mockManifest,
    };
  }

  private templateDefinitions(): Map<string, TemplateDefinitionNode> {
    const definitions = new Map<string, TemplateDefinitionNode>();
    for (const file of this.parsedFiles.values()) {
      for (const definition of file.templates) if (!definitions.has(definition.name)) definitions.set(definition.name, definition);
    }
    return definitions;
  }

  private getTemplateSource(definition: TemplateDefinitionNode): string {
    if (!definition.sourceFile) return '';
    for (const [path, file] of this.parsedFiles) {
      if (path === definition.sourceFile || file.path === definition.sourceFile || file.templates.includes(definition)) return file.content;
    }
    return '';
  }

  private collectReferencedTemplateNames(definition: TemplateDefinitionNode): Set<string> {
    const names = new Set<string>();
    const componentArrayNames = new Set<string>();
    const componentVarNames = new Set<string>();
    for (const component of definition.components || []) {
      if (component.type === 'ComponentDeclaration') {
        if (component.arraySizes) componentArrayNames.add(component.name);
        else componentVarNames.add(component.name);
      } else if (component.type === 'ComponentArrayInit') componentArrayNames.add(component.name);
    }
    const visit = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(visit); return; }
      if (node.type === 'ComponentInstantiationNode' && typeof node.templateName === 'string' && !node.isAnonymous) names.add(node.templateName);
      if (node.type === 'Assignment') {
        const left = node.left;
        const right = node.right;
        if (left?.type === 'ArrayAccess' && left.array?.type === 'Identifier' && componentArrayNames.has(left.array.name) && right?.type === 'FunctionCall') names.add(right.function);
        if (left?.type === 'Identifier' && componentVarNames.has(left.name) && right?.type === 'FunctionCall') names.add(right.function);
      }
      for (const [key, value] of Object.entries(node)) if (key !== 'type' && value && typeof value === 'object') visit(value);
    };
    definition.components.forEach(visit);
    definition.statements.forEach(visit);
    return names;
  }
}
