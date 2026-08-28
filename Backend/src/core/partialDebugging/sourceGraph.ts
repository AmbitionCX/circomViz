import type { ExpressionNode, ForLoopNode, ParsedFile, StatementNode, TemplateDefinitionNode, VariableNode } from '../parser/ast.js';
import { collectDirectComponents } from '../parser/componentCollector.js';
import type { SourceBranchCoverageDto, SourceConditionalDto, SourceGraphDto, SourceGraphEdge, SourceGraphNode, SourceLoopDto, SourceStatementDto } from '../../types/partialDebugging.js';

type CompileEnv = Record<string, number>;
type ArraySize = number | ExpressionNode;

const binaryPrecedence: Record<string, number> = {
  '||': 2,
  '&&': 3,
  '==': 4,
  '!=': 4,
  '<': 5,
  '<=': 5,
  '>': 5,
  '>=': 5,
  '|': 6,
  '^': 7,
  '&': 8,
  '<<': 9,
  '>>': 9,
  '+': 10,
  '-': 10,
  '*': 11,
  '/': 11,
  '%': 11,
  '\\': 11,
  '**': 12,
};

function expressionPrecedence(expr: ExpressionNode) {
  if (expr.type === 'Ternary') return 1;
  if (expr.type === 'BinaryOp') return binaryPrecedence[expr.operator] ?? 1;
  if (expr.type === 'UnaryOp') return 13;
  if (expr.type === 'ArrayAccess' || expr.type === 'MemberAccess' || expr.type === 'FunctionCall' || expr.type === 'ComponentCall') return 14;
  return 15;
}

