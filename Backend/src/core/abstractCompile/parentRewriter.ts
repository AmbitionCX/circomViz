import type {
  TemplateDefinitionNode,
  ComponentInstantiationNode,
  ComponentDeclarationNode,
  ComponentInstantiationWithInitNode,
  ComponentArrayInitNode,
  StatementNode,
} from '../parser/ast.js';
import type { TemplateInterface, SignalPort } from './interfaceExtractor.js';

export interface ValidatorWarning {
  templateName: string;
  instance: string;
  reason: string;
}

export interface RewrittenParentResult {
  templateName: string;
  source: string;
  mockedInstances: Array<{ name: string; templateName: string; outputs: SignalPort[] }>;
  unmockedInstances: Array<{ name: string; templateName: string; reason: string }>;
  validatorWarnings: ValidatorWarning[];
  boundaryInputs: Array<{ instance: string; signal: string; isArray: boolean }>;
}

export interface ParentRewriterOptions {
  partialSuffix?: string;
}

interface InstanceInfo {
  name: string;
  templateName: string;
  line: number;
  isArrayElement: boolean;
  arrayName?: string;
  arrayIndex?: string;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

export class ParentRewriter {
  private partialSuffix: string;
  private confirmSet: Set<string>;
  private interfaceMap: Map<string, TemplateInterface>;
  private mockedInstances: Array<{ name: string; templateName: string; outputs: SignalPort[] }> = [];
  private unmockedInstances: Array<{ name: string; templateName: string; reason: string }> = [];
  private validatorWarnings: ValidatorWarning[] = [];
  private boundaryInputs: Array<{ instance: string; signal: string; isArray: boolean }> = [];

  constructor(
    confirmSet: Set<string>,
    interfaceMap: Map<string, TemplateInterface>,
    opts: Partial<ParentRewriterOptions> = {},
  ) {
    this.confirmSet = confirmSet;
    this.interfaceMap = interfaceMap;
    this.partialSuffix = opts.partialSuffix ?? '_Partial';
  }

