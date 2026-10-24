Icônes PWA du Plan Lyautey (`pwa-icon-*.png`, `pwa-maskable-512.png`, copies sous
`favicon.*` / `apple-touch-icon.png`) : **favicon officiel** du site du lycée
(`lyautey-favicon.png`, source
[lyceelyautey.org](https://lyceelyautey.org/wp-content/uploads/2025/12/faveicon-lyaute.png)).

Régénération : `npm run icons:plan` (`scripts/generate-plan-icons.js`) à partir de
`lyautey-favicon.png`. Le bandeau d’interface `logo-lyautey.png` n’est pas régénéré ici.

L’onglet navigateur et `/favicon.ico` sur `planlyautey.*` et `proflyautey.*` servent **ces**
fichiers (`plan.html` / `staff.html`, `assetsDir: 'plan'` dans `lib/products.js`). Ne pas
rebrancher sur l’icône ForetMap (arbre n³) sans accord explicite.
