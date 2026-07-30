import type { TemplateDefinitionNode } from '../parser/ast.js';
import type { TemplateInterface, SignalPort } from './interfaceExtractor.js';

export interface ValidatorWarning {
  templateName: string;
  instance: string;
  reason: string;
}

export interface SyntheticInputPort {
  name: string;
  isArray: boolean;
  arraySizes: Array<number | string>;
  forOutput?: string;
}

export interface MockProvenanceEntry {
  instancePath: string;
  originalTemplate: string;
  mockedTemplate: string;
  boundaryInputs: string[];
  boundaryOutputs: string[];
  syntheticSignals: Array<{ path: string; role: 'root-mock-input' | 'mock-bridge'; forOutput: string }>;
}

export interface ChildReplacementPlan {
  originalTemplateName: string;
  replacementTemplateName: string;
  inputNames: string[];
  syntheticInputs: SyntheticInputPort[];
  outputs: SignalPort[];
  isMock: boolean;
  isValidator: boolean;
}

export interface RewrittenParentResult {
  templateName: string;
  source: string;
  mockedInstances: Array<{ name: string; templateName: string; mockTemplateName: string; outputs: SignalPort[] }>;
  unmockedInstances: Array<{ name: string; templateName: string; reason: string }>;
  validatorWarnings: ValidatorWarning[];
  boundaryInputs: Array<{ instance: string; signal: string; isArray: boolean }>;
  boundaryPorts: SyntheticInputPort[];
  mockProvenance: MockProvenanceEntry[];
}

export interface ParentRewriterOptions {
  partialSuffix?: string;
  replacementPlans?: Map<string, ChildReplacementPlan>;
}

interface InstanceInfo {
  name: string;
  templateName: string;
  line: number;
  isArrayElement: boolean;
  arrayName?: string;
  arrayIndex?: string;
  arguments?: any[];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exprToStr(expr: any): string {
  if (!expr) return '';
  if (typeof expr === 'number') return String(expr);
  switch (expr.type) {
    case 'Literal': return String(expr.value);
    case 'Identifier': return expr.name;
    case 'BinaryOp': return `${exprToStr(expr.left)} ${expr.operator} ${exprToStr(expr.right)}`;
    case 'UnaryOp': return expr.isPostfix
      ? `${exprToStr(expr.operand)}${expr.operator}`
      : `${expr.operator}${exprToStr(expr.operand)}`;
    case 'MemberAccess': return `${exprToStr(expr.object)}.${expr.property}`;
    case 'ArrayAccess': return `${exprToStr(expr.array)}[${exprToStr(expr.index)}]`;
    default: return '';
  }
}

function arraySizeToStr(size: any): string {
  if (typeof size === 'number') return String(size);
  return exprToStr(size);
}

function renderArraySizes(sizes: Array<number | string>): string {
  return sizes.map((size) => `[${size}]`).join('');
}

export function instantiateReplacementPlan(
  plan: ChildReplacementPlan,
  iface: TemplateInterface | undefined,
  args: any[],
): ChildReplacementPlan {
  if (!iface || args.length === 0) return plan;

  const bindings = new Map<string, string>();
  iface.parameters.forEach((parameter, index) => {
    const argument = args[index];
    if (!argument) return;
    const rendered = exprToStr(argument);
    if (!rendered) return;
    const replacement = argument.type === 'Identifier' || argument.type === 'Literal'
      ? rendered
      : `(${rendered})`;
    bindings.set(parameter.name, replacement);
  });
  if (bindings.size === 0) return plan;

  const resolveSizes = (sizes: Array<number | string>) => sizes.map((size) => {
    if (typeof size === 'number') return size;
    return size.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (identifier) =>
      bindings.get(identifier) ?? identifier);
  });

  return {
    ...plan,
    syntheticInputs: plan.syntheticInputs.map((input) => ({
      ...input,
      arraySizes: resolveSizes(input.arraySizes),
    })),
    outputs: plan.outputs.map((output) => ({
      ...output,
      arraySizes: resolveSizes(output.arraySizes),
    })),
  };
}

