import { ConstraintObject, circuitData } from "../types/constraint.js";

const Prime = String(process.env.P);
const PrimeNumber = BigInt(Prime);

/** 
 * Lagrange interpolation function 
 * Calculate polynomial coefficients from a given set of points 
 * @param points Set of points containing x and y coordinates 
 * @returns Array of coefficients of the interpolated polynomial 
 */
function lagrangeInterpolation(points: { x: bigint, y: bigint }[]): bigint[] {
    const prime = PrimeNumber;
    const degree = points.length;

    const coefficients: bigint[] = Array(degree).fill(BigInt(0));

    for (let i = 0; i < degree; i++) {
        const { x: xi, y: yi } = points[i];

        if (yi === BigInt(0)) continue;

        // Compute the basic Lagrange polynomial Li(x)
        // Li(x) = ∏(j≠i) (x - xj) / (xi - xj)
        let term: bigint[] = [BigInt(1)];

        for (let j = 0; j < degree; j++) {
            if (i === j) continue;

            const { x: xj } = points[j];

            // Compute (x - xj), which is equivalent to [-xj, 1] denoting the polynomial (x - xj)
            const factor: bigint[] = [(-xj % prime + prime) % prime, BigInt(1)];

            // Polynomial multiplication: term = term * factor
            term = multiplyPolynomials(term, factor, prime);

            // Compute (xi - xj)^(-1) mod prime
            let diff = (xi - xj) % prime;
            if (diff < 0) diff += prime;

            // calculate the mode inverse
            let inverse = modInversePrime(diff, prime);

            // Multiply term by the factor (xi - xj)^(-1)
            for (let k = 0; k < term.length; k++) {
                term[k] = (term[k] * inverse) % prime;
            }
        }

        // Multiply term by yi
        for (let k = 0; k < term.length; k++) {
            term[k] = (term[k] * yi) % prime;
        }

        // Add the result to the polynomial coefficients
        for (let k = 0; k < term.length; k++) {
            if (k < coefficients.length) {
                coefficients[k] = (coefficients[k] + term[k]) % prime;
            }
        }
    }

    return coefficients;
}

/** 
 * Polynomial multiplication auxiliary function 
 * Computes the product of two polynomials over a finite field 
 * @param a Array of coefficients of the first polynomial 
 * @param b Array of coefficients of the second polynomial 
 * @param prime Modulo a finite field 
 * @returns Array of coefficients of the resulting polynomial 
 */
function multiplyPolynomials(a: bigint[], b: bigint[], prime: bigint): bigint[] {
    const result: bigint[] = Array(a.length + b.length - 1).fill(BigInt(0));

    for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < b.length; j++) {
            result[i + j] = (result[i + j] + (a[i] * b[j])) % prime;
        }
    }

    return result;
}

/** 
 * Compute the modular inverse over a finite field 
 * @param a Number needed to compute the inverse 
 * @param prime Modulus of a finite field 
 * @returns Modular inverse 
 */
function modInversePrime(a: bigint, prime: bigint): bigint {
    return modPow(a, prime - BigInt(2), prime);
}

/** 
 * Modulo power operation 
 * Calculate (base^exponent) mod modulus 
 * @param base base 
 * @param exponent exponent 
 * @param modulus modulus 
 * @returns modulo power operation result 
 */
function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
    if (modulus === BigInt(1)) return BigInt(0);

    let result = BigInt(1);
    base = base % modulus;

    while (exponent > BigInt(0)) {
        if (exponent % BigInt(2) === BigInt(1)) {
            result = (result * base) % modulus;
        }
        exponent = exponent >> BigInt(1);
        base = (base * base) % modulus;
    }

    return result;
}

/** 
 * Conversion of R1CS to QAP 
 * Conversion process for constraint systems 
 * @param circuitData Circuit data containing constraints and symbols 
 * @returns QAP representation 
 */
