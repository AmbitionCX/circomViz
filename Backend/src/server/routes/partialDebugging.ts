import type { FastifyReply, FastifyRequest } from 'fastify';
import { getPartialDebuggingBuild } from '../../core/partialDebugging/store.js';
import type { OptimizationLevel } from '../../types/partialDebugging.js';

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
  const level = ((request.query as { level?: OptimizationLevel }).level ?? 'O1');
  if (!['O0', 'O1', 'O2'].includes(level)) return reply.code(400).send({ error: 'level must be O0, O1, or O2' });
  return reply.send({ graph: build.constraintGraphs[level], mappings: build.mappings, diagnostics: build.summary.diagnostics });
};
export const partialDebuggingSliceHandler = (request: FastifyRequest, reply: FastifyReply) => {
  const build = resolveBuild(request, reply); if (!build) return;
  const query = request.query as { graph?: 'source' | 'constraint'; level?: OptimizationLevel; nodeId?: string; depth?: string };
  const graph = query.graph === 'source' ? build.sourceGraph : build.constraintGraphs[query.level ?? 'O1'];
  if (!query.nodeId || !graph.adjacency[query.nodeId]) return reply.code(400).send({ error: 'A valid nodeId is required' });
  const ids = new Set([query.nodeId]); let frontier = [query.nodeId];
  for (let step = 0; step < Math.max(1, Math.min(2, Number(query.depth ?? 1))); step++) {
    frontier = frontier.flatMap((id) => graph.adjacency[id] ?? []).filter((id) => !ids.has(id));
    frontier.forEach((id) => ids.add(id));
  }
  if ('nodes' in graph) return reply.send({ ...graph, nodes: graph.nodes.filter((node) => ids.has(node.id)), edges: graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) });
  return reply.send({ ...graph, signals: graph.signals.filter((node) => ids.has(node.id)), constraints: graph.constraints.filter((node) => ids.has(node.id)), edges: graph.edges.filter((edge) => ids.has(edge.signalNodeId) && ids.has(edge.constraintNodeId)) });
};
