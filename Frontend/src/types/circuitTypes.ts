// ------------------------ data type ------------------------

export type SymbolObject = {
    index: number;
    witness: number;
    component: number;
    name: string;
};

export interface ConstraintComponent {
    [key: string]: string | number;
}

export type ConstraintObject = [ConstraintComponent, ConstraintComponent, ConstraintComponent];

export interface SubstitutionObject {
    [key: string]: string | number;
}

export type SubstitutionMap = {
    [key: string]: SubstitutionObject;
}

export type circuitData = {
    symbols: SymbolObject[];
    constraints: ConstraintObject[];
    substitutions: SubstitutionMap;
}

export type QAPData = {
    numVars: number;
    numConstraints: number;
    qapPolysA: any[];
    qapPolysB: any[];
    qapPolysC: any[];
    zPoly: any[];
    evaluationPoints: any[];
};

// ------------------------ svg type ------------------------

export type NodeType = 'signal' | 'constant' | 'add' | 'mul' | 'equation';
export type QAPNode = {
    id: number;
    symbolId: number; // signal index
    type: NodeType;
    name: string; // Signal name
    component: number; // Signal component
    coefficient?: string;
};

export type QAPLink = {
    source: number; // source symbolId
    target: number; // target symbolId
};

