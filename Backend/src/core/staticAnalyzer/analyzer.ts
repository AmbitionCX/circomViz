import * as fs from 'fs';
import { ASTNode, AssignmentNode, ExpressionNode, SignalNode, TemplateDefinitionNode } from '../parser/ast.js';
import {
  UnsafeAssignmentFinding,
  ConstraintLikeFinding,
  SignalDeclarationFinding,
  AstAnalysis,
  StaticCheckFinding,
  SymEntry,
  ConstraintIndex
} from './types.js';

function serializeExpr(expr: ExpressionNode): string {
  if (!expr) return '';

  switch (expr.type) {
    case 'Literal':
      return String(expr.value);
    case 'Identifier':
      return expr.name;
    case 'BinaryOp':
      return `${serializeExpr(expr.left)} ${expr.operator} ${serializeExpr(expr.right)}`;
    case 'UnaryOp':
      if (expr.isPostfix) {
        return `${serializeExpr(expr.operand)}${expr.operator}`;
      }
      return `${expr.operator}(${serializeExpr(expr.operand)})`;
    case 'ArrayAccess':
      return `${serializeExpr(expr.array)}[${serializeExpr(expr.index)}]`;
    case 'MemberAccess':
      return `${serializeExpr(expr.object)}.${expr.property}`;
    case 'FunctionCall':
      return `${expr.function}(${expr.arguments.map(serializeExpr).join(', ')})`;
    case 'ComponentCall':
      return `${expr.template}(${expr.templateArgs.map(serializeExpr).join(', ')})`;
    case 'Ternary':
      return `${serializeExpr(expr.condition)} ? ${serializeExpr(expr.thenExpr)} : ${serializeExpr(expr.elseExpr)}`;
    case 'Tuple':
      return `(${expr.elements.map(serializeExpr).join(', ')})`;
    case 'ArrayLiteral':
      return `[${expr.elements.map(serializeExpr).join(', ')}]`;
    default:
      return '';
  }
}

function extractSignalsFromExpr(expr: ExpressionNode): string[] {
  const signals = new Set<string>();

  function walk(node: ExpressionNode): void {
    if (!node) return;

    if (node.type === 'Identifier') {
      signals.add(node.name);
    } else if (node.type === 'BinaryOp') {
      walk(node.left);
      walk(node.right);
    } else if (node.type === 'Ternary') {
      walk(node.condition);
      walk(node.thenExpr);
      walk(node.elseExpr);
    } else if (node.type === 'UnaryOp') {
      walk(node.operand);
    } else if (node.type === 'ArrayAccess') {
      walk(node.array);
      walk(node.index);
    } else if (node.type === 'MemberAccess') {
      walk(node.object);
    } else if (node.type === 'FunctionCall') {
      node.arguments.forEach(walk);
    } else if (node.type === 'ComponentCall') {
      node.templateArgs.forEach(walk);
      node.callArgs.forEach(walk);
    } else if (node.type === 'Tuple') {
      node.elements.forEach(walk);
    } else if (node.type === 'ArrayLiteral') {
      node.elements.forEach(walk);
    }
  }

  walk(expr);
  return Array.from(signals);
}

function getTargetSignalName(left: ExpressionNode): string | null {
  if (left.type === 'Identifier') {
    return left.name;
  } else if (left.type === 'ArrayAccess') {
    const array = left.array;
    if (array.type === 'Identifier') {
      return array.name;
    }
  } else if (left.type === 'MemberAccess') {
    if (left.object.type === 'Identifier') {
      return left.property;
    }
  }
  return null;
}