function defaultMockPlan(iface: TemplateInterface): ChildReplacementPlan {
  return {
    originalTemplateName: iface.templateName,
    replacementTemplateName: `${iface.templateName}_mocked`,
    inputNames: iface.inputs.map((input) => input.name),
    syntheticInputs: iface.outputs.map((output) => ({
      name: `__mock_${output.name}`,
      isArray: output.isArray,
      arraySizes: output.arraySizes,
      forOutput: output.name,
    })),
    outputs: iface.outputs,
    isMock: true,
    isValidator: iface.outputs.length === 0,
  };
}

export class ParentRewriter {
  private partialSuffix: string;
  private confirmSet: Set<string>;
  private interfaceMap: Map<string, TemplateInterface>;
  private replacementPlans: Map<string, ChildReplacementPlan>;
  private mockedInstances: Array<{ name: string; templateName: string; mockTemplateName: string; outputs: SignalPort[] }> = [];
  private unmockedInstances: Array<{ name: string; templateName: string; reason: string }> = [];
  private validatorWarnings: ValidatorWarning[] = [];
  private boundaryInputs: Array<{ instance: string; signal: string; isArray: boolean }> = [];
  private boundaryPorts: SyntheticInputPort[] = [];
  private mockProvenance: MockProvenanceEntry[] = [];

  constructor(
    confirmSet: Set<string>,
    interfaceMap: Map<string, TemplateInterface>,
    opts: ParentRewriterOptions = {},
  ) {
    this.confirmSet = confirmSet;
    this.interfaceMap = interfaceMap;
    this.partialSuffix = opts.partialSuffix ?? '_Partial';
    this.replacementPlans = opts.replacementPlans ?? new Map();
  }

