pragma circom 2.2.2;

template Internal() {
  signal input in[2];
  signal output out;
  out <== in[0]*in[1];
}

template Main() {
  signal input in[2];
  signal output out;
  component c = Internal ();
  c.in[0] <== in[0];
  c.in[1] <== in[1]+2*in[0]+1;
  c.out ==> out;
}

component main { public [ in ] } = Main();