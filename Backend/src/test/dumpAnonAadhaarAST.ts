/**
 * Dump the parsed AST of every local circom file in anon-aadhaar
 * to a single human-readable text file for manual inspection.
 *
 * Build & run:
 *   npx tsc -p tsconfig.json
 *   node dist/test/dumpAnonAadhaarAST.js
 *
 * Output: logs/ast-dump/anon-aadhaar-ast.txt
 */

import * as fs from 'fs';
import * as path from 'path';

import { CircomLexer } from '../core/parser/lexer.js';
import { CircomParser } from '../core/parser/parser.js';
import type { ASTNode } from '../core/parser/ast.js';

const BACKEND_ROOT = path.resolve(process.cwd());
const SUBMODULE_ROOT = path.resolve(BACKEND_ROOT, '..', 'submodules', 'anon-aadhaar');
const OUTPUT_DIR = path.join(BACKEND_ROOT, 'logs', 'ast-dump');

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

// ---------------------------------------------------------------------------
// AST → human-readable text
// ---------------------------------------------------------------------------

function parseFile(relPath: string): ASTNode[] {
  const fullPath = path.join(SUBMODULE_ROOT, relPath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  const lexer = new CircomLexer(content);
  const parser = new CircomParser(lexer, fullPath);
  return parser.parse(content, fullPath);
}

function pad(str: string, width: number): string {
  return str.length >= width ? str + ' ' : str + ' '.repeat(width - str.length);
}

/** Format an expression node as a compact one-liner (best-effort). */
function exprToString(node: any): string {
  if (!node) return '∅';

  switch (node.type) {
    case 'Literal':
      return String(node.value);
    case 'Identifier':
      return node.name;
    case 'BinaryOp':
      return `(${exprToString(node.left)} ${node.operator} ${exprToString(node.right)})`;
    case 'UnaryOp':
      return node.isPostfix
        ? `${exprToString(node.operand)}${node.operator}`
        : `${node.operator}${exprToString(node.operand)}`;
    case 'ArrayAccess':
      return `${exprToString(node.array)}[${exprToString(node.index)}]`;
    case 'MemberAccess':
      return `${exprToString(node.object)}.${node.property}`;
    case 'FunctionCall':
      return `${node.function}(${node.arguments.map(exprToString).join(', ')})`;
    case 'ComponentCall':
      return `${node.template}(${node.templateArgs.map(exprToString).join(', ')})(${node.callArgs.map(exprToString).join(', ')})`;
    case 'Ternary':
      return `${exprToString(node.condition)} ? ${exprToString(node.thenExpr)} : ${exprToString(node.elseExpr)}`;
    case 'Tuple':
      return `(${node.elements.map(exprToString).join(', ')})`;
    case 'ArrayLiteral':
      return `[${node.elements.map(exprToString).join(', ')}]`;
    default:
      return `[${node.type}]`;
  }
}

/** Format array-size expressions (may be number or expression). */
function sizeToString(size: any): string {
  if (typeof size === 'number') return String(size);
  return exprToString(size);
}

function signalKindTag(kind: string): string {
  if (kind === 'input') return '[input ]';
  if (kind === 'output') return '[output]';
  return '[inter ]';
}

/** Format a statement node, returning an array of indented text lines. */
function statementToString(node: any, indent: string): string[] {
  const lines: string[] = [];

  const push = (text: string) => lines.push(indent + text);

  switch (node.type) {
    case 'Assignment': {
      const op = node.operator;
      // Check if left side is a tuple or member access etc.
      push(`${exprToString(node.left)}  ${op}  ${exprToString(node.right)}   (line ${node.line})`);
      break;
    }
    case 'ExpressionStatement':
      push(`${exprToString(node.expression)}   (line ${node.line})`);
      break;
    case 'Variable': {
      let s = `var ${node.name}`;
      if (node.isArray && node.arraySizes) {
        s += `[${node.arraySizes.map(sizeToString).join('][')}]`;
      }
      if (node.initialValue) {
        s += ` = ${exprToString(node.initialValue)}`;
      }
      push(`${s}   (line ${node.line})`);
      break;
    }
    case 'Signal': {
      let s = `signal ${signalKindTag(node.kind)} ${node.name}`;
      if (node.isArray && node.arraySizes) {
        s += `[${node.arraySizes.map(sizeToString).join('][')}]`;
      }
      if (node.initialValue) {
        s += ` <== ${exprToString(node.initialValue)}`;
      }
      push(`${s}   (line ${node.line})`);
      break;
    }
    case 'TupleSignalDeclaration': {
      const elems = node.elements.map((e: any) =>
        e.isArray ? `${e.name}[${(e.arraySizes || []).map(sizeToString).join('][')}]` : e.name,
      );
      let s = `signal ${signalKindTag(node.kind)} (${elems.join(', ')})`;
      if (node.initialValue) {
        s += ` <== ${exprToString(node.initialValue)}`;
      }
      push(`${s}   (line ${node.line})`);
      break;
    }
    case 'ComponentInstantiationNode': {
      const pubStr = node.publicSignals?.length
        ? ` { public [${node.publicSignals.join(', ')}] }`
        : '';
      push(`component ${node.name}${pubStr} = ${node.templateName}(${node.arguments.map(exprToString).join(', ')})   (line ${node.line})`);
      break;
    }
    case 'ComponentDeclaration': {
      let s = `component ${node.name}`;
      if (node.isArray && node.arraySizes) {
        s += `[${node.arraySizes.map(sizeToString).join('][')}]`;
      }
      push(`${s};   (declaration, line ${node.line})`);
      break;
    }
    case 'ComponentArrayInit': {
      let s = `component ${node.name}[${node.arraySizes.map(sizeToString).join('][')}]`;
      push(`${s};   (array init, line ${node.line})`);
      for (const stmt of node.initStatements || []) {
        lines.push(...statementToString(stmt, indent + '    '));
      }
      break;
    }
    case 'ComponentInstantiationWithInitNode': {
      let s = `component ${node.name}`;
      if (node.isArray && node.arraySizes) {
        s += `[${node.arraySizes.map(sizeToString).join('][')}]`;
      }
      push(`${s};   (init block, line ${node.line})`);
      for (const stmt of node.initBlock || []) {
        lines.push(...statementToString(stmt, indent + '    '));
      }
      break;
    }
    case 'IfStatement': {
      push(`if (${exprToString(node.condition)})   (line ${node.line}) {`);
      for (const stmt of node.thenBranch || []) {
        lines.push(...statementToString(stmt, indent + '    '));
      }
      if (node.elseBranch) {
        push(`} else {`);
        for (const stmt of node.elseBranch) {
          lines.push(...statementToString(stmt, indent + '    '));
        }
      }
      push(`}`);
      break;
    }
    case 'ForLoop': {
      let stepStr = '';
      if (node.step) {
        stepStr = `; ${exprToString(node.step)}`;
      }
      push(`for (var ${node.variable} = ${exprToString(node.start)}; ${exprToString(node.end)}${stepStr})   (line ${node.line}) {`);
      for (const stmt of node.body || []) {
        lines.push(...statementToString(stmt, indent + '    '));
      }
      push(`}`);
      break;
    }
    case 'WhileLoop': {
      push(`while (${exprToString(node.condition)})   (line ${node.line}) {`);
      for (const stmt of node.body || []) {
        lines.push(...statementToString(stmt, indent + '    '));
      }
      push(`}`);
      break;
    }
    case 'Return':
      push(`return ${exprToString(node.value)}   (line ${node.line})`);
      break;
    case 'Assert':
      push(`assert(${exprToString(node.condition)}${node.message ? ', ' + exprToString(node.message) : ''})   (line ${node.line})`);
      break;
    case 'BlockStatement':
      push(`{   (block, line ${node.line})`);
      for (const stmt of node.body || []) {
        lines.push(...statementToString(stmt, indent + '    '));
      }
      push(`}`);
      break;
    default:
      push(`[unknown statement: ${node.type}]   (line ${node.line})`);
  }

  return lines;
}

function dumpAST(ast: ASTNode[], relPath: string): string {
  const out: string[] = [];
  const sep = '='.repeat(100);

  out.push(sep);
  out.push(`File: ${relPath}`);
  out.push(sep);
  out.push('');

  for (const node of ast as any[]) {
    switch (node.type) {
      case 'Pragma':
        out.push(`pragma circom ${node.version}   (line ${node.line})`);
        out.push('');
        break;

      case 'Include':
        out.push(`include "${node.path}"   (line ${node.line})`);
        break;

      case 'FunctionDefinition': {
        const params = node.parameters.map((p: any) => {
          let s = p.name;
          if (p.isArray) s += `[${(p.arraySizes || []).map(sizeToString).join('][')}]`;
          return s;
        });
        out.push(`--- Function: ${node.name}(${params.join(', ')})   (line ${node.line}) ---`);
        for (const stmt of node.body || []) {
          out.push(...statementToString(stmt, '    '));
        }
        out.push('');
        break;
      }

      case 'TemplateDefinition': {
        const params = node.parameters.map((p: any) => {
          let s = p.name;
          if (p.isArray) s += `[${(p.arraySizes || []).map(sizeToString).join('][')}]`;
          return s;
        });
        out.push('');
        out.push('-'.repeat(100));
        out.push(`Template: ${node.name}(${params.join(', ')})   (line ${node.line})`);
        out.push('-'.repeat(100));

        // Signals
        if (node.signals && node.signals.length > 0) {
          out.push('');
          out.push('  Signals:');
          for (const sig of node.signals) {
            let s = `    ${signalKindTag(sig.kind)} ${sig.name}`;
            if (sig.isArray && sig.arraySizes) {
              s += `[${sig.arraySizes.map(sizeToString).join('][')}]`;
            }
            if (sig.initialValue) {
              s += `  <==  ${exprToString(sig.initialValue)}`;
            }
            s += `   (line ${sig.line})`;
            out.push(s);
          }
        }

        // Variables
        if (node.variables && node.variables.length > 0) {
          out.push('');
          out.push('  Variables:');
          for (const v of node.variables) {
            let s = `    var ${v.name}`;
            if (v.isArray && v.arraySizes) {
              s += `[${v.arraySizes.map(sizeToString).join('][')}]`;
            }
            if (v.initialValue) {
              s += ` = ${exprToString(v.initialValue)}`;
            }
            s += `   (line ${v.line})`;
            out.push(s);
          }
        }

        // Components (named instantiations, declarations, arrays)
        if (node.components && node.components.length > 0) {
          out.push('');
          out.push('  Components:');
          for (const comp of node.components) {
            switch (comp.type) {
              case 'ComponentInstantiationNode': {
                const pubStr = comp.publicSignals?.length
                  ? ` { public [${comp.publicSignals.join(', ')}] }`
                  : '';
                const anonStr = comp.isAnonymous ? ' [anonymous]' : '';
                const callArgsStr = comp.callArgs?.length
                  ? `(${comp.callArgs.map(exprToString).join(', ')})`
                  : '';
                out.push(`    ${comp.name}${pubStr}${anonStr} = ${comp.templateName}(${comp.arguments.map(exprToString).join(', ')})${callArgsStr}   (line ${comp.line})`);
                break;
              }
              case 'ComponentDeclaration':
                out.push(`    ${comp.name}[${(comp.arraySizes || []).map(sizeToString).join('][')}]  (declaration, line ${comp.line})`);
                break;
              case 'ComponentArrayInit': {
                out.push(`    ${comp.name}[${comp.arraySizes.map(sizeToString).join('][')}]  (array init, line ${comp.line})`);
                if (comp.initStatements?.length) {
                  out.push(`      ↳ initStatements (${comp.initStatements.length}):`);
                  for (const s of comp.initStatements) {
                    out.push(...statementToString(s, '          '));
                  }
                }
                break;
              }
              case 'ComponentInstantiationWithInitNode':
                out.push(`    ${comp.name}  (init block, line ${comp.line})`);
                if (comp.initBlock?.length) {
                  out.push(`      ↳ initBlock (${comp.initBlock.length}):`);
                  for (const s of comp.initBlock) {
                    out.push(...statementToString(s, '          '));
                  }
                }
                break;
            }
          }
        }

        // Statements
        if (node.statements && node.statements.length > 0) {
          out.push('');
          out.push('  Statements:');
          for (const stmt of node.statements) {
            out.push(...statementToString(stmt, '    '));
          }
        }

        out.push('');
        break;
      }

      case 'ComponentInstantiationNode': {
        const pubStr = node.publicSignals?.length
          ? ` { public [${node.publicSignals.join(', ')}] }`
          : '';
        out.push(`component ${node.name}${pubStr} = ${node.templateName}(${node.arguments.map(exprToString).join(', ')})   (line ${node.line})`);
        out.push('');
        break;
      }

      default:
        out.push(`[top-level node: ${node.type}]   (line ${node.line})`);
    }
  }

  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const sections: string[] = [];
  const header = [
    '╔' + '═'.repeat(98) + '╗',
    '║  AST Dump — anon-aadhaar local circom files' + ' '.repeat(60) + '║',
    '║  Generated: ' + new Date().toISOString() + ' '.repeat(57) + '║',
    '╚' + '═'.repeat(98) + '╝',
    '',
  ];
  sections.push(header.join('\n'));

  for (const relPath of LOCAL_FILES) {
    try {
      const ast = parseFile(relPath);
      const dumped = dumpAST(ast, relPath);
      sections.push(dumped);
    } catch (err: any) {
      sections.push(`${'='.repeat(100)}\nFile: ${relPath}\n${'='.repeat(100)}\n\n  PARSE ERROR: ${err.message}\n`);
    }
  }

  const outputPath = path.join(OUTPUT_DIR, 'anon-aadhaar-ast.txt');
  fs.writeFileSync(outputPath, sections.join('\n'), 'utf-8');
  console.log(`AST dump written to: ${outputPath}`);
  console.log(`File size: ${Math.round(fs.statSync(outputPath).size / 1024)} KB`);
}

main();
