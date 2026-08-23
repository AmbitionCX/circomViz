pragma circom 2.1.9;

template PointAdd() {
    signal input x1;
    signal input y1;
    signal input x2;
    signal input y2;
    signal output xout;
    signal output yout;

    xout <== x1 + x2 * 17;
    yout <== y1 + y2 * 19;
}

template SegmentDigest(N) {
    signal input x[N];
    signal input y[N];
    signal output out;
    signal acc[N + 1];

    acc[0] <== 0;
    for (var i = 0; i < N; i++) {
        acc[i + 1] <== acc[i] + x[i] * (i + 3) + y[i] * (i + 5);
    }
    out <== acc[N];
}

template DataEscrowElGamalEncryption() {
    signal input paddingPoint[6][2];
    signal input ephemeralSharedKey[2];
    signal input hidingPoint[2];
    signal output encryptedMessage[6][2];
    signal output messageDigest;

    component drv_mGrY[6];
    component drv_mGrY_final[6];
    for (var j = 0; j < 6; j++) {
        drv_mGrY[j] = PointAdd();
        drv_mGrY[j].x1 <== paddingPoint[j][0];
        drv_mGrY[j].y1 <== paddingPoint[j][1];
        drv_mGrY[j].x2 <== ephemeralSharedKey[0];
        drv_mGrY[j].y2 <== ephemeralSharedKey[1];
    }

    for (var j = 0; j < 6; j++) {
        drv_mGrY_final[j] = PointAdd();
        drv_mGrY_final[j].x1 <== drv_mGrY[j].xout;
        drv_mGrY_final[j].y1 <== drv_mGrY[j].yout;
        drv_mGrY_final[j].x2 <== hidingPoint[0];
        drv_mGrY_final[j].y2 <== hidingPoint[1];
    }

    component digest = SegmentDigest(6);
    for (var j = 0; j < 6; j++) {
        if (j == 3) {
            encryptedMessage[j][0] <== drv_mGrY[j].xout;
            encryptedMessage[j][1] <== drv_mGrY[j].yout;
        } else {
            encryptedMessage[j][0] <== drv_mGrY_final[j].xout;
            encryptedMessage[j][1] <== drv_mGrY_final[j].yout;
        }
        digest.x[j] <== encryptedMessage[j][0];
        digest.y[j] <== encryptedMessage[j][1];
    }
    messageDigest <== digest.out;
}

template EscrowRecord() {
    signal input paddingPoint[6][2];
    signal input sharedKey[2];
    signal input hidingPoint[2];
    signal input expectedDigest;
    signal input recordNonce;
    signal output recordTag;

    component encryption = DataEscrowElGamalEncryption();
    encryption.paddingPoint <== paddingPoint;
    encryption.ephemeralSharedKey <== sharedKey;
    encryption.hidingPoint <== hidingPoint;
    encryption.messageDigest === expectedDigest;

    recordTag <== encryption.messageDigest + recordNonce * 43;
}

template EscrowCircuit() {
    signal input paddingPoint[6][2];
    signal input sharedKey[2];
    signal input hidingPoint[2];
    signal input expectedDigest;
    signal input recordNonce;
    signal output tag;

    component record = EscrowRecord();
    record.paddingPoint <== paddingPoint;
    record.sharedKey <== sharedKey;
    record.hidingPoint <== hidingPoint;
    record.expectedDigest <== expectedDigest;
    record.recordNonce <== recordNonce;
    tag <== record.recordTag;
}

component main = EscrowCircuit();
