export type SubmoduleInfo = Readonly<{
  id: string;
  name: string;
  entry: string;
  rootComponent: string;
  rootArguments?: readonly number[];
  description: string;
}>;

// Hard coded meta data of circom code
// We don't need to analysis entrance of a repo at current stage
export class CircomParser {
  private static readonly EXAMPLES = [
    {
      id: 'DonationMatch_Bug',
      name: 'Donation Match',
      entry: 'DonationMatch_Bug.circom',
      rootComponent: 'DonationMatch_Bug',
      description: 'Overconstraint / extra unintended relation'
    },
    {
      id: 'GoldDiscount_Bug',
      name: 'Gold Discount',
      entry: 'GoldDiscount_Bug.circom',
      rootComponent: 'GoldDiscount_Bug',
      description: 'Unsafe component boundary usage'
    },
    {
      id: 'LoyaltyReward_Bug',
      name: 'Loyalty Reward',
      entry: 'LoyaltyReward_Bug.circom',
      rootComponent: 'LoyaltyReward_Bug',
      description: 'Missing constraint / witness-only computation'
    },
    {
      id: 'MerkleRoot2_Bug',
      name: 'Merkle Root 2',
      entry: 'MerkleRoot2_Bug.circom',
      rootComponent: 'MerkleRoot2_Bug',
      description: 'Index/branch/selector logic error'
    },
    {
      id: 'Payroll_Bug',
      name: 'Payroll',
      entry: 'Payroll_Bug.circom',
      rootComponent: 'Payroll_Bug',
      description: 'Wrong local arithmetic relation'
    },
    {
      id: 'TwoFactorLogin_Bug',
      name: 'Two Factor Login',
      entry: 'TwoFactorLogin_Bug.circom',
      rootComponent: 'TwoFactorLogin_Bug',
      description: 'Wrong dependency / wrong wiring'
    },
    {
      id: 'WithdrawalLimit_Bug',
      name: 'Withdrawal Limit',
      entry: 'WithdrawalLimit_Bug.circom',
      rootComponent: 'WithdrawalLimit_Bug',
      description: 'Integer/range/field semantic mismatch'
    }
  ] as const;

  private static readonly SUBMODULES = [
    {
      id: 'zk-email-verify',
      name: 'ZK Email Verify',
      entry: 'packages/circuits/email-verifier.circom',
      rootComponent: 'EmailVerifier',
      rootArguments: [640, 768, 121, 17, 0, 0, 0, 0],
      description: 'Email signature verification circuit'
    },
    {
      id: 'anon-aadhaar',
      name: 'Anon Aadhaar',
      entry: 'packages/circuits/src/aadhaar-verifier.circom',
      rootComponent: 'main',
      description: 'Aadhaar identity proof circuit'
    },
    {
      id: 'zksync-social-login-circuit',
      name: 'ZKSync Social Login',
      entry: 'jwt-tx-validation.circom',
      rootComponent: 'main',
      description: 'JWT/OIDC social login circuit'
    },
    {
      id: 'zk-franchise-proof-circuit',
      name: 'ZK Franchise Proof',
      entry: 'circuit/census.circom',
      rootComponent: 'ZkFranchiseProofCircuit',
      rootArguments: [160],
      description: 'Anonymous voting circuit'
    },
    {
      id: 'semaphore',
      name: 'Semaphore',
      entry: 'packages/circuits/src/semaphore.circom',
      rootComponent: 'Semaphore',
      rootArguments: [20],
      description: 'Anonymous group membership circuit'
    }
  ] as const;

  static getSubmoduleById(id: string): SubmoduleInfo | null {
    return this.SUBMODULES.find(s => s.id === id) || null;
  }

  static getAllSubmodules(): readonly SubmoduleInfo[] {
    return this.SUBMODULES;
  }

  static getExampleById(id: string): SubmoduleInfo | null {
    return this.EXAMPLES.find(s => s.id === id) || null;
  }

  static getAllExamples(): readonly SubmoduleInfo[] {
    return this.EXAMPLES;
  }
}

