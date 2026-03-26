import { CircomLexer } from '../parser/lexer.js';
import { CircomParser } from '../parser/index.js';
import type { TemplateDefinitionNode, SignalNode, ParsedFile } from '../parser/ast.js';
import type { SymbolObject } from '../../types/constraint.js';
import * as fs from 'fs/promises';

export interface SignalClassification {
  inputIndices: number[];
  outputIndices: number[];
  inputNames: string[];
  outputNames: string[];
}

export class OutputSignalIdentifier {

  identifySignals(ast: any[]): { inputs: string[]; outputs: string[] } {
    const inputs: string[] = [];
    const outputs: string[] = [];

    // Find 'main' component instantiation to get its template name
    let mainTemplateName: string | null = null;
    for (const node of ast) {
      if (node.type === 'ComponentInstantiationNode' && node.name === 'main') {
        mainTemplateName = node.templateName;
        break;
      }
    }

    // Find the template that 'main' instantiates and extract its signals
    if (mainTemplateName) {
      for (const node of ast) {
        if (node.type === 'TemplateDefinition' && node.name === mainTemplateName) {
          for (const signal of node.signals) {
            if (signal.kind === 'input') {
              inputs.push(signal.name);
            } else if (signal.kind === 'output') {
              outputs.push(signal.name);
            }
          }
          break;
        }
      }
    }

    return { inputs, outputs };
  }

  async classifySignals(
    repo: string,
    entry: string,
    symEntries: SymbolObject[]
  ): Promise<SignalClassification> {
    const content = await fs.readFile(entry, 'utf-8');
    const lexer = new CircomLexer(content);
    const parser = new CircomParser(lexer);
    const ast = parser.parse(content, entry);

    const { inputs, outputs } = this.identifySignals(ast);

    const inputIndices = this.mapSignalNamesToIndices(
      inputs.map(name => `main.${name}`),
      symEntries
    );
    const outputIndices = this.mapSignalNamesToIndices(
      outputs.map(name => `main.${name}`),
      symEntries
    );

    return {
      inputIndices,
      outputIndices,
      inputNames: inputs.map(name => `main.${name}`),
      outputNames: outputs.map(name => `main.${name}`),
    };
  }

  mapSignalNamesToIndices(names: string[], symEntries: SymbolObject[]): number[] {
    const result: number[] = [];
    const nameMap = new Map<string, number>();
    for (const sym of symEntries) {
      nameMap.set(sym.name, sym.index);
    }
    for (const name of names) {
      const idx = nameMap.get(name);
      if (idx !== undefined) {
        result.push(idx);
      }
    }
    return result;
  }

  mapIndicesToNames(indices: number[], symEntries: SymbolObject[]): Record<number, string> {
    const result: Record<number, string> = {};
    const indexMap = new Map<number, string>();
    for (const sym of symEntries) {
      indexMap.set(sym.index, sym.name);
    }
    for (const idx of indices) {
      const name = indexMap.get(idx);
      if (name !== undefined) {
        result[idx] = name;
      }
    }
    return result;
  }
}
