# Données Gnomes & Licornes

## Assets GL (images / audio conventionnels)

Les illustrations de jeu (`GL_plateau-*`, `GL_biome_*`, `GL_recit_feuillet-action_*`, etc.) se déposent via **Contenus → Bibliothèque** (ZIP ou galerie). Le nom d’origine (`GL_<slug>.ext`) devient la **clé stable** ; les manifestes `_keys.json` / `_manifest.*.json` sont régénérés automatiquement sous `uploads/media-library/`.

**Import local (dev)** : déposer `images.zip` et les MP3 sources dans le dossier `médias/` à la racine du dépôt (non versionné), puis :

```bash
npm run gl:import:media          # images.zip + audio (prepare + upload)
npm run gl:audit:media-keys      # vérifie les clés vs slugs attendus
```

**Audio plateaux** : nommer `GL_plateau-<N>_<variante>.mp3` (ex. `GL_plateau-2_savane.mp3`, `GL_plateau-5_toundra-nuit.mp3`). Préparation depuis les MP3 sources : `node scripts/prepare-gl-audio-pack.mjs [dossier]` → `data/gl/audio-pack/` (inclus dans `gl:import:media`). La musique en jeu choisit la piste selon le **plateau** et le **biome** du chapitre (toundra été/hiver automatique).

Sprites à alpha (`app_*`, `embleme_*`) : versionner dans `public/gl/sprites/` (PNG/WebP).

### Scènes de récit des chapitres (`GL_recit_0N-chapN_*`)

Une image nommée `GL_recit_0N-chapN_<titre>.png` (ou `GL_recit_00-prologue_<titre>.png`) est **automatiquement liée au chapitre N** : galerie de l'onglet **Histoire**, couverture de la **Biocénose**, repli du fond de plateau. Aucune liaison en base — la clé suffit. Convention partagée client/serveur : `src/gl/utils/glChapterRecitConvention.js`.

- **Ordre** : par défaut alphabétique sur la clé (conseil : segment numérique `GL_recit_01-chap1_010_<titre>.png`). Modifiable sans renommer via **Contenus → Chapitres → Scènes de récit** (champ Ordre, méta `recitOrder` dans `_keys.json`).
- **Légende / alt** et **couverture** : éditables au même endroit (`recitCaption`, `recitCover` ; une seule couverture par chapitre). Les métas survivent au ré-import d'un fichier homonyme.
- **Intercalage dans le texte** : `![légende](scene:N)` dans le markdown de l'Histoire insère la N-ième scène à cet endroit ; les scènes intercalées quittent la galerie de fin.
- **Visibilité admin** : ces médias apparaissent « Utilisée · Histoire — chapitre N » dans la médiathèque ; l'audit (**Contenus → Bibliothèque → Audit des conventions**, ou `npm run gl:audit:media-keys`) signale les clés `recit_*` mal nommées (typos), invisibles en jeu.
- **Collisions** : ré-importer un fichier au même nom re-pointe la clé vers le nouveau fichier (dernier import gagnant) — un avertissement est renvoyé à l'upload.

## Intro cinématique (écran de lancement)

- Assets statiques extraits du bundle hors-ligne : `public/gl/intro/` (commande `npm run gl:intro:debundle` depuis le fichier `Intro Gnomes & Licornes (hors-ligne).html`).
- Config éditoriale : clé `content.intro` dans `gl_settings`, modèle par défaut `data/gl/intro.default.json`, admin **Contenus → Intro**.
- Images/audio personnalisés : clés stables `GL_intro_*` via **Contenus → Bibliothèque** (ex. `GL_intro_01_la-boite`, `GL_intro_audio_loop`, `GL_intro_audio_final`).

Snapshot build prod : `npm run gl:build:assets` (appelé aussi par `npm run build`).

## Catalogue espèces / biomes

Fichier de référence : `especes-biomes-gnomes-et-licornes.xlsx` (feuilles `especes`, `biomes_stats`, `groupes_stats`).

Import en base :

```bash
npm run gl:import:species          # simulation (dry-run)
npm run gl:import:species -- --apply
npm run gl:import:species -- --apply --file=chemin/vers/fichier.xlsx
```

