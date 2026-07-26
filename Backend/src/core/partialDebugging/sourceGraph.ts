import type { ExpressionNode, ParsedFile, StatementNode, TemplateDefinitionNode } from '../parser/ast.js';
import type { SourceGraphDto, SourceGraphEdge, SourceGraphNode } from '../../types/partialDebugging.js';

type CompileEnv = Record<string, number>;

function printExpression(expr: ExpressionNode): string {
  switch (expr.type) {
    case 'Literal': return String(expr.value);
    case 'Identifier': return expr.name;
    case 'ArrayAccess': return `${printExpression(expr.array)}[${printExpression(expr.index)}]`;
    case 'MemberAccess': return `${printExpression(expr.object)}.${expr.property}`;
    case 'BinaryOp': return `${printExpression(expr.left)} ${expr.operator} ${printExpression(expr.right)}`;
    case 'UnaryOp': return `${expr.operator}${printExpression(expr.operand)}`;
    case 'Ternary': return `${printExpression(expr.condition)} ? ${printExpression(expr.thenExpr)} : ${printExpression(expr.elseExpr)}`;
    case 'FunctionCall': return `${expr.function}(${expr.arguments.map(printExpression).join(', ')})`;
    case 'ComponentCall': return `${expr.template}(${expr.templateArgs.map(printExpression).join(', ')})(${expr.callArgs.map(printExpression).join(', ')})`;
    case 'ArrayLiteral': return `[${expr.elements.map(printExpression).join(', ')}]`;
    case 'Tuple': return `(${expr.elements.map(printExpression).join(', ')})`;
  }
}

function evaluate(expr: ExpressionNode, env: CompileEnv): number | undefined {
  if (expr.type === 'Literal' && typeof expr.value === 'number') return expr.value;
  if (expr.type === 'Identifier') return env[expr.name];
  if (expr.type !== 'BinaryOp') return undefined;
  const left = evaluate(expr.left, env); const right = evaluate(expr.right, env);
  if (left === undefined || right === undefined) return undefined;
  if (expr.operator === '+') return left + right;
  if (expr.operator === '-') return left - right;
  if (expr.operator === '*') return left * right;
  if (expr.operator === '/' && right !== 0) return Math.trunc(left / right);
  if (expr.operator === '<') return Number(left < right);
  if (expr.operator === '<=') return Number(left <= right);
  if (expr.operator === '>') return Number(left > right);
  if (expr.operator === '>=') return Number(left >= right);
  if (expr.operator === '==') return Number(left === right);
  if (expr.operator === '!=') return Number(left !== right);
  return undefined;
}

function classifyOperation(operator: string): string {
  const mapping: Record<string, string> = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '**': 'pow', '<<': 'shift', '>>': 'shift', '&': 'bitwise', '|': 'bitwise', '^': 'bitwise' };
  return mapping[operator] ?? (['==', '!=', '<', '<=', '>', '>='].includes(operator) ? 'compare' : operator);
}

