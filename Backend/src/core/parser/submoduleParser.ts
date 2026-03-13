export type SubmoduleInfo = Readonly<{
  id: string;
  name: string;
  entry: string;
  rootComponent: string;
  description: string;
}>;

// Hard coded meta data of circom code
// We don't need to analysis entrance of a repo at current stage
export class CircomParser {
  private static readonly SUBMODULES = [
    {
      id: 'zk-email-verify',
      name: 'ZK Email Verify',
      entry: 'packages/circuits/email-verifier.circom',
      rootComponent: 'EmailVerifier',
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
      rootComponent: 'main',
      description: 'Anonymous voting circuit'
    },
    {
      id: 'semaphore',
      name: 'Semaphore',
      entry: 'circuits/semaphore.circom',
      rootComponent: 'Semaphore',
      description: 'Anonymous group membership circuit'
    }
  ] as const;

  static getSubmoduleById(id: string): SubmoduleInfo | null {
    return this.SUBMODULES.find(s => s.id === id) || null;
  }

  static getAllSubmodules(): readonly SubmoduleInfo[] {
    return this.SUBMODULES;
  }
}
