export type SubmoduleInfo = {
  id: string;
  name: string;
  entry: string;
  rootComponent: string;
  description: string;
}

type SubmodulesMap = Record<string, SubmoduleInfo>;

// submodules list
const SUBMODULES: SubmodulesMap = {
  'zk-email-verify': {
    id: 'zk-email-verify',
    name: 'ZK Email Verify',
    entry: 'packages/circuits/email-verifier.circom',
    rootComponent: 'EmailVerifier',
    description: 'Email signature verification circuit'
  },
  'anon-aadhaar': {
    id: 'anon-aadhaar',
    name: 'Anon Aadhaar',
    entry: 'packages/circuits/src/aadhaar-verifier.circom',
    rootComponent: 'AadhaarQRVerifier',
    description: 'Aadhaar identity proof circuit'
  },
  'zksync-social-login-circuit': {
    id: 'zksync-social-login-circuit',
    name: 'ZKSync Social Login',
    entry: 'jwt-tx-validation.circom',
    rootComponent: 'main',
    description: 'JWT/OIDC social login circuit'
  },
  'zk-franchise-proof-circuit': {
    id: 'zk-franchise-proof-circuit',
    name: 'ZK Franchise Proof',
    entry: 'circuit/census.circom',
    rootComponent: 'ZkFranchiseProofCircuit',
    description: 'Anonymous voting circuit'
  },
  'semaphore': {
    id: 'semaphore',
    name: 'Semaphore',
    entry: 'packages/circuits/src/semaphore.circom',
    rootComponent: 'Semaphore',
    description: 'Anonymous group membership circuit'
  }
};

export async function getSubmodules(): Promise<SubmoduleInfo[]> {
  return Object.values(SUBMODULES);
}

export async function getSubmoduleById(id: string): Promise<SubmoduleInfo | null> {
  return SUBMODULES[id] || null;
}
