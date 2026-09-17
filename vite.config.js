import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { createRequire } from 'module';

import { GL_AUTH_BACK_COVER } from './src/gl/constants/authCover.js';

// `lib/brand.js` et `lib/products.js` sont en CommonJS (ils sont consommés par le serveur) :
// on les charge ici pour que le build HTML et le serveur lisent **la même** identité de marque.
const require = createRequire(import.meta.url);
const { getBrand } = require('./lib/brand.js');
const { PRODUCTS, PRODUCT_IDS } = require('./lib/products.js');

const brand = getBrand();

// Description publique de Gnomes & Licornes (aperçus de lien, SEO) : on réutilise
// la quatrième de couverture comme source unique du texte.
const GL_SHARE_DESCRIPTION = GL_AUTH_BACK_COVER.join(' ');

/** Échappe une valeur destinée à du texte HTML ou à un attribut `content="…"`. */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Jetons de marque communs à toutes les entrées HTML. Les jetons propres à un produit
 * (`%BRAND_PRODUCT_*%`) sont ajoutés par entrée, depuis le registre `lib/products.js`.
 */
const GLOBAL_BRAND_TOKENS = {
  BRAND_APP_NAME: brand.appName,
  BRAND_APP_SHORT_NAME: brand.appShortName,
  BRAND_ORG_NAME: brand.orgName,
  BRAND_ORG_SHORT_NAME: brand.orgShortName,
  BRAND_GL_NAME: brand.glName,
  BRAND_GL_SHORT_NAME: brand.glShortName,
};

/** Produit dont l'entrée HTML correspond au fichier transformé, ou `null`. */
function resolveProductForEntry(target) {
  const id = PRODUCT_IDS.find((productId) => target.endsWith(PRODUCTS[productId].htmlEntry));
  return id ? PRODUCTS[id] : null;
}

/**
 * Métadonnées de partage (Open Graph, Twitter Card) par produit. G&L garde sa quatrième de
 * couverture ; les autres produits réutilisent le titre et la description de leur manifeste
 * PWA, déjà dérivés de la marque.
 */
function shareMetaForProduct(product) {
  if (!product) return null;
  if (product.id === 'gl') {
    return { title: product.pwa.name, description: GL_SHARE_DESCRIPTION };
  }
  if (product.id === 'plan') {
    return { title: product.pwa.name, description: product.pwa.description };
  }
  return null;
}

/**
 * Marque et métadonnées de partage injectées dans les entrées HTML, en dev comme au build.
 *
 * Trois effets :
 *  1. substitution des jetons `%BRAND_*%` (titres, `application-name`, descriptions) ;
 *  2. exposition de `window.__FORETMAP_BRAND__` pour les composants front qui affichent le
 *     nom de l'établissement sans passer par l'API (le carnet, notamment) ;
 *  3. injection des métadonnées de partage, comme avant, mais dérivées du registre produits.
 *
 * Le nom du logiciel et celui de l'établissement viennent de `lib/brand.js` : rebrander une
 * installation, c'est poser des variables d'environnement avant `npm run build`, pas éditer
 * ces fichiers HTML.
 */
function brandHtmlPlugin() {
  return {
    name: 'foretmap-brand-html',
    transformIndexHtml(html, ctx) {
      const target = ctx?.path || ctx?.filename || '';
      const product = resolveProductForEntry(target);
      const tokens = {
        ...GLOBAL_BRAND_TOKENS,
        ...(product
          ? {
              BRAND_PRODUCT_NAME: product.pwa.name,
              BRAND_PRODUCT_SHORT_NAME: product.pwa.shortName,
              BRAND_PRODUCT_LABEL: product.label,
              BRAND_PRODUCT_DESCRIPTION: product.pwa.description,
            }
          : {}),
      };
      const rendered = html.replace(/%(BRAND_[A-Z_]+)%/g, (match, key) =>
        Object.prototype.hasOwnProperty.call(tokens, key) ? escapeHtml(tokens[key]) : match,
      );

      const tags = [
        {
          tag: 'script',
          injectTo: 'head-prepend',
          // `<` échappé : une marque contenant `</script>` ne doit pas pouvoir fermer la balise.
          children: `window.__FORETMAP_BRAND__=${JSON.stringify({
            appName: brand.appName,
            appShortName: brand.appShortName,
            orgName: brand.orgName,
            orgShortName: brand.orgShortName,
          }).replace(/</g, '\\u003c')};`,
        },
      ];

      const share = shareMetaForProduct(product);
      if (share) {
        const meta = [
          { name: 'description', content: share.description },
          { property: 'og:type', content: 'website' },
          { property: 'og:site_name', content: share.title },
          { property: 'og:locale', content: 'fr_FR' },
          { property: 'og:title', content: share.title },
          { property: 'og:description', content: share.description },
          { name: 'twitter:card', content: 'summary' },
          { name: 'twitter:title', content: share.title },
          { name: 'twitter:description', content: share.description },
        ];
        tags.push(...meta.map((attrs) => ({ tag: 'meta', attrs, injectTo: 'head' })));
      }

      return { html: rendered, tags };
    },
  };
}

export default defineConfig({
  plugins: [react(), brandHtmlPlugin()],
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
        staff: path.resolve(process.cwd(), 'staff.html'),
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
