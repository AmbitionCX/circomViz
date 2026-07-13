export const GROTH16_PRIME = '21888242871839275222246405745257275088548364400416034343698204186575808495617';

export const P = BigInt(GROTH16_PRIME);

export function simplifyFieldElement(rawVal: string | number): bigint {
  let val = BigInt(rawVal);
  if (val < 0n) val = ((val % P) + P) % P;
  else if (val >= P) val = val % P;
  const half = P / 2n;
  return val > half ? val - P : val;
}
