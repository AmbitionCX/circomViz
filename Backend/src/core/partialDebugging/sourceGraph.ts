import type { ExpressionNode, ForLoopNode, ParsedFile, StatementNode, TemplateDefinitionNode, VariableNode } from '../parser/ast.js';
import { collectDirectComponents } from '../parser/componentCollector.js';
import type { SourceGraphDto, SourceGraphEdge, SourceGraphNode, SourceLoopDto, SourceStatementDto } from '../../types/partialDebugging.js';

type CompileEnv = Record<string, number>;
type ArraySize = number | ExpressionNode;

function printExpression(expr: ExpressionNode): string {
  switch (expr.type) {
    case 'Literal': return String(expr.value);
    case 'Identifier': return expr.name;
    case 'ArrayAccess': return `${printExpression(expr.array)}[${printExpression(expr.index)}]`;
    case 'MemberAccess': return `${printExpression(expr.object)}.${expr.property}`;
    case 'BinaryOp': return `${printExpression(expr.left)} ${expr.operator} ${printExpression(expr.right)}`;
    case 'UnaryOp': return expr.isPostfix ? `${printExpression(expr.operand)}${expr.operator}` : `${expr.operator}${printExpression(expr.operand)}`;
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
  if (expr.type === 'UnaryOp') {
    const operand = evaluate(expr.operand, env);
    if (operand === undefined) return undefined;
    if (expr.operator === '-') return -operand;
    if (expr.operator === '+') return operand;
    if (expr.operator === '!') return Number(!operand);
    if (expr.operator === '~') return ~operand;
    return undefined;
  }
  if (expr.type !== 'BinaryOp') return undefined;
  const left = evaluate(expr.left, env); const right = evaluate(expr.right, env);
  if (left === undefined || right === undefined) return undefined;
  if (expr.operator === '+') return left + right;
  if (expr.operator === '-') return left - right;
  if (expr.operator === '*') return left * right;
  if ((expr.operator === '/' || expr.operator === '\\') && right !== 0) return Math.trunc(left / right);
  if (expr.operator === '%' && right !== 0) return left % right;
  if (expr.operator === '<<') return left << right;
  if (expr.operator === '>>') return left >> right;
  if (expr.operator === '&') return left & right;
  if (expr.operator === '|') return left | right;
  if (expr.operator === '^') return left ^ right;
  if (expr.operator === '<') return Number(left < right);
  if (expr.operator === '<=') return Number(left <= right);
  if (expr.operator === '>') return Number(left > right);
  if (expr.operator === '>=') return Number(left >= right);
  if (expr.operator === '==') return Number(left === right);
  if (expr.operator === '!=') return Number(left !== right);
  if (expr.operator === '&&') return Number(Boolean(left) && Boolean(right));
  if (expr.operator === '||') return Number(Boolean(left) || Boolean(right));
  return undefined;
}

function classifyOperation(operator: string): string {
  const mapping: Record<string, string> = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '\\': 'div', '**': 'pow', '<<': 'shift', '>>': 'shift', '&': 'bitwise', '|': 'bitwise', '^': 'bitwise' };
  return mapping[operator] ?? (['==', '!=', '<', '<=', '>', '>='].includes(operator) ? 'compare' : operator);
}

function loopStep(loop: ForLoopNode, env: CompileEnv): number | undefined {
  if (!loop.step) return 1;
  if (loop.step.type === "UnaryOp") return loop.step.operator === "++" ? 1 : loop.step.operator === "--" ? -1 : undefined;
  if (loop.step.type === "BinaryOp") {
    const value = evaluate(loop.step.right, env);
    if (value === undefined) return undefined;
    if (loop.step.operator === "+=") return value;
    if (loop.step.operator === "-=") return -value;
  }
  return evaluate(loop.step, env);
}
function loopIterationCount(loop: ForLoopNode, env: CompileEnv): number | undefined {
  const start = evaluate(loop.start, env); const step = loopStep(loop, env);
  if (start === undefined || !step || loop.end.type !== "BinaryOp" || loop.end.left.type !== "Identifier") return undefined;
  const end = evaluate(loop.end.right, env); if (end === undefined) return undefined;
  if (loop.end.operator === "<" && step > 0) return Math.max(0, Math.ceil((end - start) / step));
  if (loop.end.operator === "<=" && step > 0) return Math.max(0, Math.floor((end - start) / step) + 1);
  if (loop.end.operator === ">" && step < 0) return Math.max(0, Math.ceil((start - end) / -step));
  if (loop.end.operator === ">=" && step < 0) return Math.max(0, Math.floor((start - end) / -step) + 1);
  return undefined;
}

