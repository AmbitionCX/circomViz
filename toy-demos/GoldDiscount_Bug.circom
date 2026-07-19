pragma circom 2.2.3;

template IsZero() {
    signal input in;
    signal output out;

    signal inv;

    inv <-- in != 0 ? 1 / in : 0;

    out <== 1 - in * inv;
    in * out === 0;
}

template EqualConst(c) {
    signal input x;
    signal output ok;

    signal diff;
    component z = IsZero();

    diff <== x - c;
    z.in <== diff;
    ok <== z.out;
}

template Discount10Pct() {
    signal input price;
    signal output discount;

    discount <== price * 10;
}

template AuditTag() {
    signal input ok;
    signal input price;
    signal output tag;

    tag <== ok * 31 + price;
}

template GoldDiscount_Bug() {
    signal input tier;
    signal input price;

    signal output discount;
    signal output auditTag;

    component isGold = EqualConst(2);
    component d = Discount10Pct();
    component audit = AuditTag();

    isGold.x <== tier;

    d.price <== price;

    audit.ok <== isGold.ok;
    audit.price <== price;

    // BUG:
    // isGold.ok is computed and even sent to auditTag,
    // but it does not constrain the ability to claim discount.
    //
    // Missing:
    //   isGold.ok === 1;
    //
    // Or:
    //   discount <== isGold.ok * d.discount;
    discount <== d.discount;
    auditTag <== audit.tag;
}