export function convertR1CStoQAP(circuitData: circuitData): any {
    const constraints = circuitData.constraints;
    const symbols = circuitData.symbols;
    const numVars = symbols.length + 1; // +1 for the constant signal (index 0)
    const numConstraints = constraints.length;

    console.log(`Processing ${numConstraints} constraints with ${numVars} variables`);

    // Use Array.from to avoid reference bugs
    const matrixA: bigint[][] = Array.from({ length: numConstraints }, () => Array(numVars).fill(BigInt(0)));
    const matrixB: bigint[][] = Array.from({ length: numConstraints }, () => Array(numVars).fill(BigInt(0)));
    const matrixC: bigint[][] = Array.from({ length: numConstraints }, () => Array(numVars).fill(BigInt(0)));

    for (let i = 0; i < numConstraints; i++) {
        const [aComp, bComp, cComp] = constraints[i] as ConstraintObject;

        for (const [key, value] of Object.entries(aComp)) {
            const index = parseInt(key);
            const coeff = parseCoefficient(value);
            matrixA[i][index] = coeff;
        }

        for (const [key, value] of Object.entries(bComp)) {
            const index = parseInt(key);
            const coeff = parseCoefficient(value);
            matrixB[i][index] = coeff;
        }

        for (const [key, value] of Object.entries(cComp)) {
            const index = parseInt(key);
            const coeff = parseCoefficient(value);
            matrixC[i][index] = coeff;
        }
    }

    // Evaluation points: x = 0..m-1
    const evaluationPoints = Array.from({ length: numConstraints }, (_, i) => BigInt(i));

    const qapPolysA: bigint[][] = [];
    const qapPolysB: bigint[][] = [];
    const qapPolysC: bigint[][] = [];

    for (let varIndex = 0; varIndex < numVars; varIndex++) {
        const pointsA: { x: bigint, y: bigint }[] = [];
        const pointsB: { x: bigint, y: bigint }[] = [];
        const pointsC: { x: bigint, y: bigint }[] = [];

        for (let i = 0; i < numConstraints; i++) {
            pointsA.push({ x: evaluationPoints[i], y: matrixA[i][varIndex] });
            pointsB.push({ x: evaluationPoints[i], y: matrixB[i][varIndex] });
            pointsC.push({ x: evaluationPoints[i], y: matrixC[i][varIndex] });
        }

        qapPolysA.push(lagrangeInterpolation(pointsA));
        qapPolysB.push(lagrangeInterpolation(pointsB));
        qapPolysC.push(lagrangeInterpolation(pointsC));
    }

    // Vanishing polynomial Z(x) = ∏(x - r_i)
    // return a coefficient arrays, a0 + a1*x + a2*x^2 + ... + an·x^n   
    const zPoly = evaluationPoints.reduce((acc, x) => {
        if (acc.length === 0) {
            return [(-x + PrimeNumber) % PrimeNumber, BigInt(1)];
        }
        const factor = [(-x + PrimeNumber) % PrimeNumber, BigInt(1)];
        return multiplyPolynomials(acc, factor, PrimeNumber);
    }, [] as bigint[]);

    const qap = {
        numVars,
        numConstraints,
        qapPolysA,
        qapPolysB,
        qapPolysC,
        zPoly,
        evaluationPoints,
    };

    return serializeBigInts(qap);
}

// Parses string | number to bigint and handles fraction format
function parseCoefficient(raw: string | number): bigint {
    if (typeof raw === 'number') return BigInt(raw);
    if (!raw.includes('/')) return BigInt(raw);
    return BigInt(processInverseFraction(raw));
}

/** 
 * Processes a fraction string of the form "1/x" 
 * @param fraction fraction string 
 * @returns Processed value string 
 */
function processInverseFraction(fraction: string): string {
    const [numeratorStr, denominatorStr] = fraction.split('/');
    const numerator = BigInt(numeratorStr || "1");
    const denominator = BigInt(denominatorStr);

    if (denominator === BigInt(0)) {
        console.error("Denominator cannot be zero");
        return "0";
    }

    const inverse = modInversePrime(denominator, PrimeNumber);
    return ((numerator * inverse) % PrimeNumber).toString();
}


/** 
 * Recursively convert all BigInt in an object to strings 
 * @param obj Object containing BigInt 
 * @returns Converted object with all BigInt changed to strings 
 */
export function serializeBigInts(obj: any): any {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (typeof obj === 'bigint') {
        return obj.toString();
    }

    if (Array.isArray(obj)) {
        return obj.map(item => serializeBigInts(item));
    }

    if (typeof obj === 'object') {
        const result: any = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                result[key] = serializeBigInts(obj[key]);
            }
        }
        return result;
    }

    return obj;
}