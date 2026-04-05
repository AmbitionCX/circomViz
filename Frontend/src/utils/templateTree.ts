import type { TemplateInfo, TemplateParameter } from '@/types/circuitTypes';

export interface TreeNodeData {
  id: string;
  templateName: string;
  instanceName?: string;
  depth: number;
  path: string[];
  templateInfo: TemplateInfo | null;
  componentCount: number;
  parameters: TemplateParameter[];
  sourceFile?: string;
  isTerminal: boolean;
  isExternal: boolean;
  isLeaf: boolean;
  nodeModulesLibrary?: string;
  children: TreeNodeData[];
}

function extractNodeModulesLibrary(sourceFile: string | undefined): string | undefined {
  if (!sourceFile) return undefined;
  const match = sourceFile.match(/\/node_modules\/([^/]+)/);
  return match ? match[1] : undefined;
}

function buildTemplateNode(
  template: TemplateInfo,
  currentPath: string[],
  depth: number,
  instanceName?: string
): TreeNodeData {
  const hasComponents = template.components && template.components.length > 0;

  const children: TreeNodeData[] = hasComponents
    ? template.components.map((comp) => {
        const childPath = [...currentPath, comp.name];

        if (comp.template) {
          return buildTemplateNode(comp.template, childPath, depth + 1, comp.name);
        }

        return {
          id: childPath.join('.'),
          templateName: comp.templateName,
          instanceName: comp.name,
          depth: depth + 1,
          path: childPath,
          templateInfo: null,
          componentCount: 0,
          parameters: [],
          sourceFile: undefined,
          isTerminal: true,
          isExternal: true,
          isLeaf: true,
          nodeModulesLibrary: undefined,
          children: [],
        };
      })
    : [];

  return {
    id: currentPath.join('.') || template.templateName,
    templateName: template.templateName,
    instanceName,
    depth,
    path: [...currentPath],
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
  return buildTemplateNode(tree, [], 0);
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
