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
const SIGNAL_MAX_WIDTH = 220
const EXPRESSION_MAX_WIDTH = 360

function estimatedLabelWidth(label: string) {
  return label.length * LABEL_FONT_SIZE * AVERAGE_CHARACTER_EM + LABEL_HORIZONTAL_PADDING
}

export function fitLoopOperandLabel(label: string, width: number, shape: LoopOperandPresentationShape) {
  if (shape === 'circle' || estimatedLabelWidth(label) <= width + 0.5) return label
  const availableCharacters = Math.max(4, Math.floor(
    (width - LABEL_HORIZONTAL_PADDING + 0.5) / (LABEL_FONT_SIZE * AVERAGE_CHARACTER_EM),
  ))
  return label.length > availableCharacters
    ? `${label.slice(0, availableCharacters - 3)}...`
    : label
}

export function loopOperandPresentation(
  label: string,
  style: LoopOperandPresentationStyle,
  shape: LoopOperandPresentationShape,
) {
  const width = style === 'component'
    ? 150
    : shape === 'circle'
      ? 40
      : Math.min(
          style === 'expression' ? EXPRESSION_MAX_WIDTH : SIGNAL_MAX_WIDTH,
          Math.max(66, estimatedLabelWidth(label)),
        )
  const displayLabel = fitLoopOperandLabel(label, width, shape)
  return { width, displayLabel, truncated: displayLabel !== label }
}
