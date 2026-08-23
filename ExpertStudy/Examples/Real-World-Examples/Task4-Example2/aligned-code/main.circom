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

template DateEncoder() {
    signal input day;
    signal input month;
    signal input year;
    signal output encoded[3];

    signal dayDecimals <-- day \ 10;
    signal dayRest <-- day % 10;
    dayDecimals * 10 + dayRest === day;

    signal monthDecimals <-- month \ 10;
    signal monthRest <-- month % 10;
    monthDecimals * 10 + monthRest === month;

    signal yearDecimals <-- year \ 10;
    signal yearRest <-- year % 10;
    yearDecimals * 10 + yearRest === year;

    encoded[0] <== dayDecimals * 256 + dayRest + 12336;
    encoded[1] <== monthDecimals * 256 + monthRest + 12336;
    encoded[2] <== yearDecimals * 256 + yearRest + 12336;
}

template DateDigest() {
    signal input encodedDate[3];
    signal input contextDigest;
    signal output out;

    signal firstPair <== encodedDate[0] * 17 + encodedDate[1] * 19;
    out <== firstPair + encodedDate[2] * 23 + contextDigest * 29;
}

template PassportRecord() {
    signal input day;
    signal input month;
    signal input year;
    signal input context[8];
    signal input expectedContextDigest;
    signal output recordCommitment;

    component date = DateEncoder();
    date.day <== day;
    date.month <== month;
    date.year <== year;

    component contextHasher = LinearDigest(8);
    contextHasher.in <== context;
    contextHasher.out === expectedContextDigest;

    component dateHasher = DateDigest();
    dateHasher.encodedDate <== date.encoded;
    dateHasher.contextDigest <== contextHasher.out;
    recordCommitment <== dateHasher.out;
}

template IdentityQuery() {
    signal input day;
    signal input month;
    signal input year;
    signal input context[8];
    signal input expectedContextDigest;
    signal input queryNonce;
    signal output queryTag;

    component passport = PassportRecord();
    passport.day <== day;
    passport.month <== month;
    passport.year <== year;
    passport.context <== context;
    passport.expectedContextDigest <== expectedContextDigest;
    queryTag <== passport.recordCommitment + queryNonce * 37;
}

template DateCircuit() {
    signal input day;
    signal input month;
    signal input year;
    signal input context[8];
    signal input expectedContextDigest;
    signal input queryNonce;
    signal output tag;

    component query = IdentityQuery();
    query.day <== day;
    query.month <== month;
    query.year <== year;
    query.context <== context;
    query.expectedContextDigest <== expectedContextDigest;
    query.queryNonce <== queryNonce;
    tag <== query.queryTag;
}

component main = DateCircuit();
