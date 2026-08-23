pragma circom 2.1.9;

template Num2Bits(N) {
    signal input in;
    signal output out[N];

    var reconstructed = 0;
    for (var i = 0; i < N; i++) {
        out[i] <-- (in >> i) & 1;
        out[i] * (out[i] - 1) === 0;
        reconstructed += out[i] * (2 ** i);
    }
    reconstructed === in;
}

template LessThan(N) {
    signal input in[2];
    signal output out;

    component bits = Num2Bits(N + 1);
    bits.in <== in[0] + (2 ** N) - in[1];
    out <== 1 - bits.out[N];
}

template RangeProof(BITS) {
    signal input in;
    signal input max_abs_value;
    signal output out;

    component lowerBound = LessThan(BITS);
    lowerBound.in[0] <== 0;
    lowerBound.in[1] <== in + max_abs_value + 1;

    component upperBound = LessThan(BITS);
    upperBound.in[0] <== in + max_abs_value;
    upperBound.in[1] <== 2 * max_abs_value + 1;

    out <== lowerBound.out * upperBound.out;
}

template ContextDigest(N) {
    signal input values[N];
    signal output out;
    signal acc[N + 1];

    acc[0] <== 0;
    for (var i = 0; i < N; i++) {
        acc[i + 1] <== acc[i] + values[i] * (i + 7);
    }
    out <== acc[N];
}

template PlanetLocation() {
    signal input x;
    signal input y;
    signal input radius;
    signal input context[8];
    signal input expectedContextDigest;
    signal output locationTag;

    signal xSquare <== x * x;
    signal ySquare <== y * y;
    signal distanceMeasure <== xSquare + ySquare;
    component distanceRange = RangeProof(8);
    distanceRange.in <== distanceMeasure;
    distanceRange.max_abs_value <== radius;
    distanceRange.out === 1;

    component contextHasher = ContextDigest(8);
    contextHasher.values <== context;
    contextHasher.out === expectedContextDigest;

    locationTag <== x * 31 + y * 37 + contextHasher.out;
}

template InitCircuit() {
    signal input x;
    signal input y;
    signal input radius;
    signal input context[8];
    signal input expectedContextDigest;
    signal input planetNonce;
    signal output planetTag;

    component location = PlanetLocation();
    location.x <== x;
    location.y <== y;
    location.radius <== radius;
    location.context <== context;
    location.expectedContextDigest <== expectedContextDigest;
    planetTag <== location.locationTag + planetNonce * 41;
}

component main = InitCircuit();
