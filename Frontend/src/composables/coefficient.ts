const GROTH16_PRIME = "21888242871839275222246405745257275088548364400416034343698204186575808495617"
const prime_bigint = BigInt(GROTH16_PRIME);

export function readableCoefficient(input: number): string {
    const x: bigint = BigInt(input);
    const P = prime_bigint;

    if (x === BigInt(0)) return "0";

    // Simplify the element to signed form: [-P/2, P/2]
    const simplify = (val: bigint): bigint => {
        const half = P / BigInt(2);
        return val <= half ? val : val - P;
    };

    // Compute modular inverse using Fermat's little theorem
    const modInverse = (val: bigint): bigint => {
        let base = val % P;
        let exp = P - BigInt(2);
        let result = BigInt(1);

        while (exp > 0) {
            if (exp % BigInt(2) === BigInt(1)) {
                result = (result * base) % P;
            }
            base = (base * base) % P;
            exp = exp / BigInt(2);
        }

        return result;
    };

    const simplified = simplify(x);
    const inverseSimplified = simplify(modInverse(x));

    const absS = simplified < 0n ? -simplified : simplified;
    const absI = inverseSimplified < 0n ? -inverseSimplified : inverseSimplified;

    return absS <= absI
        ? simplified.toString()
        : `-1/${absI.toString()}`;
}