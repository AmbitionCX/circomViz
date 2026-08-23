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

template GoldDiscount() {
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

    discount <== isGold.ok * d.discount;
    auditTag <== audit.tag;
}

component main = GoldDiscount();
