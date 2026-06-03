# Données Gnomes & Licornes

## Catalogue espèces / biomes

Fichier de référence : `especes-biomes-gnomes-et-licornes.xlsx` (feuilles `especes`, `biomes_stats`, `groupes_stats`).

Import en base :

```bash
npm run gl:import:species          # simulation (dry-run)
npm run gl:import:species -- --apply
npm run gl:import:species -- --apply --file=chemin/vers/fichier.xlsx
```

Depuis l’admin GL : **Contenus → Espèces** — onglet **Saisie manuelle** (formulaire fiche par fiche) ou **Import XLSX** (upload, dry-run puis appliquer ; boutons **Modèle XLSX** et **Exporter le catalogue**, ou API `GET /api/gl/admin/species/import/template` et `GET /api/gl/admin/species/export?statut=actif|all` avec filtre optionnel `biomeSlug`). CRUD unitaire : `POST/PUT /api/gl/admin/species`, `GET /api/gl/admin/species?biomeSlug=`.

Après import, lier un ou plusieurs biomes catalogue à un chapitre via **Contenus → Chapitres → Biomes (catalogue espèces)** (sélection multiple ; alimente biocénose, glossaire et QCM du chapitre).

## Catalogue sortilèges

Fichier de référence : `sortileges-gnomes-et-licornes.xlsx` (feuilles `sortileges`, `categories_stats`).

```bash
npm run gl:import:spells          # simulation (dry-run)
npm run gl:import:spells -- --apply
npm run gl:import:spells -- --apply --file=chemin/vers/fichier.xlsx
```

Depuis l’admin GL : **Contenus → Sortilèges** — onglet **Saisie manuelle** ou **Import XLSX** (boutons **Modèle XLSX** et **Exporter le catalogue**, ou API `GET /api/gl/admin/spells/import/template` et `GET /api/gl/admin/spells/export`). CRUD unitaire : `POST/PUT/DELETE /api/gl/admin/spells`, `GET /api/gl/admin/spells?categorySlug=`.

Après import, cocher les sorts utilisables par chapitre via **Contenus → Chapitres → Sorts du chapitre** (tout cocher / tout décocher par catégorie). L’onglet joueur **Sortilèges** affiche le grimoire filtré ; un clic ouvre la fiche en popover.

## Glossaire pédagogique

Fichier de référence : `glossaire-gnomes-et-licornes.xlsx` (feuille `glossaire`).

```bash
npm run gl:import:glossary          # simulation (dry-run)
npm run gl:import:glossary -- --apply
```

Depuis l’admin GL : **Contenus → Glossaire** — onglet **Saisie manuelle** (formulaire terme par terme) ou **Import XLSX** (boutons **Modèle XLSX** et **Exporter le catalogue**, ou API `GET /api/gl/admin/glossary/import/template` et `GET /api/gl/admin/glossary/export?statut=actif|all`). CRUD unitaire : `POST/PUT /api/gl/admin/glossary/terms`, `GET /api/gl/admin/glossary/terms`.

Les termes sont filtrés par biome du chapitre ; les fiches espèces affichent des liens glossaire via `mots_cles` (re-importer les espèces après ajout de la colonne).

## QCM biomes

Fichier de référence : `qcm-biomes-gnomes-et-licornes-consolide.xlsx` (feuilles `categories`, `questions`). La feuille `questions` inclut les retours pédagogiques `feedback_correct`, `feedback_a`…`feedback_e` (re-import par `id` / `question_code` pour compléter le catalogue sans recréer les lignes).

```bash
npm run gl:import:qcm          # simulation (dry-run)
npm run gl:import:qcm -- --apply
```

Depuis l’admin GL : **Contenus → QCM** (boutons **Modèle XLSX** et **Exporter le catalogue**, ou API `GET /api/gl/admin/qcm/import/template` et `GET /api/gl/admin/qcm/export` avec filtres optionnels `biomeSlug`, `categorieSlug`, `statut`).

Les questions sont liées au glossaire via `mots_cles` / `tags` (importer le glossaire avant ou re-importer le QCM après). Les réponses sont mélangées à chaque présentation (`GET /api/gl/qcm/questions/:code/present`) ; le message affiché après validation provient des colonnes feedback du fichier consolidé.
