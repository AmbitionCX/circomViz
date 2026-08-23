pragma circom 2.1.9;

template LinearDigest(N) {
    signal input in[N];
    signal output out;
    signal acc[N + 1];
    signal squared[N];

    acc[0] <== 0;
    for (var i = 0; i < N; i++) {
        squared[i] <== in[i] * in[i];
        acc[i + 1] <== acc[i] + squared[i] + in[i] * (i + 7);
    }
    out <== acc[N];
}

template NoteHasher() {
    signal input nullifierPubKey[2];
    signal input balance;
    signal input tokenId;
    signal input nonce;
    signal output out;

    signal keyDigest <== nullifierPubKey[0] * 11 + nullifierPubKey[1] * 13;
    signal assetDigest <== balance * 17 + tokenId * 19;
    out <== keyDigest + assetDigest + nonce * 23;
}

template NullifierHasher() {
    signal input privKey;
    signal input commitment;
    signal input domain;
    signal output out;

    signal keyDigest <== privKey * 29 + domain * 31;
    out <== keyDigest + commitment * 37;
}

template ZAccountRenewalV1() {
    signal input zAccountUtxoInNullifierPubKey[2];
    signal input zAccountUtxoInNullifierPrivKey;
    signal input balance;
    signal input tokenId;
    signal input nonce;
    signal input domain;
    signal input context[8];
    signal input expectedCommitment;
    signal input expectedNullifier;
    signal output renewedCommitment;
    signal output validatedNullifier;

    component contextDigest = LinearDigest(8);
    for (var i = 0; i < 8; i++) {
        contextDigest.in[i] <== context[i];
    }

    component zAccountUtxoInNoteHasher = NoteHasher();
    zAccountUtxoInNoteHasher.nullifierPubKey <== zAccountUtxoInNullifierPubKey;
    zAccountUtxoInNoteHasher.balance <== balance;
    zAccountUtxoInNoteHasher.tokenId <== tokenId;
    zAccountUtxoInNoteHasher.nonce <== nonce;
    zAccountUtxoInNoteHasher.out === expectedCommitment;

    component zAccountUtxoInNullifierHasher = NullifierHasher();
    zAccountUtxoInNullifierHasher.privKey <== zAccountUtxoInNullifierPrivKey;
    zAccountUtxoInNullifierHasher.commitment <== zAccountUtxoInNoteHasher.out;
    zAccountUtxoInNullifierHasher.domain <== domain;
    zAccountUtxoInNullifierHasher.out === expectedNullifier;

    validatedNullifier <== zAccountUtxoInNullifierHasher.out;
    renewedCommitment <== expectedCommitment + contextDigest.out;
}

template RenewalTransaction() {
    signal input nullifierPubKey[2];
    signal input nullifierPrivKey;
    signal input balance;
    signal input tokenId;
    signal input nonce;
    signal input domain;
    signal input context[8];
    signal input oldCommitment;
    signal input nullifier;
    signal output newCommitment;
    signal output spentNullifier;

    component renewal = ZAccountRenewalV1();
    renewal.zAccountUtxoInNullifierPubKey <== nullifierPubKey;
    renewal.zAccountUtxoInNullifierPrivKey <== nullifierPrivKey;
    renewal.balance <== balance;
    renewal.tokenId <== tokenId;
    renewal.nonce <== nonce;
    renewal.domain <== domain;
    renewal.context <== context;
    renewal.expectedCommitment <== oldCommitment;
    renewal.expectedNullifier <== nullifier;

    newCommitment <== renewal.renewedCommitment;
    spentNullifier <== renewal.validatedNullifier;
}

component main = RenewalTransaction();
