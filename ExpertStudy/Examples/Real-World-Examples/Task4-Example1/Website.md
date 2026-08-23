# Source websites

- zkbugs case: https://github.com/zksecurity/zkbugs/tree/main/dataset/circom/selfxyz/self/zksecurity_missing_boolean_constraints_in_the_merkle_tree_path_leads_to_an_attacker_being_able_to_craft_a_fake_merkle_proof_for_an_arbitrary_leaf
- Upstream project: https://github.com/selfxyz/self
- Vulnerable commit: https://github.com/selfxyz/self/commit/4f18c75041bb47c1862169eef82c22067642a83a
- Original project entrypoint: https://github.com/selfxyz/self/blob/4f18c75041bb47c1862169eef82c22067642a83a/circuits/circuits/register_id/instances/register_id_sha256_sha256_sha256_rsa_65537_4096.circom
- Fix commit: https://github.com/selfxyz/self/commit/8801c6c1d793896a778c4b597531bc710995d30c
- Audit report: https://github.com/zksecurity/zkbugs/blob/main/reports/documents/zksecurity-celo-self-audit-2.pdf

The vulnerable `BinaryMerkleRoot` implementation comes from the project's `@zk-kit/binary-merkle-root.circom` dependency and is not tracked directly in the upstream repository. zkbugs preserves the extracted vulnerable dependency source as `binary-merkle-root.circom`; that exact file is copied into both `zkbugs-case-files/` and its dependency-relative path under `original-code/`.

