pragma circom 2.1.9;

template LinearDigest(N) {
    signal input in[N];
    signal output out;
    signal acc[N + 1];
    signal squared[N];

    acc[0] <== 0;
    for (var i = 0; i < N; i++) {
        squared[i] <== in[i] * in[i];
        acc[i + 1] <== acc[i] + squared[i] + in[i] * (i + 5);
    }
    out <== acc[N];
}

template ForceEqualIfEnabled() {
    signal input in[2];
    signal input enabled;
    signal output out;

    (in[0] - in[1]) * enabled === 0;
    out <== 1;
}

template NullifierHasher() {
    signal input privKey;
    signal input commitment;
    signal input domain;
    signal output out;

    signal mixedKey <== privKey * 17 + domain * 19;
    out <== mixedKey * 23 + commitment;
}

template ZSwapV1() {
    signal input zAccountUtxoInNullifier;
    signal input zAccountUtxoInSpendPrivKey;
    signal input zAccountUtxoInCommitment;
    signal input membershipPath[8];
    signal input domain;
    signal output validatedNullifier;
    signal output pathDigest;

    component pathHasher = LinearDigest(8);
    for (var i = 0; i < 8; i++) {
        pathHasher.in[i] <== membershipPath[i];
    }
    pathDigest <== pathHasher.out;

    component zAccountUtxoInNullifierHasher = NullifierHasher();
    zAccountUtxoInNullifierHasher.privKey <== zAccountUtxoInSpendPrivKey;
    zAccountUtxoInNullifierHasher.commitment <== zAccountUtxoInCommitment;
    zAccountUtxoInNullifierHasher.domain <== domain;

    component zAccountUtxoInNullifierHasherProver = ForceEqualIfEnabled();
    zAccountUtxoInNullifierHasherProver.in[0] <== zAccountUtxoInNullifier;
    zAccountUtxoInNullifierHasherProver.in[1] <== zAccountUtxoInNullifierHasher.out;
    zAccountUtxoInNullifierHasherProver.enabled <== zAccountUtxoInSpendPrivKey;

    validatedNullifier <== zAccountUtxoInNullifier;
}

template PrivateTransfer() {
    signal input nullifier;
    signal input spendPrivKey;
    signal input commitment;
    signal input membershipPath[8];
    signal input domain;
    signal input expectedPathDigest;
    signal output transferTag;

    component swap = ZSwapV1();
    swap.zAccountUtxoInNullifier <== nullifier;
    swap.zAccountUtxoInSpendPrivKey <== spendPrivKey;
    swap.zAccountUtxoInCommitment <== commitment;
    swap.membershipPath <== membershipPath;
    swap.domain <== domain;

    swap.pathDigest === expectedPathDigest;
    transferTag <== swap.validatedNullifier * 31 + expectedPathDigest;
}

template PoolTransaction() {
    signal input nullifier;
    signal input spendPrivKey;
    signal input commitment;
    signal input membershipPath[8];
    signal input domain;
    signal input expectedPathDigest;
    signal output acceptedTag;

    component transfer = PrivateTransfer();
    transfer.nullifier <== nullifier;
    transfer.spendPrivKey <== spendPrivKey;
    transfer.commitment <== commitment;
    transfer.membershipPath <== membershipPath;
    transfer.domain <== domain;
    transfer.expectedPathDigest <== expectedPathDigest;
    acceptedTag <== transfer.transferTag;
}

component main = PoolTransaction();
