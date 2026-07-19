pragma circom 2.2.3;

template BasePay() {
    signal input hours;
    signal input rate;
    signal output base;

    base <== hours * rate;
}

template AddBonus() {
    signal input base;
    signal input bonus;
    signal output gross;

    gross <== base + bonus;
}

template TaxCalc() {
    signal input gross;
    signal input taxRate;
    signal output tax;

    tax <== gross * taxRate;
}

template NetPay_Bug() {
    signal input gross;
    signal input tax;
    signal output net;

    // BUG:
    // Developer intended:
    //   net <== gross - tax;
    //
    // Actual:
    //   net = gross * tax
    net <== gross * tax;
}

template Payroll_Bug() {
    signal input hours;
    signal input rate;
    signal input bonus;
    signal input taxRate;

    signal output net;

    component base = BasePay();
    component gross = AddBonus();
    component tax = TaxCalc();
    component netPay = NetPay_Bug();

    base.hours <== hours;
    base.rate <== rate;

    gross.base <== base.base;
    gross.bonus <== bonus;

    tax.gross <== gross.gross;
    tax.taxRate <== taxRate;

    netPay.gross <== gross.gross;
    netPay.tax <== tax.tax;

    net <== netPay.net;
}