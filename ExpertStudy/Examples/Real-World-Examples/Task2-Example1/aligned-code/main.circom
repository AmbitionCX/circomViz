pragma circom 2.1.9;

template LinearDigest(N) {
    signal input in[N];
    signal output out;
    signal acc[N + 1];

    acc[0] <== 0;
    for (var i = 0; i < N; i++) {
        acc[i + 1] <== acc[i] + in[i] * (i + 3);
    }
    out <== acc[N];
}

template ArrayXOR(N) {
    signal input a[N];
    signal input b[N];
    signal output out[N];

    for (var i = 0; i < N; i++) {
        out[i] <-- a[i] ^ b[i];
    }
}

template ColumnMixer(N) {
    signal input left[N];
    signal input right[N];
    signal output out[N];

    for (var i = 0; i < N; i++) {
        out[i] <== left[i] * (i + 5) + right[i] * (i + 7);
    }
}

template HashToField() {
    signal input message[8];
    signal input mask[8];
    signal input context[8];
    signal output fieldElement;
    signal output contextTag;

    component xorBytes = ArrayXOR(8);
    component mixedBytes = ColumnMixer(8);
    component messageDigest = LinearDigest(8);
    component contextDigest = LinearDigest(8);

    for (var i = 0; i < 8; i++) {
        xorBytes.a[i] <== message[i];
        xorBytes.b[i] <== mask[i];
    }
    for (var i = 0; i < 8; i++) {
        mixedBytes.left[i] <== xorBytes.out[i];
        mixedBytes.right[i] <== context[i];
    }
    for (var i = 0; i < 8; i++) {
        messageDigest.in[i] <== mixedBytes.out[i];
        contextDigest.in[i] <== context[i];
    }

    fieldElement <== messageDigest.out;
    contextTag <== contextDigest.out;
}

template BeaconStep() {
    signal input message[8];
    signal input mask[8];
    signal input context[8];
    signal input expectedContextTag;
    signal input slot;
    signal output signingRoot;

    component hashToField = HashToField();
    hashToField.message <== message;
    hashToField.mask <== mask;
    hashToField.context <== context;
    hashToField.contextTag === expectedContextTag;

    signingRoot <== hashToField.fieldElement + slot * 41;
}

template TelepathyCircuit() {
    signal input message[8];
    signal input mask[8];
    signal input context[8];
    signal input expectedContextTag;
    signal input slot;
    signal output root;

    component step = BeaconStep();
    step.message <== message;
    step.mask <== mask;
    step.context <== context;
    step.expectedContextTag <== expectedContextTag;
    step.slot <== slot;
    root <== step.signingRoot;
}

component main = TelepathyCircuit();
