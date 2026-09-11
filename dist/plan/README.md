Icônes PWA du Plan Lyautey (`pwa-icon-*.png`, `pwa-maskable-512.png`, copies sous
`favicon.*` / `apple-touch-icon.png`) : alignées sur ForetMap (même arbre n³ / vert forêt).

L’onglet navigateur et `/favicon.ico` sur `planlyautey.*` réutilisent **directement** les
fichiers racine ForetMap (`/icon.svg`, `/favicon.ico`, `/pwa-icon-192.png`) — voir
`plan.html` et `shareFaviconWith: 'foret'` dans `lib/products.js`. Ne pas inventer une
icône distincte pour le Plan sans mettre à jour ces deux points.
