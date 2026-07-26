import request from './request'
import type { ConstraintGraphResponse, OptimizationLevel, SourceGraphDto } from '@/types/partialDebugging'

export const getPartialDebuggingSourceGraph = (buildId: string) =>
  request.get(`/partial-debugging/builds/${encodeURIComponent(buildId)}/source-graph`) as unknown as Promise<SourceGraphDto>

export const getPartialDebuggingConstraintGraph = (buildId: string, level: OptimizationLevel) =>
  request.get(`/partial-debugging/builds/${encodeURIComponent(buildId)}/constraint-graph`, { params: { level } }) as unknown as Promise<ConstraintGraphResponse>