function printExpression(expr: ExpressionNode, parentPrecedence = 0, rightChild = false): string {
  const precedence = expressionPrecedence(expr);
  let printed: string;
  switch (expr.type) {
    case 'Literal': printed = String(expr.value); break;
    case 'Identifier': printed = expr.name; break;
    case 'ArrayAccess': printed = `${printExpression(expr.array, precedence)}[${printExpression(expr.index)}]`; break;
    case 'MemberAccess': printed = `${printExpression(expr.object, precedence)}.${expr.property}`; break;
    case 'BinaryOp': {
      const printOperand = (operand: ExpressionNode, right: boolean) => {
        const value = printExpression(operand, precedence, right);
        const readabilityGroup = ['&', '|', '^'].includes(expr.operator)
          && operand.type === 'BinaryOp'
          && ['<<', '>>'].includes(operand.operator);
        return readabilityGroup ? `(${value})` : value;
      };
      printed = `${printOperand(expr.left, false)} ${expr.operator} ${printOperand(expr.right, true)}`;
      break;
    }
    case 'UnaryOp': printed = expr.isPostfix ? `${printExpression(expr.operand, precedence)}${expr.operator}` : `${expr.operator}${printExpression(expr.operand, precedence)}`; break;
    case 'Ternary': printed = `${printExpression(expr.condition, precedence)} ? ${printExpression(expr.thenExpr)} : ${printExpression(expr.elseExpr, precedence, true)}`; break;
    case 'FunctionCall': printed = `${expr.function}(${expr.arguments.map((argument) => printExpression(argument)).join(', ')})`; break;
    case 'ComponentCall': printed = `${expr.template}(${expr.templateArgs.map((argument) => printExpression(argument)).join(', ')})(${expr.callArgs.map((argument) => printExpression(argument)).join(', ')})`; break;
    case 'ArrayLiteral': printed = `[${expr.elements.map((element) => printExpression(element)).join(', ')}]`; break;
    case 'Tuple': printed = `(${expr.elements.map((element) => printExpression(element)).join(', ')})`; break;
  }
  const needsParentheses = precedence < parentPrecedence
    || (rightChild && expr.type === 'BinaryOp' && precedence === parentPrecedence);
  return needsParentheses ? `(${printed})` : printed;
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

const LOOP_DOMAIN_LIMIT = 10_000;
const COVERAGE_VALUE_LIMIT = 32;

function loopIterationValues(loop: ForLoopNode, env: CompileEnv): number[] | undefined {
  const start = evaluate(loop.start, env); const step = loopStep(loop, env); const count = loopIterationCount(loop, env);
  if (start === undefined || step === undefined || count === undefined || count > LOOP_DOMAIN_LIMIT) return undefined;
  return Array.from({ length: count }, (_, index) => start + index * step);
}

const dimensions = (sizes?: ArraySize[]) => sizes?.map((size) => typeof size === 'number' ? String(size) : printExpression(size)) ?? [];
const resolvedDimensions = (sizes: ArraySize[] | undefined, env: CompileEnv) => sizes?.map((size) => {
  if (typeof size === 'number') return String(size);
  return String(evaluate(size, env) ?? printExpression(size));
}) ?? [];
const withDimensions = (name: string, values: string[]) => `${name}${values.map((value) => `[${value}]`).join('')}`;
const withoutIndexes = (name: string) => name.replace(/\[[^\]]*\]/g, '');
const accessLabel = (expr: ExpressionNode) => {
  const indexes = printExpression(expr).match(/\[[^\]]*\]/g);
  return indexes?.join('');
};

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
  const loops: SourceLoopDto[] = []; const statements: SourceStatementDto[] = []; const conditionals: SourceConditionalDto[] = [];
  type ConditionalBranch = 'then' | 'else';
  type ActiveConditional = { id: string; branch: ConditionalBranch };
  let activeLoopId: string | undefined; let activeLoopIterator: string | undefined;
  let activeIterationEnvs: CompileEnv[] | undefined; let activeLoopDomainKnown = true;
  let activeConditional: ActiveConditional | undefined; let activeStatementId: string | undefined;
  let activeCompileActivity: SourceGraphNode['compileActivity'] = 'active';
  const templates = new Map<string, TemplateDefinitionNode>(); const mockSet = new Set(mockedTemplateNames); let sequence = 0;
  for (const file of parsedFiles.values()) for (const template of file.templates) templates.set(template.name, template);
  const addNode = (node: SourceGraphNode) => {
    const contextual = {
      ...node,
      loopId: node.loopId ?? activeLoopId,
      statementId: node.statementId ?? activeStatementId,
      conditionalId: node.conditionalId ?? activeConditional?.id,
      conditionalBranch: node.conditionalBranch ?? activeConditional?.branch,
      compileActivity: node.compileActivity ?? activeCompileActivity,
    };
    if (!knownNodes.has(node.id)) { knownNodes.add(node.id); nodes.push(contextual); }
    return node.id;
  };
  const addEdge = (source: string, target: string, kind: SourceGraphEdge['kind'], operandIndex?: number, operator?: SourceGraphEdge['operator'], label?: string, accessExpression?: string) => edges.push({ id: `source-edge:${sequence++}`, source, target, kind, operandIndex, operator, label, accessExpression });

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
    const registerSignal = (
      baseName: string,
      displayName: string,
      role: SourceGraphNode['role'],
      arrayDimensions: string[] = [],
      ownerGroupId = groupId,
      declaredArrayDimensions: string[] = arrayDimensions,
    ) => {
      const qualifiedName = `${instancePath}.${displayName}`;
      const baseQualifiedName = `${instancePath}.${baseName}`;
      const id = `signal:${qualifiedName}`;
      addNode({ id, kind: 'signal', label: qualifiedName, qualifiedName, localName: displayName, role, templateName: definition.name, componentPath: instancePath, arrayDimensions: arrayDimensions.length ? arrayDimensions : undefined, declaredArrayDimensions: declaredArrayDimensions.length ? declaredArrayDimensions : undefined, arrayBaseQualifiedName: arrayDimensions.length ? baseQualifiedName : undefined, sourceSpan: at(definition.line) });
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
        const declaredPortDimensions = dimensions(signal.arraySizes);
        const portDimensions = resolvedDimensions(signal.arraySizes, childEnv);
        const baseName = `${component.name}.${signal.name}`;
        const displayName = `${componentDisplayName}.${withDimensions(signal.name, portDimensions)}`;
        const signalId = registerSignal(
          baseName,
          displayName,
          'intermediate',
          [...componentDimensions, ...portDimensions],
          childGroupId,
          [...componentDimensions, ...declaredPortDimensions],
        );
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
      children.forEach((child, index) => {
        const access = accessLabel(child);
        addEdge(lower(child), id, 'data', index, undefined, access, access ? printExpression(child) : undefined);
      }); return id;
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
    const orderByControlScope = new Map<string, number>();
    const controlScopeKey = () => activeConditional
      ? `conditional:${activeConditional.id}:${activeConditional.branch}`
      : activeLoopId ? `loop:${activeLoopId}` : `root:${instancePath}`;
    const nextControlOrder = () => {
      const key = controlScopeKey();
      const order = orderByControlScope.get(key) ?? 0;
      orderByControlScope.set(key, order + 1);
      return order;
    };
    const coverage = (
      status: SourceBranchCoverageDto['status'],
      matchingEnvs: CompileEnv[] | undefined,
      totalIterations: number | undefined,
    ): SourceBranchCoverageDto => {
      const iteratorValues = matchingEnvs && activeLoopIterator
        ? [...new Set(matchingEnvs.map((candidate) => candidate[activeLoopIterator!]).filter((value): value is number => value !== undefined))]
        : undefined;
      return {
        status,
        iterationCount: matchingEnvs?.length,
        totalIterations,
        iterator: iteratorValues ? activeLoopIterator : undefined,
        iteratorValues: iteratorValues?.slice(0, COVERAGE_VALUE_LIMIT),
        valuesTruncated: iteratorValues ? iteratorValues.length > COVERAGE_VALUE_LIMIT : undefined,
      };
    };
    const visitStatements = (items: StatementNode[], localEnv: CompileEnv) => {
      for (const statement of items) {
        if (statement.type === 'Variable') { registerVariable(statement, localEnv); continue; }
        if (statement.type === 'BlockStatement') { visitStatements(statement.body, { ...localEnv }); continue; }
        if (statement.type === 'IfStatement') {
          const conditionalId = `conditional:${instancePath}:${statement.line}:${sequence++}`;
          const order = nextControlOrder();
          const parentConditional = activeConditional;
          const candidateEnvs = activeCompileActivity === 'inactive'
            ? []
            : activeCompileActivity === 'unknown'
              ? undefined
              : activeLoopId
                ? activeLoopDomainKnown ? activeIterationEnvs ?? [] : undefined
                : [localEnv];
          const evaluated = candidateEnvs?.map((candidate) => ({ env: candidate, value: evaluate(statement.condition, candidate) }));
          const coverageKnown = Boolean(evaluated) && evaluated!.every((entry) => entry.value !== undefined);
          const thenEnvs = coverageKnown ? evaluated!.filter((entry) => Boolean(entry.value)).map((entry) => entry.env) : undefined;
          const elseEnvs = coverageKnown ? evaluated!.filter((entry) => !entry.value).map((entry) => entry.env) : undefined;
          const totalIterations = coverageKnown ? evaluated!.length : undefined;
          const thenCoverage = coverage(coverageKnown ? thenEnvs!.length ? 'active' : 'inactive' : 'unknown', thenEnvs, totalIterations);
          const elseCoverage = coverage(coverageKnown ? elseEnvs!.length ? 'active' : 'inactive' : 'unknown', elseEnvs, totalIterations);
          const conditional: SourceConditionalDto = {
            id: conditionalId,
            condition: printExpression(statement.condition),
            order,
            parentLoopId: activeLoopId,
            parentConditionalId: parentConditional?.id,
            parentBranch: parentConditional?.branch,
            hasElse: Boolean(statement.elseBranch),
            thenStatementIds: [],
            elseStatementIds: [],
            thenCoverage,
            elseCoverage,
            sourceSpan: at(statement.line),
          };
          conditionals.push(conditional);

          const previousConditional = activeConditional;
          const previousIterationEnvs = activeIterationEnvs;
          const previousDomainKnown = activeLoopDomainKnown;
          const previousActivity = activeCompileActivity;
          const visitBranch = (branch: ConditionalBranch, branchItems: StatementNode[], branchCoverage: SourceBranchCoverageDto, branchEnvs: CompileEnv[] | undefined) => {
            activeConditional = { id: conditionalId, branch };
            activeIterationEnvs = branchEnvs;
            activeLoopDomainKnown = branchCoverage.status !== 'unknown';
            activeCompileActivity = branchCoverage.status;
            visitStatements(branchItems, { ...localEnv });
          };
          visitBranch('then', statement.thenBranch, thenCoverage, thenEnvs);
          visitBranch('else', statement.elseBranch ?? [], elseCoverage, elseEnvs);
          activeConditional = previousConditional;
          activeIterationEnvs = previousIterationEnvs;
          activeLoopDomainKnown = previousDomainKnown;
          activeCompileActivity = previousActivity;
          conditional.thenStatementIds = statements.filter((candidate) => candidate.conditionalId === conditionalId && candidate.conditionalBranch === 'then').map((candidate) => candidate.id);
          conditional.elseStatementIds = statements.filter((candidate) => candidate.conditionalId === conditionalId && candidate.conditionalBranch === 'else').map((candidate) => candidate.id);
          continue;
        }
        if (statement.type === 'ForLoop') {
          const parentLoopId = activeLoopId;
          const loopId = `loop:${instancePath}:${statement.line}:${sequence++}`;
          const count = loopIterationCount(statement, localEnv);
          const header = `for (${statement.variable} = ${printExpression(statement.start)}; ${printExpression(statement.end)}; ${statement.step ? printExpression(statement.step) : `${statement.variable}++`})`;
          const loop: SourceLoopDto = { id: loopId, header, iterator: statement.variable, iterationLabel: count === undefined ? 'symbolic' : `× ${count}`, iterationCount: count, parentLoopId, bodyStatementIds: [], stateVariables: [], sourceSpan: at(statement.line) };
          loops.push(loop); orderByControlScope.set(`loop:${loopId}`, 0);
          const previousLoopId = activeLoopId; const previousStatementId = activeStatementId;
          const previousLoopIterator = activeLoopIterator;
          const previousIterationEnvs = activeIterationEnvs;
          const previousDomainKnown = activeLoopDomainKnown;
          activeLoopId = loopId; activeStatementId = undefined;
          activeLoopIterator = statement.variable;
          const start = evaluate(statement.start, localEnv);
          const parentEnvs = previousLoopId
            ? previousDomainKnown ? previousIterationEnvs ?? [] : undefined
            : [localEnv];
          let loopEnvs: CompileEnv[] | undefined = parentEnvs ? [] : undefined;
          if (parentEnvs && loopEnvs) {
            for (const parentEnv of parentEnvs) {
              const values = loopIterationValues(statement, parentEnv);
              if (!values || loopEnvs.length + values.length > LOOP_DOMAIN_LIMIT) { loopEnvs = undefined; break; }
              values.forEach((value) => loopEnvs!.push({ ...parentEnv, [statement.variable]: value }));
            }
          }
          activeIterationEnvs = loopEnvs;
          activeLoopDomainKnown = Boolean(loopEnvs);
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
          activeLoopIterator = previousLoopIterator;
          activeIterationEnvs = previousIterationEnvs;
          activeLoopDomainKnown = previousDomainKnown;
          continue;
        }
        if (statement.type !== 'Assignment' || !['<==', '==>', '<--', '-->', '===', '='].includes(statement.operator)) continue;
        let statementMeta: SourceStatementDto | undefined;
        if (activeLoopId || activeConditional) {
          const order = nextControlOrder();
          const scopeId = activeConditional ? `${activeConditional.id}:${activeConditional.branch}` : activeLoopId!;
          statementMeta = {
            id: `statement:${scopeId}:${order}`,
            loopId: activeLoopId,
            order,
            kind: statementKind(statement),
            label: `${printExpression(statement.left)} ${statement.operator} ${printExpression(statement.right)}`,
            nodeIds: [],
            conditionalId: activeConditional?.id,
            conditionalBranch: activeConditional?.branch,
            compileActivity: activeCompileActivity,
            sourceSpan: at(statement.line),
          };
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
          const id = addNode({
            id: `source-constraint:${instancePath}:${statement.line}:${sequence++}`,
            kind: 'source-constraint',
            label: '===',
            operator: '===',
            leftExpression: printExpression(statement.left),
            rightExpression: printExpression(statement.right),
            generatesConstraint: true,
            sourceSpan: at(statement.line),
          });
          addEdge(left, id, 'constraint-relation', undefined, '==='); addEdge(right!, id, 'constraint-relation', undefined, '===');
        } else {
          const operator = statement.operator as SourceGraphEdge['operator']; const constrained = operator === '<==' || operator === '==>'; const witness = operator !== '=';
          const id = addNode({
            id: `assignment:${instancePath}:${statement.line}:${sequence++}`,
            kind: 'assignment',
            label: operator!,
            operator,
            leftExpression: printExpression(statement.left),
            rightExpression: printExpression(statement.right),
            generatesWitness: witness,
            generatesConstraint: constrained,
            dangerLevel: witness ? constrained ? 'safe' : 'review' : undefined,
            sourceSpan: at(statement.line),
          });
          const reverse = operator === '==>' || operator === '-->'; const sources = ternary ? [ternary.thenId, ternary.elseId] : [reverse ? left : right!];
          for (const source of sources) addEdge(source, id, 'data', undefined, operator); addEdge(id, reverse ? right! : left, 'assignment', undefined, operator);
        }
        if (statementMeta) statementMeta.nodeIds = nodes.filter((node) => node.statementId === statementMeta!.id).map((node) => node.id);
        activeStatementId = undefined;
      }
    };
    const inlineSignalAssignments: StatementNode[] = definition.signals
      .filter((signal) => signal.initialValue)
      .map((signal) => ({
        type: 'Assignment' as const,
        left: { type: 'Identifier' as const, name: signal.name, line: signal.line },
        operator: signal.initialOperator ?? '<==',
        right: signal.initialValue!,
        line: signal.line,
      }));
    visitStatements(
      [...definition.statements, ...inlineSignalAssignments]
        .sort((left, right) => left.line - right.line),
      env,
    );
  };

  visitInstance(rootTemplate, 'main', Object.fromEntries(params.map((param) => [param.name, param.value])));
  const adjacency: Record<string, string[]> = {};
  for (const edge of edges) { (adjacency[edge.source] ??= []).push(edge.target); (adjacency[edge.target] ??= []).push(edge.source); }
  return { nodes, edges, adjacency, loops, statements, conditionals };
}
