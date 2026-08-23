# CircomVis Real-World Bug Examples

This archive collects the twelve documented Circom vulnerabilities selected for the CircomVis expert study.

Each `TaskN-ExampleN` directory contains:

- `README.md`: copied verbatim from the corresponding zkbugs case directory.
- `Website.md`: dataset, upstream source, vulnerable commit, fix, and report/issue links.
- `original-code/`: the vulnerable Circom source at the commit declared by zkbugs. Its project-relative path is preserved.
- `original-entrypoint/`: the original project entrypoint or nearest tracked parent when available.
- `zkbugs-case-files/`: Circom wrapper/extracted files shipped with the zkbugs case.

The files in this archive are raw collection material. The zkbugs README field `Reproduced` should be checked before describing a case as independently reproduced.

| Directory | Documented vulnerability |
|---|---|
| Task1-Example1 | Zkopru ownership proof verification disabled |
| Task1-Example2 | Panther nullifier verification can be disabled |
| Task1-Example3 | Panther zAccount renewal key-pair binding missing |
| Task2-Example1 | Telepathy ArrayXOR assigned but unconstrained |
| Task2-Example2 | SIV shiftedFirstByte assigned but unconstrained |
| Task2-Example3 | Aptos Base64DecodedLength output unconstrained |
| Task3-Example1 | Self forbidden-country indexing error |
| Task3-Example2 | Panther ZoneId inclusion off-by-one |
| Task3-Example3 | Panther data escrow uses incorrect intermediate input |
| Task4-Example1 | Self Merkle path lacks Boolean constraints |
| Task4-Example2 | Rarimo DateEncoder remainder range missing |
| Task4-Example3 | Dark Forest comparator input bit length missing |

