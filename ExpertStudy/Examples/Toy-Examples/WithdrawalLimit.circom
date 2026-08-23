pragma circom 2.2.3;

template Range4() {
    signal input in;
    signal bits[4];

    var acc = 0;
    var pow = 1;

    for (var i = 0; i < 4; i++) {
        bits[i] <-- (in >> i) & 1;
        bits[i] * (bits[i] - 1) === 0;

        acc = acc + bits[i] * pow;
        pow = pow * 2;
    }

    acc === in;
}

template LessThan4() {
    signal input a;
    signal input b;
    signal output out;

    signal encoded;
    signal bits[5];

    encoded <== 16 + a - b;

    var acc = 0;
    var pow = 1;

    for (var i = 0; i < 5; i++) {
        bits[i] <-- (encoded >> i) & 1;
        bits[i] * (bits[i] - 1) === 0;

        acc = acc + bits[i] * pow;
        pow = pow * 2;
    }

    acc === encoded;
    out <== 1 - bits[4];
}

template WithdrawalLimit() {
    signal input amount;
    signal input limit;
    signal output ok;

    component amountRange = Range4();
    component limitRange = Range4();
    component lt = LessThan4();

    amountRange.in <== amount;
    limitRange.in <== limit;

    lt.a <== amount;
    lt.b <== limit;
    lt.out === 1;

    ok <== lt.out;
}

component main = WithdrawalLimit();
