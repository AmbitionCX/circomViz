import assert from 'node:assert/strict'
import test from 'node:test'
import { expandedLoopOperandWidth, LOOP_FRAME_HORIZONTAL_PADDING, LOOP_FRAME_MAX_WIDTH, loopOperandPresentation, loopStatementPresentation } from '../utils/loopOperandPresentation.js'

test('shows a loop equation in full when the adaptive frame can contain it', () => {
  const label = 'acc[i] + squared[i] + in[i] * (i + 7)'
  const presentation = loopStatementPresentation(
    { label, style: 'expression', shape: 'capsule' },
    { label: 'acc[i + 1]', style: 'intermediate', shape: 'capsule' },
  )
  assert.equal(presentation.left.displayLabel, label)
  assert.equal(presentation.left.truncated, false)
  assert.ok(presentation.left.width < label.length * 16 * 0.62 + 26)
  assert.ok(presentation.contentWidth + LOOP_FRAME_HORIZONTAL_PADDING < LOOP_FRAME_MAX_WIDTH)
})

test('caps the loop frame and truncates a genuinely long expression', () => {
  const label = 'previousAccumulator[i - 1] + currentInput[i] * scalingFactor[i] + anotherVeryLongTerm[i] + finalLongTerm[i]'
  const presentation = loopStatementPresentation(
    { label, style: 'expression', shape: 'capsule' },
    { label: 'nextAccumulator[i]', style: 'intermediate', shape: 'capsule' },
  )
  assert.equal(presentation.contentWidth + LOOP_FRAME_HORIZONTAL_PADDING, LOOP_FRAME_MAX_WIDTH)
  assert.equal(presentation.left.truncated, true)
  assert.match(presentation.left.displayLabel, /\.\.\.$/)
  assert.equal(presentation.right.displayLabel, 'nextAccumulator[i]')
})

test('shares the available width between two long expressions', () => {
  const presentation = loopStatementPresentation(
    { label: 'leftAccumulator[i] + leftInput[i] * leftScale[i] + leftOffset[i]', style: 'expression', shape: 'capsule' },
    { label: 'rightAccumulator[i] + rightInput[i] * rightScale[i] + rightOffset[i]', style: 'expression', shape: 'capsule' },
  )
  assert.equal(presentation.contentWidth + LOOP_FRAME_HORIZONTAL_PADDING, LOOP_FRAME_MAX_WIDTH)
  assert.equal(presentation.left.truncated, true)
  assert.equal(presentation.right.truncated, true)
})

test('keeps short circular signal and constant labels unchanged', () => {
  assert.equal(loopOperandPresentation('x', 'input', 'circle').displayLabel, 'x')
  assert.equal(loopOperandPresentation('1234', 'constant', 'circle').displayLabel, '1234')
})

test('allows a truncated loop operand to expand to its complete label width', () => {
  const label = 'selectors[i].selectionValueWithLongName'
  const collapsed = loopOperandPresentation(label, 'intermediate', 'capsule', 180)
  const expandedWidth = expandedLoopOperandWidth(label, 'intermediate', 'capsule')

  assert.equal(collapsed.truncated, true)
  assert.ok(expandedWidth > collapsed.width)
  assert.equal(expandedWidth, label.length * 16 * 0.62 + 26)
})
