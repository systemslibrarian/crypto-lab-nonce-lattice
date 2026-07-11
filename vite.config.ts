import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  base: '/crypto-lab-nonce-lattice/',
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
