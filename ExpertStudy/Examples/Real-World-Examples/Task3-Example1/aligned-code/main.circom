pragma circom 2.1.9;

template IsEqual() {
    signal input in[2];
    signal output out;

    signal diff <== in[0] - in[1];
    signal inverse <-- diff != 0 ? 1 / diff : 0;
    out <== 1 - diff * inverse;
    diff * out === 0;
}

template CountryMatch() {
    signal input passportCountry[3];
    signal input listedCountry[3];
    signal output out;

    signal passportPacked <== passportCountry[0]
                              + passportCountry[1] * 256
                              + passportCountry[2] * 65536;
    signal listedPacked <== listedCountry[0]
                            + listedCountry[1] * 256
                            + listedCountry[2] * 65536;

    component equalCountry = IsEqual();
    equalCountry.in[0] <== passportPacked;
    equalCountry.in[1] <== listedPacked;
    out <== equalCountry.out;
}

template ProveCountryIsNotInList() {
    signal input passportCountry[3];
    signal input forbiddenCountriesList[18];
    signal output isAllowed;

    component countryChecks[6];
    for (var i = 0; i < 6; i++) {
        countryChecks[i] = CountryMatch();
        for (var j = 0; j < 3; j++) {
            countryChecks[i].passportCountry[j] <== passportCountry[j];
            countryChecks[i].listedCountry[j] <== forbiddenCountriesList[i + j];
        }
    }

    signal allowedAcc[7];
    allowedAcc[0] <== 1;
    for (var i = 0; i < 6; i++) {
        allowedAcc[i + 1] <== allowedAcc[i] * (1 - countryChecks[i].out);
    }
    isAllowed <== allowedAcc[6];
}

template ListDigest(N) {
    signal input values[N];
    signal output out;
    signal acc[N + 1];

    acc[0] <== 0;
    for (var i = 0; i < N; i++) {
        acc[i + 1] <== acc[i] + values[i] * (i + 3);
    }
    out <== acc[N];
}

template PassportDisclosure() {
    signal input passportCountry[3];
    signal input forbiddenCountriesList[18];
    signal input expectedListDigest;
    signal input disclosureNonce;
    signal output disclosureTag;

    component policy = ProveCountryIsNotInList();
    policy.passportCountry <== passportCountry;
    policy.forbiddenCountriesList <== forbiddenCountriesList;
    policy.isAllowed === 1;

    component listDigest = ListDigest(18);
    listDigest.values <== forbiddenCountriesList;
    listDigest.out === expectedListDigest;

    disclosureTag <== passportCountry[0] * 31
                     + passportCountry[1] * 37
                     + passportCountry[2] * 41
                     + disclosureNonce;
}

template DisclosureCircuit() {
    signal input passportCountry[3];
    signal input forbiddenCountriesList[18];
    signal input expectedListDigest;
    signal input disclosureNonce;
    signal output tag;

    component disclosure = PassportDisclosure();
    disclosure.passportCountry <== passportCountry;
    disclosure.forbiddenCountriesList <== forbiddenCountriesList;
    disclosure.expectedListDigest <== expectedListDigest;
    disclosure.disclosureNonce <== disclosureNonce;
    tag <== disclosure.disclosureTag;
}

component main = DisclosureCircuit();
