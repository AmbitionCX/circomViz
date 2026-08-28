export type LoopOperandPresentationStyle =
  | 'input'
  | 'output'
  | 'variable'
  | 'constant'
  | 'intermediate'
  | 'component-reference'
  | 'component'
  | 'expression'

export type LoopOperandPresentationShape = 'circle' | 'capsule' | 'component'

const LABEL_FONT_SIZE = 16
const AVERAGE_CHARACTER_EM = 0.62
const LABEL_HORIZONTAL_PADDING = 26
const EXPRESSION_CHARACTER_EM = 0.54
const EXPRESSION_HORIZONTAL_PADDING = 18
const SIGNAL_MAX_WIDTH = 220
const OPERAND_MIN_WIDTH = 66

export const LOOP_FRAME_MIN_WIDTH = 360
export const LOOP_FRAME_MAX_WIDTH = 720
export const LOOP_FRAME_HORIZONTAL_PADDING = 36
export const LOOP_OPERATOR_WIDTH = 40
export const LOOP_CONNECTOR_LENGTH = 12
const LOOP_STATEMENT_FIXED_WIDTH = LOOP_OPERATOR_WIDTH + LOOP_CONNECTOR_LENGTH * 2
const LOOP_OPERAND_WIDTH_BUDGET = LOOP_FRAME_MAX_WIDTH - LOOP_FRAME_HORIZONTAL_PADDING - LOOP_STATEMENT_FIXED_WIDTH

export interface LoopOperandSpec {
  label: string
  style: LoopOperandPresentationStyle
  shape: LoopOperandPresentationShape
}

function labelMetrics(style: LoopOperandPresentationStyle) {
  return style === 'expression'
    ? { characterEm: EXPRESSION_CHARACTER_EM, horizontalPadding: EXPRESSION_HORIZONTAL_PADDING }
    : { characterEm: AVERAGE_CHARACTER_EM, horizontalPadding: LABEL_HORIZONTAL_PADDING }
}

function estimatedLabelWidth(label: string, style: LoopOperandPresentationStyle) {
  const metrics = labelMetrics(style)
  return label.length * LABEL_FONT_SIZE * metrics.characterEm + metrics.horizontalPadding
}

export function fitLoopOperandLabel(label: string, width: number, shape: LoopOperandPresentationShape, style: LoopOperandPresentationStyle) {
  const metrics = labelMetrics(style)
  if (shape === 'circle' || estimatedLabelWidth(label, style) <= width + 0.5) return label
  const availableCharacters = Math.max(4, Math.floor(
    (width - metrics.horizontalPadding + 0.5) / (LABEL_FONT_SIZE * metrics.characterEm),
  ))
  return label.length > availableCharacters
    ? `${label.slice(0, availableCharacters - 3)}...`
    : label
}

export function loopOperandPresentation(
  label: string,
  style: LoopOperandPresentationStyle,
  shape: LoopOperandPresentationShape,
  maxWidth = Number.POSITIVE_INFINITY,
) {
  const preferredWidth = style === 'component'
    ? 150
    : shape === 'circle'
      ? 40
      : Math.min(style === 'expression' ? Number.POSITIVE_INFINITY : SIGNAL_MAX_WIDTH, Math.max(OPERAND_MIN_WIDTH, estimatedLabelWidth(label, style)))
  const width = Math.min(preferredWidth, Math.max(minimumOperandWidth({ label, style, shape }), maxWidth))
  const displayLabel = fitLoopOperandLabel(label, width, shape, style)
  return { width, preferredWidth, displayLabel, truncated: displayLabel !== label }
}

export function expandedLoopOperandWidth(
  label: string,
  style: LoopOperandPresentationStyle,
  shape: LoopOperandPresentationShape,
) {
  return Math.max(minimumOperandWidth({ label, style, shape }), estimatedLabelWidth(label, style))
}

function minimumOperandWidth(operand: LoopOperandSpec) {
  if (operand.style === 'component') return 150
  if (operand.shape === 'circle') return 40
  return OPERAND_MIN_WIDTH
}

function proportionalWidths(left: LoopOperandSpec, right: LoopOperandSpec, leftPreferred: number, rightPreferred: number) {
  const leftMinimum = minimumOperandWidth(left)
  const rightMinimum = minimumOperandWidth(right)
  const remaining = Math.max(0, LOOP_OPERAND_WIDTH_BUDGET - leftMinimum - rightMinimum)
  const leftDemand = Math.max(0, leftPreferred - leftMinimum)
  const rightDemand = Math.max(0, rightPreferred - rightMinimum)
  const totalDemand = leftDemand + rightDemand
  if (!totalDemand) return { leftWidth: leftMinimum, rightWidth: rightMinimum }
  const leftExtra = remaining * leftDemand / totalDemand
  return {
    leftWidth: leftMinimum + leftExtra,
    rightWidth: rightMinimum + remaining - leftExtra,
  }
}

export function loopStatementPresentation(left: LoopOperandSpec, right: LoopOperandSpec) {
  const leftPreferred = loopOperandPresentation(left.label, left.style, left.shape).preferredWidth
  const rightPreferred = loopOperandPresentation(right.label, right.style, right.shape).preferredWidth
  let leftWidth = leftPreferred
  let rightWidth = rightPreferred

  if (leftPreferred + rightPreferred > LOOP_OPERAND_WIDTH_BUDGET) {
    const leftExpression = left.style === 'expression'
    const rightExpression = right.style === 'expression'
    if (leftExpression !== rightExpression) {
      const expression = leftExpression ? left : right
      const other = leftExpression ? right : left
      const expressionMinimum = minimumOperandWidth(expression)
      const otherPreferred = leftExpression ? rightPreferred : leftPreferred
      const otherWidth = Math.min(otherPreferred, Math.max(minimumOperandWidth(other), LOOP_OPERAND_WIDTH_BUDGET - expressionMinimum))
      if (leftExpression) {
        leftWidth = LOOP_OPERAND_WIDTH_BUDGET - otherWidth
        rightWidth = otherWidth
      } else {
        leftWidth = otherWidth
        rightWidth = LOOP_OPERAND_WIDTH_BUDGET - otherWidth
      }
    } else {
      const proportional = proportionalWidths(left, right, leftPreferred, rightPreferred)
      leftWidth = proportional.leftWidth
      rightWidth = proportional.rightWidth
    }
  }

  const leftPresentation = loopOperandPresentation(left.label, left.style, left.shape, leftWidth)
  const rightPresentation = loopOperandPresentation(right.label, right.style, right.shape, rightWidth)
  return {
    left: leftPresentation,
    right: rightPresentation,
    contentWidth: leftPresentation.width + rightPresentation.width + LOOP_STATEMENT_FIXED_WIDTH,
  }
}
