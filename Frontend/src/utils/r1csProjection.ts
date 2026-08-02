import type { ConstraintExpressionDto, ConstraintGraphDto } from '../types/partialDebugging.js'

export type R1csConstraint = ConstraintGraphDto['constraints'][number]

export interface R1csConstraintFamily {
  key: string
  clusterId?: string
  constraints: R1csConstraint[]
  referenceIds: Set<string>
  hasOutput: boolean
  firstIndex: number
}

function normalizedSignalName(name: string) {
  return (name.startsWith('main.') ? name.slice('main.'.length) : name).replace(/\[\d+\]/g, '[n]')
}

export function buildConstraintFamilies(graph: ConstraintGraphDto): R1csConstraintFamily[] {
  const signalById = new Map(graph.signals.map(signal => [signal.signalId, signal]))
  const groupBySignalId = new Map(graph.signalGroups.flatMap(group =>
    group.memberSignalIds.map(signalId => [signalId, group] as const),
  ))
  const outputReferenceIds = new Set([
    ...graph.signals.filter(signal => signal.role === 'output').map(signal => signal.id),
    ...graph.signalGroups.filter(group => group.role === 'output').flatMap(group => [group.id, ...group.memberSignalNodeIds]),
  ])
  const clusterByConstraintId = new Map(
    graph.loopClusters.flatMap(cluster => cluster.constraintNodeIds.map(constraintId => [constraintId, cluster.id] as const)),
  )
  const expressionPattern = (expression: ConstraintExpressionDto): string => {
    if (expression.kind === 'constant') return `constant:${expression.value}`
    if (expression.kind === 'signal') {
      const group = groupBySignalId.get(expression.signalId)
      if (group) return `group:${group.id}`
      const signalName = signalById.get(expression.signalId)?.qualifiedName ?? `s${expression.signalId}`
      return `signal:${normalizedSignalName(signalName)}`
    }
    return `${expression.kind}(${expression.operands.map(expressionPattern).sort().join(',')})`
  }
  const collectReferences = (expression: ConstraintExpressionDto, references: Set<string>) => {
    if (expression.kind === 'signal') {
      const group = groupBySignalId.get(expression.signalId)
      const signal = signalById.get(expression.signalId)
      if (group) {
        references.add(group.id)
        group.memberSignalNodeIds.forEach(id => references.add(id))
      } else if (signal) references.add(signal.id)
      return
    }
    if (expression.kind !== 'constant') expression.operands.forEach(operand => collectReferences(operand, references))
  }

  const grouped = new Map<string, R1csConstraintFamily>()
  for (const constraint of graph.constraints) {
    const clusterId = clusterByConstraintId.get(constraint.id)
    const equationPattern = [
      expressionPattern(constraint.equation.left),
      expressionPattern(constraint.equation.right),
    ].sort().join('=')
    const key = `${clusterId ?? 'global'}:${equationPattern}`
    const family = grouped.get(key) ?? {
      key,
      clusterId,
      constraints: [],
      referenceIds: new Set<string>(clusterId ? [clusterId] : []),
      hasOutput: false,
      firstIndex: constraint.index,
    }
    family.constraints.push(constraint)
    family.referenceIds.add(constraint.id)
    collectReferences(constraint.equation.left, family.referenceIds)
    collectReferences(constraint.equation.right, family.referenceIds)
    family.hasOutput ||= [...family.referenceIds].some(referenceId => outputReferenceIds.has(referenceId))
    grouped.set(key, family)
  }
  return [...grouped.values()]
}

export function familyMatches(family: R1csConstraintFamily, ids: ReadonlySet<string>) {
  return [...ids].some(id => family.key === id || family.referenceIds.has(id))
}

export function prioritizeConstraintFamilies(
  families: R1csConstraintFamily[],
  focusIds: ReadonlySet<string>,
  attentionIds: ReadonlySet<string>,
) {
  const score = (family: R1csConstraintFamily) =>
    (familyMatches(family, focusIds) ? 1_000_000 : 0)
    + (familyMatches(family, attentionIds) ? 100_000 : 0)
    + (family.hasOutput ? 10_000 : 0)
    + family.constraints.length
  return [...families].sort((left, right) => score(right) - score(left) || left.firstIndex - right.firstIndex)
}

export function exactConstraintPage(family: R1csConstraintFamily, page: number, pageSize: number) {
  const start = Math.max(0, page) * pageSize
  return family.constraints.slice(start, start + pageSize).map(constraint => ({
    ...family,
    key: `${family.key}:exact:${constraint.id}`,
    constraints: [constraint],
    referenceIds: new Set([...family.referenceIds, constraint.id]),
    firstIndex: constraint.index,
  }))
}
