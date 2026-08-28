export interface GraphEdgeEndpoints {
  id: string
  source: string
  target: string
}

export interface GraphNodeMembership {
  id: string
  memberNodeIds?: readonly string[]
}

export function connectedEdgeIds(
  nodeId: string | null,
  edges: readonly GraphEdgeEndpoints[],
) {
  if (!nodeId) return new Set<string>()
  return new Set(edges
    .filter(edge => edge.source === nodeId || edge.target === nodeId)
    .map(edge => edge.id))
}

export function containingNodeIds(
  memberNodeId: string | null,
  nodes: readonly GraphNodeMembership[],
) {
  if (!memberNodeId) return new Set<string>()
  return new Set(nodes
    .filter(node => node.memberNodeIds?.includes(memberNodeId))
    .map(node => node.id))
}

export function togglePinnedNodeExpansion(
  pinnedNodeId: string | null,
  nodeId: string,
  expandable: boolean,
) {
  if (!expandable) return pinnedNodeId
  return pinnedNodeId === nodeId ? null : nodeId
}
