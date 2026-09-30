# Import yo.<domaine> vers GL

Objectif : transposer le contenu et l'identité visuelle de `yo.<domaine>` dans `gl.<domaine>`.

Les autres seeds GL (XLSX chapitres, QCM, lore…) sont listés dans [SCRIPTS.md](SCRIPTS.md) §2.

## Prérequis

- API REST WordPress accessible en lecture :
  - `https://yo.<domaine>/wp-json/wp/v2/pages`
- Base cible GL accessible (via `.env` local ou environnement serveur).
- Config d'import à jour : `scripts/gl-import-wp.config.json`.

## Procédure simple (4 commandes)

```bash
# 1) Vérifier l'accès WP
curl -s https://yo.<domaine>/wp-json/wp/v2/pages

# 2) Dry-run complet (identité + pages + chapitres si chapterMap)
npm run gl:import:wp -- --source-base-url https://yo.<domaine> --target=all --dry-run

# 3) Apply complet
npm run gl:import:wp -- --source-base-url https://yo.<domaine> --target=all --apply

# 4) Vérifier côté GL
curl -s https://gl.<domaine>/api/gl/auth/config
```

## Ce qui est importé

- `platform.title`, `platform.subtitle` (depuis WordPress).
- `platform.brand` (couleurs, polices, logo, **emplacements visuels** `slots` : hero + cartes monde / règles / sortilèges, calqués sur la page d’accueil yo.<domaine>).
- Pages éditoriales GL (`gl_content_pages`) via `slugMap`.
- Chapitres GL (`gl_chapters`) si `chapterMap` est renseigné.
- Images référencées dans les contenus (`/wp-content/uploads/...`) vers `uploads/gl_import/wp/*` et `uploads/gl_brand/*` (sauf si `--skip-media`). Les URLs `gl.<domaine>/wp-content/...` de la page d’accueil yo sont **re-téléchargées depuis yo.<domaine>** (même chemin), car `gl.<domaine>` sert l’app Node et renvoie du HTML à la place des fichiers.
- En fin d’import **brand**, le script affiche un récapitulatif `médias charte: N/N URL locales` : si N &lt; total, relancer après déploiement du correctif ou vérifier l’accès réseau à yo.<domaine>.
- Après import, l’écran de connexion GL et les onglets **Monde / Règles / Sortilèges** affichent ces visuels via `brand.slots` (`GET /api/gl/auth/config`).

## Options utiles

- `--target=brand` : importe uniquement l'identité visuelle.
- `--target=pages` : importe uniquement les pages éditoriales.
- `--target=chapters` : importe uniquement les chapitres mappés.
- `--skip-media` : conserve les URLs distantes (pas de copie d'assets).

## Côté WordPress : faut-il des identifiants ?

Par défaut, non :

- pages + médias + HTML sont lus en public.

Identifiants requis seulement si :

- l'API `/wp-json/*` est protégée,
- ou si un plugin bloque la lecture des médias/pages.

Dans ce cas, créer un mot de passe d'application WordPress et fournir des accès pour la phase d'import.
