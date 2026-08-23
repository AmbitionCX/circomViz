# Source websites

- zkbugs case: https://github.com/zksecurity/zkbugs/tree/main/dataset/circom/aptos-labs/keyless-zk-proofs/koukyosyumei_unconstrained_base64_decoded_len
- Upstream project: https://github.com/aptos-labs/keyless-zk-proofs
- Vulnerable commit: https://github.com/aptos-labs/keyless-zk-proofs/commit/fd160220a88a5becf0f91ea1a5425fdd537c7399
- Vulnerable source: https://github.com/aptos-labs/keyless-zk-proofs/blob/fd160220a88a5becf0f91ea1a5425fdd537c7399/circuit/templates/helpers/misc.circom
- Original parent template: https://github.com/aptos-labs/keyless-zk-proofs/blob/fd160220a88a5becf0f91ea1a5425fdd537c7399/circuit/templates/mainTemplate.circom
- Fix commit: https://github.com/aptos-labs/keyless-zk-proofs/commit/fa943244d45cb733626e54108a0ce7e10bcba5c3
- Upstream issue: https://github.com/aptos-labs/keyless-zk-proofs/issues/50

The generated direct entrypoint named by zkbugs is not tracked in the vulnerable upstream commit. The real parent template that invokes `Base64DecodedLength` is included under `original-entrypoint/`.

