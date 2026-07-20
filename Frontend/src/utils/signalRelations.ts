import type { TreeNodeData } from '@/utils/templateTree';

export type SignalKey = string;
export type SignalRelationGraph = Map<SignalKey, Set<SignalKey>>;

type AstNode = {
  type?: string;
  [key: string]: unknown;
};

interface NodeSignalContext {
  node: TreeNodeData;
  localSignals: Set<string>;
  childByInstanceName: Map<string, TreeNodeData>;
  childSignals: Map<string, Set<string>>;
}

export function makeSignalKey(nodeId: string, signalName: string): SignalKey {
  return `${nodeId}::${signalName}`;
}

function isAstNode(value: unknown): value is AstNode {
  return typeof value === 'object' && value !== null;
}

function declaredSignalNames(node: TreeNodeData): Set<string> {
  return new Set(
    (node.templateInfo?.signals ?? [])
      .map(signal => signal.name)
  );
}

function unwrapArrayAccess(expression: unknown): AstNode | null {
  if (!isAstNode(expression)) return null;
  if (expression.type === 'ArrayAccess') {
    return unwrapArrayAccess(expression.array);
  }
  return expression;
}

function componentInstanceName(expression: unknown): string | null {
  const base = unwrapArrayAccess(expression);
  if (base?.type !== 'Identifier' || typeof base.name !== 'string') return null;
  return base.name;
}

function resolveDirectSignal(expression: unknown, context: NodeSignalContext): SignalKey | null {
  const base = unwrapArrayAccess(expression);
  if (!base) return null;

  if (base.type === 'Identifier' && typeof base.name === 'string') {
    return context.localSignals.has(base.name)
      ? makeSignalKey(context.node.id, base.name)
      : null;
  }

  if (base.type !== 'MemberAccess' || typeof base.property !== 'string') return null;

  const instanceName = componentInstanceName(base.object);
  if (!instanceName) return null;

  const child = context.childByInstanceName.get(instanceName);
  if (!child || !context.childSignals.get(child.id)?.has(base.property)) return null;

  return makeSignalKey(child.id, base.property);
}

function collectSignalReferences(expression: unknown, context: NodeSignalContext): Set<SignalKey> {
  const references = new Set<SignalKey>();

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isAstNode(value)) return;

    const resolved = resolveDirectSignal(value, context);
    if (resolved) {
      references.add(resolved);
      return;
    }

    switch (value.type) {
      case 'BinaryOp':
        visit(value.left);
        visit(value.right);
        break;
      case 'UnaryOp':
        visit(value.operand);
        break;
      case 'FunctionCall':
        visit(value.arguments);
        break;
      case 'ComponentCall':
        visit(value.templateArgs);
        visit(value.callArgs);
        break;
      case 'Ternary':
        visit(value.condition);
        visit(value.thenExpr);
        visit(value.elseExpr);
        break;
      case 'ArrayLiteral':
      case 'Tuple':
        visit(value.elements);
        break;
      default:
        break;
    }
  };

  visit(expression);
  return references;
}

function addEdge(graph: SignalRelationGraph, left: SignalKey, right: SignalKey) {
  if (left === right) return;
  graph.get(left)?.add(right);
  graph.get(right)?.add(left);
}

function connectAssignment(statement: AstNode, context: NodeSignalContext, graph: SignalRelationGraph) {
  const leftSignals = collectSignalReferences(statement.left, context);
  const rightSignals = collectSignalReferences(statement.right, context);

  for (const left of leftSignals) {
    for (const right of rightSignals) {
      addEdge(graph, left, right);
    }
  }
}

function visitStatements(value: unknown, context: NodeSignalContext, graph: SignalRelationGraph) {
  if (Array.isArray(value)) {
    value.forEach(statement => visitStatements(statement, context, graph));
    return;
  }
  if (!isAstNode(value)) return;

  if (value.type === 'Assignment') {
    connectAssignment(value, context, graph);
    return;
  }

  switch (value.type) {
    case 'BlockStatement':
      visitStatements(value.body, context, graph);
      break;
    case 'IfStatement':
      visitStatements(value.thenBranch, context, graph);
      visitStatements(value.elseBranch, context, graph);
      break;
    case 'ForLoop':
    case 'WhileLoop':
      visitStatements(value.body, context, graph);
      break;
    case 'ComponentArrayInit':
      visitStatements(value.initStatements, context, graph);
      break;
    case 'ComponentInstantiationWithInitNode':
      visitStatements(value.initBlock, context, graph);
      break;
    default:
      break;
  }
}

function flattenTree(root: TreeNodeData): TreeNodeData[] {
  const nodes: TreeNodeData[] = [];
  const visit = (node: TreeNodeData) => {
    nodes.push(node);
    node.children.forEach(visit);
  };
  visit(root);
  return nodes;
}

export function buildSignalRelationGraph(root: TreeNodeData): SignalRelationGraph {
  const graph: SignalRelationGraph = new Map();
  const nodes = flattenTree(root);
  const signalsByNode = new Map<string, Set<string>>();

  for (const node of nodes) {
    const signalNames = declaredSignalNames(node);
    signalsByNode.set(node.id, signalNames);
    for (const signalName of signalNames) {
      graph.set(makeSignalKey(node.id, signalName), new Set());
    }
  }

  for (const node of nodes) {
    if (!node.templateInfo) continue;

    const childByInstanceName = new Map<string, TreeNodeData>();
    for (const child of node.children) {
      for (const instanceName of child.instanceNames) {
        childByInstanceName.set(instanceName, child);
      }
    }

    const context: NodeSignalContext = {
      node,
      localSignals: signalsByNode.get(node.id) ?? new Set(),
      childByInstanceName,
      childSignals: signalsByNode,
    };

    visitStatements(node.templateInfo.statements, context, graph);
  }

  return graph;
}
