# crypto-lab-nonce-lattice

## What It Is

A browser-based educational demo of ECDSA nonce leakage and lattice-based key recovery. Shows how partial nonce leakage or reuse can be exploited using the Hidden Number Problem and LLL/Babai lattice reduction. For classroom and self-study use only.

It is built for progressive disclosure. A newcomer meets the one governing equation first, then follows a **guided four-step walkthrough** (Sign → Build HNP → Reduce → Extract) that gates the deep panels behind step tabs mirroring the attack pipeline, so the hard lattice matrices come only after the intuition. Along the way: a live feasibility gauge that shows when leakage is enough (with a caption reconciling this demo's small signature budget against the real `√(log₂ n) ≈ 16`-bit HNP bound on secp256k1), a worked row-construction that turns one real signature into one lattice row, a **2-D geometric projection** where you watch the skewed starting basis snap into short, near-orthogonal reduced vectors with the key-carrying vector highlighted, a byte-for-byte key-recovery grid, and — for the nonce-reuse case — a fully worked two-signature derivation with the real numbers. The Lattice View still surfaces the single conceptual leap for deeper readers by outlining the winning short vector and showing that its secret coordinate divided by the scaling bound *is* the private key (`secretCoordinate / B mod n = d`). Historical case studies and the timeline sit behind a collapsed History section at the end.

## Exhibits

1. **The one equation** — the always-visible ECDSA congruence `s = k⁻¹(h + r·d) mod n` recast as `r·d − s·k + h ≡ 0 (mod n)`, the on-ramp the whole attack turns on.
2. **Configuration + presets** — pick curve, leak mode (MSB / LSB / fixed-prefix / reused-nonce / RFC 6979), leak size, and signature count; one-click scenario presets.
3. **Feasibility gauge** — plots your live config against the information floor and this demo's numerical boundary, with a caption bridging the on-screen axes — capped at 32 signatures because the reduction runs in your browser — to the real `√(log₂ n)` theoretical bound.
4. **Guided walkthrough (Sign → Build HNP → Reduce → Extract)** — step tabs that reveal the deep panels in the pipeline's order.
5. **Signature log** — the captured `r, s, h`, digests, and leaked-nonce metadata that feed the attack.
6. **Row construction** — one real signature becoming one lattice row, with the modulus rows and the bound/scaling column labeled.
7. **2-D lattice projection** — an animated slice showing the starting basis vectors reduce into short, near-orthogonal ones, with the key-carrying vector highlighted along the `= d·B` axis.
8. **Lattice View + key bridge** — the before/after basis matrices and the equation `secretCoordinate / B mod n = d` reading the key out of the short vector.
9. **Recovery panel** — byte-for-byte comparison of the recovered key against the signer's key, verified against `Q = dG`.
10. **Nonce-reuse derivation** — the two-line PS3-style algebra (`k`, then `d`) with the real numbers, no lattice needed.
11. **History & context** — real-world case studies (PS3, Android, Minerva, TPM-FAIL), the historical timeline, and related labs.

**Warning:** This is an educational tool. It does not break real-world cryptosystems. See `docs/limitations.md` and `SECURITY.md`.

## When to Use It

- To understand ECDSA nonce leakage attacks.
- To demonstrate lattice-based recovery in a safe, reproducible setting.
- For teaching, labs, and cryptography exercises.
- Do NOT use it against real keys or systems. Note what makes it safe: the curves here are the real standardized ones (secp256k1, P-256) at full size, and the signatures really verify. What is artificial is that the signer deliberately hands the attacker known nonce bits. A correctly implemented signer leaks none of them, and this demo has no way to obtain them from one that does not.

## Live Demo

**[systemslibrarian.github.io/crypto-lab-nonce-lattice](https://systemslibrarian.github.io/crypto-lab-nonce-lattice/)**

The demo lets you generate ECDSA signatures with deliberately leaked or biased nonce bits, then assembles the Hidden Number Problem lattice and runs LLL/Babai reduction to recover the private key. Drag the leaked-bits and signature-count controls and the feasibility gauge marks your configuration against the information floor and this demo's numerical boundary, so you can sweep a slider until recovery starts failing and watch the boundary cross. On a successful run the Lattice View outlines the winning short vector and reads the key straight out of it, and a byte grid shows every reconstructed byte of the private key. This makes the relationship between leakage and attack feasibility concrete rather than asserted.

## What Can Go Wrong

- **Nonce reuse:** signing two different messages with the same nonce k leaks the private key directly through simple algebra — the classic failure behind the 2010 Sony PlayStation 3 code-signing key recovery.
- **Biased or partially known nonces:** even a few leaked or biased high/low bits per signature, gathered across enough signatures, let an attacker recover the key by solving the Hidden Number Problem with LLL/BKZ lattice reduction.
- **Weak randomness:** a low-entropy or broken PRNG produces predictable nonces and collapses ECDSA security; RFC 6979 deterministic nonces remove the RNG from the trust path.
- **Side-channel leakage of nonce bits:** cache or timing leaks from the scalar multiplication can expose exactly the partial-nonce information this lattice attack consumes.
- **Insufficient samples:** the attack only succeeds above a threshold of signatures relative to bits leaked — `bits x signatures` must clear the 256-bit curve order or the lattice is under-determined. Because this demo caps the sample count at 32 (browser-speed LLL), it needs far more leakage per signature than the `√(log₂ n) ≈ 16` bits that Boneh–Venkatesan / Nguyen–Shparlinski prove sufficient given a number of signatures linear in `log n`. Real attacks like Minerva got by on a couple of bits per signature and many thousands of signatures.

## Real-World Usage

- **Sony PlayStation 3 (2010):** the console's ECDSA code-signing key was recovered because the same nonce was reused across signatures.
- **Android Bitcoin wallets (2013):** a flaw in `SecureRandom` produced repeated ECDSA nonces, enabling theft of funds from affected wallets.
- **Minerva (2019):** timing side channels leaking the nonce bit-length enabled Hidden Number Problem / lattice key recovery against several ECDSA implementations.
- **TPM-Fail (2019):** nonce timing leakage in TPM firmware allowed ECDSA private-key recovery via lattice methods.
- **RFC 6979 deterministic ECDSA:** standardized in part to eliminate the RNG-driven nonce failures this attack class exploits.

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-nonce-lattice
cd crypto-lab-nonce-lattice
npm install
npm run dev
```

## Related Demos

- [crypto-lab-ecdsa-forge](https://systemslibrarian.github.io/crypto-lab-ecdsa-forge/) — ECDSA nonce reuse and RFC 6979 deterministic nonces.
- [crypto-lab-lll-break](https://systemslibrarian.github.io/crypto-lab-lll-break/) — LLL/BKZ lattice reduction on toy LWE.
- [crypto-lab-lwe-hints](https://systemslibrarian.github.io/crypto-lab-lwe-hints/) — recovering lattice secrets from approximate hints.
- [crypto-lab-nonce-guard](https://systemslibrarian.github.io/crypto-lab-nonce-guard/) — nonce misuse on the symmetric (AEAD) side.
- [crypto-lab-timing-oracle](https://systemslibrarian.github.io/crypto-lab-timing-oracle/) — the timing side channels that leak nonce bits.

## License

Released under the [MIT License](LICENSE). Copyright (c) 2026 systemslibrarian.

---

*One of 170+ browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
