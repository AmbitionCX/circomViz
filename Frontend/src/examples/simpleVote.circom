pragma circom 2.2.2;

template IsAdult() {
    signal input age;
    signal output isAdult;

    // Calculate age - 18
    signal diff <== age - 18;

    // Check if diff >= 0
    signal isNonNegative <-- (diff >= 0) ? 1 : 0;
    isNonNegative * (isNonNegative - 1) === 0;
    isAdult <== isNonNegative;

    isAdult * diff === diff;  // If isAdult=1, diff must equal itself (>=0)
}

template IsValidVote() {
    signal input vote;
    signal output isValid;

    // Check 1 <= vote <= 5
    signal lowerBound <== vote - 1;
    signal upperBound <== 5 - vote;

    // Check lowerBound >=0
    signal isLowerValid <-- (lowerBound >= 0) ? 1 : 0;
    isLowerValid * (isLowerValid - 1) === 0;
    isLowerValid * lowerBound === lowerBound;

    // Check upperBound >=0
    signal isUpperValid <-- (upperBound >= 0) ? 1 : 0;
    isUpperValid * (isUpperValid - 1) === 0;
    isUpperValid * upperBound === upperBound;

    // Both bounds must be valid
    isValid <== isLowerValid * isUpperValid;
}

template ComputeChecksum() {
    signal input vote;
    signal input age;
    signal output checksum;
    checksum <== vote + age;
}

template SimpleVote() {
    signal input age;
    signal input vote;
    signal output checksum;

    component isAdult = IsAdult();
    isAdult.age <== age;

    component isValidVote = IsValidVote();
    isValidVote.vote <== vote;

    // Enforce valid vote from adult
    isAdult.isAdult * isValidVote.isValid === 1;

    component checksumCalc = ComputeChecksum();
    checksumCalc.vote <== vote;
    checksumCalc.age <== age;
    checksum <== checksumCalc.checksum;
}

component main { public [ vote ] } = SimpleVote();