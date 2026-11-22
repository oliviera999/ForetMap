# Journal SI — intégration et vérification (chantier collège)

## 22/11 — fusions

- `main` relu : dernière migration 378 (`college_socle`), R1 (#733) non fusionnée → série D en 379…384.
- Fusionnées dans `integration/college`, dans l'ordre de la fiche § 7 : C1 (#734), C4 (#739),
  C2 (#740), C3 (#735), C5 (#743), C6 (#741), D1 (#738), D2 (#737), D3 (#745), D4 (#744),
  D5 (#742), D6 (#736).
- Conflit unique : `docs/MCP.md` (puce « Profil collège », C5 × C6) — les deux ajouts gardés.
- `tests/biodiv-pedago-level.test.js` (C1 × C3) : fusion automatique, la ligne C3
  (`frugivorie` → `mutualisme`) et les ajouts C1 cohabitent.
- Renumérotation (`git mv`) : D1 379, D2 380, D3 381, D4 382, D5 383, D6 384 ; générateurs
  `--check` à jour (ils retrouvent le fichier par suffixe).

Prochaine action : tests de migration, « À faire par SI », suite complète.

## 22/11 — « À faire par SI », référentiel, rejeu

- C1 × C2 : `glossary_depth_max` lycée `avance` → `null` (sinon popover replié au lycée).
- C2 : câblage de l'auto-lien par palier des tutoriels (`routes/tutorials.js`), requête
  authentifiée seulement (l'iframe d'aperçu part sans jeton) ; test
  `tests/college-si-tutorial-glossary-depth.test.js`.
- C6 + D3 : migration `college_referentiel_notions` (6 notions, 14 liaisons de la prod), placée
  en **379**, avant le retri ; série D décalée : D1 380, D2 381, D3 382, D4 383, D5 384, D6 385.
  Tests du 20/11 recomptés (220 / 231).
- C4 : repli `group_1` retiré ; C1 : commentaire `CYCLE4_ONLY` ; C3 : JSDoc `foodWebRequest`,
  renvoi dans `niveaux-pedagogiques-biodiversite.md`.
- `changelog.d/` → `CHANGELOG.md` ; `docs/PROFIL_COLLEGE.md`.
- Rejeu : base fraîche (db:init + 2 passes) et base « instantané » (3 passes) : empreintes
  identiques d'une passe à l'autre. Instantané : notions 26/66 inchangées (no-op en prod),
  quiz_question_notions 482 → 1262, lycée 233 → 255, clades 74 → 78 (35 visibles), clés 31 → 37,
  étiquettes 644, phares 100, descriptions 73.

Prochaine action : suite complète, vérification indépendante.

## 22/11 — vérification et clôture

- Suite : lint 0 erreur, format, `npm test` 6 907/0, `test:ui` vert après correction C1 × C2,
  `test:content` vert après correction de pollution, build, e2e collège + G&L (78 + 3 relancés
  verts après adaptation C1 × C3 / C4 × D2), smoke mobile-webkit vert.
- Vérification indépendante : échec catalogue corrigé et re-vérifié OK ; verrouillage 6e laissé
  selon C6 (point d'arbitrage pour Oliv).
- `main` relu : toujours 378, R1 non fusionnée → série 379…385 définitive.
- Suppression du dossier de coordination et du chargeur ; PR vers `main`.

FLUX TERMINÉ
