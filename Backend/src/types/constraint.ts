// The type of a single symbol
// witness: -1 refer to the private symbol or replaced by substitution
export type SymbolObject = {
    index: number;
    witness: number;
    component: number;
    name: string;
};

// The type of a single constraint
// The key is the variable, and the value is the coefficient
export interface ConstraintComponent {
    [key: string]: string | number;
}

export type ConstraintObject = [ConstraintComponent, ConstraintComponent, ConstraintComponent];

// The type for substitutions
export interface SubstitutionObject {
    [key: string]: string | number;
}

export type SubstitutionMap = {
    [key: string]: SubstitutionObject;
}

// A circuit contains a symbol, a constraint and a substitution
export type circuitData = {
    symbols: SymbolObject[];
    constraints: ConstraintObject[];
    substitutions: SubstitutionMap;
}

export type qapData = {
    numVars: number;
    numConstraints: number;
    qapPolysA: any[];
    qapPolysB: any[];
    qapPolysC: any[];
    zPoly: any[];
    evaluationPoints: any[];
};