  rewrite(def: TemplateDefinitionNode, fullSource: string): RewrittenParentResult {
    this.mockedInstances = [];
    this.unmockedInstances = [];
    this.validatorWarnings = [];
    this.boundaryInputs = [];
    this.boundaryPorts = [];
    this.mockProvenance = [];

    const newName = `${def.name}${this.partialSuffix}`;
    const { lines, offsetLine } = this.extractTemplateBlock(fullSource, def.line);
    const componentArrays = this.collectComponentArrays(def);
    const componentVars = this.collectComponentVars(def);
    const instances = this.collectInstances(def, componentArrays, componentVars);
    const componentDeclLines = new Map((def.components || []).map((component) => [component.name, component.line]));
    const occupiedNames = new Set([
      ...def.signals.map((signal) => signal.name),
      ...def.variables.map((variable) => variable.name),
      ...def.components.map((component) => component.name),
    ]);

    this.renameTemplate(lines, def.name, newName);

    const declarationsBefore = new Map<number, string[]>();
    const feedersAfter = new Map<number, string[]>();
    const replacementsByLine = new Map<number, Array<{ original: string; replacement: string }>>();
    const boundaryNameByKey = new Map<string, string>();

    for (const inst of instances) {
      let plan = this.replacementPlans.get(inst.templateName);
      if (!plan && this.confirmSet.has(inst.templateName)) {
        const iface = this.interfaceMap.get(inst.templateName);
        if (!iface) {
          this.unmockedInstances.push({ name: inst.name, templateName: inst.templateName, reason: 'interface not found' });
          continue;
        }
        plan = defaultMockPlan(iface);
      }
      if (!plan) continue;
      plan = instantiateReplacementPlan(
        plan,
        this.interfaceMap.get(inst.templateName),
        inst.arguments ?? [],
      );

      const componentName = inst.isArrayElement ? inst.arrayName! : inst.name;
      const componentRef = inst.isArrayElement ? `${inst.arrayName}[${inst.arrayIndex}]` : inst.name;
      const componentSizes = inst.isArrayElement ? componentArrays.get(inst.arrayName!) ?? [] : [];
      const instantiationIndex = Math.max(0, inst.line - offsetLine);
      const declarationLine = componentDeclLines.get(componentName) ?? inst.line;
      const declarationIndex = Math.max(0, declarationLine - offsetLine);

      const lineReplacements = replacementsByLine.get(instantiationIndex) ?? [];
      lineReplacements.push({ original: inst.templateName, replacement: plan.replacementTemplateName });
      replacementsByLine.set(instantiationIndex, lineReplacements);

      let provenance: MockProvenanceEntry | undefined;
      if (plan.isMock) {
        provenance = {
          instancePath: componentRef,
          originalTemplate: plan.originalTemplateName,
          mockedTemplate: plan.replacementTemplateName,
          boundaryInputs: plan.inputNames.map((name) => `${componentRef}.${name}`),
          boundaryOutputs: plan.outputs.map((output) => `${componentRef}.${output.name}`),
          syntheticSignals: [],
        };
        this.mockProvenance.push(provenance);
        this.mockedInstances.push({
          name: componentName,
          templateName: inst.templateName,
          mockTemplateName: plan.replacementTemplateName,
          outputs: plan.outputs,
        });
        if (plan.isValidator) {
          this.validatorWarnings.push({
            templateName: inst.templateName,
            instance: componentName,
            reason: 'validator-style child has no outputs; internal constraints removed',
          });
        }
      }

      const feederInsertionIndex = this.findFeederInsertionIndex(lines, inst, plan.inputNames, offsetLine);
      const feederIndent = (lines[feederInsertionIndex]?.match(/^(\s*)/) ?? ['', '    '])[1];

      for (const synthetic of plan.syntheticInputs) {
        const key = `${componentName}:${synthetic.name}`;
        let boundaryName = boundaryNameByKey.get(key);
        if (!boundaryName) {
          boundaryName = this.allocateBoundaryName(componentName, synthetic.name, occupiedNames);
          boundaryNameByKey.set(key, boundaryName);
          const arraySizes = [...componentSizes, ...synthetic.arraySizes];
          const declaration = `signal input ${boundaryName}${renderArraySizes(arraySizes)};`;
          const declarations = declarationsBefore.get(declarationIndex) ?? [];
          declarations.push(declaration);
          declarationsBefore.set(declarationIndex, declarations);
          this.boundaryInputs.push({ instance: componentName, signal: boundaryName, isArray: arraySizes.length > 0 });
          this.boundaryPorts.push({ name: boundaryName, isArray: arraySizes.length > 0, arraySizes });
        }

        if (provenance && synthetic.forOutput) {
          const forOutput = `${componentRef}.${synthetic.forOutput}`;
          provenance.syntheticSignals.push(
            { path: boundaryName, role: 'root-mock-input', forOutput },
            { path: `${componentRef}.${synthetic.name}`, role: 'mock-bridge', forOutput },
          );
        }

        const feeders = feedersAfter.get(feederInsertionIndex) ?? [];
        feeders.push(...this.renderSyntheticBinding(
          componentRef,
          inst.isArrayElement ? inst.arrayIndex : undefined,
          synthetic,
          boundaryName,
          feederIndent,
        ));
        feedersAfter.set(feederInsertionIndex, feeders);
      }
    }

    const outputLines: string[] = [];
    for (let index = 0; index < lines.length; index++) {
      const indent = (lines[index].match(/^(\s*)/) ?? ['', ''])[1];
      for (const declaration of declarationsBefore.get(index) ?? []) outputLines.push(`${indent}${declaration}`);

      let line = lines[index];
      for (const replacement of replacementsByLine.get(index) ?? []) {
        const call = new RegExp(`\\b${escapeRegex(replacement.original)}(\\s*\\()`);
        line = line.replace(call, `${replacement.replacement}$1`);
      }
      outputLines.push(line);
      outputLines.push(...(feedersAfter.get(index) ?? []));
    }

    return {
      templateName: newName,
      source: outputLines.join('\n'),
      mockedInstances: this.mockedInstances,
      unmockedInstances: this.unmockedInstances,
      validatorWarnings: this.validatorWarnings,
      boundaryInputs: this.boundaryInputs,
      boundaryPorts: this.boundaryPorts,
      mockProvenance: this.mockProvenance,
    };
  }

