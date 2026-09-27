import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests-ui/setup.js'],
    include: ['tests-ui/**/*.test.{js,jsx}'],
    exclude: ['tests/**', 'e2e/**', 'node_modules/**'],
    // Au-dessus des attentes de Testing Library (5 s chacune, tests-ui/setup.js) : un test qui
    // en enchaîne plusieurs ne doit pas être coupé par le délai global (5 s par défaut).
    testTimeout: 20000,
  },
});
