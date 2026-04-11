# Import biodiversité (mode professeur)

Cette page décrit le format attendu pour importer des fiches biodiversité depuis un fichier CSV/Excel ou une URL Google Sheet.

## 1) Sources supportées

- Fichier local: `.csv`, `.xlsx`, `.xls`
- URL Google Sheet publique/partagée (lecture): format
  `https://docs.google.com/spreadsheets/d/<sheetId>/edit#gid=<gid>`

## 2) Stratégies d'import

- `upsert_name`: met à jour si `name` existe déjà, sinon crée.
- `insert_only`: crée uniquement les nouvelles lignes, ignore les doublons.
- `replace_all`: remplace entièrement le catalogue par les lignes valides du fichier.

## 3) Colonnes

Colonne minimale obligatoire:

- `name`

Colonnes recommandées (template minimal):

- `emoji`, `description`, `scientific_name`, `group_1`, `sources`, `photo`

Colonnes avancées (template complet):

- Tous les champs de la table `plants`:
  `name, emoji, description, second_name, scientific_name, group_1, group_2, group_3, group_4, habitat, photo, nutrition, agroecosystem_category, longevity, remark_1, remark_2, remark_3, reproduction, size, sources, ideal_temperature_c, optimal_ph, ecosystem_role, geographic_origin, human_utility, harvest_part, planting_recommendations, preferred_nutrients, photo_species, photo_leaf, photo_flower, photo_fruit, photo_harvest_part`

## 4) Règles de validation

- `name` est requis.
- `photo*`:
  - URL image directe (extensions: `jpg`, `jpeg`, `png`, `webp`, `gif`, `svg`, `avif`, `bmp`),
  - ou lien `.../wiki/Special:FilePath/...`,
  - ou chemin local `/uploads/...` avec extension image.
- `ideal_temperature_c`: nombre ou intervalle raisonnable (`-20` à `80`).
- `optimal_ph`: nombre ou intervalle (`0` à `14`).

En cas d'erreur, le rapport indique la ligne et le champ bloquant.

## 5) Templates fournis

- `docs/templates/plants-import-template-vierge.csv`
- `docs/templates/plants-import-template-minimal.csv`
- `docs/templates/plants-import-template.csv`

Dans l'interface mode professeur, deux boutons permettent aussi de générer un CSV:

- `Télécharger template vierge` (colonnes minimales)
- `Télécharger template complet` (toutes les colonnes `plants`)

## 6) Conseils Google Sheet

- Vérifier que la feuille est partageable en lecture.
- Mettre l'en-tête en première ligne.
- Utiliser une seule espèce par ligne.
- Garder les photos au format URL direct.
