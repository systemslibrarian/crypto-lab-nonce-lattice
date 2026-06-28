# crypto-lab-nonce-lattice

## What It Is

A browser-based educational demo of ECDSA nonce leakage and lattice-based key recovery. Shows how partial nonce leakage or reuse can be exploited using the Hidden Number Problem and LLL/Babai lattice reduction. For classroom and self-study use only.

**Warning:** This is an educational tool. It does not break real-world cryptosystems. See `docs/limitations.md` and `SECURITY.md`.

## When to Use It

- To understand ECDSA nonce leakage attacks.
- To demonstrate lattice-based recovery in a safe, reproducible setting.
- For teaching, labs, and cryptography exercises.
- Do NOT use it against real keys or systems — it is a teaching demo on toy parameters and does not break real-world cryptosystems.

## Live Demo

**[systemslibrarian.github.io/crypto-lab-nonce-lattice](https://systemslibrarian.github.io/crypto-lab-nonce-lattice/)**

The demo lets you generate ECDSA signatures with deliberately leaked or biased nonce bits, then assembles the Hidden Number Problem lattice and runs LLL/Babai reduction to recover the private key. You can vary how many signatures and how many leaked bits per signature are available and watch the recovery succeed or fail, making the relationship between leakage and attack feasibility concrete.

## What Can Go Wrong

- **Nonce reuse:** signing two different messages with the same nonce k leaks the private key directly through simple algebra — the classic failure behind the 2010 Sony PlayStation 3 code-signing key recovery.
- **Biased or partially known nonces:** even a few leaked or biased high/low bits per signature, gathered across enough signatures, let an attacker recover the key by solving the Hidden Number Problem with LLL/BKZ lattice reduction.
- **Weak randomness:** a low-entropy or broken PRNG produces predictable nonces and collapses ECDSA security; RFC 6979 deterministic nonces remove the RNG from the trust path.
- **Side-channel leakage of nonce bits:** cache or timing leaks from the scalar multiplication can expose exactly the partial-nonce information this lattice attack consumes.
- **Insufficient samples:** the attack only succeeds above a threshold of signatures relative to bits leaked, and this demo uses toy curves — it does not threaten standardized secp256k1 keys.

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

Add chosen open-source license here.

---

*One of 120+ browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