function walkAST(node: any, analysis: AstAnalysis, templateName?: string, sourceFile?: string): void {
  if (!node) return;

  if (node.type === 'TemplateDefinition') {
    const tpl = node as TemplateDefinitionNode;
    const tplName = tpl.name || templateName;
    const tplSourceFile = tpl.sourceFile || sourceFile;

    tpl.signals.forEach((signal: SignalNode) => {
      analysis.declaredSignals.push({
        kind: 'signal-decl',
        name: signal.name,
        signalKind: signal.kind,
        line: signal.line,
        templateName: tplName,
        sourceFile: tplSourceFile
      });
    });

    tpl.statements.forEach((stmt: any) => walkAST(stmt, analysis, tplName, tplSourceFile));
  }

  if (node.type === 'Assignment') {
    const assignment = node as AssignmentNode;
    const target = getTargetSignalName(assignment.left);

    if (assignment.operator === '<--' || assignment.operator === '-->') {
      if (target) {
        analysis.unsafeAssignments.push({
          kind: 'unsafe-assign',
          operator: assignment.operator,
          target: { name: target },
          exprText: serializeExpr(assignment.right),
          line: assignment.line,
          templateName,
          sourceFile
        });
      }
    }

    if (assignment.operator === '<==' || assignment.operator === '==>' || assignment.operator === '===') {
      analysis.constraintLikes.push({
        kind: 'constraint-like',
        operator: assignment.operator,
        signalsMentioned: [
          ...extractSignalsFromExpr(assignment.left),
          ...extractSignalsFromExpr(assignment.right)
        ],
        line: assignment.line,
        templateName,
        sourceFile
      });
    }
  }

  if (node.type === 'IfStatement') {
    const ifStmt = node;
    ifStmt.thenBranch.forEach((stmt: any) => walkAST(stmt, analysis, templateName, sourceFile));
    if (ifStmt.elseBranch) {
      ifStmt.elseBranch.forEach((stmt: any) => walkAST(stmt, analysis, templateName, sourceFile));
    }
  }

  if (node.type === 'ForLoop' || node.type === 'WhileLoop') {
    const loop = node;
    loop.body.forEach((stmt: any) => walkAST(stmt, analysis, templateName, sourceFile));
  }

  if (node.type === 'BlockStatement') {
    const block = node;
    block.body.forEach((stmt: any) => walkAST(stmt, analysis, templateName, sourceFile));
  }
}

export function analyzeAstForUnsafeAssignments(ast: ASTNode[], sourceFile?: string): AstAnalysis {
  const unsafeAssignments: UnsafeAssignmentFinding[] = [];
  const constraintLikes: ConstraintLikeFinding[] = [];
  const declaredSignals: SignalDeclarationFinding[] = [];

  const analysis: AstAnalysis = {
    unsafeAssignments,
    constraintLikes,
    declaredSignals
  };

  ast.forEach(node => walkAST(node, analysis, undefined, sourceFile));

  return analysis;
}

export function analyzeMultipleFiles(files: Array<{ ast: ASTNode[]; path: string }>): AstAnalysis {
  const combined: AstAnalysis = {
    unsafeAssignments: [],
    constraintLikes: [],
    declaredSignals: []
  };

  for (const file of files) {
    const fileAnalysis = analyzeAstForUnsafeAssignments(file.ast, file.path);
    combined.unsafeAssignments.push(...fileAnalysis.unsafeAssignments);
    combined.constraintLikes.push(...fileAnalysis.constraintLikes);
    combined.declaredSignals.push(...fileAnalysis.declaredSignals);
  }

  return combined;
}

export function parseSymFile(symPath: string): SymEntry[] {
  const text = fs.readFileSync(symPath, 'utf-8');
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [index, witness, component, ...nameRest] = line.split(',');
      return {
        index: Number(index),
        witness: Number(witness),
        component: Number(component),
        name: nameRest.join(',').trim()
      };
    });
}

export function collectSignalIdsInConstraints(constraintsJsonPath: string): Set<number> {
  const raw = JSON.parse(fs.readFileSync(constraintsJsonPath, 'utf-8'));
  const used = new Set<number>();

  for (const constraint of raw.constraints as any[]) {
    for (const linExpr of constraint) {
      for (const sigIdStr of Object.keys(linExpr)) {
        if (sigIdStr !== '1') {
          used.add(Number(sigIdStr));
        }
      }
    }
  }
  return used;
}

export function buildConstraintIndex(symPath: string, constraintsJsonPath: string): ConstraintIndex {
  const symEntries = parseSymFile(symPath);
  const constrainedIds = collectSignalIdsInConstraints(constraintsJsonPath);

  const nameToEntries = new Map<string, SymEntry[]>();
  for (const e of symEntries) {
    if (!nameToEntries.has(e.name)) {
      nameToEntries.set(e.name, []);
    }
    nameToEntries.get(e.name)!.push(e);
  }

  return {
    symEntries,
    constrainedIds,
    nameToEntries,
    isSignalNameConstrained(name: string) {
      const entries = nameToEntries.get(name) ?? [];
      if (entries.some((e) => constrainedIds.has(e.index))) {
        return true;
      }

      for (const [fullName, symEntries] of nameToEntries) {
        if (fullName.endsWith('.' + name)) {
          if (symEntries.some((e) => constrainedIds.has(e.index))) {
            return true;
          }
        }
      }

      return false;
    }
  };
}

