export function calculateSusScore(responses: number[]): number | null {
  if (responses.length !== 10 || responses.some((value) => value < 1 || value > 5)) {
    return null
  }

  const contribution = responses.reduce((total, value, index) => {
    return total + (index % 2 === 0 ? value - 1 : 5 - value)
  }, 0)

  return contribution * 2.5
}
