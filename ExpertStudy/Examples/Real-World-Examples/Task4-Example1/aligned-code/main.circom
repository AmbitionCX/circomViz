pragma circom 2.1.9;

template MultiMux1() {
    signal input left;
    signal input right;
    signal input selector;
    signal output orderedLeft;
    signal output orderedRight;

    orderedLeft <== left + selector * (right - left);
    orderedRight <== right + selector * (left - right);
}

template NodeHasher() {
    signal input left;
    signal input right;
    signal output out;

    signal product <== left * right;
    out <== product + left * 17 + right * 19;
}

template BinaryMerkleRoot(DEPTH) {
    signal input leaf;
    signal input indices[DEPTH];
    signal input siblings[DEPTH];
    signal output out;

    signal nodes[DEPTH + 1];
    nodes[0] <== leaf;

    component selectors[DEPTH];
    component hashers[DEPTH];
    for (var i = 0; i < DEPTH; i++) {
        selectors[i] = MultiMux1();
        selectors[i].left <== nodes[i];
        selectors[i].right <== siblings[i];
        selectors[i].selector <== indices[i];

        hashers[i] = NodeHasher();
        hashers[i].left <== selectors[i].orderedLeft;
        hashers[i].right <== selectors[i].orderedRight;
        nodes[i + 1] <== hashers[i].out;
    }
    out <== nodes[DEPTH];
}

template ContextDigest(N) {
    signal input values[N];
    signal output out;
    signal acc[N + 1];

    acc[0] <== 0;
    for (var i = 0; i < N; i++) {
        acc[i + 1] <== acc[i] + values[i] * (i + 3);
    }
    out <== acc[N];
}

template PassportRegistry() {
    signal input leaf;
    signal input pathIndices[8];
    signal input siblings[8];
    signal input expectedRoot;
    signal input registryContext[8];
    signal input expectedContextDigest;
    signal output registrationTag;

    component merkleRoot = BinaryMerkleRoot(8);
    merkleRoot.leaf <== leaf;
    merkleRoot.indices <== pathIndices;
    merkleRoot.siblings <== siblings;
    merkleRoot.out === expectedRoot;

    component context = ContextDigest(8);
    context.values <== registryContext;
    context.out === expectedContextDigest;

    registrationTag <== merkleRoot.out + context.out * 31;
}

template RegistrationCircuit() {
    signal input leaf;
    signal input pathIndices[8];
    signal input siblings[8];
    signal input expectedRoot;
    signal input registryContext[8];
    signal input expectedContextDigest;
    signal output tag;

    component registry = PassportRegistry();
    registry.leaf <== leaf;
    registry.pathIndices <== pathIndices;
    registry.siblings <== siblings;
    registry.expectedRoot <== expectedRoot;
    registry.registryContext <== registryContext;
    registry.expectedContextDigest <== expectedContextDigest;
    tag <== registry.registrationTag;
}

component main = RegistrationCircuit();