  rewrite(def: TemplateDefinitionNode, fullSource: string): RewrittenParentResult {
    this.mockedInstances = [];
    this.unmockedInstances = [];
    this.validatorWarnings = [];
    this.boundaryInputs = [];

    const newName = `${def.name}${this.partialSuffix}`;

    const { lines, offsetLine } = this.extractTemplateBlock(fullSource, def.line);
    const componentArrays = this.collectComponentArrays(def);
    const componentVars = this.collectComponentVars(def);
    const instances = this.collectInstances(def, componentArrays, componentVars);

    const componentDeclLines = new Map<string, number>();
    for (const comp of def.components || []) {
      componentDeclLines.set(comp.name, comp.line);
    }

    this.renameTemplate(lines, def.name, newName);

    // --- Build elimination data from confirmed instances ---

    const confirmedComponentNames = new Set<string>();
    const replacementRegexes: Array<{ regex: RegExp; target: string }> = [];
    const boundaryDecls: Array<{ name: string; sizes: string; insertAtIdx: number }> = [];
    const usedBoundaryKeys = new Set<string>();

    for (const inst of instances) {
      if (!this.confirmSet.has(inst.templateName)) continue;

      const iface = this.interfaceMap.get(inst.templateName);
      if (!iface) {
        this.unmockedInstances.push({
          name: inst.name,
          templateName: inst.templateName,
          reason: 'interface not found',
        });
        continue;
      }

      const compName = inst.isArrayElement ? inst.arrayName! : inst.name;
      confirmedComponentNames.add(compName);

      this.mockedInstances.push({
        name: compName,
        templateName: inst.templateName,
        outputs: iface.outputs,
      });

      if (iface.outputs.length === 0) {
        this.validatorWarnings.push({
          templateName: inst.templateName,
          instance: compName,
          reason: 'validator-style child has no outputs; constraints dropped',
        });
        continue;
      }

      const declLine = inst.isArrayElement
        ? (componentDeclLines.get(inst.arrayName!) ?? inst.line)
        : inst.line;
      const declIdx = Math.max(0, declLine - offsetLine);

      for (const out of iface.outputs) {
        const bName = this.boundaryName(compName, out.name);
        const boundaryKey = `${compName}__${out.name}`;

        if (!usedBoundaryKeys.has(boundaryKey)) {
          usedBoundaryKeys.add(boundaryKey);

          const compArraySizes = inst.isArrayElement
            ? (componentArrays.get(inst.arrayName!) ?? [])
            : [];
          const outputSizes = out.isArray ? out.arraySizes.map((s) => `[${s}]`).join('') : '';
          const allSizes = compArraySizes.map((s) => `[${s}]`).join('') + outputSizes;

          this.boundaryInputs.push({
            instance: compName,
            signal: bName,
            isArray: allSizes.length > 0,
          });
          boundaryDecls.push({ name: bName, sizes: allSizes, insertAtIdx: declIdx });
        }

        if (inst.isArrayElement) {
          replacementRegexes.push({
            regex: new RegExp(`\\b${escapeRegex(compName)}\\[([^\\]]+)\\]\\.${escapeRegex(out.name)}\\b`, 'g'),
            target: `${bName}[$1]`,
          });
        } else {
          replacementRegexes.push({
            regex: new RegExp(`\\b${escapeRegex(compName)}\\.${escapeRegex(out.name)}\\b`, 'g'),
            target: bName,
          });
        }
      }
    }

    // --- Group boundary declarations by insertion position ---

    const boundaryByLine = new Map<number, typeof boundaryDecls>();
    for (const decl of boundaryDecls) {
      if (!boundaryByLine.has(decl.insertAtIdx)) {
        boundaryByLine.set(decl.insertAtIdx, []);
      }
      boundaryByLine.get(decl.insertAtIdx)!.push(decl);
    }

    // --- Classify lines: delete or keep+patch ---

    const outputLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      // Check: component declaration for a confirmed component?
      // → Replace with boundary signal declaration(s)
      const declMatch = lines[i].match(/^\s*component\s+(\w+)/);
      if (declMatch && confirmedComponentNames.has(declMatch[1])) {
        const decls = boundaryByLine.get(i) ?? boundaryByLine.get(confirmedComponentNames.has(declMatch[1]) ? i : -1) ?? [];
        const indent = (lines[i].match(/^(\s*)/) ?? ['', ''])[1];
        if (decls.length > 0) {
          for (const decl of decls) {
            outputLines.push(`${indent}signal input ${decl.name}${decl.sizes};`);
          }
        }
        continue;
      }

      // Check: boundary declarations for this line that weren't caught by declaration match?
      // (e.g., inline component declarations in for-loops)
      const extraDecls = boundaryByLine.get(i);
      if (extraDecls && extraDecls.length > 0) {
        const indent = (lines[i].match(/^(\s*)/) ?? ['', ''])[1];
        for (const decl of extraDecls) {
          outputLines.push(`${indent}signal input ${decl.name}${decl.sizes};`);
        }
      }

      // Check: component instantiation for a confirmed component?
      // arr[idx] = Template() OR componentName = Template()
      const instMatch = lines[i].match(/^\s*(\w+)(?:\[[^\]]*\])?\s*=\s*\w+\s*\(/);
      if (instMatch && confirmedComponentNames.has(instMatch[1])) {
        continue;
      }

      // Check: input assignment to a confirmed component?
      // compName.field <== OR compName[idx].field[idx] <==
      const inputMatch = lines[i].match(/^\s*(\w+)(?:\[[^\]]*\])?\.\w+(?:\[[^\]]*\])?\s*<==/);
      if (inputMatch && confirmedComponentNames.has(inputMatch[1])) {
        continue;
      }

