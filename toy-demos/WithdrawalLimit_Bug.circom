pragma circom 2.2.3;

template Bit() {
    signal input in;

    in * (in - 1) === 0;
}

template Num2Bits(n) {
    signal input in;
    signal output out[n];

    var acc = 0;
    var pow = 1;

    for (var i = 0; i < n; i++) {
        component b = Bit();
        b.in <== out[i];

        acc += out[i] * pow;
        pow = pow * 2;
    }

    acc === in;
}

template Range4() {
    signal input in;

    component bits = Num2Bits(4);
    bits.in <== in;
}

template LessThan4() {
    signal input a;
    signal input b;
    signal output out;

    // Standard small comparator pattern:
    // If a,b are both in [0, 15], then:
    //   out = 1 iff a < b.
    //
    // This template assumes a and b are already 4-bit.
    component bits = Num2Bits(5);

    bits.in <== 16 + a - b;

    // If the 5th bit is 0, then 16 + a - b < 16,
    // which means a < b under the 4-bit precondition.
    out <== 1 - bits.out[4];
}

template WithdrawalLimit_Bug() {
    signal input amount;
    signal input limit;

    signal output ok;

    component limitRange = Range4();
    component lt = LessThan4();

    // Correct:
    // limit is range-constrained.
    limitRange.in <== limit;

    lt.a <== amount;
    lt.b <== limit;

    lt.out === 1;

    // BUG:
    // Missing:
    //   component amountRange = Range4();
    //   amountRange.in <== amount;
    //
    // Without this, LessThan4's integer interpretation is invalid.

    ok <== lt.out;
}