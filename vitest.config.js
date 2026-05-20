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
  },
});
