pragma circom 2.2.2;

include "comparators.circom";

// This circuit is the circom equivalent of our `extract()` function from `curve.ts`.
// It extracts an embedded string from a Ristretto point, and returns the string as individual bytes.
// Since circom doesn't support strings, we represent the string as a series of bytes.

template ExtractStringFromPoint() {
    var bytesPerPoint = 32;
    var maxLength = bytesPerPoint - 1; // 1st byte is for length
    // Input: serialized point as bytes
    signal input pointAsBytes[bytesPerPoint];

    // Output: extracted string as individual bytes
    signal output stringAsBytes[maxLength];

    // Extract length from first byte (right shifted by 1)
    signal shiftedFirstByte <-- (pointAsBytes[0] >> 1);
    signal output length <== shiftedFirstByte;

    // Extract the embedded string bytes:
    // For each possible string byte, output `value` if `i < length`, else output 0.
    // Since the 1st byte was reserved for the length, we use `pointAsBytes[i + 1]`.
    for (var i = 0; i < maxLength; i++) {
        stringAsBytes[i] <== EmitIfInRange(5)(i, length, pointAsBytes[i + 1]);
    }
}

// if (index < range) { emit value } else { emit 0 }
template EmitIfInRange(n) {
    signal input index, range, value;
    signal output out;

    component lt = LessThan(n);
    lt.in[0] <== index;
    lt.in[1] <== range;
    out <== lt.out * value;
}


// > snarkjs r1cs info build/ExtractStringFromPoint.r1cs

// [INFO]  snarkJS: Curve: bn-128
// [INFO]  snarkJS: # of Wires: 312
// [INFO]  snarkJS: # of Constraints: 310
// [INFO]  snarkJS: # of Private Inputs: 32
// [INFO]  snarkJS: # of Public Inputs: 0
// [INFO]  snarkJS: # of Labels: 500
// [INFO]  snarkJS: # of Outputs: 32