export function crossCheckAstVsConstraints(
  astAnalysis: AstAnalysis,
  index: ConstraintIndex
): StaticCheckFinding[] {
  const findings: StaticCheckFinding[] = [];

  const signalsInConstraintLikes = new Set<string>();
  for (const cl of astAnalysis.constraintLikes) {
    for (const sig of cl.signalsMentioned) {
      signalsInConstraintLikes.add(sig);
    }
  }

  for (const ua of astAnalysis.unsafeAssignments) {
    const constrainedInR1CS = index.isSignalNameConstrained(ua.target.name);
    const hasAstConstraint = signalsInConstraintLikes.has(ua.target.name);

    if (!constrainedInR1CS) {
      findings.push({
        severity: 'high',
        type: 'witness-only-signal',
        message: `Signal "${ua.target.name}" is assigned with ${ua.operator} at line ${ua.line}${ua.templateName ? ` (in ${ua.templateName})` : ''}, but does not appear in any R1CS constraint. This signal is witness-only and has no soundness guarantee.`,
        file: ua.sourceFile,
        line: ua.line
      });
    } else if (hasAstConstraint) {
      findings.push({
        severity: 'low',
        type: 'unsafe-assignment-with-constraint',
        message: `Signal "${ua.target.name}" is assigned with ${ua.operator} at line ${ua.line}${ua.exprText ? ` (= ${ua.exprText})` : ''}. It appears in a nearby constraint statement, but verify the constraint fully captures the intended relation.`,
        file: ua.sourceFile,
        line: ua.line
      });
    } else {
      findings.push({
        severity: 'medium',
        type: 'unsafe-assignment-needs-review',
        message: `Signal "${ua.target.name}" is assigned with ${ua.operator} at line ${ua.line}${ua.exprText ? ` (= ${ua.exprText})` : ''}. It appears in R1CS constraints, but no explicit constraint statement (===, <==, ==>) was found near the assignment. Verify the relation is fully enforced.`,
        file: ua.sourceFile,
        line: ua.line
      });
    }
  }

  return findings;
}

export function checkDeclaredButNeverConstrained(
  astAnalysis: AstAnalysis,
  index: ConstraintIndex
): StaticCheckFinding[] {
  const findings: StaticCheckFinding[] = [];

  for (const signal of astAnalysis.declaredSignals) {
    if (signal.signalKind === 'intermediate') {
      const constrained = index.isSignalNameConstrained(signal.name);

      if (!constrained) {
        findings.push({
          severity: 'medium',
          type: 'declared-but-never-constrained',
          message: `Intermediate signal "${signal.name}" (line ${signal.line}${signal.templateName ? ` in ${signal.templateName}` : ''}) is declared but never appears in any constraint.`,
          file: signal.sourceFile,
          line: signal.line
        });
      }
    }
  }

  return findings;
}

export function runStaticAnalysis(
  ast: ASTNode[],
  symPath: string,
  constraintsJsonPath: string,
  sourceFile?: string
): StaticCheckFinding[] {
  const astAnalysis = analyzeAstForUnsafeAssignments(ast, sourceFile);
  const constraintIndex = buildConstraintIndex(symPath, constraintsJsonPath);

  const findings: StaticCheckFinding[] = [
    ...crossCheckAstVsConstraints(astAnalysis, constraintIndex),
    ...checkDeclaredButNeverConstrained(astAnalysis, constraintIndex)
  ];

  return findings;
}

export function runStaticAnalysisOnFiles(
  files: Array<{ ast: ASTNode[]; path: string }>,
  symPath: string,
  constraintsJsonPath: string
): StaticCheckFinding[] {
  const astAnalysis = analyzeMultipleFiles(files);
  const constraintIndex = buildConstraintIndex(symPath, constraintsJsonPath);

  const findings: StaticCheckFinding[] = [
    ...crossCheckAstVsConstraints(astAnalysis, constraintIndex),
    ...checkDeclaredButNeverConstrained(astAnalysis, constraintIndex)
  ];

  return findings;
}
