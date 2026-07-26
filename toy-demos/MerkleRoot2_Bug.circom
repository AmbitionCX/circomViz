pragma circom 2.2.3;

template Bit() {
    signal input in;

    in * (in - 1) === 0;
}

template ToyHash2() {
    signal input left;
    signal input right;
    signal output out;

    out <== left * 31 + right * 37;
}

template SelectLR_Bug() {
    signal input current;
    signal input sibling;
    signal input dir;

    signal output left;
    signal output right;

    component b = Bit();
    b.in <== dir;

    signal delta;
    signal selectedDelta;

    delta <== current - sibling;
    selectedDelta <== dir * delta;

    // Intended convention:
    //
    // dir = 0:
    //   left  = current
    //   right = sibling
    //
    // dir = 1:
    //   left  = sibling
    //   right = current
    //
    // BUG:
    // The two cases are reversed.
    //
    // Actual behavior:
    //
    // dir = 0:
    //   left  = sibling
    //   right = current
    //
    // dir = 1:
    //   left  = current
    //   right = sibling
    left <== sibling + selectedDelta;
    right <== current - selectedDelta;
}

template MerkleStep() {
    signal input current;
    signal input sibling;
    signal input dir;

    signal output next;

    component sel = SelectLR_Bug();
    component h = ToyHash2();

    sel.current <== current;
    sel.sibling <== sibling;
    sel.dir <== dir;

    h.left <== sel.left;
    h.right <== sel.right;

    next <== h.out;
}

template MerkleRoot2_Bug() {
    signal input leaf;
    signal input sibling0;
    signal input sibling1;

    signal input dir0;
    signal input dir1;

    signal output root;

    component step0 = MerkleStep();
    component step1 = MerkleStep();

    step0.current <== leaf;
    step0.sibling <== sibling0;
    step0.dir <== dir0;

    step1.current <== step0.next;
    step1.sibling <== sibling1;
    step1.dir <== dir1;

    root <== step1.next;
}