# Rapports QA UX (routine)

Ce dossier centralise les audits QA UX par personae.

## Convention de nommage

- `qa-ux-YYYY-MM-DD.md` pour un audit complet.
- `qa-ux-YYYY-MM-DD-<lot>.md` pour un audit cible sur un lot.

Exemples:

- `qa-ux-2026-04-17.md`
- `qa-ux-2026-04-17-tasks-reorder.md`

## Processus recommande

1. Preparer l'environnement local.
2. Lancer:
   - `npm test`
   - `npm run build` (si frontend touche et serveur sert `dist/`)
   - `npm run test:e2e`
3. Executer le prompt:
   - `docs/QA_AUDIT_PERSONAE_PROMPT.md`
4. Copier le template:
   - `docs/reports/qa-ux-template.md`
5. Completer le rapport, puis prioriser les correctifs.

## Gate de sortie minimal

- Aucun bloquant non planifie sur un parcours critique.
- Chaque probleme a une recommandation testable.
- Le rapport inclut references techniques (fichiers, lignes si applicable).
