# Static Code Analysis for Circom

This module provides static code analysis for Circom circuits, focusing on detecting unsafe assignments and signal usage patterns.

## Features

- **Unsafe Assignment Detection**: Identifies signals assigned with `<--` or `-->` operators that don't participate in constraints
- **Declared But Never Constrained Signals**: Finds intermediate signals that are declared but never used in any constraint
- **Suspicious Signal Patterns**: Detects potentially problematic signal usage patterns

## Severity Levels

- **High**: Witness-only signals assigned with `<--` or `-->` that don't appear in any R1CS constraint
- **Medium**: Unsafe assignments that appear in constraints but need manual review
- **Low**: Low priority warnings for code quality improvements

## Usage

### API Endpoint

**POST** `/static_analysis`

**Request Body**:
```typescript
{
  code: string;           // Circom source code
  symPath: string;        // Path to .sym file
  constraintsJsonPath: string; // Path to constraints.json file
}
```

**Response**:
```typescript
{
  success: boolean;
  findings: Array<{
    severity: 'high' | 'medium' | 'low';
    type: string;
    message: string;
    file?: string;
    line?: number;
  }>;
  error?: string;
}
```

### Programmatic Usage

```typescript
import { CircomLexer } from './core/parser/lexer.js';
import { CircomParser } from './core/parser/parser.js';
import { runStaticAnalysis } from './core/staticAnalyzer/analyzer.js';

const code = `
  template Test() {
    signal input a;
    signal output b;
    signal intermediate c;
    
    c <-- a + 1;  // Unsafe assignment!
    b <== c;
  }
`;

const lexer = new CircomLexer(code);
const parser = new CircomParser(lexer);
const ast = parser.parse(code, 'test.circom');

const findings = runStaticAnalysis(
  ast,
  'path/to/sym/file.sym',
  'path/to/constraints.json'
);

console.log(findings);
```

## Analysis Types

### 1. Witness-Only Signal
**Severity**: High

Detects signals that are assigned using `<--` or `-->` operators but never appear in any R1CS constraint.

**Example**:
```circom
signal intermediate c;
c <-- a + 1;  // This is a witness-only assignment
```

**Message**: `Signal c is assigned with <-- at line 5, but does not appear in any R1CS constraint.`

### 2. Unsafe Assignment Needs Review
**Severity**: Medium

Detects signals assigned with `<--` or `-->` that do appear in constraints but require manual verification.

**Example**:
```circom
b <-- a + 1;
b === a + 1;  // Constraint appears, but verify correctness
```

**Message**: `Signal b is assigned with <-- at line 5. It does appear in constraints, but you still need to confirm the intended relation is fully enforced.`

### 3. Declared But Never Constrained
**Severity**: Medium

Finds intermediate signals that are declared but never used in any constraint.

**Example**:
```circom
signal intermediate c;
signal intermediate d;
// c and d are never constrained
```

**Message**: `Intermediate signal c (line 3) is declared but never appears in any constraint.`

## Implementation Details

### AST Analysis

The analyzer walks through the AST to identify:
1. All `<--` and `-->` assignments
2. All `<==`, `==>`, and `===` constraint statements
3. All signal declarations

### Constraint Cross-Check

The analyzer parses the `.sym` file and `constraints.json` file to determine which signals actually participate in constraints. This provides definitive evidence of signal usage, rather than relying on text-based heuristics.

### Signal Name Mapping

Signal names from the AST are mapped to signal IDs from the `.sym` file. This mapping allows the analyzer to cross-reference AST findings with actual R1CS constraints.

## Best Practices

1. **Always use constraint operators** (`<==`, `==>`, `===`) when you need R1CS constraints
2. **Use `<--` and `-->` only** for witness values that don't need constraints
3. **Review all high-severity findings** before deployment
4. **Keep intermediate signals minimal** to reduce analysis complexity

## Limitations

- The analyzer requires compiled circuit artifacts (`.sym` and `constraints.json`)
- False positives may occur for signals used in template instantiations
- Complex control flow (loops, conditionals) may produce incomplete results

## Future Enhancements

- Add support for detecting unused signals
- Improve analysis of template instantiations
- Add suggestions for fixing detected issues
- Support for detecting circular dependencies
