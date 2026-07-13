import type { TemplateInfo, TemplateParameter, ComponentInstance } from '@/types/circuitTypes';

export interface PathEntry {
  instanceName: string;
  templateName: string;
}

export interface TreeNodeData {
  id: string;
  templateName: string;
  instanceName?: string;
  depth: number;
  path: string[];
  pathInfo: PathEntry[];
  templateInfo: TemplateInfo | null;
  componentCount: number;
  parameters: TemplateParameter[];
  sourceFile?: string;
  isTerminal: boolean;
  isExternal: boolean;
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

  let componentGroups: { comp: ComponentInstance; count: number }[] = [];
  if (hasComponents) {
    const groupMap = new Map<string, { comp: ComponentInstance; count: number }>();
    for (const comp of template.components) {
      const existing = groupMap.get(comp.templateName);
      if (existing) {
        existing.count++;
      } else {
        groupMap.set(comp.templateName, { comp, count: 1 });
      }
    }
    componentGroups = Array.from(groupMap.values());
  }

  const children: TreeNodeData[] = hasComponents
    ? componentGroups.map(({ comp, count }) => {
        const childPath = [...currentPath, comp.name];
        const childPathInfo = [...currentPathInfo, { instanceName: comp.name, templateName: comp.templateName }];

        if (comp.template) {
          const node = buildTemplateNode(comp.template, childPath, childPathInfo, depth + 1, comp.name);
          node.instanceCount = count;
          return node;
        }

        return {
          id: childPath.join('.'),
          templateName: comp.templateName,
          instanceName: comp.name,
          depth: depth + 1,
          path: childPath,
          pathInfo: childPathInfo,
          templateInfo: null,
          componentCount: 0,
          parameters: [],
          sourceFile: undefined,
          isTerminal: true,
          isExternal: true,
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
    depth,
    path: [...currentPath],
    pathInfo: [...currentPathInfo],
    templateInfo: template,
    componentCount: template.components ? template.components.length : 0,
    parameters: template.parameters || [],
    sourceFile: template.sourceFile,
    isTerminal: !hasComponents,
    isExternal: false,
    isLeaf: !hasComponents,
    nodeModulesLibrary: extractNodeModulesLibrary(template.sourceFile),
    children,
  };
}

export function buildD3Hierarchy(tree: TemplateInfo): TreeNodeData {
  return buildTemplateNode(tree, [], [], 0);
}

export function isAllChildrenConfirmed(node: TreeNodeData, confirmedNames: Set<string>): boolean {
  if (node.children.length === 0) return true;
  return node.children.every(child => {
    if (child.isExternal) return true;
    return confirmedNames.has(child.templateName) && isAllChildrenConfirmed(child, confirmedNames);
  });
}

export function isNodeSelectable(node: TreeNodeData, confirmedNames: Set<string>): boolean {
  if (node.isExternal) return false;
  if (node.isLeaf && node.templateInfo) return true;
  return confirmedNames.has(node.templateName) ? false : isAllChildrenConfirmed(node, confirmedNames);
}

export function isNodeConfirmable(node: TreeNodeData): boolean {
  return !!node.templateInfo;
}
