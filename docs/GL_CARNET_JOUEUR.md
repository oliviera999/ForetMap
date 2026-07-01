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
2. Il clique sur **« Marquer comme appris »** (le libellé varie selon le contenu : « étudié »,
   « lu », « découvert »…).
3. Si l'élément est **conditionné par un quiz** (gating configuré via `gl_resource_question_links`
   / `gl_resource_gating_policy`), un ou plusieurs **QCM** doivent être **réussis** avant de
   pouvoir confirmer.
4. Après confirmation explicite, l'acquisition est enregistrée (upsert idempotent).

Types marquables (`GL_MARKABLE`) : `species`, `glossary`, `tutorial`, `lore_glossary`,
`feuillet`, `content_page`, `ecosystem`.

> **Biotope / biocénose** : il n'existe pas d'entité dédiée en base (ce sont des champs markdown
> du chapitre). Sur la **page Écosystèmes**, chaque écosystème est identifié **par biome**
> (`ecosystem` / `biome_slug`) : c'est cette unité qui se marque et s'importe.

---

## 4. Importer un élément dans le carnet

Une fois l'élément acquis, un bouton **« Ajouter à mon journal »** apparaît sur sa page. L'import :

- crée une entrée dans le fil (table `gl_player_journal_imports`),
- fige un **titre** (fourni par le client, sinon résolu côté serveur, sinon `type · ref`),
- est **idempotent** (unique par `(joueur, type, référence)`),
- est **refusé (403)** si l'élément n'a pas été appris au préalable.

L'élément importé s'affiche comme une **carte** dans le fil chronologique : icône + libellé du
type + **titre réel** + date d'import + bouton **« Voir »** (navigation vers l'onglet d'origine)
et **« Retirer »**.

Correspondance type → onglet (utilitaire `utils/glJournalImportMeta.js`) :

| Type            | Libellé            | Onglet cible « Voir » |
| --------------- | ------------------ | --------------------- |
| `species`       | Fiche biodiversité | `biodiversite`        |
| `ecosystem`     | Écosystème         | `ecosystemes`         |
| `glossary`      | Définition         | `glossary`            |
| `lore_glossary` | Lexique lore       | `lore-glossary`       |
| `tutorial`      | Tutoriel           | `tutorials`           |
| `feuillet`      | Feuillet de Sélène | `selene-carnet`       |
| `content_page`  | Page du monde      | slug de la page       |

L'import est **réservé aux joueurs** (`gl_player`) : le bouton est masqué pour les invités et le
MJ.

---

## 5. Consultation par le MJ

Depuis les statistiques de classe (`gl.players.manage`), le MJ ouvre le carnet d'un joueur en
lecture seule (`GLPlayerJournalReadModal`) : liste des articles (titre, horodatages, rendu
markdown avec encarts, illustrations) **et** liste des éléments importés. Objectif :
accompagnement pédagogique, pas notation.

---

## 6. Modèle de données

| Table                              | Rôle                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `gl_player_journal_articles`       | Articles : `id`, `player_id`, `title?`, `body_markdown`, `created_at`, `updated_at`.                         |
| `gl_player_journal_article_assets` | Illustrations d'un article (cascade sur l'article et le joueur).                                             |
| `gl_player_journal_imports`        | Éléments importés : `resource_type`, `resource_ref`, `title`, `created_at` ; unique par ressource et joueur. |
| `gl_learning_acknowledgements`     | État « appris » par joueur (partagé avec le système d'apprentissage).                                        |

Migrations : `155_gl_player_journal_articles.sql` (articles + assets), `156_gl_player_journal_imports.sql`
(imports). Le corps d'article est en `MEDIUMTEXT` (pas de limite de stockage pratique).

---

## 7. API (résumé)

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

## 8. Frontend (composants clés)

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

## 9. Réglages & activation

- **Activer/désactiver** le carnet : module `modules.player_journal_enabled`.
- **Plafonds optionnels par article** : `gameplay.player_journal_max_chars` /
  `gameplay.player_journal_max_assets` (`0` = illimité). Réglables par le MJ/admin.
- **Gating par quiz** de l'acquisition : configuré via les liens ressource ↔ question
  (`gl_resource_question_links`) et la politique de gating (`gl_resource_gating_policy` / réglages
  `gating.*`), indépendamment du carnet.

---

## 10. Historique

- Carnet initialement mono-document, sans limite explicite de caractères/médias.
- Refonte en **articles** (titre optionnel, texte et/ou médias, horodatage création/modif).
- Ajout de l'**import d'éléments appris** (fil chronologique, vrai titre + lien) sur 7 types de
  contenus.

Voir `CHANGELOG.md` pour le détail versionné.
