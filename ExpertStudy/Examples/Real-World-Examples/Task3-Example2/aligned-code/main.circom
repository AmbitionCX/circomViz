pragma circom 2.1.9;

template IsEqual() {
    signal input in[2];
    signal output out;

    signal diff <== in[0] - in[1];
    signal inverse <-- diff != 0 ? 1 / diff : 0;
    out <== 1 - diff * inverse;
    diff * out === 0;
}

template ForceEqualIfEnabled() {
    signal input in[2];
    signal input enabled;
    signal output out;

    (in[0] - in[1]) * enabled === 0;
    out <== 1;
}

template ZoneIdInclusionProver() {
    signal input zoneId;
    signal input zoneOffset;
    signal input allowedZoneIds[6];
    signal output validatedZone;

    component offsetMatches[5];
    component equalityChecks[5];
    signal activeChecks[6];
    activeChecks[0] <== 0;

    for (var i = 0; i < 5; i++) {
        offsetMatches[i] = IsEqual();
        offsetMatches[i].in[0] <== zoneOffset;
        offsetMatches[i].in[1] <== i;

        equalityChecks[i] = ForceEqualIfEnabled();
        equalityChecks[i].in[0] <== zoneId;
        equalityChecks[i].in[1] <== allowedZoneIds[i];
        equalityChecks[i].enabled <== offsetMatches[i].out;
        activeChecks[i + 1] <== activeChecks[i] + offsetMatches[i].out;
    }

    activeChecks[5] * (activeChecks[5] - 1) === 0;
    validatedZone <== zoneId;
}

template ZoneListDigest() {
    signal input zoneIds[6];
    signal output out;
    signal acc[7];

    acc[0] <== 0;
    for (var i = 0; i < 6; i++) {
        acc[i + 1] <== acc[i] + zoneIds[i] * (i + 5);
    }
    out <== acc[6];
}

template PrivateTransaction() {
    signal input zoneId;
    signal input zoneOffset;
    signal input allowedZoneIds[6];
    signal input expectedListDigest;
    signal input transactionNonce;
    signal output transactionTag;

    component inclusion = ZoneIdInclusionProver();
    inclusion.zoneId <== zoneId;
    inclusion.zoneOffset <== zoneOffset;
    inclusion.allowedZoneIds <== allowedZoneIds;

    component listDigest = ZoneListDigest();
    listDigest.zoneIds <== allowedZoneIds;
    listDigest.out === expectedListDigest;

    transactionTag <== inclusion.validatedZone * 37
                      + zoneOffset * 41
                      + transactionNonce;
}

template ZoneCircuit() {
    signal input zoneId;
    signal input zoneOffset;
    signal input allowedZoneIds[6];
    signal input expectedListDigest;
    signal input transactionNonce;
    signal output tag;

    component transaction = PrivateTransaction();
    transaction.zoneId <== zoneId;
    transaction.zoneOffset <== zoneOffset;
    transaction.allowedZoneIds <== allowedZoneIds;
    transaction.expectedListDigest <== expectedListDigest;
    transaction.transactionNonce <== transactionNonce;
    tag <== transaction.transactionTag;
}

component main = ZoneCircuit();
