# Profil collège et paliers

Synthèse technique du chantier « affichage collège simplifié » (novembre 2026). Le détail des
routes reste dans [`API.md`](API.md), celui du connecteur dans [`MCP.md`](MCP.md), et la
description fonctionnelle pour les enseignants dans
[`reference/foretmap/niveaux-pedagogiques-biodiversite.md`](reference/foretmap/niveaux-pedagogiques-biodiversite.md).

## Principe

- **Un seul affichage collège**, identique de la 6e à la 3e, Visite sans compte comprise.
- Le **palier** (cycle 3 / cycle 4) ne règle que trois choses : la profondeur du vocabulaire
  (glossaire), l’éligibilité des questions du quiz, et les types d’interaction symbiose et
  compétition du réseau trophique.
- **Lycée et université : inchangés.** Toute brique « collège seulement » vaut `hide` au lycée
  et à l’université ; toute règle de palier y vaut `null` (pas de filtre) ou `[]`.

## Où se décide l’affichage

| Élément                                     | Emplacement                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Table de visibilité (briques et règles)     | `src/shared/pedagoVisibilityCore.js` (miroir généré `lib/shared/pedagoVisibilityCore.js`) |
| Résolution de l’apprenant (classe, séance…) | `lib/pedago/learnerLevel.js`, miroir `src/utils/learnerLevel.js`                          |
| Lecture côté front                          | `BiodivPedagoContext` : `canShow(clé)`, `visibility(clé)`, `palierRule(règle)`            |
| Lecture côté serveur                        | `visibilityFor`, `palierRuleFor`, `biodivFeatureVisibility` (`lib/biodivPedagoLevel.js`)  |

Profil d’affichage : `college`, `lycee`, `universite` (déduit de `learner.etape`). Profil de
palier : `cycle3`, `cycle4`, `lycee`, `universite` (déduit de `learner.niveau` ; collégien sans
classe connue et visiteur sans compte = `cycle3`).

### Règles de palier

| Règle                       | cycle 3                   | cycle 4             | lycée  | université |
| --------------------------- | ------------------------- | ------------------- | ------ | ---------- |
| `glossary_depth_max`        | `base`                    | `approfondissement` | `null` | `null`     |
| `quiz_entry_palier_max`     | `1`                       | `2`                 | `null` | `null`     |
| `foodweb_types_cycle4_only` | `[symbiose, competition]` | `[]`                | `[]`   | `[]`       |

Une valeur non nulle de `glossary_depth_max` signale aussi le popover « collège » (définition
courte d’abord) : le lycée doit rester à `null`.

### Briques propres au chantier

`taxonomy_line`, `meta_sections`, `range_gauges`, `nutrition_badge`, `iucn_code` (`'code'` |
`'mots'`), `visit_tile_scientific_name`, `usage_label`, `description_college`,
`foodweb_offmap_species`, `foodweb_full_by_default`, `nested_groups_full_tree`,
`catalog_grouped`, `featured_first`, `zone_tiles_cap` (`null` | entier, 12 au collège).

## Colonnes ajoutées (migration `college_socle`)

| Colonne                                                      | Rôle                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `clades.visible_college`, `label_simple`, `attribute_simple` | Boîtes gardées au collège (groupes d’usage), libellé et attribut simples |
| `map_species.is_featured` (+ index `(map_id, is_featured)`)  | Espèce phare d’une carte                                                 |
| `plants.usage_label`                                         | Étiquette simple (« un petit oiseau des jardins »)                       |
| `plants.description_college`                                 | Description collège (espèces phares)                                     |
| `quiz_categories.description_college`                        | Présentation collège d’une catégorie de quiz                             |

Données semées par les migrations de contenu : `college_referentiel_notions`,
`college_corrections_immediates`, `college_groupes_usage`, `college_quiz_paliers`,
`college_cles_courtes`, `college_etiquettes_simples`, `college_especes_phares` (données dans
`data/college-2026-11/`, migrations générées par `scripts/college-2026-11/build-*-migration.js`,
option `--check`).

## Paramètres d’API ajoutés

- `GET /api/plants` : `usage_label`, `description_college`, `usage_group` (`{ id, label }`).
- `GET /api/clades`, `/:id/path`, `POST /activity/subtree`, `POST /activity/check` :
  `profile=college` réduit l’arbre aux boîtes `visible_college` (profondeur 4 au plus).
- `PATCH /api/plants/:id/map-species/:mapId` : `is_featured` (`plants.manage`).
- `GET /api/visit/content` : `is_featured`, `validation_status` sur les espèces d’une zone.
- `GET /api/quiz/draw`, `GET /api/quiz/categories` : `palierMax` (1–5) ; catégories avec
  `description_college`.
- `GET /api/tutorials/:id/view` : auto-lien du glossaire au palier de l’élève authentifié.

## Options de séance

- `notionNiveau` : défaut « Tout le collège » (la classe précise le palier) pour une séance
  Collège ; `cycle3` / `cycle4` fixent le palier le temps de la séance.
- Étape `open_foodweb` : `plantIds` facultatif (12 au plus, `FOODWEB_STEP_MAX_PLANT_IDS`) en
  plus de `highlightPlantId`.

## Connecteur (MCP)

- `foretmap_species` : `usage_label`, `usage_group` ; `registry_status` accepte `is_featured`.
- `foretmap_get_species` : `usage_label`, `description_college`, `presence.maps[].is_featured`.
- `foretmap_quiz` : `categories` accepte `palier_max` ; `get` rend `notions.entry_palier`.
- `foretmap_pedago_sessions` : `plantIds` des étapes `open_foodweb`.