const dimensions = (sizes?: ArraySize[]) => sizes?.map((size) => typeof size === 'number' ? String(size) : printExpression(size)) ?? [];
const withDimensions = (name: string, values: string[]) => `${name}${values.map((value) => `[${value}]`).join('')}`;
const withoutIndexes = (name: string) => name.replace(/\[[^\]]*\]/g, '');

interface VariableDefinition {
  name: string;
  line: number;
  initialExpression?: ExpressionNode;
  initialValue?: number;
  arrayDimensions: string[];
  loopVariable: boolean;
}

export function buildSourceGraph(parsedFiles: Map<string, ParsedFile>, rootTemplate: TemplateDefinitionNode, params: Array<{ name: string; value: number }>, mockedTemplateNames: string[]): SourceGraphDto {
  const nodes: SourceGraphNode[] = []; const edges: SourceGraphEdge[] = []; const knownNodes = new Set<string>();
  const loops: SourceLoopDto[] = []; const statements: SourceStatementDto[] = [];
  let activeLoopId: string | undefined; let activeStatementId: string | undefined;
  const templates = new Map<string, TemplateDefinitionNode>(); const mockSet = new Set(mockedTemplateNames); let sequence = 0;
  for (const file of parsedFiles.values()) for (const template of file.templates) templates.set(template.name, template);
  const addNode = (node: SourceGraphNode) => {
    const contextual = { ...node, loopId: node.loopId ?? activeLoopId, statementId: node.statementId ?? activeStatementId };
    if (!knownNodes.has(node.id)) { knownNodes.add(node.id); nodes.push(contextual); }
    return node.id;
  };
  const addEdge = (source: string, target: string, kind: SourceGraphEdge['kind'], operandIndex?: number, operator?: SourceGraphEdge['operator'], label?: string) => edges.push({ id: `source-edge:${sequence++}`, source, target, kind, operandIndex, operator, label });

  const visitInstance = (definition: TemplateDefinitionNode, instancePath: string, initialEnv: CompileEnv, mocked = false) => {
    const env = { ...initialEnv };
    const at = (line: number) => ({ file: definition.sourceFile, startLine: line, endLine: line });
    const groupId = addNode({ id: `component:${instancePath}`, kind: 'component-group', label: `${instancePath} : ${definition.name}`, templateName: definition.name, componentPath: instancePath, mocked, childNodeIds: [], sourceSpan: at(definition.line) });
    const referenceNodes = new Map<string, string>();
    const componentReferenceNames = new Set<string>();
    const componentNodeIds = new Map<string, string>();
    const postLoopVariableNodes = new Map<string, string>();
    const variableDefinitions = new Map<string, VariableDefinition>();

    const addToRootGroup = (id: string) => {
      const group = nodes.find((node) => node.id === groupId);
      if (group?.childNodeIds && !group.childNodeIds.includes(id)) group.childNodeIds.push(id);
    };
    const registerSignal = (baseName: string, displayName: string, role: SourceGraphNode['role'], arrayDimensions: string[] = [], ownerGroupId = groupId) => {
      const qualifiedName = `${instancePath}.${displayName}`;
      const baseQualifiedName = `${instancePath}.${baseName}`;
      const id = `signal:${qualifiedName}`;
      addNode({ id, kind: 'signal', label: qualifiedName, qualifiedName, localName: displayName, role, templateName: definition.name, componentPath: instancePath, arrayDimensions: arrayDimensions.length ? arrayDimensions : undefined, arrayBaseQualifiedName: arrayDimensions.length ? baseQualifiedName : undefined, sourceSpan: at(definition.line) });
      referenceNodes.set(withoutIndexes(baseName), id);
      addToRootGroup(id);
      const owner = nodes.find((node) => node.id === ownerGroupId);
      if (owner?.childNodeIds && !owner.childNodeIds.includes(id)) owner.childNodeIds.push(id);
      return id;
    };
    const registerVariable = (variable: Pick<VariableNode, 'name' | 'line' | 'initialValue' | 'arraySizes'>, localEnv: CompileEnv, loopVariable = false) => {
      const value = variable.initialValue ? evaluate(variable.initialValue, localEnv) : undefined;
      variableDefinitions.set(variable.name, {
        name: variable.name,
        line: variable.line,
        initialExpression: variable.initialValue,
        initialValue: value,
        arrayDimensions: dimensions(variable.arraySizes),
        loopVariable,
      });
      if (value !== undefined) localEnv[variable.name] = value;
    };
    const ensureVariable = (definitionEntry: VariableDefinition) => {
      const displayName = withDimensions(definitionEntry.name, definitionEntry.arrayDimensions);
      const id = `variable:${instancePath}:${definitionEntry.line}:${definitionEntry.name}`;
      const initialExpression = definitionEntry.initialExpression ? printExpression(definitionEntry.initialExpression) : undefined;
      addNode({
        id,
        kind: 'variable',
        label: displayName,
        localName: displayName,
        componentPath: instancePath,
        arrayDimensions: definitionEntry.arrayDimensions.length ? definitionEntry.arrayDimensions : undefined,
        initialExpression,
        initialValue: definitionEntry.initialValue,
        loopVariable: definitionEntry.loopVariable,
        sourceSpan: at(definitionEntry.line),
      });
      addToRootGroup(id);
      return id;
    };

    for (const signal of definition.signals) {
      const role = mocked ? signal.kind === 'input' ? 'mock-input' : signal.kind === 'output' ? 'mock-output' : signal.kind : signal.kind;
      const signalDimensions = dimensions(signal.arraySizes);
      registerSignal(signal.name, withDimensions(signal.name, signalDimensions), role, signalDimensions);
    }
    for (const variable of definition.variables) registerVariable(variable, env);

    const componentDeclarations = new Map(definition.components.map((component) => [component.name, component]));
    for (const component of collectDirectComponents(definition)) {
      const child = templates.get(component.templateName); if (!child) continue;
      const declaration = componentDeclarations.get(component.name);
      const componentDimensions = component.isArray && declaration && 'arraySizes' in declaration ? dimensions(declaration.arraySizes) : [];
      const componentDisplayName = withDimensions(component.name, componentDimensions);
      const childPath = `${instancePath}.${componentDisplayName}`;
      componentReferenceNames.add(component.name);
      const childGroupId = addNode({
        id: `component:${childPath}`,
        kind: 'component-group',
        label: child.name,
        localName: componentDisplayName,
        templateName: child.name,
        componentPath: childPath,
        arrayDimensions: componentDimensions.length ? componentDimensions : undefined,
        mocked: mockSet.has(component.templateName),
        childNodeIds: [],
        sourceSpan: at(component.line ?? definition.line),
      });
      componentNodeIds.set(component.name, childGroupId);
      const childEnv: CompileEnv = {};
      child.parameters.forEach((parameter, index) => { const value = component.arguments[index] ? evaluate(component.arguments[index], env) : undefined; if (value !== undefined) childEnv[parameter.name] = value; });
      for (const signal of child.signals.filter((candidate) => candidate.kind === 'input' || candidate.kind === 'output')) {
        const portDimensions = dimensions(signal.arraySizes);
        const baseName = `${component.name}.${signal.name}`;
        const displayName = `${componentDisplayName}.${withDimensions(signal.name, portDimensions)}`;
        const signalId = registerSignal(baseName, displayName, 'intermediate', [...componentDimensions, ...portDimensions], childGroupId);
        if (signal.kind === 'input') addEdge(signalId, childGroupId, 'component-input');
        else addEdge(childGroupId, signalId, 'component-output');
      }
    }

    const ensureReference = (expr: Extract<ExpressionNode, { type: 'Identifier' | 'ArrayAccess' | 'MemberAccess' }>) => {
      const rawName = printExpression(expr);
      const baseName = withoutIndexes(rawName);
      if (!baseName.includes('.') && variableDefinitions.has(baseName)) return postLoopVariableNodes.get(baseName) ?? ensureVariable(variableDefinitions.get(baseName)!);
      const registered = referenceNodes.get(baseName);
      if (registered) return registered;
      return registerSignal(baseName, rawName, 'intermediate');
    };
    const collectReferences = (expr: ExpressionNode): string[] => {
      if (expr.type === 'Identifier' || expr.type === 'ArrayAccess' || expr.type === 'MemberAccess') return [ensureReference(expr)];
      if (expr.type === 'Literal') return [];
      if (expr.type === 'BinaryOp') return [...collectReferences(expr.left), ...collectReferences(expr.right)];
      if (expr.type === 'UnaryOp') return collectReferences(expr.operand);
      if (expr.type === 'Ternary') return [...collectReferences(expr.condition), ...collectReferences(expr.thenExpr), ...collectReferences(expr.elseExpr)];
      if (expr.type === 'FunctionCall') return expr.arguments.flatMap(collectReferences);
      if (expr.type === 'ComponentCall') return [...expr.templateArgs, ...expr.callArgs].flatMap(collectReferences);
      if (expr.type === 'ArrayLiteral' || expr.type === 'Tuple') return expr.elements.flatMap(collectReferences);
      return [];
    };
    const lowerTernary = (expr: Extract<ExpressionNode, { type: 'Ternary' }>) => {
      const conditionId = addNode({ id: `ternary-condition:${instancePath}:${expr.line}:${sequence++}`, kind: 'ternary-condition', label: printExpression(expr.condition), operation: 'ternary-condition', componentPath: instancePath, sourceSpan: at(expr.line) });
      for (const reference of new Set(collectReferences(expr.condition))) addEdge(reference, conditionId, 'data');
      const thenId = addNode({ id: `ternary-result:${instancePath}:${expr.line}:then:${sequence++}`, kind: 'ternary-result', label: printExpression(expr.thenExpr), operation: 'ternary-result', componentPath: instancePath, sourceSpan: at(expr.line) });
      const elseId = addNode({ id: `ternary-result:${instancePath}:${expr.line}:else:${sequence++}`, kind: 'ternary-result', label: printExpression(expr.elseExpr), operation: 'ternary-result', componentPath: instancePath, sourceSpan: at(expr.line) });
      addEdge(conditionId, thenId, 'control-dependency', undefined, undefined, 'Yes'); addEdge(conditionId, elseId, 'control-dependency', undefined, undefined, 'No');
      return { conditionId, thenId, elseId };
    };
    const lower = (expr: ExpressionNode): string => {
      if (expr.type === 'Identifier' || expr.type === 'ArrayAccess' || expr.type === 'MemberAccess') return ensureReference(expr);
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
    const statementKind = (statement: Extract<StatementNode, { type: 'Assignment' }>): SourceStatementDto['kind'] => {
      if (statement.operator === '=' && statement.right.type === 'FunctionCall' && componentReferenceNames.has(withoutIndexes(printExpression(statement.left)))) return 'component';
      if (statement.operator === '=') return 'state-update';
      if (statement.operator === '<--' || statement.operator === '-->') return 'witness';
      if (statement.operator === '<==' || statement.operator === '==>' || statement.operator === '===') return 'constraint';
      return 'other';
    };
    const assignedLoopVariables = (body: StatementNode[]) => {
      const names = new Set<string>();
      const scan = (items: StatementNode[]) => items.forEach((item) => {
        if (item.type === 'Assignment' && item.operator === '=' && item.left.type === 'Identifier' && variableDefinitions.has(item.left.name)) names.add(item.left.name);
        else if (item.type === 'BlockStatement') scan(item.body);
        else if (item.type === 'IfStatement') { scan(item.thenBranch); scan(item.elseBranch ?? []); }
      });
      scan(body); return [...names];
    };
    const orderByLoop = new Map<string, number>();
    const visitStatements = (items: StatementNode[], localEnv: CompileEnv) => {
      for (const statement of items) {
        if (statement.type === 'Variable') { registerVariable(statement, localEnv); continue; }
        if (statement.type === 'BlockStatement') { visitStatements(statement.body, { ...localEnv }); continue; }
        if (statement.type === 'IfStatement') {
          const value = evaluate(statement.condition, localEnv);
          if (value !== undefined) visitStatements(value ? statement.thenBranch : (statement.elseBranch ?? []), { ...localEnv });
          continue;
        }
        if (statement.type === 'ForLoop') {
          const parentLoopId = activeLoopId;
          const loopId = `loop:${instancePath}:${statement.line}:${sequence++}`;
          const count = loopIterationCount(statement, localEnv);
          const header = `for (${statement.variable} = ${printExpression(statement.start)}; ${printExpression(statement.end)}; ${statement.step ? printExpression(statement.step) : `${statement.variable}++`})`;
          const loop: SourceLoopDto = { id: loopId, header, iterator: statement.variable, iterationLabel: count === undefined ? 'symbolic' : `× ${count}`, iterationCount: count, parentLoopId, bodyStatementIds: [], stateVariables: [], sourceSpan: at(statement.line) };
          loops.push(loop); orderByLoop.set(loopId, 0);
          const previousLoopId = activeLoopId; const previousStatementId = activeStatementId;
          activeLoopId = loopId; activeStatementId = undefined;
          const start = evaluate(statement.start, localEnv);
          registerVariable({ name: statement.variable, line: statement.line, initialValue: statement.start }, localEnv, true);
          for (const name of assignedLoopVariables(statement.body)) {
            const variable = variableDefinitions.get(name)!;
            activeLoopId = undefined;
            const initialNodeId = ensureVariable(variable);
            activeLoopId = loopId;
            const currentNodeId = addNode({ id: `variable-state:${loopId}:${name}:current`, kind: 'variable', label: `${name}ᵢ`, localName: `${name}ᵢ`, componentPath: instancePath, loopId, stateVariable: name, statePhase: 'current', initialExpression: variable.initialExpression ? printExpression(variable.initialExpression) : undefined, initialValue: variable.initialValue, sourceSpan: at(statement.line) });
            const nextNodeId = addNode({ id: `variable-state:${loopId}:${name}:next`, kind: 'variable', label: `${name}ᵢ₊₁`, localName: `${name}ᵢ₊₁`, componentPath: instancePath, loopId, stateVariable: name, statePhase: 'next', sourceSpan: at(statement.line) });
            const finalNodeId = addNode({ id: `variable-state:${loopId}:${name}:final`, kind: 'variable', label: `${name}ₙ`, localName: `${name}ₙ`, componentPath: instancePath, loopId, stateVariable: name, statePhase: 'final', sourceSpan: at(statement.line) });
            addEdge(initialNodeId, currentNodeId, 'loop-carried', undefined, undefined, 'initial');
            addEdge(nextNodeId, finalNodeId, 'loop-carried', undefined, undefined, 'after loop');
            loop.stateVariables.push({ variableName: name, initialNodeId, currentNodeId, nextNodeId, finalNodeId });
            postLoopVariableNodes.set(name, finalNodeId);
          }
          visitStatements(statement.body, { ...localEnv, ...(start !== undefined ? { [statement.variable]: start } : {}) });
          for (const state of loop.stateVariables) {
            for (const edge of edges) {
              const targetNode = nodes.find((node) => node.id === edge.target);
              const sourceNode = nodes.find((node) => node.id === edge.source);
              if (edge.source === state.initialNodeId && targetNode?.loopId === loopId && edge.kind !== 'loop-carried') edge.source = state.currentNodeId;
              if (edge.target === state.initialNodeId && sourceNode?.loopId === loopId && sourceNode.kind === 'assignment' && sourceNode.operator === '=') edge.target = state.nextNodeId;
            }
            const update = statements.find((candidate) => candidate.loopId === loopId && candidate.kind === 'state-update' && candidate.label.startsWith(`${state.variableName} `));
            if (update) {
              if (!update.nodeIds.includes(state.currentNodeId)) update.nodeIds.unshift(state.currentNodeId);
              if (!update.nodeIds.includes(state.nextNodeId)) update.nodeIds.push(state.nextNodeId);
            }
          }
          loop.bodyStatementIds = statements.filter((candidate) => candidate.loopId === loopId).map((candidate) => candidate.id);
          activeLoopId = previousLoopId; activeStatementId = previousStatementId;
          continue;
        }
        if (statement.type !== 'Assignment' || !['<==', '==>', '<--', '-->', '===', '='].includes(statement.operator)) continue;
        let statementMeta: SourceStatementDto | undefined;
        if (activeLoopId) {
          const order = orderByLoop.get(activeLoopId) ?? 0; orderByLoop.set(activeLoopId, order + 1);
          statementMeta = { id: `statement:${activeLoopId}:${order}`, loopId: activeLoopId, order, kind: statementKind(statement), label: `${printExpression(statement.left)} ${statement.operator} ${printExpression(statement.right)}`, nodeIds: [], sourceSpan: at(statement.line) };
          statements.push(statementMeta); activeStatementId = statementMeta.id;
        }
        if (statement.operator === '=' && statement.right.type === 'FunctionCall' && componentReferenceNames.has(withoutIndexes(printExpression(statement.left)))) {
          const componentId = componentNodeIds.get(withoutIndexes(printExpression(statement.left)));
          if (componentId && statementMeta) statementMeta.nodeIds.push(componentId);
          activeStatementId = undefined; continue;
        }
        const left = lower(statement.left);
        const ternary = statement.operator !== '===' && statement.right.type === 'Ternary' ? lowerTernary(statement.right) : undefined;
        const right = ternary ? undefined : lower(statement.right);
        if (statement.operator === '===') {
          const id = addNode({ id: `source-constraint:${instancePath}:${statement.line}:${sequence++}`, kind: 'source-constraint', label: '===', operator: '===', generatesConstraint: true, sourceSpan: at(statement.line) });
          addEdge(left, id, 'constraint-relation', undefined, '==='); addEdge(right!, id, 'constraint-relation', undefined, '===');
        } else {
          const operator = statement.operator as SourceGraphEdge['operator']; const constrained = operator === '<==' || operator === '==>'; const witness = operator !== '=';
          const id = addNode({ id: `assignment:${instancePath}:${statement.line}:${sequence++}`, kind: 'assignment', label: operator!, operator, generatesWitness: witness, generatesConstraint: constrained, dangerLevel: witness ? constrained ? 'safe' : 'review' : undefined, sourceSpan: at(statement.line) });
          const reverse = operator === '==>' || operator === '-->'; const sources = ternary ? [ternary.thenId, ternary.elseId] : [reverse ? left : right!];
          for (const source of sources) addEdge(source, id, 'data', undefined, operator); addEdge(id, reverse ? right! : left, 'assignment', undefined, operator);
        }
        if (statementMeta) statementMeta.nodeIds = nodes.filter((node) => node.statementId === statementMeta!.id).map((node) => node.id);
        activeStatementId = undefined;
      }
    };
    visitStatements(definition.statements, env);
  };

  visitInstance(rootTemplate, 'main', Object.fromEntries(params.map((param) => [param.name, param.value])));
  const adjacency: Record<string, string[]> = {};
  for (const edge of edges) { (adjacency[edge.source] ??= []).push(edge.target); (adjacency[edge.target] ??= []).push(edge.source); }
  return { nodes, edges, adjacency, loops, statements };
}
