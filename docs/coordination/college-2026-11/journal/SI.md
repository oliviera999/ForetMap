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
