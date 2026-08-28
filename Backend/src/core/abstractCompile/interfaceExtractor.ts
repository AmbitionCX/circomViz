import type {
  ParsedFile,
  TemplateDefinitionNode,
  SignalNode,
  Parameter,
  ExpressionNode,
} from '../parser/ast.js';

export interface SignalPort {
  name: string;
  kind: 'input' | 'output';
  isArray: boolean;
  arraySizes: Array<number | string>;
}

export interface TemplateInterface {
  templateName: string;
  parameters: Parameter[];
  variables?: Array<{ name: string; value: string }>;
  inputs: SignalPort[];
  outputs: SignalPort[];
}

function expressionToSource(expression: ExpressionNode): string {
  switch (expression.type) {
    case 'Literal': return String(expression.value);
    case 'Identifier': return expression.name;
    case 'BinaryOp': return `${expressionToSource(expression.left)} ${expression.operator} ${expressionToSource(expression.right)}`;
    case 'UnaryOp': return expression.isPostfix
      ? `${expressionToSource(expression.operand)}${expression.operator}`
      : `${expression.operator}${expressionToSource(expression.operand)}`;
    case 'ArrayAccess': return `${expressionToSource(expression.array)}[${expressionToSource(expression.index)}]`;
    case 'MemberAccess': return `${expressionToSource(expression.object)}.${expression.property}`;
    case 'FunctionCall': return `${expression.function}(${expression.arguments.map(expressionToSource).join(', ')})`;
    case 'ComponentCall': return `${expression.template}(${expression.templateArgs.map(expressionToSource).join(', ')})`;
    case 'Ternary': return `${expressionToSource(expression.condition)} ? ${expressionToSource(expression.thenExpr)} : ${expressionToSource(expression.elseExpr)}`;
    case 'ArrayLiteral': return `[${expression.elements.map(expressionToSource).join(', ')}]`;
    case 'Tuple': return `(${expression.elements.map(expressionToSource).join(', ')})`;
  }
}

function expressionIdentifiers(expression: ExpressionNode | number): Set<string> {
  const identifiers = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as Record<string, unknown>;
    if (node.type === 'Identifier' && typeof node.name === 'string') identifiers.add(node.name);
    for (const child of Object.values(node)) visit(child);
  };
  visit(expression);
  return identifiers;
}

function coerceArraySize(size: number | { type: string; [k: string]: any }): number | string {
  if (typeof size === 'number') return size;
  if (size && typeof size === 'object') {
    if (size.type === 'Literal' && typeof size.value === 'number') return size.value;
    if (size.type === 'Identifier') return size.name;
    if (size.type === 'BinaryOp') {
      const l = coerceArraySize(size.left as any);
      const r = coerceArraySize(size.right as any);
      if (typeof l === 'number' && typeof r === 'number') {
        switch (size.operator) {
          case '+': return l + r;
          case '-': return l - r;
          case '*': return l * r;
          default: return `${l}${size.operator}${r}`;
        }
      }
      return `${l}${size.operator}${r}`;
    }
    if (size.type === 'FunctionCall') {
      return `${size.function}(${(size.arguments || []).map((a: any) => coerceArraySize(a)).join(',')})`;
    }
  }
  return String(size);
}

function portFromSignal(sig: SignalNode, kind: 'input' | 'output'): SignalPort {
  const sizes: Array<number | string> = [];
  if (sig.isArray && sig.arraySizes) {
    for (const s of sig.arraySizes) sizes.push(coerceArraySize(s as any));
  }
  return {
    name: sig.name,
    kind,
    isArray: !!sig.isArray,
    arraySizes: sizes,
  };
}

export class InterfaceExtractor {
  constructor(private parsedFiles: Map<string, ParsedFile>) {}

  extract(templateName: string): TemplateInterface | null {
    for (const file of this.parsedFiles.values()) {
      const def = file.templates.find((t) => t.name === templateName);
      if (def) return this.extractFromDefinition(def);
    }
    return null;
  }

  extractFromDefinition(def: TemplateDefinitionNode): TemplateInterface {
    const inputs: SignalPort[] = [];
    const outputs: SignalPort[] = [];
    for (const sig of def.signals) {
      if (sig.kind === 'input') inputs.push(portFromSignal(sig, 'input'));
      else if (sig.kind === 'output') outputs.push(portFromSignal(sig, 'output'));
    }
    const requiredVariables = new Set<string>();
    for (const signal of [...inputs, ...outputs]) {
      for (const size of signal.arraySizes) {
        if (typeof size === 'string') {
          for (const identifier of size.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) requiredVariables.add(identifier);
        }
      }
    }
    const variablesByName = new Map(def.variables.map((variable) => [variable.name, variable]));
    const pending = [...requiredVariables];
    while (pending.length) {
      const name = pending.pop()!;
      const variable = variablesByName.get(name);
      if (!variable?.initialValue) continue;
      for (const dependency of expressionIdentifiers(variable.initialValue)) {
        if (variablesByName.has(dependency) && !requiredVariables.has(dependency)) {
          requiredVariables.add(dependency);
          pending.push(dependency);
        }
      }
    }
    return {
      templateName: def.name,
      parameters: def.parameters || [],
      variables: def.variables
        .filter((variable) => requiredVariables.has(variable.name) && variable.initialValue)
        .map((variable) => ({ name: variable.name, value: expressionToSource(variable.initialValue!) })),
      inputs,
      outputs,
    };
  }

  hasInterface(parsedFiles: Map<string, ParsedFile>, templateName: string): boolean {
    return this.extract(templateName) !== null;
  }
}
