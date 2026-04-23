# crypto-lab-nonce-lattice

Interactive lab for exploring ECDSA nonce-bias lattice attacks in the browser.

## Development

```bash
npm ci
npm run dev
```

## Production build

```bash
npm run build
```

The Vite `base` is configured for GitHub Pages project hosting:

`/crypto-lab-nonce-lattice/`

## GitHub Pages

This repository includes a workflow at `.github/workflows/deploy-pages.yml`.

To publish:

1. In GitHub, go to Settings > Pages.
2. Set Source to GitHub Actions.
3. Push to `main`.

The workflow builds the site and deploys the `dist/` artifact to GitHub Pages.