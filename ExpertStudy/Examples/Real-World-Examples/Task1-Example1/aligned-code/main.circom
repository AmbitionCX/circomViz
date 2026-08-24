pragma circom 2.1.9;

template LinearDigest(N) {
    signal input in[N];
    signal output out;
    signal acc[N + 1];
    signal squared[N];

    acc[0] <== 0;
    for (var i = 0; i < N; i++) {
        squared[i] <== in[i] * in[i];
        acc[i + 1] <== acc[i] + squared[i] + in[i] * (i + 3);
    }
    out <== acc[N];
}

template EdDSAPoseidonVerifier() {
    signal input enabled;
    signal input A[2];
    signal input R8[2];
    signal input S;
    signal input M;
    signal output verified;

    signal keyDigest <== A[0] * 5 + A[1] * 7;
    signal responseDigest <== R8[0] * 11 + R8[1] * 13 + S;
    signal expectedDigest <== keyDigest + M * 17;

    (responseDigest - expectedDigest) * enabled === 0;
    verified <== 1;
}

template OwnershipProof() {
    signal input ownerKey[2];
    signal input signatureR8[2];
    signal input signatureS;
    signal input noteSecret;
    signal input context[8];
    signal output ownerCommitment;
    signal output authorizationValid;

    component contextDigest = LinearDigest(8);
    for (var i = 0; i < 8; i++) {
        contextDigest.in[i] <== context[i];
    }

    signal message <== noteSecret * 19 + contextDigest.out;
    ownerCommitment <== ownerKey[0] * 23 + ownerKey[1] * 29 + noteSecret;

    component eddsa = EdDSAPoseidonVerifier();
    eddsa.A[0] <== ownerKey[0];
    eddsa.A[1] <== ownerKey[1];
    eddsa.R8[0] <== signatureR8[0];
    eddsa.R8[1] <== signatureR8[1];
    eddsa.S <== signatureS;
    eddsa.M <== message;
    eddsa.enabled <== 0;

    authorizationValid <== eddsa.verified;
}

template TransferAuthorization() {
    signal input ownerKey[2];
    signal input signatureR8[2];
    signal input signatureS;
    signal input noteSecret;
    signal input context[8];
    signal input expectedCommitment;
    signal output transferApproved;

    component proof = OwnershipProof();
    proof.ownerKey <== ownerKey;
    proof.signatureR8 <== signatureR8;
    proof.signatureS <== signatureS;
    proof.noteSecret <== noteSecret;
    proof.context <== context;

    proof.ownerCommitment === expectedCommitment;
    transferApproved <== proof.authorizationValid;
}

template RollupEntry() {
    signal input ownerKey[2];
    signal input signatureR8[2];
    signal input signatureS;
    signal input noteSecret;
    signal input context[8];
    signal input expectedCommitment;
    signal output accepted;

    component transfer = TransferAuthorization();
    transfer.ownerKey <== ownerKey;
    transfer.signatureR8 <== signatureR8;
    transfer.signatureS <== signatureS;
    transfer.noteSecret <== noteSecret;
    transfer.context <== context;
    transfer.expectedCommitment <== expectedCommitment;
    accepted <== transfer.transferApproved;
}

component main = RollupEntry();
