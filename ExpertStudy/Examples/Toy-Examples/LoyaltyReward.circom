pragma circom 2.2.3;

template ScoreFromPurchase() {
    signal input amount;
    signal input rate;
    signal output score;

    score <== amount * rate;
}

template BonusAdder() {
    signal input score;
    signal input bonus;
    signal output total;

    total <== score + bonus;
}

template ToyCommit() {
    signal input value;
    signal input salt;
    signal output commitment;

    commitment <== value * 7 + salt;
}

template LoyaltyReward() {
    signal input amount;
    signal input rate;
    signal input bonus;
    signal input salt;
    signal output commitment;

    component scoreCalc = ScoreFromPurchase();
    component bonusCalc = BonusAdder();
    component commit = ToyCommit();

    scoreCalc.amount <== amount;
    scoreCalc.rate <== rate;

    bonusCalc.score <== scoreCalc.score;
    bonusCalc.bonus <== bonus;

    commit.value <== bonusCalc.total;
    commit.salt <== salt;

    commitment <== commit.commitment;
}

component main = LoyaltyReward();