Depuis l’admin GL : **Contenus → Espèces** — onglet **Saisie manuelle** (formulaire fiche par fiche) ou **Import XLSX** (upload, dry-run puis appliquer ; boutons **Modèle XLSX** et **Exporter le catalogue**, ou API `GET /api/gl/admin/species/import/template` et `GET /api/gl/admin/species/export?statut=actif|all` avec filtre optionnel `biomeSlug`). CRUD unitaire : `POST/PUT /api/gl/admin/species`, `GET /api/gl/admin/species?biomeSlug=`.

Après import, lier un ou plusieurs biomes catalogue à un chapitre via **Contenus → Chapitres → Biomes (catalogue espèces)** (sélection multiple ; alimente biocénose, glossaire et QCM du chapitre).

## Série de chapitres (import / export)

Fichier de référence : `chapitres-gnomes-et-licornes-exemple.xlsx` (portée `full` : feuilles `chapitres`, `reperes`, `zones_royaume`, `chapitres_charte`).

```bash
npm run gl:import:chapters          # simulation (dry-run)
npm run gl:import:chapters -- --apply
npm run gl:import:chapters -- --apply --sync-reperes --sync-zones
npm run gl:import:chapters:example  # régénère le fichier exemple
```

Depuis l’admin GL : **Contenus → Chapitres** — section **Import / export chapitres (XLSX)**. Trois portées au choix :

| Portée | Feuilles |
|--------|----------|
| Contenu éditorial | `chapitres` (incl. `souffle_face`) |
| Contenu + repères | `chapitres`, `reperes` |
| Export complet | `chapitres`, `reperes`, `zones_royaume`, `chapitres_charte` |

La feuille **`reperes`** inclut les traits plateau : `sous_biome_slug`, `effet_mecanique`, effets Gnome/Licorne (`effet_*`, `dpv_*`, `dgem_*`, `dmvt_*`), deltas neutres (`delta_pv`, `delta_gemmes`, `delta_mouvement`), métadonnées QCM (`categorie_question`, `niveau_question`) et optionnellement `tonalite` / `rarete`. Les alias FR de type (`depart`, `evenement`, `souffle`, `trame`, `defi`, `raccourci`, `frontiere`, `arrivee`) sont acceptés à l'import.

API : `GET /api/gl/chapters/admin/import/template?scope=`, `GET /api/gl/chapters/admin/export?scope=&slug=`, `POST /api/gl/chapters/admin/import` (`syncReperes`, `syncZones` pour remplacer repères/zones absents du fichier, par chapitre).

Sémantique import chapitres : cellule **vide** = champ inchangé ; **titre** obligatoire pour créer un slug inconnu ; `biomes_slugs` et `sorts_codes` en CSV.

## Charte graphique des chapitres (import dédié)

Feuille XLSX : `chapitres_charte` (colonnes `slug`, `titre`, `image_carte_url`, couleurs `couleur_*`, cadre `cadre_*`). Incluse aussi dans l’export **complet** ci-dessus.

API dédiée (inchangée) : `GET /api/gl/chapters/admin/charte/import/template`, `GET /api/gl/chapters/admin/charte/export?slug=`, `POST /api/gl/chapters/admin/charte/import`.

Sémantique import charte : cellule **vide** = ne pas modifier le champ ; **`reset`** ou **`-`** sur une couleur = réhériter de la charte plateforme pour cette teinte ; **titre** obligatoire pour créer un chapitre inconnu.

## Catalogue sortilèges

Fichier de référence : `sortileges-gnomes-et-licornes.xlsx` (feuilles `sortileges`, `categories_stats`).

```bash
npm run gl:import:spells          # simulation (dry-run)
npm run gl:import:spells -- --apply
npm run gl:import:spells -- --apply --file=chemin/vers/fichier.xlsx
```

Depuis l’admin GL : **Contenus → Sortilèges** — onglet **Saisie manuelle** ou **Import XLSX** (boutons **Modèle XLSX** et **Exporter le catalogue**, ou API `GET /api/gl/admin/spells/import/template` et `GET /api/gl/admin/spells/export`). CRUD unitaire : `POST/PUT/DELETE /api/gl/admin/spells`, `GET /api/gl/admin/spells?categorySlug=`.

