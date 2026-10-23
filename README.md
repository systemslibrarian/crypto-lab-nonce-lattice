# crypto-lab-nonce-lattice

## What It Is

A browser-based educational demo of ECDSA nonce leakage and lattice-based key recovery. Shows how partial nonce leakage or reuse can be exploited using the Hidden Number Problem and LLL/Babai lattice reduction. For classroom and self-study use only.

It is built for progressive disclosure. A newcomer meets the one governing equation first, then follows a **guided four-step walkthrough** (Sign → Build HNP → Reduce → Extract) that gates the deep panels behind step tabs mirroring the attack pipeline, so the hard lattice matrices come only after the intuition. Along the way: a live feasibility gauge that compares this demo's small signature budget with the asymptotic Nguyen–Shparlinski result of about `√(log₂ n)` known consecutive nonce bits under that paper's assumptions, a worked row-construction that turns one real signature into one lattice row, a **2-D geometric projection** where you watch the skewed starting basis snap into short, near-orthogonal reduced vectors with the key-carrying vector highlighted, a byte-for-byte key-recovery grid, and — for the nonce-reuse case — a fully worked two-signature derivation with the real numbers. The Lattice View still surfaces the single conceptual leap for deeper readers by outlining the winning short vector and showing that its secret coordinate divided by the scaling bound *is* the private key (`secretCoordinate / B mod n = d`). Historical case studies and the timeline sit behind a collapsed History section at the end.

## Exhibits

1. **The one equation** — the always-visible ECDSA congruence `s = k⁻¹(h + r·d) mod n` recast as `r·d − s·k + h ≡ 0 (mod n)`, the on-ramp the whole attack turns on.
2. **Configuration + presets** — pick curve, leak mode (MSB / LSB / fixed-prefix / reused-nonce / RFC 6979), leak size, and signature count; one-click scenario presets.
3. **Feasibility gauge** — plots your live config against a simple `bits × signatures = curve bits` guide and this demo's hand-calibrated numerical boundary. The first line is a starting heuristic, not an impossibility theorem; the caption distinguishes both model curves from the asymptotic Nguyen–Shparlinski result.
4. **Measured boundary** — the two curves above are a model, so **Measure this column** goes and checks them. For the current signature count it runs three complete end-to-end attacks (fresh key, fresh signatures, real LLL, byte-for-byte validation) at each of six leak sizes around the bit-count guide, prints the observed recovery rate per rung, and states where the measurement and the drawn curve disagree. Measured columns accumulate as dots over the modelled curves. Where it cannot honestly measure — a leak mode with no bits axis, a signature count too slow to sweep in a tab, or a centered ladder that lies past the 32-bit control — it declines and gives the reason instead of drawing a boundary it did not run.
5. **Guided walkthrough (Sign → Build HNP → Reduce → Extract)** — step tabs that reveal the deep panels in the pipeline's order.
6. **Signature log** — the captured `r, s, h`, digests, and leaked-nonce metadata that feed the attack.
7. **Row construction** — one real signature becoming one lattice row, with the modulus rows and the bound/scaling column labeled.
8. **2-D lattice projection** — an animated slice showing the starting basis vectors reduce into short, near-orthogonal ones, with the key-carrying vector highlighted along the `= d·B` axis.
9. **Lattice View + key bridge** — the before/after basis matrices and the equation `secretCoordinate / B mod n = d` reading the key out of the short vector.
10. **Recovery panel** — byte-for-byte comparison of the recovered key against the signer's key, verified against `Q = dG`.
11. **Nonce-reuse derivation** — the two-line PS3-style algebra (`k`, then `d`) with the real numbers, no lattice needed.
12. **History & context** — real-world case studies (PS3, Android, Minerva, TPM-FAIL, OpenSSL 2026), the historical timeline, and related labs.

**Warning:** This is an educational tool. It does not break real-world cryptosystems. See `docs/limitations.md` and `SECURITY.md`.

## When to Use It

- To understand ECDSA nonce leakage attacks.
- To demonstrate lattice-based recovery in a safe, reproducible setting.
- For teaching, labs, and cryptography exercises.
- Do NOT use it against real keys or systems. Note what makes it safe: the curves here are the real standardized ones (secp256k1, P-256) at full size, and the signatures really verify. What is artificial is that the signer deliberately hands the attacker known nonce bits. A correctly implemented signer leaks none of them, and this demo has no way to obtain them from one that does not.

## Live Demo

