import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: path.resolve(process.cwd(), 'index.vite.html'),
        mascotPackTool: path.resolve(process.cwd(), 'mascot-pack-tool.html'),
        gl: path.resolve(process.cwd(), 'gl.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/socket.io-client')) return 'socket-io';
          if (id.includes('node_modules/@rive-app')) return 'rive';
          if (id.includes('node_modules/marked') || id.includes('node_modules/isomorphic-dompurify')
            || id.includes('node_modules/dompurify')) {
            return 'markdown';
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true, changeOrigin: true },
      '/health': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
