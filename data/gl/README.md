# Données Gnomes & Licornes

## Catalogue espèces / biomes

Fichier de référence : `especes-biomes-gnomes-et-licornes.xlsx` (feuilles `especes`, `biomes_stats`, `groupes_stats`).

Import en base :

```bash
npm run gl:import:species          # simulation (dry-run)
npm run gl:import:species -- --apply
npm run gl:import:species -- --apply --file=chemin/vers/fichier.xlsx
```

Depuis l’admin GL : **Contenus → Espèces** (upload XLSX, dry-run puis appliquer).

Après import, lier un chapitre à un biome via **Contenus → Chapitres → Biome (catalogue espèces)**.

## Glossaire pédagogique

Fichier de référence : `glossaire-gnomes-et-licornes.xlsx` (feuille `glossaire`).

```bash
npm run gl:import:glossary          # simulation (dry-run)
npm run gl:import:glossary -- --apply
```

Depuis l’admin GL : **Contenus → Glossaire** (boutons **Modèle XLSX** et **Exporter le catalogue**, ou API `GET /api/gl/admin/glossary/import/template` et `GET /api/gl/admin/glossary/export?statut=actif|all`).

Les termes sont filtrés par biome du chapitre ; les fiches espèces affichent des liens glossaire via `mots_cles` (re-importer les espèces après ajout de la colonne).

## QCM biomes

Fichier de référence : `qcm-biomes-gnomes-et-licornes-consolide.xlsx` (feuilles `categories`, `questions`).

```bash
npm run gl:import:qcm          # simulation (dry-run)
npm run gl:import:qcm -- --apply
```

Depuis l’admin GL : **Contenus → QCM** (boutons **Modèle XLSX** et **Exporter le catalogue**, ou API `GET /api/gl/admin/qcm/import/template` et `GET /api/gl/admin/qcm/export` avec filtres optionnels `biomeSlug`, `categorieSlug`, `statut`).

Les questions sont liées au glossaire via `mots_cles` / `tags` (importer le glossaire avant ou re-importer le QCM après). Les réponses sont mélangées à chaque présentation (`GET /api/gl/qcm/questions/:code/present`).
