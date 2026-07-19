pragma circom 2.2.3;

template ToyCommit2() {
    signal input x;
    signal input secret;
    signal output commitment;

    commitment <== x * 13 + secret * 17;
}

template MatchCalculator() {
    signal input donation;
    signal input matchRate;
    signal output matchAmount;

    matchAmount <== donation * matchRate;
}

template DonorRecord() {
    signal input donorId;
    signal input donorSecret;
    signal output donorCommit;

    component c = ToyCommit2();

    c.x <== donorId;
    c.secret <== donorSecret;

    donorCommit <== c.commitment;
}

template CampaignRecord() {
    signal input campaignId;
    signal input campaignSecret;
    signal output campaignCommit;

    component c = ToyCommit2();

    c.x <== campaignId;
    c.secret <== campaignSecret;

    campaignCommit <== c.commitment;
}

template DonationMatch_Bug() {
    signal input donorId;
    signal input donorSecret;

    signal input campaignId;
    signal input campaignSecret;

    signal input donation;
    signal input matchRate;

    signal output donorCommit;
    signal output campaignCommit;
    signal output matchAmount;

    component donor = DonorRecord();
    component campaign = CampaignRecord();
    component match = MatchCalculator();

    donor.donorId <== donorId;
    donor.donorSecret <== donorSecret;

    campaign.campaignId <== campaignId;
    campaign.campaignSecret <== campaignSecret;

    match.donation <== donation;
    match.matchRate <== matchRate;

    donorCommit <== donor.donorCommit;
    campaignCommit <== campaign.campaignCommit;
    matchAmount <== match.matchAmount;

    // BUG:
    // Leftover debug constraint.
    // No intended relation requires donorId = campaignId.
    donorId === campaignId;
}