  private findFeederInsertionIndex(lines: string[], inst: InstanceInfo, inputNames: string[], offsetLine: number): number {
    const base = inst.isArrayElement ? inst.arrayName! : inst.name;
    const componentPattern = inst.isArrayElement
      ? `\\b${escapeRegex(base)}\\[[^\\]]+\\]\\.`
      : `\\b${escapeRegex(base)}\\.`;
    const inputPattern = inputNames.length ? `(?:${inputNames.map(escapeRegex).join('|')})` : '(?!)';
    const assignment = new RegExp(`${componentPattern}${inputPattern}(?:\\[[^\\]]+\\])*\\s*(?:<==|<--|==>|-->)`);
    const instantiationIndex = Math.max(0, inst.line - offsetLine);
    let last = instantiationIndex;
    for (let index = last + 1; index < lines.length; index++) {
      if (assignment.test(lines[index])) last = index;
    }
    const indentation = (line: string) => (line.match(/^(\s*)/) ?? ['', ''])[1].length;
    const instantiationIndent = indentation(lines[instantiationIndex] ?? '');
    if (last > instantiationIndex && indentation(lines[last]) > instantiationIndent) {
      for (let index = last + 1; index < lines.length; index++) {
        if (lines[index].trimStart().startsWith('}') && indentation(lines[index]) <= instantiationIndent) return index;
      }
    }
    return last;
  }

  private renderSyntheticBinding(
    componentRef: string,
    componentIndex: string | undefined,
    synthetic: SyntheticInputPort,
    boundaryName: string,
    indent: string,
  ): string[] {
    const boundaryBase = componentIndex ? `${boundaryName}[${componentIndex}]` : boundaryName;
    if (!synthetic.isArray || synthetic.arraySizes.length === 0) {
      return [`${indent}${componentRef}.${synthetic.name} <== ${boundaryBase};`];
    }

    const lines: string[] = [];
    const loopVariables = synthetic.arraySizes.map((_, index) =>
      `__mock_${componentRef.replace(/[^A-Za-z0-9_]/g, '_')}_${synthetic.name.replace(/[^A-Za-z0-9_]/g, '')}_i${index}`);
    synthetic.arraySizes.forEach((size, index) => {
      lines.push(`${indent}${'    '.repeat(index)}for (var ${loopVariables[index]} = 0; ${loopVariables[index]} < ${size}; ${loopVariables[index]}++) {`);
    });
    const indexes = loopVariables.map((variable) => `[${variable}]`).join('');
    lines.push(`${indent}${'    '.repeat(loopVariables.length)}${componentRef}.${synthetic.name}${indexes} <== ${boundaryBase}${indexes};`);
    for (let index = loopVariables.length - 1; index >= 0; index--) {
      lines.push(`${indent}${'    '.repeat(index)}}`);
    }
    return lines;
  }

  private allocateBoundaryName(componentName: string, syntheticName: string, occupied: Set<string>): string {
    const component = componentName.replace(/[^A-Za-z0-9_]/g, '_');
    const suffix = syntheticName.replace(/^__mock_/, '').replace(/[^A-Za-z0-9_]/g, '_');
    const base = `__mock_${component}_${suffix}`;
    let candidate = base;
    let counter = 1;
    while (occupied.has(candidate)) candidate = `${base}_${counter++}`;
    occupied.add(candidate);
    return candidate;
  }

  private extractTemplateBlock(source: string, startLine: number): { lines: string[]; offsetLine: number } {
    const allLines = source.split('\n');
    const startIdx = Math.max(0, startLine - 1);
    let braceCount = 0;
    let foundOpen = false;
    let endIdx = startIdx;
    for (let index = startIdx; index < allLines.length; index++) {
      const line = allLines[index];
      let inLineComment = false;
      for (let column = 0; column < line.length; column++) {
        if (inLineComment) break;
        const char = line[column];
        const next = line[column + 1];
        if (char === '/' && next === '/') { inLineComment = true; continue; }
        if (char === '{') { braceCount++; foundOpen = true; }
        else if (char === '}') braceCount--;
      }
      if (foundOpen && braceCount === 0) { endIdx = index; break; }
    }
    return { lines: allLines.slice(startIdx, endIdx + 1), offsetLine: startLine };
  }

