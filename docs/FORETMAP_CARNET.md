# Carnet ForetMap — documentation technique

Miroir ForetMap du carnet personnel GL (« Mon journal », voir `docs/GL_CARNET_JOUEUR.md`).
Produit isolé : tables `user_journal_*`, API `/api/user-journal`, pas de couplage `gl_*`.

## Fonctionnalités

- Articles (titre optionnel, markdown, multi-photos, zone optionnelle, auto-save UI, épinglage)
- **Lecture-first** : cartes lecture + édition ciblée (`editingId` dans `useJournalFeed`)
- Encarts inline (`plant`, `glossary`, `tutorial`, `module_stub`) — format `journal-embed`
  - Resolve enrichi `{ titles, cards }` ; planches à l’affichage
  - Picker par **recherche** (`GET /embeds/search`)
- Imports catalogue après apprentissage : `plant`, `glossary`, `tutorial`
- Recherche / filtre (« Éléments appris ») / tri côté client
- Lecture staff + export `.md` + **vue livre** impression/PDF navigateur
- Module `ui.modules.observations_enabled` ; limites chars/assets (0 = illimité)
- **Hors ligne** (piste D, migration `299`) : sans réseau, « + Nouvel article » crée un
  brouillon local (`utils/journalDraftQueue.js`, file par compte) que l'éditeur partagé
  enregistre sans le savoir — l'adaptateur ForetMap `services/userJournalOfflineAdapter.js`
  a la même interface que `userJournalAdapter` ; G&L n'est pas concerné. Au retour du réseau,
  chaque brouillon part en un `POST /me/articles` portant `client_uuid` (réponse rejouée
  `replayed: true` sur un renvoi). Images et épinglage attendent le réseau ; un refus
  définitif garde le texte, marqué en échec.

## Public

Tout compte ForetMap connecté tient **son** carnet personnel. L’ancien carnet
`observation_logs` est retiré (audit du 25/09/2026, § 3.5) : ses routes `/api/observations`
répondent **410 Gone** (`OBSERVATIONS_LEGACY_GONE`) et plus rien n’y est écrit ; la table reste en
lecture jusqu’au temps 3 (`docs/RUNBOOK_RETRAITS_T3.md`). Les signalements d’espèces validés par
un enseignant sont un module distinct : `/api/species-observations` (migration 307, interrupteur
`ui.modules.species_observations_enabled`).

## Fichiers

- `lib/fmUserJournal.js`, `routes/user-journal.js`, `migrations/237_user_journal.sql`
- UI : `src/components/journal/*` + `src/shared/journal/*` (`JournalBookView`, `JournalArticleReadCard`)
- Import : `FmLearnAndImportSlot` + `FmJournalImportButton` sur espèce / glossaire / tuto
- Illustrations : famille privée `user-journal/` (garde `/uploads` → 403) ; lecture via
  `GET /api/user-journal/assets/:id/file` (propriétaire ou `observations.read.*`)