**[systemslibrarian.github.io/crypto-lab-nonce-lattice](https://systemslibrarian.github.io/crypto-lab-nonce-lattice/)**

The demo lets you generate ECDSA signatures with deliberately leaked or biased nonce bits, then assembles the Hidden Number Problem lattice and runs LLL/Babai reduction to recover the private key. Adjust the leaked-bits and signature-count controls and the feasibility gauge marks your configuration against the bit-count guide and this demo's numerical boundary; the measured sweep then runs real attacks to show where recovery actually starts failing. On a successful run the Lattice View outlines the winning short vector and reads the key straight out of it, and a byte grid shows every reconstructed byte of the private key. This makes the relationship between leakage and attack feasibility concrete rather than asserted.

## What Can Go Wrong

- **Nonce reuse:** signing two different messages with the same nonce k leaks the private key directly through simple algebra — the classic failure behind the 2010 Sony PlayStation 3 code-signing key recovery.
- **Biased or partially known nonces:** even a few leaked or biased high/low bits per signature, gathered across enough signatures, let an attacker recover the key by solving the Hidden Number Problem with LLL/BKZ lattice reduction.
- **Weak randomness:** a low-entropy or broken PRNG produces predictable nonces and collapses ECDSA security; RFC 6979 deterministic nonces remove the RNG from the nonce-generation trust path, but do not by themselves stop timing or other implementation leakage.
- **Side-channel leakage of nonce bits:** cache or timing leaks from the scalar multiplication can expose exactly the partial-nonce information this lattice attack consumes.
- **Insufficient samples:** success depends on the number and quality of signatures, the leak model, the nonce draws, and the reduction. The on-screen `bits × signatures = 256` line is a useful first-order guide, not a hard boundary; the measured sweep shows a probabilistic ramp around it. Because this demo caps the sample count at 32 (browser-speed LLL), it needs much more leakage per signature than the asymptotic Nguyen–Shparlinski ECDSA result, which requires about `√(log₂ n)` known consecutive bits under its stated assumptions and a number of signatures at most linear in `log n`. Practical attacks use their own leakage distributions and sample counts; Minerva, for example, reports 2,100 signatures for its smart-card demonstration.

## Real-World Usage

- **Sony PlayStation 3 (2010):** the console's ECDSA code-signing key was recovered because the same nonce was reused across signatures.
- **Android Bitcoin wallets (2013):** weaknesses in Android's secure-random-number component put affected wallet keys and ECDSA signatures at risk, prompting wallet updates and key rotation.
- **Minerva (2019):** timing side channels leaking the nonce bit-length enabled Hidden Number Problem / lattice key recovery against several ECDSA implementations.
- **TPM-Fail (2019):** nonce timing leakage in TPM firmware allowed ECDSA private-key recovery via lattice methods.
- **OpenSSL advisory (29 September 2026):** [CVE-2026-54872](https://openssl-library.org/news/secadv/20260929.txt) discloses a small signing-time nonce leak in generic EC scalar multiplication, affecting Brainpool and other generic prime curves and SM2 on its generic path. Many timing measurements may enable lattice/HNP key recovery; the advisory does not establish universal practical exploitation. OpenSSL's dedicated P-256, P-384 and P-521 implementations are unaffected by this CVE. This lab uses different implementations and deliberately supplied nonce bits: it does not measure timing or reproduce the OpenSSL vulnerability. Follow the advisory's branch-specific upgrade guidance for affected deployments.
- **RFC 6979 deterministic ECDSA:** standardized in part to eliminate the RNG-driven nonce failures this attack class exploits.

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-nonce-lattice
cd crypto-lab-nonce-lattice
npm install
npm run dev
```

## Recovery checks

`npm test` runs the seeded MSB-leak transcript through both the app's recovery
path and `verification/solve_hnp.py`, a separate Python HNP lattice solver.
The test compares their recovered scalars with the signing key and public key.
The fixture is generated locally; it is not a published attack-output vector.
The HNP context is [Nguyen and Shparlinski's partial-nonce work](https://www.di.ens.fr/~pnguyen/pub_NgSh02.htm).
The existing [RFC 6979](https://www.rfc-editor.org/rfc/rfc6979.html) mode is a
negative control with no nonce bits supplied to the attack.

`npm run build` also runs seven executable workflow-policy controls before
TypeScript and the production build. CI exercises the unit/build path on Node
22, 24, and 26, then runs the full Chromium behavior and WCAG gate separately.
Publishing authority is confined to no-checkout jobs, pull requests retain no
Pages bundle, main deployments cannot be cancelled midway, and only gated
patch/minor Dependabot updates may auto-merge.

## Related Demos

- [crypto-lab-ecdsa-forge](https://systemslibrarian.github.io/crypto-lab-ecdsa-forge/) — ECDSA nonce reuse and RFC 6979 deterministic nonces.
- [crypto-lab-lll-break](https://systemslibrarian.github.io/crypto-lab-lll-break/) — LLL/BKZ lattice reduction on toy LWE.
- [crypto-lab-lwe-hints](https://systemslibrarian.github.io/crypto-lab-lwe-hints/) — recovering lattice secrets from approximate hints.
- [crypto-lab-nonce-guard](https://systemslibrarian.github.io/crypto-lab-nonce-guard/) — nonce misuse on the symmetric (AEAD) side.
- [crypto-lab-timing-oracle](https://systemslibrarian.github.io/crypto-lab-timing-oracle/) — the timing side channels that leak nonce bits.

## License

Released under the [MIT License](LICENSE). Copyright (c) 2026 systemslibrarian.

---

*Part of the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
