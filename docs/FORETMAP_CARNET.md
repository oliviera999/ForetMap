# Carnet ForetMap — documentation technique

Miroir ForetMap du carnet personnel GL (« Mon journal », voir `docs/GL_CARNET_JOUEUR.md`).
Produit isolé : tables `user_journal_*`, API `/api/user-journal`, pas de couplage `gl_*`.

## Fonctionnalités

- Articles (titre optionnel, markdown, multi-photos, zone optionnelle, auto-save UI, épinglage)
- Encarts inline (`plant`, `glossary`, `tutorial`, `module_stub`) — format `journal-embed`
- Imports catalogue après apprentissage : `plant` (événements d’observation), `glossary`
  (`learning_acknowledgements`), `tutorial` (`user_tutorial_reads`)
- Recherche / filtre / tri côté client
- Lecture staff (`observations.read.*`) + export `.md`
- Module `ui.modules.observations_enabled` ; limites `observations.journal_max_chars` /
  `observations.journal_max_assets` (0 = illimité)

## Public

Élève, visiteur connecté, prof de classe (carnet personnel). Les routes `/api/observations`
restent pour compatibilité historique ; l’UI et le panneau Stats utilisent le carnet unifié.

## Fichiers

- `lib/fmUserJournal.js`, `routes/user-journal.js`, `migrations/237_user_journal.sql`
- UI : `src/components/journal/*`
- Import : `FmLearnAndImportSlot` + `FmJournalImportButton` sur espèce / glossaire / tuto
