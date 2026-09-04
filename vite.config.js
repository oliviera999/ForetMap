import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { GL_AUTH_BACK_COVER } from './src/gl/constants/authCover.js';

// Description publique de Gnomes & Licornes (aperçus de lien, SEO) : on réutilise
// la quatrième de couverture comme source unique du texte.
const GL_SHARE_TITLE = 'Gnomes & Licornes';
const GL_SHARE_DESCRIPTION = GL_AUTH_BACK_COVER.join(' ');

/**
 * Métadonnées de partage par entrée HTML (clé = nom de fichier de l'entrée). Les entrées
 * absentes de cette table (index.vite.html, mascot-pack-tool.html) ne sont pas modifiées.
 */
const SHARE_META_BY_ENTRY = {
  'gl.html': { title: GL_SHARE_TITLE, description: GL_SHARE_DESCRIPTION },
  'plan.html': {
    title: 'Plan Lyautey',
    description: 'Plan du Lycée Lyautey : se repérer dans les lieux avec son smartphone',
  },
};

/**
 * Injecte les métadonnées de partage (description, Open Graph, Twitter Card) dans les
 * entrées HTML déclarées, en dev comme au build.
 * @param {Record<string, { title: string, description: string }>} metaByEntry
 */
function shareMetaPlugin(metaByEntry) {
  return {
    name: 'share-meta',
    transformIndexHtml(html, ctx) {
      const target = ctx?.path || ctx?.filename || '';
      const entryName = Object.keys(metaByEntry).find((name) => target.endsWith(name));
      if (!entryName) return html;
      const { title, description } = metaByEntry[entryName];
      const meta = [
        { name: 'description', content: description },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: title },
        { property: 'og:locale', content: 'fr_FR' },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { name: 'twitter:card', content: 'summary' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
      ];
      return {
        html,
        tags: meta.map((attrs) => ({ tag: 'meta', attrs, injectTo: 'head' })),
      };
    },
  };
}

export default defineConfig({
  plugins: [react(), shareMetaPlugin(SHARE_META_BY_ENTRY)],
  root: '.',
  optimizeDeps: {
    // lucide-react expose ~1500 modules ESM : pré-bundlé en dev pour éviter l'avalanche
    // de requêtes au premier chargement.
    include: ['lucide-react'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Pas de sourcemap en build prod : aucun consommateur (pas de Sentry/error-tracking) et
    // ~6 MB de `.map` versionnes a chaque deploy. Le serveur de dev Vite garde ses sourcemaps
    // (esbuild) inchanges. Repasser a 'hidden' si un agregateur d'erreurs est ajoute plus tard.
    sourcemap: false,
    // Manifeste Rollup (`dist/.vite/manifest.json`) : liste des bundles hachés par entrée,
    // consommée par `scripts/build-pwa.js` pour précacher exactement les fichiers de chaque
    // produit dans son service worker.
    manifest: true,
    rollupOptions: {
      input: {
        main: path.resolve(process.cwd(), 'index.vite.html'),
        mascotPackTool: path.resolve(process.cwd(), 'mascot-pack-tool.html'),
        gl: path.resolve(process.cwd(), 'gl.html'),
        plan: path.resolve(process.cwd(), 'plan.html'),
      },
      output: {
        manualChunks(id) {
          // Regex bornée : `includes('node_modules/react')` capturait tout paquet
          // react* (react-is…) et laissait `scheduler` (dépendance de react-dom)
          // hors du chunk react-vendor.
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/socket.io-client')) return 'socket-io';
          if (id.includes('node_modules/@rive-app')) return 'rive';
          // Icônes du chrome (audit UI, D-2) : chunk dédié, sinon lucide-react serait
          // dupliqué dans les chunks des entrées main et gl.
          if (id.includes('node_modules/lucide-react')) return 'icons';
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
