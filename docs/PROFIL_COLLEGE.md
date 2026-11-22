# Profil collège et paliers

Synthèse technique du chantier « affichage collège simplifié » (novembre 2026). Le détail des
routes reste dans [`API.md`](API.md), celui du connecteur dans [`MCP.md`](MCP.md), et la
description fonctionnelle pour les enseignants dans
[`reference/foretmap/niveaux-pedagogiques-biodiversite.md`](reference/foretmap/niveaux-pedagogiques-biodiversite.md).

## Principe

- **Un seul affichage collège**, identique de la 6e à la 3e, Visite sans compte comprise.
- Le **palier** (cycle 3 / cycle 4) ne règle que trois choses : la profondeur du vocabulaire
  (glossaire), l’éligibilité des questions du quiz, et les types d’interaction réservés au
  cycle 4 (symbiose, compétition et, depuis le 22/11/2026, mutualisme) du réseau trophique.
- **Simplifier la présentation, pas l’accès** (assouplissement du 22/11/2026, voir plus bas) :
  au collège on ordonne, on étiquette simplement, on replie ; on ne retire que ce qui est hors
  programme, et toujours avec une issue.
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
classe connue et compte personnel sans groupe = `cycle3` ; visiteur sans compte = `cycle4`,
constante `GUEST_NIVEAU` de `learnerLevel`, décision 6 du 22/11/2026).

### Règles de palier

| Règle                       | cycle 3                               | cycle 4             | lycée  | université |
| --------------------------- | ------------------------------------- | ------------------- | ------ | ---------- |
| `glossary_depth_max`        | `base`                                | `approfondissement` | `null` | `null`     |
| `quiz_entry_palier_max`     | `1`                                   | `2`                 | `null` | `null`     |
| `foodweb_types_cycle4_only` | `[symbiose, competition, mutualisme]` | `[]`                | `[]`   | `[]`       |

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
  `profile=college` réduit l’arbre aux boîtes `visible_college` (profondeur 5 au plus depuis la
  racine, avec la boîte « Animaux à quatre membres » rétablie le 22/11/2026).
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

## Assouplissement du 22/11/2026

Décisions d’Oliv du 22/11/2026, prises après l’audit des restrictions du cycle 3 (le profil
collège empilait des filtres durs sans issue). Lycée, université, vue gestion des professeurs et
Gnomes & Licornes : inchangés.

| Sujet                        | Au collège depuis le 22/11/2026                                                                                                                                                                                                                               | Où                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Réseau : espèces hors carte  | **Grisées et cliquables**, jamais retirées, avec la mention « vit ailleurs : <cartes> » ; ressources, consortiums et groupes fonctionnels toujours dans le périmètre (champs `from_elsewhere` / `to_elsewhere`)                                               | flux C1, `routes/food-web.js` ; détail dans [`API.md`](API.md)                                  |
| Réseau : point de départ     | **Sélection de plusieurs espèces** (ajout et retrait d’un clic, depuis la liste ou le graphe) au lieu d’une seule espèce de départ                                                                                                                            | flux C1                                                                                         |
| Réseau : clic sur une espèce | Petit panneau « Ajouter à la sélection » / « Retirer de la sélection » et « Voir la fiche »                                                                                                                                                                   | flux C1 (`nodeClickMode`, défaut inchangé pour le lycée et G&L)                                 |
| Réseau : barrière douce      | Bouton **« Pour aller plus loin »** (réseau complet de la carte) et « Revenir au réseau simplifié » ; cadrage par défaut « Tout » ; `preset` des étapes de séance `open_foodweb`                                                                              | flux C1 ; `preset` dans [`API.md`](API.md) et [`MCP.md`](MCP.md)                                |
| Mutualisme                   | Montré à partir du **cycle 4**, comme la symbiose et la compétition (libellé simple « s’entraident ») ; la pollinisation reste visible dès le cycle 3                                                                                                         | flux C1, `CYCLE4_ONLY_INTERACTION_TYPE_ENUM`                                                    |
| Fiche espèce                 | Sections **Identité** et **Écologie et usages** rendues **repliées** (brique `meta_sections` = `collapsed`) ; nom scientifique dans Identité ; description collège puis bloc replié « Description complète » ; interactions de la fiche en libellés du profil | `PlantMetaSections` (`metaSectionDisplay`), `PlantCatalogPreview`, `PlantPedagoFetchedSections` |
| Visite sans compte           | Palier **cycle 4** (parents, visiteurs institutionnels) : glossaire jusqu’à `approfondissement`, questions de palier 2, types du cycle 4 ; affichage collège inchangé                                                                                         | `resolveLearnerLevel` (front et serveur, `GUEST_NIVEAU`)                                        |
| Groupes emboîtés             | Boîte « Animaux à quatre membres » (clade `tetrapodes`) rétablie : l’arbre collège passe à 5 niveaux depuis la racine                                                                                                                                         | migration `college_assouplissement`                                                             |

Données de la migration `college_assouplissement` (sources : `data/college-assouplissement/`,
migration générée et contrôlée par `scripts/college-assouplissement/build-lot4-migration.js`,
option `--check`, `--db` pour contrôler aussi la base) :

- clade `tetrapodes` visible au collège (« Animaux à quatre membres ») ;
- présences confirmées (`map_species`, `confirme_site`) : abeille domestique, pucerons, mineuse
  de la tomate, escargot petit-gris et escargot espagnol sur n3 ; abeille domestique sur foret ;
- séances 6e : consignes réécrites pour la sélection et « Pour aller plus loin »
  (`6e-sol-de-n3`, `6e-biodiversite-deux-lieux`), `preset` des étapes `open_foodweb`
  (`relations` pour `6e-pollinisation`, `alimentaire` pour `6e-regimes-alimentaires` et
  `6e-sol-de-n3`) — une étape retouchée dans l’application n’est pas réécrite ;
- QF9877 (séance `6e-eau-de-nos-lieux`) : notion C3-ENV en ajout, palier d’entrée 1 ;
- glossaire : « matière organique » au palier `base` (notion C3-MAT) ;
- 20 questions de cycle 3 (QF9934 à QF9953) en `environnement_durable` et
  `ravageurs_auxiliaires`, avec liens non bloquants vers les fiches dans
  `resource_question_links`.

Questions collège actives de palier 1 (copie anonymisée de la production du 22/11/2026, avant /
après la migration) : `environnement_durable` 0 → 10, `ravageurs_auxiliaires` 3 → 13,
`demarche_mesure` 3 → 4 ; total 330 → 351 sur 482 → 502 questions collège actives.
