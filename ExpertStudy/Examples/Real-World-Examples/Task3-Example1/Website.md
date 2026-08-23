# Source websites

- zkbugs case: https://github.com/zksecurity/zkbugs/tree/main/dataset/circom/selfxyz/self/zksecurity_exclusion_check_of_forbidden_countries_is_unsound_and_incomplete_due_to_incorrect_indexing
- Upstream project: https://github.com/selfxyz/self
- Vulnerable commit: https://github.com/selfxyz/self/commit/59c16d6e924c946970665504d883ced46981e5c1
- Vulnerable source: https://github.com/selfxyz/self/blob/59c16d6e924c946970665504d883ced46981e5c1/circuits/circuits/utils/passport/disclose/proveCountryIsNotInList.circom
- Original entrypoint: https://github.com/selfxyz/self/blob/59c16d6e924c946970665504d883ced46981e5c1/circuits/circuits/disclose/vc_and_disclose.circom
- Audit report: https://github.com/zksecurity/zkbugs/blob/main/reports/documents/zksecurity-celo-self-audit.pdf

zkbugs does not declare an upstream fix commit for this case.

