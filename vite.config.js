import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { GL_AUTH_BACK_COVER } from './src/gl/constants/authCover.js';

// Description publique de Gnomes & Licornes (aperçus de lien, SEO) : on réutilise
// la quatrième de couverture comme source unique du texte.
const GL_SHARE_TITLE = 'Gnomes & Licornes';
const GL_SHARE_DESCRIPTION = GL_AUTH_BACK_COVER.join(' ');

/**
 * Injecte les métadonnées de partage (description, Open Graph, Twitter Card) dans
 * la seule SPA GL (gl.html), en dev comme au build. Les autres entrées HTML
 * (index.vite.html, mascot-pack-tool.html) ne sont pas modifiées.
 */
function glShareMetaPlugin() {
  return {
    name: 'gl-share-meta',
    transformIndexHtml(html, ctx) {
      const target = ctx?.path || ctx?.filename || '';
      if (!target.endsWith('gl.html')) return html;
      const meta = [
        { name: 'description', content: GL_SHARE_DESCRIPTION },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: GL_SHARE_TITLE },
        { property: 'og:locale', content: 'fr_FR' },
        { property: 'og:title', content: GL_SHARE_TITLE },
        { property: 'og:description', content: GL_SHARE_DESCRIPTION },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: GL_SHARE_TITLE },
        { name: 'twitter:description', content: GL_SHARE_DESCRIPTION },
      ];
      return {
        html,
        tags: meta.map((attrs) => ({ tag: 'meta', attrs, injectTo: 'head' })),
      };
    },
  };
}

export default defineConfig({
  plugins: [react(), glShareMetaPlugin()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Pas de sourcemap en build prod : aucun consommateur (pas de Sentry/error-tracking) et
    // ~6 MB de `.map` versionnes a chaque deploy. Le serveur de dev Vite garde ses sourcemaps
    // (esbuild) inchanges. Repasser a 'hidden' si un agregateur d'erreurs est ajoute plus tard.
    sourcemap: false,
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
          if (
            id.includes('node_modules/marked') ||
            id.includes('node_modules/isomorphic-dompurify') ||
            id.includes('node_modules/dompurify')
          ) {
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