      // Keep + patch: apply output reference replacements
      let patchedLine = lines[i];
      for (const { regex, target } of replacementRegexes) {
        patchedLine = patchedLine.replace(regex, target);
      }
      outputLines.push(patchedLine);
    }

    return {
      templateName: newName,
      source: outputLines.join('\n'),
      mockedInstances: this.mockedInstances,
      unmockedInstances: this.unmockedInstances,
      validatorWarnings: this.validatorWarnings,
      boundaryInputs: this.boundaryInputs,
    };
  }

  private extractTemplateBlock(source: string, startLine: number): { lines: string[]; offsetLine: number } {
    const allLines = source.split('\n');
    const startIdx = Math.max(0, startLine - 1);

    let braceCount = 0;
    let foundOpen = false;
    let endIdx = startIdx;

    for (let i = startIdx; i < allLines.length; i++) {
      const line = allLines[i];
      let inLineComment = false;
      for (let c = 0; c < line.length; c++) {
        if (inLineComment) break;
        const ch = line[c];
        const next = line[c + 1];
        if (ch === '/' && next === '/') { inLineComment = true; continue; }
        if (ch === '{') { braceCount++; foundOpen = true; }
        else if (ch === '}') { braceCount--; }
      }
      if (foundOpen && braceCount === 0) {
        endIdx = i;
        break;
      }
    }

    return {
      lines: allLines.slice(startIdx, endIdx + 1),
      offsetLine: startLine,
    };
  }

  private renameTemplate(lines: string[], originalName: string, newName: string): void {
    const regex = new RegExp(`(template\\s+)${escapeRegex(originalName)}(\\s*\\()`, 'g');
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      if (regex.test(lines[i])) {
        lines[i] = lines[i].replace(regex, `$1${newName}$2`);
        return;
      }
    }
  }

  private collectComponentArrays(def: TemplateDefinitionNode): Map<string, string[]> {
    const m = new Map<string, string[]>();
    for (const comp of def.components || []) {
      if (comp.type === 'ComponentDeclaration' && comp.arraySizes) {
        m.set(comp.name, comp.arraySizes.map(arraySizeToStr as any));
      } else if (comp.type === 'ComponentArrayInit') {
        m.set(comp.name, comp.arraySizes.map(arraySizeToStr as any));
      }
    }
    return m;
  }

  private collectComponentVars(def: TemplateDefinitionNode): Set<string> {
    const s = new Set<string>();
    for (const comp of def.components || []) {
      if (comp.type === 'ComponentDeclaration' && !comp.arraySizes) {
        s.add(comp.name);
      }
    }
    return s;
  }

  private collectInstances(
    def: TemplateDefinitionNode,
    componentArrays: Map<string, string[]>,
    componentVars: Set<string>,
  ): InstanceInfo[] {
    const results: InstanceInfo[] = [];

    for (const comp of def.components || []) {
      if (comp.type === 'ComponentInstantiationNode' && !(comp as any).isAnonymous) {
        results.push({
          name: comp.name,
          templateName: comp.templateName,
          line: comp.line,
          isArrayElement: false,
        });
      }
    }

    const visit = (stmt: any) => {
      if (!stmt) return;

      if (stmt.type === 'ComponentInstantiationNode' && !stmt.isAnonymous) {
        results.push({
          name: stmt.name,
          templateName: stmt.templateName,
          line: stmt.line,
          isArrayElement: false,
        });
      }

      if (stmt.type === 'Assignment') {
        const left = stmt.left;
        const right = stmt.right;

        if (left?.type === 'ArrayAccess' &&
            left.array?.type === 'Identifier' &&
            componentArrays.has(left.array.name) &&
            right?.type === 'FunctionCall') {
          results.push({
            name: `${left.array.name}[${exprToStr(left.index)}]`,
            templateName: right.function,
            line: stmt.line,
            isArrayElement: true,
            arrayName: left.array.name,
            arrayIndex: exprToStr(left.index),
          });
        }

        if (left?.type === 'Identifier' &&
            componentVars.has(left.name) &&
            right?.type === 'FunctionCall') {
          results.push({
            name: left.name,
            templateName: right.function,
            line: stmt.line,
            isArrayElement: false,
          });
        }
      }

      if (Array.isArray(stmt.body)) stmt.body.forEach(visit);
      if (Array.isArray(stmt.thenBranch)) stmt.thenBranch.forEach(visit);
      if (Array.isArray(stmt.elseBranch)) stmt.elseBranch.forEach(visit);
      if (Array.isArray(stmt.initStatements)) stmt.initStatements.forEach(visit);
      if (Array.isArray(stmt.initBlock)) stmt.initBlock.forEach(visit);
    };

    for (const stmt of def.statements || []) {
      visit(stmt);
    }

    return results;
  }

  private boundaryName(instanceOrArrayName: string, outputName: string): string {
    return `__${instanceOrArrayName}_${outputName}`;
  }
}
