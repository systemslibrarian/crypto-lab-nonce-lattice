# Threat Model

## What This Demo Models
- Controlled, educational nonce leakage or reuse
- Attacker can observe signatures and some nonce bits
- Lattice-based recovery in a simplified setting

## What This Demo Does Not Model
- Real-world side-channels in production
- Full cryptographic wallet attacks
- Advanced mitigations or implementation bugs

## Attacker Assumptions
- Can collect enough signatures
- Knows leakage model and curve
- Has access to public key and signature data

See `docs/limitations.md` for more.