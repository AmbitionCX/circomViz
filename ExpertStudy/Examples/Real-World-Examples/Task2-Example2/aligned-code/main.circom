pragma circom 2.1.9;

template LinearDigest(N) {
    signal input in[N];
    signal output out;
    signal acc[N + 1];

    acc[0] <== 0;
    for (var i = 0; i < N; i++) {
        acc[i + 1] <== acc[i] + in[i] * (i + 5);
    }
    out <== acc[N];
}

template EmitIfSelected() {
    signal input value;
    signal input selected;
    signal output out;

    selected * (selected - 1) === 0;
    out <== value * selected;
}

template ExtractStringFromPoint() {
    signal input pointAsBytes[8];
    signal input selected[8];
    signal output extracted[8];
    signal output length;
    signal output bodyDigest;

    signal shiftedFirstByte <-- (pointAsBytes[0] >> 1);
    length <== shiftedFirstByte;

    component emitters[8];
    component digest = LinearDigest(8);
    for (var i = 0; i < 8; i++) {
        emitters[i] = EmitIfSelected();
        emitters[i].value <== pointAsBytes[i];
        emitters[i].selected <== selected[i];
        extracted[i] <== emitters[i].out;
        digest.in[i] <== emitters[i].out;
    }
    bodyDigest <== digest.out;
}

template PrivateOverride() {
    signal input encodedPoint[8];
    signal input selected[8];
    signal input expectedBodyDigest;
    signal input policyNonce;
    signal output messageLength;
    signal output overrideTag;

    component extractor = ExtractStringFromPoint();
    extractor.pointAsBytes <== encodedPoint;
    extractor.selected <== selected;
    extractor.bodyDigest === expectedBodyDigest;

    messageLength <== extractor.length;
    overrideTag <== extractor.bodyDigest + extractor.length * 37 + policyNonce;
}

template VoteEnvelope() {
    signal input encodedPoint[8];
    signal input selected[8];
    signal input expectedBodyDigest;
    signal input policyNonce;
    signal input electionId;
    signal output authorizationTag;

    component privateOverride = PrivateOverride();
    privateOverride.encodedPoint <== encodedPoint;
    privateOverride.selected <== selected;
    privateOverride.expectedBodyDigest <== expectedBodyDigest;
    privateOverride.policyNonce <== policyNonce;

    authorizationTag <== privateOverride.overrideTag
                        + privateOverride.messageLength * 41
                        + electionId * 43;
}

template OverrideCircuit() {
    signal input encodedPoint[8];
    signal input selected[8];
    signal input expectedBodyDigest;
    signal input policyNonce;
    signal input electionId;
    signal output tag;

    component envelope = VoteEnvelope();
    envelope.encodedPoint <== encodedPoint;
    envelope.selected <== selected;
    envelope.expectedBodyDigest <== expectedBodyDigest;
    envelope.policyNonce <== policyNonce;
    envelope.electionId <== electionId;
    tag <== envelope.authorizationTag;
}

component main = OverrideCircuit();

