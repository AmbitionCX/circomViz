import type { TemplateDefinitionNode } from './ast.js';

export interface CollectedComponent {
  name: string;
  templateName: string;
  arguments: any[];
  templateArgs?: any[];
  callArgs?: any[];
  isAnonymous?: boolean;
  isArray?: boolean;
  line?: number;
}

function componentArrayName(expression: any): string | null {
  let current = expression;
  while (current?.type === 'ArrayAccess') {
    current = current.array;
  }
  return current?.type === 'Identifier' ? current.name : null;
}

function childNodes(node: any, excludedKeys: Set<string> = new Set()): any[] {
  const children: any[] = [];

  for (const [key, value] of Object.entries(node)) {
    if (excludedKeys.has(key) || key === 'type' || key === 'line') continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') children.push(item);
      }
    } else if (value && typeof value === 'object') {
      children.push(value);
    }
  }

  return children;
}

/** Collect each direct component-instantiation site contained in a template body. */
export function collectDirectComponents(template: TemplateDefinitionNode): CollectedComponent[] {
  const roots = [...template.components, ...template.signals, ...template.variables, ...template.statements];
  const componentArrays = new Set<string>();

  function collectArrayDeclarations(node: any): void {
    if (!node || typeof node !== 'object') return;

    if ((node.type === 'ComponentDeclaration' || node.type === 'ComponentArrayInit') &&
        node.arraySizes?.length > 0) {
      componentArrays.add(node.name);
    }

    childNodes(node).forEach(collectArrayDeclarations);
  }

  roots.forEach(collectArrayDeclarations);

  const collected: CollectedComponent[] = [];
  const collectedNodes = new Set<any>();
  const collectedArrays = new Set<string>();
  let anonymousIndex = 0;

  function addComponentCall(call: any, preferredName?: string): void {
    if (collectedNodes.has(call)) return;
    collectedNodes.add(call);

    collected.push({
      name: preferredName || `Anonymous_${anonymousIndex++}`,
      templateName: call.template,
      arguments: call.templateArgs || [],
      templateArgs: call.templateArgs || [],
      callArgs: call.callArgs || [],
      isAnonymous: true,
      line: call.line,
    });
  }

  function visit(node: any): void {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'ComponentInstantiationNode') {
      if (!collectedNodes.has(node) && node.templateName) {
        collectedNodes.add(node);
        collected.push({
          name: node.name,
          templateName: node.templateName,
          arguments: node.arguments || [],
          callArgs: node.callArgs,
          isAnonymous: node.isAnonymous,
          line: node.line,
        });
      }
      childNodes(node).forEach(visit);
      return;
    }

    if (node.type === 'Signal') {
      if (node.initialValue?.type === 'ComponentCall') {
        addComponentCall(node.initialValue, node.name);
      }
      childNodes(node, new Set(['initialValue'])).forEach(visit);
      return;
    }

    if (node.type === 'TupleSignalDeclaration') {
      if (node.initialValue?.type === 'ComponentCall') {
        addComponentCall(node.initialValue, node.elements?.[0]?.name);
      }
      childNodes(node, new Set(['initialValue'])).forEach(visit);
      return;
    }

    if (node.type === 'ComponentCall') {
      addComponentCall(node);
      childNodes(node).forEach(visit);
      return;
    }

    if (node.type === 'Assignment' && node.right?.type === 'FunctionCall') {
      const arrayName = componentArrayName(node.left);
      if (arrayName && componentArrays.has(arrayName) && !collectedArrays.has(arrayName)) {
        collectedArrays.add(arrayName);
        collected.push({
          name: arrayName,
          templateName: node.right.function,
          arguments: node.right.arguments || [],
          isArray: true,
          line: node.line,
        });
      }
    }

    childNodes(node).forEach(visit);
  }

  roots.forEach(visit);
  return collected;
}
