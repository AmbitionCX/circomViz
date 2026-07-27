import request from './request'
import type { ConstraintGraphResponse, SourceGraphDto } from '@/types/partialDebugging'

export const getPartialDebuggingSourceGraph = (buildId: string) =>
  request.get(`/partial-debugging/builds/${encodeURIComponent(buildId)}/source-graph`) as unknown as Promise<SourceGraphDto>

export const getPartialDebuggingConstraintGraph = (buildId: string) =>
  request.get(`/partial-debugging/builds/${encodeURIComponent(buildId)}/constraint-graph`) as unknown as Promise<ConstraintGraphResponse>
