import type { ParsedFile, TemplateDefinitionNode } from '../parser/ast.js';
import { InterfaceExtractor, type TemplateInterface } from './interfaceExtractor.js';
import { ParentRewriter, type RewrittenParentResult, type ValidatorWarning as AbstractValidatorWarning } from './parentRewriter.js';

export interface AbstractWrapperResult {
  wrapperCode: string;
  partialTemplateName: string;
  mockedChildren: string[];
  unmockedChildren: string[];
  validatorWarnings: AbstractValidatorWarning[];
  boundaryInputs: Array<{ instance: string; signal: string; isArray: boolean }>;
}

export interface BuildOptions {
  partialSuffix?: string;
  pragmaVersion?: string;
  originalFilePath?: string;
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

    const interfaceMap = new Map<string, TemplateInterface>();
    const referencedChildren = this.collectReferencedTemplateNames(parentDef);
    for (const name of referencedChildren) {
      if (confirmSet.has(name)) {
        const iface = this.extractor.extract(name);
        if (iface) interfaceMap.set(name, iface);
      }
    }

    const rewriter = new ParentRewriter(confirmSet, interfaceMap, {
      partialSuffix,
    });

    const fullSource = this.getTemplateSource(parentDef);
    const rewritten: RewrittenParentResult = rewriter.rewrite(parentDef, fullSource);

    const mockedTemplateNames = new Set<string>();
    for (const inst of rewritten.mockedInstances) {
      mockedTemplateNames.add(inst.templateName);
    }

    const validatorWarnings: AbstractValidatorWarning[] = [...rewritten.validatorWarnings];

    const paramValues = params.map((p) => String(p.value)).join(', ');
    let publicBlock = '';
    if (publicSignals && publicSignals.length > 0) {
      publicBlock = ` { public [${publicSignals.join(', ')}] }`;
    }

    const headerLines = [
      `pragma circom ${pragmaVersion};`,
    ];
    if (originalFilePath) {
      headerLines.push(`include "${originalFilePath}";`);
    }
    headerLines.push(
      '',
      '/* === Abstract Partial Compile (reference elimination) ===',
      ` * Selected template: ${parentDef.name}`,
      ` * Partial variant:   ${rewritten.templateName}`,
      ` * Eliminated children: ${[...mockedTemplateNames].join(', ') || '(none)'}`,
      ` * Validator warnings: ${validatorWarnings.length}`,
      ` * Kept expanded: ${rewritten.unmockedInstances.map((u) => u.templateName).join(', ') || '(none)'}`,
      ' */',
      '',
    );
    const header = headerLines.join('\n');

    const sections: string[] = [header];
    sections.push(rewritten.source);
    sections.push('');
    sections.push(`component main${publicBlock} = ${rewritten.templateName}(${paramValues});`);
    sections.push('');

    return {
      wrapperCode: sections.join('\n'),
      partialTemplateName: rewritten.templateName,
      mockedChildren: [...mockedTemplateNames],
      unmockedChildren: rewritten.unmockedInstances.map((u) => u.templateName),
      validatorWarnings,
      boundaryInputs: rewritten.boundaryInputs,
    };
  }

  private getTemplateSource(def: TemplateDefinitionNode): string {
    if (!def.sourceFile) return '';
    const file = this.parsedFiles.get(def.sourceFile);
    return file?.content ?? '';
  }

  private collectReferencedTemplateNames(def: TemplateDefinitionNode): Set<string> {
    const names = new Set<string>();

    const componentArrayNames = new Set<string>();
    const componentVarNames = new Set<string>();
    for (const comp of def.components || []) {
      if (comp.type === 'ComponentDeclaration') {
        if (comp.arraySizes) componentArrayNames.add(comp.name);
        else componentVarNames.add(comp.name);
      } else if (comp.type === 'ComponentArrayInit') {
        componentArrayNames.add(comp.name);
      }
    }

    const visit = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const n of node) visit(n);
        return;
      }
      if (node.type === 'ComponentInstantiationNode' && typeof node.templateName === 'string') {
        if (!node.isAnonymous) names.add(node.templateName);
      }
      if (node.type === 'Assignment') {
        const left = node.left;
        const right = node.right;
        if (left?.type === 'ArrayAccess' &&
            left.array?.type === 'Identifier' &&
            componentArrayNames.has(left.array.name) &&
            right?.type === 'FunctionCall') {
          names.add(right.function);
        }
        if (left?.type === 'Identifier' &&
            componentVarNames.has(left.name) &&
            right?.type === 'FunctionCall') {
          names.add(right.function);
        }
      }
      for (const key of Object.keys(node)) {
        if (key === 'type') continue;
        const val = node[key];
        if (val && typeof val === 'object') visit(val);
      }
    };
    for (const comp of def.components || []) visit(comp);
    for (const stmt of def.statements || []) visit(stmt);
    return names;
  }
}
