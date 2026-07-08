# Mon journal — carnet personnel du joueur GL

Documentation descriptive de la fonctionnalité **« Mon journal »** du sous-produit
**Gnomes & Licornes** (GL). C'est le carnet personnel de chaque joueur : un espace libre,
chronologique, où il rédige des articles (texte et/ou médias) et importe les éléments du site
qu'il a appris. Complète `docs/GL_ARCHITECTURE.md` (section « Carnet personnel joueur ») et
`docs/API.md` (endpoints) ; ce document donne la vue d'ensemble fonctionnelle et le détail
d'implémentation propre au carnet.

- **Onglet** : `my-journal` (« Mon journal »), visible si le module `modules.player_journal_enabled`
  est actif.
- **Public** : joueurs GL (`gl_player`). Le maître du jeu (MJ) peut le consulter en lecture seule.
- **Portée** : le carnet est **personnel et global** au joueur (il n'est pas lié à une partie).

---

## 1. Vue d'ensemble

Le carnet est un **fil chronologique** (du plus récent au plus ancien) qui mélange deux natures
d'entrées :

| Entrée      | Description                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------------- |
| **Article** | Contenu rédigé par le joueur : titre optionnel + texte markdown et/ou illustrations.               |
| **Import**  | Référence vers un élément du site que le joueur a **appris**, affichée avec son vrai titre + lien. |

Il n'y a **aucune notion de brouillon/publication** : tout est enregistré au fil de l'eau
(auto-save). Chaque article conserve ses horodatages de **création** et de **dernière
modification**.

Une **barre d'outils** (visible dès qu'il y a au moins une entrée) permet de **rechercher**
(titre/texte des articles, titre/référence des imports), de **filtrer** par type d'entrée
(tout / articles / imports) et de **trier** (plus récent ou plus ancien d'abord). Ces contrôles
agissent **côté client** sur les données déjà chargées (aucun appel réseau supplémentaire).

### Ce qu'un joueur peut faire

- Créer autant d'**articles** qu'il veut (bouton « Nouvel article »).
- Écrire du texte (markdown), y **associer des images**, ou publier un article **« média seul »**
  (corps vide + illustrations).
- Insérer des **encarts** vers des éléments du site (sortilège, espèce, glossaire, chapitre…).
- **Importer** un élément du site (feuillet, écosystème, fiche espèce, tutoriel, définition,
  page de contenu) — une fois cet élément **marqué appris/lu/découvert**, éventuellement après
  la réussite d'un **quiz**.
- Retirer un article ou un import à tout moment.

---

## 2. Les articles

### Rédaction

- **Titre** : facultatif (255 caractères max). Un article sans titre reste valide (utile pour les
  articles « média seul »).
- **Corps** : markdown. Peut être vide.
- **Auto-save** : la saisie (titre + corps) est enregistrée automatiquement après une courte
  pause (hook `useDebouncedAutoSave`). L'état d'enregistrement est affiché près de l'horodatage.

### Illustrations

- Les images s'ajoutent via le bouton **« Ajouter une image »** (elles sont compressées puis
  stockées sur disque et rattachées à l'article).
- Elles sont insérées dans le corps markdown au niveau du curseur, et listées sous l'article
  (avec possibilité de suppression).
- Les URLs d'images acceptées dans le corps sont **restreintes au préfixe du joueur**
  (`/uploads/gl-player-journal/{playerId}/`) : toute image hors de ce préfixe est retirée à
  l'enregistrement (sécurité).

### Encarts (« Insérer un élément »)

Un encart est une balise `<aside class="gl-journal-embed" data-gl-embed-type="…" data-gl-ref="…">`
insérée dans le corps. Types disponibles : `spell`, `species`, `glossary`, `chapter`,
`module_stub`. La validité de la référence est contrôlée côté serveur à l'enregistrement.

**Hydratation du titre** : le corps markdown ne stocke que le **type + la référence** (round-trip
d'édition intact). À l'affichage (aperçu de l'article et lecture MJ), le hook
`useGlJournalEmbedTitles` résout le **titre réel** de chaque encart via
`POST /player-journal/embeds/resolve` et l'injecte en attribut `data-gl-title` sur le HTML déjà
sécurisé ; le CSS affiche alors le vrai titre (repli sur « type · ref » tant que non résolu ou si
la référence est introuvable). Le markdown stocké **n'est jamais modifié**.

> Distinction : les **encarts** sont saisis _dans_ le texte d'un article. Les **imports**
> (section 4) sont des entrées autonomes du fil, avec un rendu titré et un lien.

### Limites (aucune par défaut)

Le carnet **n'impose aucune limite explicite par défaut**. Deux réglages optionnels existent,
appliqués **par article** :

| Réglage GL                           | Défaut         | Effet                                                  |
| ------------------------------------ | -------------- | ------------------------------------------------------ |
| `gameplay.player_journal_max_chars`  | `0` (illimité) | Plafond de caractères d'un article (sinon 500–200000). |
| `gameplay.player_journal_max_assets` | `0` (illimité) | Plafond d'illustrations d'un article (sinon 1–200).    |

`0` = illimité. Lorsque le plafond est `0`, le compteur affiché dans l'éditeur est purement
informatif (pas de blocage).

---

## 3. Marquer un élément comme « appris / lu / découvert »

L'import (section 4) n'est possible que pour un élément **acquis** par le joueur. L'acquisition
repose sur le système d'apprentissage GL (`gl_learning_acknowledgements`, état par joueur) :

1. Le joueur **consulte** l'élément sur sa page.
2. Il clique sur **« Marquer comme appris »** (libellé **harmonisé** sur toutes les pages :
   même intitulé d'action « Marquer comme appris » et même état « ✓ Appris »).
3. Si l'élément est **conditionné par un quiz** (gating configuré via `gl_resource_question_links`
   / `gl_resource_gating_policy`), un ou plusieurs **QCM** doivent être **réussis** avant de
   pouvoir confirmer.
4. Après confirmation explicite, l'acquisition est enregistrée (upsert idempotent).

Types marquables (`GL_MARKABLE`) : `species`, `glossary`, `tutorial`, `lore_glossary`,
`feuillet`, `content_page`, `ecosystem`.

> **Biotope / biocénose** : il n'existe pas d'entité dédiée en base (ce sont des champs markdown
> du chapitre). Sur la **page Écosystèmes**, chaque écosystème est identifié **par biome**
> (`ecosystem` / `biome_slug`) : c'est cette unité qui se marque et s'importe.

### Configurer un gating par quiz (prof/MJ)

Le conditionnement par quiz est **indépendant du carnet** : il vaut pour **tous** les types
marquables (les 7 de `GL_MARKABLE`), y compris `ecosystem`, `feuillet`, `content_page` et
`lore_glossary`. Aucune restriction ne lie un type de ressource à un jeu de questions précis :
on peut conditionner n'importe quelle ressource par n'importe quelle question `qcm` (écologie) ou
`qcm_lore` (narratif). **UI dédiée (G3)** : les liens ressource ↔ question se gèrent dans
**Contenus → Conditionnement QCM** (`GLLearningLinksPanel`, permission `gl.content.manage`) et les
réglages globaux `gating.*` dans **Réglages plateforme → Conditionnement par QCM**
(`GLGatingSettings`, permission `gl.settings.manage`, écrit via `PUT /api/gl/learning-links/settings`).
L'API GL `/api/gl/learning-links` reste utilisable directement ; marche à suivre :

1. **Activer le gating** (réglage site, une fois) :
   `PUT /api/gl/learning-links/settings` avec `{ "key": "gating.enabled", "value": true }`.
2. **Lier une (ou plusieurs) question(s) à la ressource** — chaque lien bloquant (`is_gating: 1`)
   doit être **réussi** avant l'accusé :
   `POST /api/gl/learning-links` avec, par exemple pour un écosystème :

   ```json
   {
     "questionDataset": "qcm",
     "resourceType": "ecosystem",
     "resourceRef": "savane",
     "questionCode": "GQ042",
     "isGating": 1,
     "status": "approved"
   }
   ```

   Adapter `resourceType`/`resourceRef` : `feuillet` → `feuillet_code`, `content_page` → `slug`,
   `lore_glossary` → `lore_code` (dataset `qcm_lore` recommandé pour le narratif).

3. **(Optionnel) régler la politique** de la ressource
   (`PUT /api/gl/learning-links/policy` : `mode`, `required_correct`, `enabled`) ou la
   **granularité** (site / chapitre / scope). Par défaut, le mode `all` exige **toutes** les
   questions bloquantes.

Côté joueur, dès que `gating.enabled` est vrai et qu'un lien `is_gating` approuvé existe pour la
ressource, le bouton « Marquer comme appris » ouvre automatiquement le QCM (composant générique
`GLLearningAcknowledgeButton`) : le flux **consulter → quiz → confirmer → appris** est identique
pour les 7 types. Une fois l'élément appris, l'import dans le carnet est débloqué.

> **Vérification** : le flux de bout en bout est verrouillé par
> `tests/gl-learning-gating-newtypes.test.js` (challenge + `mark` de `content_page` et `ecosystem`).

---

## 4. Importer un élément dans le carnet

Une fois l'élément acquis, un bouton **« Ajouter à mon journal »** apparaît sur sa page. L'import :

- crée une entrée dans le fil (table `gl_player_journal_imports`),
- fige un **titre** (fourni par le client, sinon résolu côté serveur, sinon `type · ref`) — ce
  titre figé sert désormais de **repli** (voir ci-dessous),
- est **idempotent** (unique par `(joueur, type, référence)`),
- est **refusé (404)** si la ressource n'existe pas, **(403)** si l'élément n'a pas été appris au
  préalable.

> **Titres résolus à l'affichage (A.4)** : à la lecture du carnet, le titre de chaque import est
> **re-résolu** depuis la source (titre courant de l'espèce, du terme, du biome…), pour refléter un
> éventuel **renommage**. Si la source est introuvable (supprimée) ou non résolvable, on **retombe
> sur le titre figé** à l'import. Résolutions faites en parallèle (`resolveResourceTitle`).

> **Validation des écosystèmes (A.3)** : l'existence d'un `ecosystem`/`biome_slug` est validée
> contre la table de registre **`gl_biomes`** (source de vérité, cible de la FK `gl_chapter_biomes`),
> et non plus contre la seule présence d'espèces — un slug bien formé mais non enregistré est
> désormais **rejeté**.

> **État « déjà dans mon journal »** : le bouton d'import reflète l'état **dès le chargement**
> de la page de l'élément (« ✓ Dans mon journal » au lieu de « + Ajouter »). Il s'appuie sur un
> endpoint léger `GET /player-journal/me/imports/refs` (liste des `(resourceType, resourceRef)`
> déjà importés, sans charger tout le carnet).

L'élément importé s'affiche comme une **carte** dans le fil chronologique : icône + libellé du
type + **titre réel** + date d'import + bouton **« Voir »** et **« Retirer »**.

### Lien « Voir » profond

Le bouton **« Voir »** ouvre l'**élément précis** dans sa vue (pas seulement l'onglet). L'utilitaire
`utils/glJournalImportMeta.js` (`importTargetNav`) produit une cible `{ tab, focusType, focusRef }` ;
`AppGL` pose la cible de focus puis change d'onglet, et la vue destinataire ouvre l'élément via un
`useEffect` de focus (modal/onglet/lecteur), sur le modèle du focus glossaire déjà existant.

| Type            | Libellé            | Onglet cible    | Ouverture précise « Voir »                                           |
| --------------- | ------------------ | --------------- | -------------------------------------------------------------------- |
| `species`       | Fiche biodiversité | `biodiversite`  | ouvre la fiche espèce (`focusSpeciesCode`, via `GET /species/:code`) |
| `ecosystem`     | Écosystème         | `ecosystemes`   | sélectionne l'onglet du biome (`focusEcosystemSlug`)                 |
| `glossary`      | Définition         | `glossary`      | ouvre le terme (`focusCode` existant)                                |
| `lore_glossary` | Lexique lore       | `lore-glossary` | ouvre le terme (`focusCode` existant)                                |
| `tutorial`      | Tutoriel           | `tutorials`     | ouvre le tutoriel (`focusTutorialId`)                                |
| `feuillet`      | Feuillet de Sélène | `selene-carnet` | ouvre le feuillet accessible (`focusFeuilletCode`)                   |
| `content_page`  | Page du monde      | slug de la page | l'onglet **est** la page                                             |

> **Espèces** : « Voir » ouvre directement la **fiche** de l'espèce, indépendamment de l'onglet
> biome courant, en la récupérant par code via `GET /api/gl/species/:code` (`GLBiodiversityView`
> monte alors `GLSpeciesDetailModal`).

L'import est **réservé aux joueurs** (`gl_player`) : le bouton est masqué pour les invités et le
MJ.

### Épinglage, tri, recherche & accessibilité

- **Épinglage** : chaque **article** et chaque **import** peut être **épinglé** (bouton « Épingler »
  / « 📌 Épinglé »). Les entrées épinglées remontent **en tête** du fil (avant le tri
  chronologique). Persisté côté serveur : colonne `pinned` (migration `160`), routes
  `PUT /player-journal/me/articles/:id/pin` et `.../me/imports/:id/pin` (`{ pinned }`), booléen
  `pinned` exposé dans `GET /me`.
- **Recherche / filtre / tri** : la barre d'outils du fil (voir §1) filtre/rechercher/trie côté
  client sur les données déjà chargées.
- **Accessibilité** : boutons d'import et de carte porteurs d'`aria-label` explicites (« Voir
  “…” », « Épingler “…” », « Retirer “…” »), `aria-pressed` sur les bascules d'épinglage,
  contrôles natifs navigables au clavier ; cibles tactiles ≥ 44 px (composant `GLButton`).

---

## 5. Exemples de flux joueur pas-à-pas

Scénarios concrets, du point de vue de l'élève. Toutes les actions sont dans l'onglet indiqué ;
le carnet est l'onglet **« Mon journal »**.

### Flux A — Écrire un article texte

1. Onglet **« Mon journal »** → bouton **« + Nouvel article »**.
2. Un article vide apparaît en tête du fil. Saisir un **titre** (facultatif) puis le **texte** dans
   la zone de rédaction.
3. Ne rien faire de plus : l'**enregistrement est automatique** (mention « Enregistré » près de la
   date). L'horodatage « Modifié le… » se met à jour.
4. Pour revenir plus tard : rouvrir « Mon journal », l'article est toujours là, modifiable.

### Flux B — Publier un article « média seul » (photos sans texte)

1. « Mon journal » → **« + Nouvel article »** (laisser le titre et le texte vides si souhaité).
2. Cliquer **« Ajouter une image »**, choisir une photo (JPEG/PNG/WebP). L'image est compressée,
   envoyée, puis insérée dans l'article et listée dessous.
3. Répéter pour ajouter d'autres images. L'article se sauvegarde tout seul.
4. Résultat : une entrée du carnet composée uniquement d'illustrations.

### Flux C — Insérer un encart vers un élément du site (dans un article)

1. Dans l'éditeur d'un article, placer le curseur à l'endroit voulu, cliquer **« Insérer un
   élément »**.
2. Choisir le **type** (sortilège, espèce, glossaire, chapitre…) et saisir/choisir la **référence**.
3. Valider : un encart est inséré dans le texte. À l'enregistrement, la référence est **vérifiée
   côté serveur** ; si elle n'existe pas, l'enregistrement est refusé avec un message.

### Flux D — Importer une définition apprise (avec quiz)

1. Aller dans **« La nature » → « Glossaire »**, ouvrir la fiche d'un terme (popover).
2. Cliquer **« Marquer comme appris »**.
3. Si le terme est **conditionné par un quiz** : répondre aux **QCM** proposés. En cas de mauvaise
   réponse, on peut réessayer ; il faut **réussir** pour continuer.
4. Cocher la case de confirmation puis **« Confirmer »** : le terme devient « ✓ Appris ».
5. Le bouton **« + Ajouter à mon journal »** apparaît → cliquer dessus.
6. Ouvrir **« Mon journal »** : la définition figure dans le fil, à sa date, avec son **titre réel**
   et un bouton **« Voir »** qui ramène au glossaire.

### Flux E — Importer un écosystème (biotope / biocénose)

1. Aller dans **« La nature » → « Écosystèmes »**. S'il y a plusieurs biomes, choisir l'onglet du
   biome voulu.
2. En bas de la section, cliquer **« Marquer cet écosystème comme étudié »** (réussir le quiz s'il
   y en a un), puis confirmer.
3. Cliquer **« + Ajouter à mon journal »**.
4. Dans « Mon journal », l'écosystème apparaît (libellé « Écosystème »), avec **« Voir »** qui
   ramène à l'onglet Écosystèmes.

> Même principe pour les **feuillets** (onglet « L'aventure → Carnet de Sélène »), les **fiches
> biodiversité** (« La nature → Biodiversité »), les **tutoriels** (« Le monde G&L → Tutoriels »),
> le **lexique lore** (« Le monde G&L → Lexique lore ») et les **pages du monde**.

### Flux F — Retirer une entrée

- **Article** : dans l'éditeur de l'article, bouton **« Supprimer »** (retire aussi ses images).
- **Import** : sur la carte de l'élément importé, bouton **« Retirer »** (retire l'entrée du carnet ;
  l'élément d'origine et son statut « appris » ne sont pas affectés).

### Ce que voit le MJ

Le MJ n'écrit rien : depuis les statistiques de classe, il **consulte** le carnet d'un joueur en
lecture seule (articles rendus + liste des éléments importés) pour l'accompagner.

---

## 6. Consultation par le MJ

Depuis les statistiques de classe (`gl.players.manage`), le MJ ouvre le carnet d'un joueur en
lecture seule (`GLPlayerJournalReadModal`) : liste des articles (titre, horodatages, rendu
markdown avec **encarts hydratés**, illustrations) **et** liste des éléments importés. Objectif :
accompagnement pédagogique, pas notation.

La vue MJ affiche un **récapitulatif** (nombre d'articles / d'imports), un **filtre des imports par
type**, et un bouton **« Exporter (.md) »** qui télécharge le carnet au format markdown (articles +
liste des imports ; sans les illustrations). Tout reste **en lecture seule**.

---

## 7. Modèle de données

| Table                              | Rôle                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `gl_player_journal_articles`       | Articles : `id`, `player_id`, `title?`, `body_markdown`, `created_at`, `updated_at`.                         |
| `gl_player_journal_article_assets` | Illustrations d'un article (cascade sur l'article et le joueur).                                             |
| `gl_player_journal_imports`        | Éléments importés : `resource_type`, `resource_ref`, `title`, `created_at` ; unique par ressource et joueur. |
| `gl_learning_acknowledgements`     | État « appris » par joueur (partagé avec le système d'apprentissage).                                        |

Migrations : `155_gl_player_journal_articles.sql` (articles + assets), `156_gl_player_journal_imports.sql`
(imports). Le corps d'article est en `MEDIUMTEXT` (pas de limite de stockage pratique).

---

## 8. API (résumé)

Toutes les routes sont préfixées `/api/gl` et exigent une auth GL. Détail exhaustif dans
`docs/API.md`.

**Carnet — articles & médias**

| Méthode  | URL                                                      | Rôle                                                 |
| -------- | -------------------------------------------------------- | ---------------------------------------------------- |
| `GET`    | `/player-journal/me`                                     | Fil du joueur : `limits`, `articles[]`, `imports[]`. |
| `POST`   | `/player-journal/me/articles`                            | Créer un article (`{ title?, bodyMarkdown? }`).      |
| `PUT`    | `/player-journal/me/articles/:articleId`                 | Mettre à jour (titre + corps).                       |
| `DELETE` | `/player-journal/me/articles/:articleId`                 | Supprimer l'article + ses médias.                    |
| `POST`   | `/player-journal/me/articles/:articleId/assets`          | Ajouter une illustration (`{ imageData }`).          |
| `DELETE` | `/player-journal/me/articles/:articleId/assets/:assetId` | Retirer une illustration.                            |

**Carnet — imports**

| Méthode  | URL                                    | Rôle                                                                                  |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------------- |
| `GET`    | `/player-journal/me/imports/refs`      | Refs légères des éléments importés (`refs: [{ resourceType, resourceRef }]`).         |
| `POST`   | `/player-journal/embeds/resolve`       | Titres réels des encarts (`{ embeds:[{type,ref}] }` → `titles`). Lecture (joueur/MJ). |
| `POST`   | `/player-journal/me/imports`           | Importer un élément **appris** (`{ resourceType, resourceRef, title? }`) — 403 sinon. |
| `DELETE` | `/player-journal/me/imports/:importId` | Retirer un élément importé.                                                           |

**Carnet — lecture MJ**

| Méthode | URL                                 | Rôle                                                  |
| ------- | ----------------------------------- | ----------------------------------------------------- |
| `GET`   | `/player-journal/players/:playerId` | Articles + imports d'un joueur (`gl.players.manage`). |

**Apprentissage (pré-requis de l'import)**

| Méthode | URL                                                              | Rôle                                                               |
| ------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| `GET`   | `/learning/me`                                                   | Progression du joueur (codes appris par type).                     |
| `GET`   | `/learning/gating/challenge`                                     | Questions de gating restantes pour une ressource.                  |
| `POST`  | `/learning/species/:code` · `/glossary/:code` · `/tutorials/:id` | Accusés dédiés (espèce/glossaire/tutoriel).                        |
| `POST`  | `/learning/mark/:resourceType/:ref`                              | Accusé **générique** (feuillet, glossaire lore, page, écosystème). |

---

## 9. Frontend (composants clés)

| Composant / fichier                                          | Rôle                                                                                      |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `GLPlayerJournalView`                                        | Onglet « Mon journal » : fil fusionné articles + imports, bouton « Nouvel article ».      |
| `GLPlayerJournalArticleCard`                                 | Éditeur d'un article (titre, texte, images, encarts, aperçu, auto-save).                  |
| `GLPlayerJournalImportCard`                                  | Carte d'un élément importé (titre, type, lien « Voir », retrait).                         |
| `GLPlayerJournalEmbedPicker`                                 | Sélecteur d'encart à insérer dans un article.                                             |
| `GLPlayerJournalReadModal`                                   | Lecture MJ (articles + imports).                                                          |
| `GLLearnAndImport`                                           | Contrôle réutilisable « marquer appris » + « importer », déposé sur les pages d'éléments. |
| `GLJournalImportButton`                                      | Bouton « Ajouter à mon journal » (masqué hors joueur).                                    |
| `useGlLearningProgress`                                      | Progression « appris » du joueur (`isLearned(type, ref)`).                                |
| `utils/glJournalImportMeta.js` · `utils/glLearningFields.js` | Métadonnées d'affichage des imports ; mapping des champs d'apprentissage.                 |

Les contrôles `GLLearnAndImport` / `GLJournalImportButton` sont câblés sur : **écosystèmes**
(`GLEcosystemsView`), **biodiversité** (`GLSpeciesDetailModal`), **glossaire écologie**
(`GLGlossaryPopover`), **glossaire lore** (`GLLoreGlossaryPopover`), **tutoriels**
(`GLTutorialsView`), **feuillets** (`GLSeleneCarnetView`) et **pages de contenu**
(`GLContentPage`).

---

## 10. Réglages & activation

- **Activer/désactiver** le carnet : module `modules.player_journal_enabled`.
- **Plafonds optionnels par article** : `gameplay.player_journal_max_chars` /
  `gameplay.player_journal_max_assets` (`0` = illimité). Réglables par le MJ/admin.
- **Gating par quiz** de l'acquisition : configuré via les liens ressource ↔ question
  (`gl_resource_question_links`) et la politique de gating (`gl_resource_gating_policy` / réglages
  `gating.*`), indépendamment du carnet.

> **Performance / pagination (évaluation)** : le fil est chargé en un seul appel `GET /me`
> (articles + imports), puis filtré/trié **côté client**. Pour la volumétrie attendue (carnet
> personnel d'un élève : quelques dizaines d'entrées au plus), c'est largement suffisant et la
> pagination n'est **pas justifiée** à ce stade. Si un usage réel faisait apparaître des carnets
> très volumineux, une pagination/chargement incrémental (curseur sur `created_at`/`id`) pourrait
> être ajoutée sans changer le modèle ; ce n'est pas nécessaire aujourd'hui.

---

## 11. Historique

- Carnet initialement mono-document, sans limite explicite de caractères/médias.
- Refonte en **articles** (titre optionnel, texte et/ou médias, horodatage création/modif).
- Ajout de l'**import d'éléments appris** (fil chronologique, vrai titre + lien) sur 7 types de
  contenus.

Voir `CHANGELOG.md` pour le détail versionné.
