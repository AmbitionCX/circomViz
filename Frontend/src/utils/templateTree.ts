import type { TemplateInfo, TemplateParameter, ComponentInstance } from '../types/circuitTypes.js';

export interface PathEntry {
  instanceName: string;
  templateName: string;
}

export interface TreeNodeData {
  id: string;
  templateName: string;
  instanceName?: string;
  instanceNames: string[];
  depth: number;
  path: string[];
  pathInfo: PathEntry[];
  templateInfo: TemplateInfo | null;
  componentCount: number;
  parameters: TemplateParameter[];
  sourceFile?: string;
  isTerminal: boolean;
  isExternal: boolean;
  isRecursiveReference: boolean;
  isLeaf: boolean;
  nodeModulesLibrary?: string;
  children: TreeNodeData[];
  instanceCount?: number;
}

export function extractNodeModulesLibrary(sourceFile: string | undefined): string | undefined {
  if (!sourceFile) return undefined;
  const match = sourceFile.match(/\/node_modules\/([^/]+)/);
  return match ? match[1] : undefined;
}

function buildTemplateNode(
  template: TemplateInfo,
  currentPath: string[],
  currentPathInfo: PathEntry[],
  depth: number,
  instanceName?: string
): TreeNodeData {
  const hasComponents = template.components && template.components.length > 0;

  let componentGroups: { comp: ComponentInstance; instances: ComponentInstance[] }[] = [];
  if (hasComponents) {
    const groupMap = new Map<string, { comp: ComponentInstance; instances: ComponentInstance[] }>();
    for (const comp of template.components) {
      const existing = groupMap.get(comp.templateName);
      if (existing) {
        existing.instances.push(comp);
      } else {
        groupMap.set(comp.templateName, { comp, instances: [comp] });
      }
    }
    componentGroups = Array.from(groupMap.values());
  }

  const children: TreeNodeData[] = hasComponents
    ? componentGroups.map(({ comp, instances }) => {
        const instanceNames = instances.map(instance => instance.name);
        const count = instances.length;
        const childPath = [...currentPath, comp.name];
        const childPathInfo = [...currentPathInfo, { instanceName: comp.name, templateName: comp.templateName }];

        if (comp.isRecursiveReference) {
          return {
            id: childPath.join('.'),
            templateName: comp.templateName,
            instanceName: comp.name,
            instanceNames,
            depth: depth + 1,
            path: childPath,
            pathInfo: childPathInfo,
            templateInfo: null,
            componentCount: 0,
            parameters: [],
            sourceFile: comp.sourceFile,
            isTerminal: true,
            isExternal: false,
            isRecursiveReference: true,
            isLeaf: true,
            nodeModulesLibrary: extractNodeModulesLibrary(comp.sourceFile),
            children: [],
            instanceCount: count,
          };
        }

        if (comp.template) {
          const node = buildTemplateNode(comp.template, childPath, childPathInfo, depth + 1, comp.name);
          node.instanceNames = instanceNames;
          node.instanceCount = count;
          return node;
        }

        return {
          id: childPath.join('.'),
          templateName: comp.templateName,
          instanceName: comp.name,
          instanceNames,
          depth: depth + 1,
          path: childPath,
          pathInfo: childPathInfo,
          templateInfo: null,
          componentCount: 0,
          parameters: [],
          sourceFile: undefined,
          isTerminal: true,
          isExternal: true,
          isRecursiveReference: false,
          isLeaf: true,
          nodeModulesLibrary: undefined,
          children: [],
          instanceCount: count,
        };
      })
    : [];

  return {
    id: currentPath.join('.') || template.templateName,
    templateName: template.templateName,
    instanceName,
    instanceNames: instanceName ? [instanceName] : [],
    depth,
    path: [...currentPath],
    pathInfo: [...currentPathInfo],
    templateInfo: template,
    componentCount: template.components ? template.components.length : 0,
    parameters: template.parameters || [],
    sourceFile: template.sourceFile,
    isTerminal: !hasComponents,
    isExternal: false,
    isRecursiveReference: false,
    isLeaf: !hasComponents,
    nodeModulesLibrary: extractNodeModulesLibrary(template.sourceFile),
    children,
  };
}

export function buildD3Hierarchy(tree: TemplateInfo): TreeNodeData {
  return buildTemplateNode(tree, [], [], 0);
}

export function isNodeSelectable(node: TreeNodeData): boolean {
  return !!node.templateInfo && !node.isExternal && !node.isRecursiveReference;
}

function containsVulnerableNode(node: TreeNodeData, vulnerableNames: Set<string>): boolean {
  if (vulnerableNames.has(node.templateName)) return true;
  return node.children.some(child => containsVulnerableNode(child, vulnerableNames));
}

function isFoldableConfirmedBranch(
  node: TreeNodeData,
  confirmedNames: Set<string>,
  vulnerableNames: Set<string>,
): boolean {
  return confirmedNames.has(node.templateName)
    && !containsVulnerableNode(node, vulnerableNames);
}

export function hasFoldableConfirmedChild(
  node: TreeNodeData,
  confirmedNames: Set<string>,
  vulnerableNames: Set<string>,
): boolean {
  return node.children.some(child =>
    isFoldableConfirmedBranch(child, confirmedNames, vulnerableNames)
  );
}

export function collectFoldableNodeIds(
  node: TreeNodeData,
  confirmedNames: Set<string>,
  vulnerableNames: Set<string>,
): Set<string> {
  const ids = new Set<string>();

  const visit = (current: TreeNodeData) => {
    if (hasFoldableConfirmedChild(current, confirmedNames, vulnerableNames)) {
      ids.add(current.id);
    }
    current.children.forEach(visit);
  };

  visit(node);
  return ids;
}

export function collectSubtreeNodeIds(node: TreeNodeData): Set<string> {
  const ids = new Set<string>();

  const visit = (current: TreeNodeData) => {
    ids.add(current.id);
    current.children.forEach(visit);
  };

  visit(node);
  return ids;
}

export function findTreeNode(node: TreeNodeData, nodeId: string): TreeNodeData | null {
  if (node.id === nodeId) return node;
  for (const child of node.children) {
    const match = findTreeNode(child, nodeId);
    if (match) return match;
  }
  return null;
}

export function treeNodeIdForSelection(templateName: string, path: string[]): string {
  return path.join('.') || templateName;
}

export function collectAncestorNodeIds(node: TreeNodeData, targetId: string): string[] | null {
  if (node.id === targetId) return [];
  for (const child of node.children) {
    const childAncestors = collectAncestorNodeIds(child, targetId);
    if (childAncestors) return [node.id, ...childAncestors];
  }
  return null;
}

export function buildVisibleTemplateTree(
  node: TreeNodeData,
  collapsedNodeIds: Set<string>,
  confirmedNames: Set<string>,
  vulnerableNames: Set<string>,
): TreeNodeData {
  const visibleChildren = node.children
    .filter(child =>
      !collapsedNodeIds.has(node.id)
      || !isFoldableConfirmedBranch(child, confirmedNames, vulnerableNames)
    )
    .map(child => buildVisibleTemplateTree(
      child,
      collapsedNodeIds,
      confirmedNames,
      vulnerableNames,
    ));

  return {
    ...node,
    children: visibleChildren,
  };
}

export function collectTreeNodeIds(node: TreeNodeData): Set<string> {
  return collectSubtreeNodeIds(node);
}
