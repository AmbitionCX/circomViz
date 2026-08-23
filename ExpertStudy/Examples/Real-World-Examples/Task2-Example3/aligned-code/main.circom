pragma circom 2.1.9;

template LinearDigest(N) {
    signal input in[N];
    signal output out;
    signal acc[N + 1];

    acc[0] <== 0;
    for (var i = 0; i < N; i++) {
        acc[i + 1] <== acc[i] + in[i] * (i + 7);
    }
    out <== acc[N];
}

template Base64DecodedLength() {
    signal input encoded_len;
    signal output decoded_len;

    signal q <-- encoded_len \ 4;
    signal remainder <-- encoded_len % 4;
    signal remainderBit0 <-- remainder & 1;
    signal remainderBit1 <-- (remainder >> 1) & 1;

    remainderBit0 * (remainderBit0 - 1) === 0;
    remainderBit1 * (remainderBit1 - 1) === 0;
    remainder === remainderBit0 + 2 * remainderBit1;
    encoded_len === q * 4 + remainder;

    signal hasRemainder <== remainderBit0 + remainderBit1
                          - remainderBit0 * remainderBit1;
    signal reducer <== 1 - hasRemainder;
}

template PayloadCommitment() {
    signal input payload[8];
    signal input decodedLength;
    signal input headerTag;
    signal output out;
    signal output payloadDigest;

    component digest = LinearDigest(8);
    for (var i = 0; i < 8; i++) {
        digest.in[i] <== payload[i];
    }
    payloadDigest <== digest.out;
    out <== digest.out + decodedLength * 31 + headerTag * 37;
}

template KeylessMessage() {
    signal input encodedPayloadLength;
    signal input payload[8];
    signal input header[8];
    signal input expectedHeaderTag;
    signal output messageCommitment;

    component decodedLength = Base64DecodedLength();
    decodedLength.encoded_len <== encodedPayloadLength;

    component headerDigest = LinearDigest(8);
    for (var i = 0; i < 8; i++) {
        headerDigest.in[i] <== header[i];
    }
    headerDigest.out === expectedHeaderTag;

    component payloadCommitment = PayloadCommitment();
    payloadCommitment.payload <== payload;
    payloadCommitment.decodedLength <== decodedLength.decoded_len;
    payloadCommitment.headerTag <== headerDigest.out;
    messageCommitment <== payloadCommitment.out;
}

template KeylessProof() {
    signal input encodedPayloadLength;
    signal input payload[8];
    signal input header[8];
    signal input expectedHeaderTag;
    signal input accountSalt;
    signal output accountCommitment;

    component message = KeylessMessage();
    message.encodedPayloadLength <== encodedPayloadLength;
    message.payload <== payload;
    message.header <== header;
    message.expectedHeaderTag <== expectedHeaderTag;

    accountCommitment <== message.messageCommitment + accountSalt * 41;
}

template KeylessCircuit() {
    signal input encodedPayloadLength;
    signal input payload[8];
    signal input header[8];
    signal input expectedHeaderTag;
    signal input accountSalt;
    signal output commitment;

    component proof = KeylessProof();
    proof.encodedPayloadLength <== encodedPayloadLength;
    proof.payload <== payload;
    proof.header <== header;
    proof.expectedHeaderTag <== expectedHeaderTag;
    proof.accountSalt <== accountSalt;
    commitment <== proof.accountCommitment;
}

component main = KeylessCircuit();