Après import, cocher les sorts utilisables par chapitre via **Contenus → Chapitres → Sorts du chapitre** (tout cocher / tout décocher par catégorie). L’onglet joueur **Sortilèges** affiche le grimoire filtré ; un clic ouvre la fiche en popover.

## Glossaire pédagogique

Fichier de référence : `glossaire-gnomes-et-licornes.xlsx` (feuille `glossaire`).

```bash
npm run gl:import:glossary          # simulation (dry-run)
npm run gl:import:glossary -- --apply
```

Depuis l’admin GL : **Contenus → Glossaire** — onglet **Saisie manuelle** (formulaire terme par terme) ou **Import XLSX** (boutons **Modèle XLSX** et **Exporter le catalogue**, ou API `GET /api/gl/admin/glossary/import/template` et `GET /api/gl/admin/glossary/export?statut=actif|all`). CRUD unitaire : `POST/PUT /api/gl/admin/glossary/terms`, `GET /api/gl/admin/glossary/terms`.

Les termes sont filtrés par biome du chapitre ; les fiches espèces affichent des liens glossaire via `mots_cles` (re-importer les espèces après ajout de la colonne).

## QCM biomes

Fichier de référence : `qcm-biomes-gnomes-et-licornes-consolide.xlsx` (feuilles `categories`, `questions`). La feuille `questions` inclut les retours pédagogiques `feedback_correct`, `feedback_a`…`feedback_e` (re-import par `id` / `question_code` pour compléter le catalogue sans recréer les lignes).

```bash
npm run gl:import:qcm          # simulation (dry-run)
npm run gl:import:qcm -- --apply
```

Depuis l’admin GL : **Contenus → QCM biomes** (boutons **Modèle XLSX** et **Exporter le catalogue**, ou API `GET /api/gl/admin/qcm/import/template` et `GET /api/gl/admin/qcm/export` avec filtres optionnels `biomeSlug`, `categorieSlug`, `statut`).

Les questions sont liées au glossaire SVT via `mots_cles` / `tags` (importer le glossaire avant ou re-importer le QCM après). Les réponses sont mélangées à chaque présentation (`GET /api/gl/qcm/questions/:code/present`) ; le message affiché après validation provient des colonnes feedback du fichier consolidé.

## QCM lore (histoire G&L)

Fichier de référence : `qcm-lore-gnomes-et-licornes.xlsx` (feuilles `chapitres`, `categories`, `questions`). Codes questions **`LQCM0001`**… ; scopes chapitre `ch0`…`ch5` et `tous` ; `tier_lore` (`cle` / `recit`) ; pas de colonnes photo.

```bash
npm run gl:import:qcm-lore          # simulation (dry-run)
npm run gl:import:qcm-lore -- --apply
```

Depuis l’admin GL : **Contenus → QCM lore** (ou API `GET /api/gl/lore/admin/qcm/import/template`, `GET /api/gl/lore/admin/qcm/export`).

En partie, le pool repère lore résout les scopes via `gl_chapters.plateau_number` : mode `chapter` inclut toujours `tous` plus `ch{N}` (ex. plateau 3 → `ch3` + `tous`). Les questions `ch0` (accroche) ne sont pas auto-incluses : pool `custom` ou sélection explicite dans l’éditeur de repère.

Liens auto vers le glossaire lore (`gl_lore_glossary_terms`) via `mots_cles` / `tags` — importer le glossaire lore avant le QCM lore pour maximiser les liens.

## Carnet de Sélène (feuillets lore)

Fichier de référence : `corpus-feuillets-selene.xlsx` (feuilles `feuillets`, `plateaux`, `biomes`).

Import **tolérant** (conçu pour ne jamais échouer sur ce type de fichiers) :

- Noms de feuilles **insensibles à la casse/aux accents** ; feuilles supplémentaires
  (`README`, `biomes`, …) et colonnes inconnues simplement **ignorées**.
- **Biome hors-référentiel** (`gl_biomes`) → feuillet importé **sans biome**
  (`biome_slug = NULL`) avec un avertissement dans `report.feuillets.warnings` — jamais de skip.