  private renameTemplate(lines: string[], originalName: string, newName: string): void {
    const regex = new RegExp(`(template\\s+)${escapeRegex(originalName)}(\\s*\\()`);
    for (let index = 0; index < Math.min(lines.length, 5); index++) {
      if (!regex.test(lines[index])) continue;
      lines[index] = lines[index].replace(regex, `$1${newName}$2`);
      return;
    }
  }

  private collectComponentArrays(def: TemplateDefinitionNode): Map<string, string[]> {
    const result = new Map<string, string[]>();
    for (const component of def.components || []) {
      if (component.type === 'ComponentDeclaration' && component.arraySizes) {
        result.set(component.name, component.arraySizes.map(arraySizeToStr));
      } else if (component.type === 'ComponentArrayInit') {
        result.set(component.name, component.arraySizes.map(arraySizeToStr));
      }
    }
    return result;
  }

  private collectComponentVars(def: TemplateDefinitionNode): Set<string> {
    const result = new Set<string>();
    for (const component of def.components || []) {
      if (component.type === 'ComponentDeclaration' && !component.arraySizes) result.add(component.name);
    }
    return result;
  }

  private collectInstances(
    def: TemplateDefinitionNode,
    componentArrays: Map<string, string[]>,
    componentVars: Set<string>,
  ): InstanceInfo[] {
    const results: InstanceInfo[] = [];
    const add = (instance: InstanceInfo) => {
      const key = `${instance.name}:${instance.templateName}:${instance.line}`;
      if (!results.some((candidate) => `${candidate.name}:${candidate.templateName}:${candidate.line}` === key)) results.push(instance);
    };
    for (const component of def.components || []) {
      if (component.type === 'ComponentInstantiationNode' && !component.isAnonymous) {
        add({
          name: component.name,
          templateName: component.templateName,
          line: component.line,
          isArrayElement: false,
          arguments: component.arguments,
        });
      }
    }
    const visit = (statement: any) => {
      if (!statement) return;
      if (statement.type === 'ComponentInstantiationNode' && !statement.isAnonymous) {
        add({
          name: statement.name,
          templateName: statement.templateName,
          line: statement.line,
          isArrayElement: false,
          arguments: statement.arguments,
        });
      }
      if (statement.type === 'Assignment') {
        const left = statement.left;
        const right = statement.right;
        if (left?.type === 'ArrayAccess' && left.array?.type === 'Identifier' && componentArrays.has(left.array.name) && right?.type === 'FunctionCall') {
          add({
            name: `${left.array.name}[${exprToStr(left.index)}]`,
            templateName: right.function,
            line: statement.line,
            isArrayElement: true,
            arrayName: left.array.name,
            arrayIndex: exprToStr(left.index),
            arguments: right.arguments,
          });
        }
        if (left?.type === 'Identifier' && componentVars.has(left.name) && right?.type === 'FunctionCall') {
          add({
            name: left.name,
            templateName: right.function,
            line: statement.line,
            isArrayElement: false,
            arguments: right.arguments,
          });
        }
      }
      if (Array.isArray(statement.body)) statement.body.forEach(visit);
      if (Array.isArray(statement.thenBranch)) statement.thenBranch.forEach(visit);
      if (Array.isArray(statement.elseBranch)) statement.elseBranch.forEach(visit);
      if (Array.isArray(statement.initStatements)) statement.initStatements.forEach(visit);
      if (Array.isArray(statement.initBlock)) statement.initBlock.forEach(visit);
    };
    for (const statement of def.statements || []) visit(statement);
    return results;
  }
}
