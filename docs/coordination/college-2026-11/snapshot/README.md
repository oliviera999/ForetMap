# Instantané de contenu — chantier collège (21/11/2026)

Exporté de la **production** le **21/11/2026 vers 17 h 52 UTC** (schéma 377, v1.259.8), en
**lecture seule**, par `foretmap_export` (JSON, une ligne d'objet par ligne de table). Sert
aux flux de contenu (D1 à D6) et aux fixtures de tests (C4) qui n'ont pas le connecteur.

Colonnes personnelles **exclues** : `created_by`, `first_record_by`, `first_record_at`,
`hazard_reviewed_by`, `hazard_reviewed_at`, `restricted_note`, horodatages d'édition, et toute
colonne liée à `users`. Contrôle fait à l'export : aucune adresse e-mail, aucun hachage.

| Fichier                          | Lignes | Filtre / remarque                                               |
| -------------------------------- | -----: | --------------------------------------------------------------- |
| `plants.json`                    |    650 | colonnes de contenu (sans les photos de détail ni l'historique) |
| `clades.json`                    |     74 | arbre complet                                                   |
| `map_species.json`               |    841 | registre de présence (sans `first_record_*`)                    |
| `zones.json`                     |    139 | `id`, `map_id`, `name` seulement                                |
| `zone_species.json`              |   1236 |                                                                 |
| `species_interactions.json`      |   1279 |                                                                 |
| `glossary_terms.json`            |    482 |                                                                 |
| `glossary_category_notions.json` |     56 |                                                                 |
| `curriculum_notions.json`        |     26 |                                                                 |
| `quiz_questions.json`            |    737 | `statut = 'actif'` seulement (73 inactives écartées)            |
| `quiz_question_notions.json`     |    482 | ajouts et exclusions (`mode`)                                   |
| `quiz_category_notions.json`     |     66 |                                                                 |
| `quiz_categories.json`           |     20 |                                                                 |
| `id_keys.json`                   |     31 | sans `created_by`                                               |
| `id_key_couplets.json`           |    279 |                                                                 |
| `id_key_leads.json`              |    858 |                                                                 |
| `id_key_lead_plants.json`        |    128 |                                                                 |
| `pedago_sessions.json`           |     20 | sans `created_by`                                               |
| `maps.json`                      |      7 | sans images ni ancres GPS                                       |

Les colonnes ajoutées par la migration de socle (`usage_label`, `is_featured`…) n'existent pas
encore en production : elles sont absentes de l'instantané.

**Charger l'instantané dans une base de test** : `node scripts/college-2026-11/load-snapshot.js`
(voir la fiche, § « Recette des tests »). Ce dossier ne va pas sur `main` : SI le supprime.
