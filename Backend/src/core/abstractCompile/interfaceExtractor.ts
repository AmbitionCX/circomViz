import type {
  ParsedFile,
  TemplateDefinitionNode,
  SignalNode,
  Parameter,
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
  inputs: SignalPort[];
  outputs: SignalPort[];
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
    return {
      templateName: def.name,
      parameters: def.parameters || [],
      inputs,
      outputs,
    };
  }

  hasInterface(parsedFiles: Map<string, ParsedFile>, templateName: string): boolean {
    return this.extract(templateName) !== null;
  }
}
