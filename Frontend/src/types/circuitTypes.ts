export type constraintType = {
    coefficient_A: string[];
    lin_expr_A: string[];
    coefficient_B: string[];
    lin_expr_B: string[];
    coefficient_C: string[];
    lin_expr_C: string[];
}

export type SymbolType = {
    symbol_id: string;
    component: string;
    name: string;
}

export type NodeType = 'signal' | 'constant' | 'add' | 'mul';
export type CircuitNode = {
  id: string;
  symbolId: string;
  type: NodeType;
  name: string;
  component: string;
  coefficient?: string;
};

// edge type
export type EdgeType = 'connect' | 'equal'
export type CircuitEdge = {
    type: EdgeType;
    source: string;
    target: string;
    coefficient?: string;
};
  
