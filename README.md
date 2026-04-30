
# Crypto-Lab: Nonce Lattice Attack

## 1. What It Is
A browser-based educational demo of ECDSA nonce leakage and lattice-based key recovery. Shows how partial nonce leakage or reuse can be exploited using the Hidden Number Problem and LLL/Babai lattice reduction. For classroom and self-study use only.

**Warning:** This is an educational tool. It does not break real-world cryptosystems. See `docs/limitations.md` and `SECURITY.md`.

## 2. When to Use It
- To understand ECDSA nonce leakage attacks
- To demonstrate lattice-based recovery in a safe, reproducible setting
- For teaching, labs, and cryptography exercises

## 3. Live Demo
[https://systemslibrarian.github.io/crypto-lab-nonce-lattice/](https://systemslibrarian.github.io/crypto-lab-nonce-lattice/)

## 4. How to Run Locally
```bash
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

## 5. Part of the Crypto-Lab Suite
See [docs/repo-map.md](docs/repo-map.md) for source layout. For more labs, visit the Crypto-Lab suite homepage.

---

> License: add chosen open-source license here.