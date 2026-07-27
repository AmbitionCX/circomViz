import type { FastifyReply, FastifyRequest } from 'fastify';
import { getPartialDebuggingBuild } from '../../core/partialDebugging/store.js';

const resolveBuild = (request: FastifyRequest, reply: FastifyReply) => {
  const build = getPartialDebuggingBuild((request.params as { buildId: string }).buildId);
  if (!build) reply.code(404).send({ error: 'Partial Debugging build not found' });
  return build;
};
export const partialDebuggingSourceGraphHandler = (request: FastifyRequest, reply: FastifyReply) => {
  const build = resolveBuild(request, reply); if (build) return reply.send(build.sourceGraph);
};
export const partialDebuggingConstraintGraphHandler = (request: FastifyRequest, reply: FastifyReply) => {
  const build = resolveBuild(request, reply); if (!build) return;
  return reply.send({ graph: build.constraintGraph, mappings: build.mappings, diagnostics: build.summary.diagnostics });
};
export const partialDebuggingSliceHandler = (request: FastifyRequest, reply: FastifyReply) => {
  const build = resolveBuild(request, reply); if (!build) return;
  const query = request.query as { graph?: 'source' | 'constraint'; nodeId?: string; depth?: string };
  const graph = query.graph === 'source' ? build.sourceGraph : build.constraintGraph;
  if (!query.nodeId || !graph.adjacency[query.nodeId]) return reply.code(400).send({ error: 'A valid nodeId is required' });
  const ids = new Set([query.nodeId]); let frontier = [query.nodeId];
  for (let step = 0; step < Math.max(1, Math.min(2, Number(query.depth ?? 1))); step++) {
    frontier = frontier.flatMap((id) => graph.adjacency[id] ?? []).filter((id) => !ids.has(id));
    frontier.forEach((id) => ids.add(id));
  }
  if ('nodes' in graph) return reply.send({ ...graph, nodes: graph.nodes.filter((node) => ids.has(node.id)), edges: graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) });
  return reply.send({ ...graph, signals: graph.signals.filter((node) => ids.has(node.id)), constraints: graph.constraints.filter((node) => ids.has(node.id)), edges: graph.edges.filter((edge) => ids.has(edge.signalNodeId) && ids.has(edge.constraintNodeId)) });
};