export function buildSourceGraph(parsedFiles: Map<string, ParsedFile>, rootTemplate: TemplateDefinitionNode, params: Array<{ name: string; value: number }>, mockedTemplateNames: string[]): SourceGraphDto {
  const nodes: SourceGraphNode[] = []; const edges: SourceGraphEdge[] = []; const knownNodes = new Set<string>();
  const templates = new Map<string, TemplateDefinitionNode>(); const mockSet = new Set(mockedTemplateNames); let sequence = 0;
  for (const file of parsedFiles.values()) for (const template of file.templates) templates.set(template.name, template);
  const addNode = (node: SourceGraphNode) => { if (!knownNodes.has(node.id)) { knownNodes.add(node.id); nodes.push(node); } return node.id; };
  const addEdge = (source: string, target: string, kind: SourceGraphEdge['kind'], operandIndex?: number, operator?: SourceGraphEdge['operator']) => edges.push({ id: `source-edge:${sequence++}`, source, target, kind, operandIndex, operator });

  const visitInstance = (definition: TemplateDefinitionNode, instancePath: string, env: CompileEnv, mocked = false) => {
    const at = (line: number) => ({ file: definition.sourceFile, startLine: line, endLine: line });
    const groupId = addNode({ id: `component:${instancePath}`, kind: 'component-group', label: `${instancePath} : ${definition.name}`, templateName: definition.name, componentPath: instancePath, mocked, childNodeIds: [], sourceSpan: at(definition.line) });
    const ensureSignal = (rawName: string, role: SourceGraphNode['role'] = 'intermediate') => {
      const qualifiedName = rawName.startsWith('main.') ? rawName : `${instancePath}.${rawName}`;
      const id = addNode({ id: `signal:${qualifiedName}`, kind: 'signal', label: qualifiedName, qualifiedName, localName: rawName, role, templateName: definition.name, componentPath: instancePath, sourceSpan: at(definition.line) });
      const group = nodes.find((node) => node.id === groupId); if (group?.childNodeIds && !group.childNodeIds.includes(id)) group.childNodeIds.push(id);
      return id;
    };
    for (const signal of definition.signals) {
      const role = mocked ? signal.kind === 'input' ? 'mock-input' : signal.kind === 'output' ? 'mock-output' : signal.kind : signal.kind;
      const arraySize = signal.arraySizes?.length === 1 ? signal.arraySizes[0] : undefined;
      const length = typeof arraySize === 'number' ? arraySize : arraySize ? evaluate(arraySize, env) : undefined;
      if (length !== undefined && length <= 512) for (let index = 0; index < length; index++) ensureSignal(`${signal.name}[${index}]`, role);
      else ensureSignal(signal.name, role);
    }
    const lower = (expr: ExpressionNode): string => {
      if (expr.type === 'Identifier' || expr.type === 'ArrayAccess' || expr.type === 'MemberAccess') return ensureSignal(printExpression(expr));
      if (expr.type === 'Literal') return addNode({ id: `constant:${String(expr.value)}`, kind: 'constant', label: String(expr.value) });
      const id = `operation:${instancePath}:${expr.line}:${sequence++}`; let children: ExpressionNode[] = []; let operation: string = expr.type;
      if (expr.type === 'BinaryOp') { children = [expr.left, expr.right]; operation = classifyOperation(expr.operator); }
      else if (expr.type === 'UnaryOp') { children = [expr.operand]; operation = classifyOperation(expr.operator); }
      else if (expr.type === 'Ternary') { children = [expr.condition, expr.thenExpr, expr.elseExpr]; operation = 'ternary'; }
      else if (expr.type === 'FunctionCall') { children = expr.arguments; operation = 'function-call'; }
      else if (expr.type === 'ComponentCall') { children = [...expr.templateArgs, ...expr.callArgs]; operation = 'component-call'; }
      else if (expr.type === 'ArrayLiteral' || expr.type === 'Tuple') { children = expr.elements; operation = 'alias'; }
      addNode({ id, kind: 'operation', label: operation, operation, componentPath: instancePath, sourceSpan: at(expr.line) });
      children.forEach((child, index) => addEdge(lower(child), id, 'data', index)); return id;
    };
    const visitStatements = (statements: StatementNode[], localEnv: CompileEnv) => {
      for (const statement of statements) {
        if (statement.type === 'Assignment' && (statement.operator === '<==' || statement.operator === '==>' || statement.operator === '<--' || statement.operator === '-->' || statement.operator === '===')) {
          const left = lower(statement.left); const right = lower(statement.right);
          if (statement.operator === '===') {
            const id = addNode({ id: `source-constraint:${instancePath}:${statement.line}:${sequence++}`, kind: 'source-constraint', label: '===', operator: '===', generatesConstraint: true, sourceSpan: at(statement.line) });
            addEdge(left, id, 'constraint-relation', undefined, '==='); addEdge(right, id, 'constraint-relation', undefined, '===');
          } else {
            const constrained = statement.operator === '<==' || statement.operator === '==>';
            const id = addNode({ id: `assignment:${instancePath}:${statement.line}:${sequence++}`, kind: 'assignment', label: statement.operator, operator: statement.operator, generatesWitness: true, generatesConstraint: constrained, dangerLevel: constrained ? 'safe' : 'review', sourceSpan: at(statement.line) });
            const reverse = statement.operator === '==>' || statement.operator === '-->';
            addEdge(reverse ? left : right, id, 'data', undefined, statement.operator); addEdge(id, reverse ? right : left, 'assignment', undefined, statement.operator);
          }
        } else if (statement.type === 'BlockStatement') visitStatements(statement.body, localEnv);
        else if (statement.type === 'IfStatement') {
          const value = evaluate(statement.condition, localEnv); if (value !== undefined) visitStatements(value ? statement.thenBranch : (statement.elseBranch ?? []), localEnv);
        } else if (statement.type === 'ForLoop') {
          const start = evaluate(statement.start, localEnv); const end = evaluate(statement.end, localEnv); const step = statement.step ? evaluate(statement.step, localEnv) : 1;
          if (start !== undefined && end !== undefined && step && Math.abs(end - start) <= 512) for (let value = start; step > 0 ? value < end : value > end; value += step) visitStatements(statement.body, { ...localEnv, [statement.variable]: value });
        }
      }
    };
    visitStatements(definition.statements, env);
    for (const component of definition.components) {
      if (component.type !== 'ComponentInstantiationNode') continue;
      const child = templates.get(component.templateName); if (!child) continue;
      const childEnv: CompileEnv = {};
      child.parameters.forEach((parameter, index) => { const value = component.arguments[index] ? evaluate(component.arguments[index], env) : undefined; if (value !== undefined) childEnv[parameter.name] = value; });
      const childPath = `${instancePath}.${component.name}`; const childMocked = mockSet.has(component.templateName);
      visitInstance(child, childPath, childEnv, childMocked); if (childMocked) addEdge(groupId, `component:${childPath}`, 'mock-boundary');
    }
  };
  visitInstance(rootTemplate, 'main', Object.fromEntries(params.map((param) => [param.name, param.value])));
  const adjacency: Record<string, string[]> = {};
  for (const edge of edges) { (adjacency[edge.source] ??= []).push(edge.target); (adjacency[edge.target] ??= []).push(edge.source); }
  return { nodes, edges, adjacency };
}
