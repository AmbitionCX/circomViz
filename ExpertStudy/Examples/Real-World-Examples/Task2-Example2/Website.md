# Source websites

- zkbugs case: https://github.com/zksecurity/zkbugs/tree/main/dataset/circom/siv-org/verifiable-private-overrides/koukyosyumei_extractstringfrompoint_shiftedfirstbyte_unconstrained
- Upstream project: https://github.com/siv-org/verifiable-private-overrides
- Vulnerable commit: https://github.com/siv-org/verifiable-private-overrides/commit/7bda2311d7a33dcab611cfea0c67707b0b65c24c
- Vulnerable source: https://github.com/siv-org/verifiable-private-overrides/blob/7bda2311d7a33dcab611cfea0c67707b0b65c24c/circuits/ExtractStringFromPoint.circom
- Fix commit: https://github.com/siv-org/verifiable-private-overrides/commit/7c3402dda19010e7ff6c3987b6fa72b076e9b159
- Upstream pull request: https://github.com/siv-org/verifiable-private-overrides/pull/13

The `circuits/generated/extract_string_from_point_main.circom` entrypoint named by zkbugs is generated during dataset setup and is not tracked in the vulnerable upstream commit. The generated/direct wrapper is retained under `zkbugs-case-files/`.