- `type` / `mode_apparition` inconnus → valeur par défaut (`feuillet` / `boite`).
- Mise à jour : upsert sur `feuillet_code` ; cellule vide = champ inchangé.
- Plafonds : **1000** lignes, **8 Mo** par fichier (`FORETMAP_GL_IMPORT_MAX_FILE_BYTES`).

Colonnes optionnelles sur la feuille `feuillets` :

- **`image_url`** — illustration de scène (`/uploads/media-library/image/<nom>.png`, voir `MANIFESTE-images.md` dans la bibliothèque média).
- **`image_coupe_url`** — coupe pédagogique (pages-biome), même format d’URL.
- **`lien_canal`** — canal de liaison (`espece`, `espece_pays`, `intro_pays`) ; cellule vide = pas de liaison.
- **`lien_ref`** — référence du lien : code espèce (`espece`, ex. `SP0049`) ou biomes du pays (`espece_pays`, ex. `taiga,desert_froid`).
- **`lien_pays`** — numéro de pays du voyage (1–5, ordre équateur→pôle) pour `espece_pays`.
- **`lien_ordre_recit`** — ordre narratif des feuillets liés (route pays ou intros `cop-mov`).
- **`lien_note`** — note éditoriale interne (non affichée en jeu).

Ré-import partiel : cellule **vide** sur `image_*` et `lien_*` = valeur en base conservée (`COALESCE` côté serveur). Les feuillets `reponse`, `vierge` et les `copiste` hors `cop-mov` restent volontairement non branchés à l’étude d’espèces ; les feuillets `reponse` / `vierge` restent généralement sans illustration.

```bash
npm run gl:import:lore-feuillets          # simulation (dry-run)
npm run gl:import:lore-feuillets -- --apply
npm run gl:import:lore-feuillets -- --apply --file=chemin/vers/fichier.xlsx
```

Depuis l’admin GL : **Contenus → Carnet Sélène** — import XLSX (boutons **Modèle XLSX** / **Exporter**, API `GET /api/gl/lore/admin/feuillets/import/template` et `GET /api/gl/lore/admin/feuillets/export`). Liaison optionnelle d’un feuillet à une zone polygonale : panneau zone du studio carte ou `PUT /api/gl/lore/admin/feuillets/:code/kingdom-zone`.

Runtime — **accès** : les feuillets ne sont **pas lisibles par défaut**. Le joueur ne voit que la **liste** scopée aux biomes des chapitres qu'il a joués ; un feuillet non trouvé est servi en **aperçu verrouillé** (titre + champs de `gameplay.lore_feuillet_preview_fields`, défaut `incipit`). MJ : accès intégral.

Runtime — **obtention** : découverte à l’entrée en zone (`POST /api/gl/lore/games/:id/feuillets/:code/present`), première étude d’espèce (`POST /api/gl/learning/species/:code` avec `gameId`), **ou** — si l'acquisition ③ est activée — toute **première consultation gatée** d'un élément consultable (`POST /api/gl/learning/mark/:type/:ref`, glossaire, tutoriel) qui attribue un feuillet du **pool du chapitre** à l'équipe (`feuilletRevealed`). Le **nom du découvreur** est mémorisé (`gl_game_feuillet_states.discovered_by_*`) et affiché (« Découvert par … »). Onglet joueur **Carnet de Sélène** ; réglages plateforme/partie (`gameplay.lore_*` dont `lore_feuillet_acquisition_enabled` / `_channels`, `modules.lore_carnet_enabled`). Détail : `docs/AUDIT_FEUILLETS_ACCES.md`.

## Glossaire narratif (lore)

Fichier de référence : `glossaire-lore-gnomes-et-licornes.xlsx` (feuille `glossaire`). **Distinct** du glossaire SVT (`gl_glossary_*`).

```bash
npm run gl:import:lore-glossary          # simulation (dry-run)
npm run gl:import:lore-glossary -- --apply
```

Depuis l’admin GL : **Contenus → Glossaire lore** — import XLSX (`GET /api/gl/lore/admin/glossary/import/template`, `GET /api/gl/lore/admin/glossary/export`). Onglet joueur **Lexique du lore** ; auto-liens dans les feuillets via `GET /api/gl/lore/glossary/link-index`.
