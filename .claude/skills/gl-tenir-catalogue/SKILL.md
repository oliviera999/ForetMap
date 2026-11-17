---
name: gl-tenir-catalogue
description: Ajouter ou modifier de bout en bout un catalogue « Tenir à deux » de Gnomes & Licornes (fichier JSON de data/gl/tenir, table, chargeur tolérant, synchronisation par empreinte, carte d'administration, outil MCP gl_tenir_catalogues, test de contenu, README). À lire dès qu'on touche à data/gl/tenir/*.json, lib/glTenirImport.js ou lib/glTenirSync.js.
---

# Catalogues « Tenir à deux »

Un catalogue = un fichier `data/gl/tenir/<nom>.json` chargé dans une ou plusieurs tables par un
chargeur de `lib/glTenirImport.js`. Le fichier est **maître** : la base le suit.

## La chaîne, dans l'ordre

1. **Fichier** `data/gl/tenir/<nom>.json` : UTF-8, JSON indenté, clé `format` en tête. Aucune
   donnée d'élève. Un jumeau minimal dans `data/gl/tenir/exemple/` sert aux tests
   (`npm run gl:import:tenir -- --dossier data/gl/tenir/exemple`).
2. **Table** : migration `migrations/NNN_*.sql` idempotente (`CREATE TABLE IF NOT EXISTS`,
   `ADD COLUMN IF NOT EXISTS`), colonne `actif` si des lignes peuvent sortir du fichier.
   Prochain numéro libre : vérifier `migrations/` sur `main` **et** les PR ouvertes.
3. **Chargeur** `importXxx(db, json, { dryRun, strict })` dans `lib/glTenirImport.js` :
   - `report()` → `{ fichier, count, upserted, desactives, ecartees, errors, warnings, refuse }` ;
   - une ligne = `ligne(out)` ; on pousse ses erreurs puis `row.keep()` ;
   - tout champ visible passe par `checkVisible` (mots interdits + termes `secret`) ;
   - `refuse(out, …)` pour une erreur de structure ; `stopBeforeWrite(out)` avant d'écrire ;
   - upsert sur la clé du fichier ; lignes absentes → `actif = 0`, jamais supprimées ;
   - **aucune table `gl_game_*`** touchée ; relancer deux fois donne la même base.
4. **Registre** : ajouter le chargeur à `IMPORTERS` (l'ordre des clés = ordre de chargement) et
   la table à `IMPORT_TABLES` (`null` s'il n'y a pas de compte à afficher).

Le reste suit seul, car tout lit `IMPORT_ORDER` :

- **Synchronisation par empreinte** (`lib/glTenirSync.js`) : au démarrage, après les migrations,
  un fichier dont le SHA-256 a changé est rechargé en mode tolérant ; `GL_TENIR_SYNC=0` coupe ;
  en `NODE_ENV=test` il faut `GL_TENIR_SYNC=1`.
- **Carte d'administration** : Contenus → Chapitres → « Catalogues Tenir à deux »
  (`GET/POST /api/gl/admin/tenir/catalogues[/sync]`, `routes/gl/admin-tenir-catalogues.js`).
- **Outil MCP** `gl_tenir_catalogues` (`status`, `sync`).
- **CLI** : `npm run gl:import:tenir -- --fichier <nom>|tous [--dry-run] [--strict] [--forcer]`.

## Tolérant ou strict

- **Tolérant** (défaut, démarrage, écran) : une ligne invalide est écartée et rapportée, le
  reste est écrit, un fichier ne bloque pas les suivants.
- **Strict** (`--strict`, CI de contenu) : une erreur refuse le fichier entier. Les contrôles
  entre lignes passent par `pushCrossRow` (erreur en strict, avertissement sinon).
- L'import strict a besoin du **corpus réel** (feuillets, espèces, QCM) : il se lance sur la
  base du banc (`npm run gl:sim:db`), pas sur la base de test nue.

## Champs facultatifs à connaître (ensemble unifié, 17 novembre 2026)

- `chasse-zones.json` : `especes` range la fiche qui porte la réponse **en premier** ; `glossaire`
  (1 à 3 codes `GL####`) passe devant elle pour la piste offerte après un « pas encore »
  (`pisteDeReponse`, `lib/glChasse.js`).
- `questions-lecture.json` : `retours` (un retour « Pas encore… » par mauvaise lettre, jamais sur
  la bonne) ; `feedback_incorrect` devient facultatif quand les trois mauvais choix sont couverts.
- `sorts.json` : les textes du Mentorat et de la Lettre (consigne, critère, amorces, points de
  relecture) vivent dans `effet_auto_json`.
- Contrôle « la réponse est-elle sur le site ? » : `node scripts/gl-controle-reponses-sur-site.js`
  (lecture seule, CSV).

## Écriture gardée

Quand un catalogue complète une table d'auteur (ex. `qcm-feedbacks-zones` dans
`gl_qcm_questions`) : n'écrire que si la colonne est vide ou d'origine, jamais sur une retouche.
Une correction ponctuelle de contenu passe par une **migration gardée par l'ancienne valeur
exacte** (`WHERE … AND colonne = '<ancien>'`), comme 337 et 344.

## À livrer dans le même lot

- `data/gl/tenir/README.md` : ligne du tableau (clé d'upsert, nombre attendu) et section du format.
- Test du chargeur dans `tests/gl-tenir-import.test.js` (idempotence, refus de ligne).
- Test de contenu dans `tests/content/` (mêmes validations en strict, mots interdits) : il porte
  sur les **données**, tourne dans l'étape CI « Contenu pédagogique » et saute sur une base neuve.
- `docs/API.md` (liste des catalogues) et `docs/GL_TENIR_A_DEUX.md` (table des migrations).

Vérifier sur le vrai contenu : `npm run gl:sim:db` puis
`TEST_DB_NAME=foretmap_sim FORETMAP_ALLOW_NON_TEST_DB=1 node --test --test-concurrency=1 --test-force-exit tests/content/gl-*.test.js`.
