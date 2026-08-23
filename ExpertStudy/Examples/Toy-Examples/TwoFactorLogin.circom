pragma circom 2.2.3;

template ToyHash() {
    signal input x;
    signal input domain;
    signal output h;

    h <== x * x + domain;
}

template PasswordHasher() {
    signal input password;
    signal output out;

    component h = ToyHash();

    h.x <== password;
    h.domain <== 11;

    out <== h.h;
}

template OTPHasher() {
    signal input otp;
    signal output out;

    component h = ToyHash();

    h.x <== otp;
    h.domain <== 17;

    out <== h.h;
}

template CombineFactors() {
    signal input passwordHash;
    signal input otpHash;
    signal input userId;
    signal output loginCommit;

    loginCommit <== passwordHash * 13 + otpHash * 19 + userId;
}

template OTPAuditTag() {
    signal input otpHash;
    signal output tag;

    tag <== otpHash * 23 + 5;
}

template TwoFactorLogin() {
    signal input password;
    signal input otp;
    signal input userId;

    signal output loginCommit;
    signal output otpAuditTag;

    component p = PasswordHasher();
    component o = OTPHasher();
    component comb = CombineFactors();
    component audit = OTPAuditTag();

    p.password <== password;
    o.otp <== otp;

    comb.passwordHash <== p.out;

    comb.otpHash <== o.out;

    comb.userId <== userId;

    audit.otpHash <== o.out;

    loginCommit <== comb.loginCommit;
    otpAuditTag <== audit.tag;
}

component main = TwoFactorLogin();
