# Alignment Report for the Expert-Study Stimuli

## Purpose

The files under each `TaskN-ExampleN/aligned-code/` directory are controlled study stimuli derived from the documented real-world vulnerabilities. They are not verbatim upstream files. The untouched upstream material remains under `original-code/`, `original-entrypoint/`, and `zkbugs-case-files/`.

The alignment keeps the original vulnerability mechanism, recognizable template and signal names, and the dataflow needed to diagnose the root cause. Unrelated cryptographic implementations, generated wrappers, package dependencies, and application-specific plumbing were removed.

## Common alignment target

- One self-contained Circom entrypoint: `aligned-code/main.circom`.
- Circom version: `2.1.9` syntax; verified with Circom compiler `2.2.3`.
- Physical source size: approximately 100 lines.
- Five or six compiled template types per example.
- A small hierarchical application wrapper around the vulnerable template.
- No comments or labels that disclose the bug location.
- Task 3 examples use six repeated scopes so that scope comparison has comparable visual density.
- Context/digest logic supplies realistic, correctly constrained surrounding computation without adding a second intended bug.

Exact R1CS equality was not forced with meaningless padding constraints. Constraint counts are kept in the same small-study range while allowing the four bug mechanisms to retain their characteristic structures. For example, equality and bit-decomposition gadgets naturally generate more constraints than an omitted assignment.

## Final metrics

Metrics were collected with Circom compiler 2.2.3 using explicit O1 optimization.

| Example | LOC | Nonblank LOC | Template types | Constraints | Wires | Labels |
|---|---:|---:|---:|---:|---:|---:|
| Task1-Example1 | 101 | 85 | 5 | 22 | 37 | 87 |
| Task1-Example2 | 103 | 86 | 6 | 20 | 32 | 78 |
| Task1-Example3 | 102 | 87 | 5 | 22 | 38 | 78 |
| Task2-Example1 | 98 | 82 | 6 | 25 | 43 | 165 |
| Task2-Example2 | 100 | 83 | 6 | 26 | 38 | 130 |
| Task2-Example3 | 107 | 88 | 6 | 24 | 44 | 116 |
| Task3-Example1 | 102 | 85 | 6 | 55 | 77 | 200 |
| Task3-Example2 | 100 | 82 | 6 | 33 | 37 | 97 |
| Task3-Example3 | 102 | 88 | 5 | 31 | 49 | 160 |
| Task4-Example1 | 102 | 84 | 6 | 41 | 67 | 174 |
| Task4-Example2 | 109 | 91 | 6 | 25 | 41 | 86 |
| Task4-Example3 | 94 | 77 | 6 | 41 | 51 | 78 |

Observed ranges are 94--109 physical LOC, 77--91 nonblank LOC, 5--6 template types, and 20--55 optimized constraints.

## Preserved vulnerability mechanisms

| Example | Mechanism retained in `aligned-code` |
|---|---|
| Task1-Example1 | `EdDSAPoseidonVerifier.enabled` is wired to constant zero inside `OwnershipProof`. |
| Task1-Example2 | `ForceEqualIfEnabled.enabled` is wired to the spend private key, so zero disables nullifier equality. |
| Task1-Example3 | The note commitment uses the public nullifier key while the nullifier uses an independently supplied private key, with no key-pair binding. |
| Task2-Example1 | Every `ArrayXOR.out[i]` is computed with witness-only assignment `<--`. |
| Task2-Example2 | `shiftedFirstByte` is computed with witness-only right shift and then used as the extracted length. |
| Task2-Example3 | `Base64DecodedLength.decoded_len` is declared and consumed downstream but never assigned from the constrained quotient/remainder. |
| Task3-Example1 | Each three-byte country should start at `i * 3`, but repeated checks start at `i`. |
| Task3-Example2 | Six zone slots exist, but equality checks are instantiated only for offsets zero through four. |
| Task3-Example3 | One encrypted segment uses `drv_mGrY` instead of `drv_mGrY_final`, unlike its sibling scopes. |
| Task4-Example1 | Merkle path selectors consume `indices[i]` without Boolean constraints. |
| Task4-Example2 | Decimal remainder witnesses are constrained by reconstruction equations but not to the range zero through nine. |
| Task4-Example3 | `LessThan` is used without enforcing the required bit-length bounds on its caller inputs. |

## Baseline build

Each example retains the same seven participant-visible baseline artifacts under `build/`:

- `main.r1cs`
- `main_constraints.json`
- `main.sym`
- `main_substitutions.json`
- `compile.log`
- `inspect.log`
- `circomspect.log`

The four compiler artifacts and the plain-text compile log are generated from inside each `TaskN-ExampleN` directory with:

```bash
circom aligned-code/main.circom \
  --r1cs \
  --json \
  --sym \
  --simplification_substitution \
  --O1 \
  -o build
```

The inspection log is generated with the same compiler and O1 setting:

```bash
circom aligned-code/main.circom \
  --inspect \
  --O1 \
  -o build
```

The static-analysis log is generated at Circomspect's default WARNING level:

```bash
circomspect aligned-code/main.circom > build/circomspect.log 2>&1
```

All twelve aligned entrypoints compiled successfully with Circom 2.2.3. The JSON files were parsed, the R1CS files were checked with snarkjs 0.7.5, and the source files were analyzed with Circomspect 0.9.0 during baseline preparation.

## Study-use note

Source-size alignment removes a major confound, but it does not by itself establish equal task difficulty. Before the formal study, use a small pilot to measure median localization time and false leads. Select two examples per task whose pilot distributions are closest, and keep the third as a replacement case.

