Icônes PWA du Plan Lyautey (`pwa-icon-*.png`, `pwa-maskable-512.png`, copies sous
`favicon.*` / `apple-touch-icon.png`) : charte graphique du **Lycée Lyautey** (bleu marine
`#183058`, monogramme / logo officiel).

Régénération : `npm run icons:plan` (`scripts/generate-plan-icons.js`) à partir de
`logo-lyautey.png`.

L’onglet navigateur et `/favicon.ico` sur `planlyautey.*` servent **ces** fichiers
(`plan.html`, `assetsDir: 'plan'` dans `lib/products.js`, sans `shareFaviconWith`). Ne pas
rebrancher sur l’icône ForetMap (arbre n³) sans accord explicite.
