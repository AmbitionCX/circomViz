import assert from 'node:assert/strict'
import test from 'node:test'
import { loopOperandPresentation } from '../utils/loopOperandPresentation.js'

test('shows a short loop expression in full', () => {
  const label = 'sums[i - 1] + nums[i]'
  const presentation = loopOperandPresentation(label, 'expression', 'capsule')
  assert.equal(presentation.displayLabel, label)
  assert.equal(presentation.truncated, false)
  assert.ok(presentation.width > 220)
  assert.ok(presentation.width <= 360)
})

test('caps and truncates a genuinely long loop expression', () => {
  const label = 'previousAccumulator[i - 1] + currentInput[i] * scalingFactor[i]'
  const presentation = loopOperandPresentation(label, 'expression', 'capsule')
  assert.equal(presentation.width, 360)
  assert.equal(presentation.truncated, true)
  assert.match(presentation.displayLabel, /\.\.\.$/)
})

test('keeps short circular signal and constant labels unchanged', () => {
  assert.equal(loopOperandPresentation('x', 'input', 'circle').displayLabel, 'x')
  assert.equal(loopOperandPresentation('1234', 'constant', 'circle').displayLabel, '1234')
})
