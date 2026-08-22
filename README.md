# circomViz

- node version: v24.19.0
- pnpm version: 11.22.0

## Initial setup for Frontend
The frontend is built with **Vite + Vue3 + TypeScript + Element-Plus + Tailwind CSS**. To run the frontend, run the following command in the root directory of the project:

```shell
cd Frontend
pnpm install
pnpm run dev
```

## Initial setup for Backend

Install [circom](https://github.com/iden3/circom) before running the backend. You can download from [GitHub release page](https://github.com/iden3/circom/releases) (recommended), and make it executable by running:
```shell
chmod +x ./circom-linux-amd64
cp ./circom-linux-amd64 /usr/local/bin/circom
circom --version
```
Or build manually:
```shell
git clone https://github.com/iden3/circom.git
cargo build --release
cargo install --path circom
# install the circom binary in the directory $HOME/.cargo/bin
circom --version
```

The backend is built with **TypeScript + Fastify**. To run the backend, run the following command in the root directory of the project:
```shell
pnpm install
pnpm run build
pnpm run start
```

## Submodules
These submodules are used as a small real-world Circom corpus for parsing experiments. They cover diverse application domains, including email verification, Aadhaar-based identity proofs, JWT/OIDC social login, anonymous group membership, and anonymous voting. Together, they provide varied circuit organizations, dependency styles, and template structures for benchmarking include resolution, template extraction, and component-tree construction.

- **anon-aadhaar**: A Circom circuit implementation of the Anon Aadhaar protocol, centered around Aadhaar QR data verification, signature validation, information extraction, and nullifier generation. Its circuits README explicitly outlines the main entry point and auxiliary module structure.

- **zksync-social-login-circuit**: A circuit for validating JWT/OIDC social login credentials. The primary circuit is jwt-tx-validation.circom, which leverages a mix of local utils/* libraries, circomlib, and @zk-email/circuits dependencies.

- **zk-franchise-proof-circuit**: Vocdoni's anonymous voting census proof circuit, with the main circuit located at circuit/census.circom. It relies on Poseidon, comparators, and SMTVerifier, making it suitable for analyzing proof structures related to voting and membership.

- **semaphore**: An anonymous member proof circuit for Semaphore, whose core logic encompasses identity commitment, Merkle membership proof, and nullifier generation. It is well-suited for analyzing Circom templates characterized by clear structure but library-centric design.

- **zk-email-verify**: The core circuit library for ZK Email, primarily used for email signature verification, DKIM/RSA-related proofs, and reusable Circom tool templates. Its @zk-email/circuits component functions more as a circuit library rather than a single main entry application.
