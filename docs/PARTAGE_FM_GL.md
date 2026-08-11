# Partage de code ForetMap ↔ Gnomes & Licornes — audit et plan

> **Note d'orientation (non normative).** Mesure l'état réel du partage de code entre les deux
> produits du monorepo, distingue les vraies duplications des faux jumeaux, et propose un plan
> d'enrichissement mutuel. À lire avant toute décision de mutualisation transverse.
> Voir aussi [`MASCOT_ARCHITECTURE_CONVERGENCE.md`](./MASCOT_ARCHITECTURE_CONVERGENCE.md)
> (convergence du système mascotte, achevée) et [`MASCOT_NARRATEUR_OLU.md`](./MASCOT_NARRATEUR_OLU.md) §15.

---

## 1. Le constat en une phrase

**La logique métier est déjà largement factorisée ; ce qui se répète encore, c'est la plomberie.
Et le vrai gisement n'est pas la duplication — c'est l'asymétrie entre les deux produits.**

---

## 2. Méthode

L'audit est **outillé et reproductible** :

```bash
node scripts/audit-duplication-fm-gl.mjs            # front (src/) et back (routes/)
node scripts/audit-duplication-fm-gl.mjs --top 40
```

Le script compare chaque fichier ForetMap à chaque fichier GL sur leurs **lignes substantielles**
(espaces normalisés, commentaires écartés, lignes < 14 caractères ignorées — ce qui élimine
accolades, parenthèses fermantes et lignes vides). Deux indicateurs sont produits :

- **`comm`** — nombre absolu de lignes communes. C'est l'indicateur qui compte pour décider.
- **`ratio`** — `comm / min(taille FM, taille GL)`. Utile pour repérer, trompeur pour conclure (§5).

---

## 3. État des lieux — ce qui est déjà partagé

| Emplacement      | Volume      | Contenu                                                                                                                                                                                                                                                                                                       |
| ---------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/shared/`    | 23 modules  | Noyaux **métier** backend : `contextCommentsCore`, `resourceQuestionGatingCore`, `questionCrudCore`, `questionQueryFactory`, `questionPoolFiltering`, `xlsxImportCore`, `glossaryNormalization`, `learningAckCore`, `foodWebCore`, `oauthCommon`, `httpHelpers`, `stringHelpers`, `jsonDefaultsStore`…        |
| `src/shared/`    | 61 fichiers | Composants (`DialogShell`, `ImportPanel`, `MediaLibraryMenu`, `ImageLightbox`), hooks (`useAdminCrud`, `useDebouncedAutoSave`, `usePrefersReducedMotion`, `useMapFullscreen`), styles (`motion.css`, `visit-map-mascot.css`), et les dossiers `qcm/`, `mascot-pack/`, `pct-map/`, `image-frame/`, `markdown/` |
| Système mascotte | 8 étapes    | **Convergence achevée** (étapes 0 à 7 de la note de convergence)                                                                                                                                                                                                                                              |

Le motif établi du dépôt est **« noyau métier partagé (`*Core.js`) + adaptateur mince par produit »**.
Il est réel et productif : `ImportPanel` est consommé par 3 panneaux ForetMap et une dizaine de
panneaux GL ; `resourceQuestionGatingCore` sert les deux routes `learning-links`.

---

## 4. Résultats de l'audit

### 4.1 Backend (`routes/`)

| Paire                    | FM ↔ GL   | `comm`  | Noyau partagé existant ?        | Lecture                                             |
| ------------------------ | --------- | ------- | ------------------------------- | --------------------------------------------------- |
| `learning-links.js`      | 130 / 163 | **89**  | ✅ `resourceQuestionGatingCore` | Reste : **plomberie de route**                      |
| `context-comments.js`    | 229 / 165 | **102** | ✅ `contextCommentsCore`        | Reste : **plomberie de route**                      |
| `quiz.js` ↔ `gl/qcm.js`  | 283 / 239 | **109** | ⚠️ partiel                      | **Candidat réel** (§6, lot B2)                      |
| `auth.js` ↔ `gl/auth.js` | 721 / 841 | **97**  | ✅ `oauthCommon`                | Reste : plomberie + libellés d'erreur               |
| `glossary.js`            | 83 / 225  | 28      | ✅ `glossaryNormalization`      | **Faux jumeaux** — modèle GL bien plus riche (lore) |
| `forum.js`               | 312 / 165 | 20      | —                               | **Faux jumeaux** — le forum GL est un pont          |

### 4.2 Frontend (`src/`)

| Paire                                                       | `ratio` | `comm` | Lecture                                                |
| ----------------------------------------------------------- | ------- | ------ | ------------------------------------------------------ |
| `fmQuizEditorForm.js` ↔ `glQcmEditorForm.js`                | 0,87    | 40     | ❌ **Faux positif** (§5)                               |
| `RichTextEditor.jsx` ↔ `GLRichTextEditor.jsx`               | 0,43    | **53** | ✅ **Candidat réel** (§6, lot B1)                      |
| `FMQuizQuestionEditorPanel` ↔ `GLQcmQuestionEditorPanel`    | 0,38    | 34     | ⚠️ `QuestionEditorPanel` déjà partagé — reste marginal |
| `media-library-views` ↔ `GLContentLibraryView`              | 0,46    | 24     | Volumes trop déséquilibrés (52 / 234) — non            |
| `api.js` ↔ `apiGL.js`                                       | 0,27    | 15     | Transports volontairement distincts (isolement)        |
| `ForetMapHelpContentAdminPanel` ↔ `GLHelpContentAdminPanel` | 0,22    | 22     | Modèles de contenu différents — non                    |

---

## 5. Faux positifs — la leçon de méthode

**Le plus fort ratio de tout l'audit (0,87) est un faux positif, et il est instructif.**

`src/utils/fmQuizEditorForm.js` et `src/gl/utils/glQcmEditorForm.js` partagent 40 lignes sur ~46.
Mais ces deux fichiers sont **déjà des adaptateurs minces** de
`src/shared/qcm/questionEditorFormCore.js`. Les 40 lignes communes sont des **listes de noms de
champs** (`EMPTY_FORM`, `FORM_FIELDS`, `TEXTAREA_FIELDS`) — de la **donnée**, pas de la logique —
et elles diffèrent réellement : GL porte en plus `biome_slug` et `mots_cles`.

Autrement dit : **87 % de similarité textuelle, 0 % de duplication factorisable.** C'est même la
preuve que le motif fonctionne — la logique a été extraite, il ne reste que le spécifique.

**Règle qui en découle : ne jamais conclure sur le ratio. Toujours vérifier si un noyau partagé
existe déjà, et si les lignes communes sont de la logique ou de la donnée.**

---

## 6. Le plan

Trois axes. L'axe A est le plus rentable et le moins risqué — c'est celui qu'on sous-estime.

### Axe A — Réduire l'asymétrie (enrichir ForetMap de ce que GL a déjà)

Constat central de l'audit : **GL est en avance sur ForetMap côté outillage d'administration.**

| Outil                                | GL                           | ForetMap                |
| ------------------------------------ | ---------------------------- | ----------------------- |
| `useDebouncedAutoSave`               | 17 fichiers                  | **1 fichier**           |
| Squelette CRUD admin                 | oui                          | **aucun** → livré en A1 |
| Doc de référence éditable dans l'app | oui (`GLReferenceDocsPanel`) | non                     |

C'est du gain **sans réécriture de l'existant**, donc sans risque de régression : on ajoute un
outil disponible, on ne refond rien.

| Lot    | Contenu                                                                                                   | Effort | Risque      | État         |
| ------ | --------------------------------------------------------------------------------------------------------- | ------ | ----------- | ------------ |
| **A1** | `useAdminCrud` promu dans `src/shared/hooks/`, transport injecté ; `useGlAdminCrud` devient un adaptateur | S      | Très faible | ✅ **livré** |
| **A2** | `QuestionEditorPanel` (partagé) consomme `useAdminCrud` au lieu de réécrire le CRUD                       | M      | Moyen       | à faire      |
| **A3** | Généraliser l'autosave débouncé aux panneaux prof ForetMap qui le méritent                                | M      | Faible      | à faire      |
| **A4** | Doc de référence `docs/reference/foretmap/` éditable depuis l'app (miroir de `GLReferenceDocsPanel`)      | M      | Moyen       | à arbitrer   |

#### A1 — `useAdminCrud` partagé ✅ livré

**Objectif.** Rendre disponible à ForetMap le squelette CRUD des panneaux admin, jusque-là
réservé à GL.

**Ce qui a été fait.** `src/gl/hooks/useGlAdminCrud.js` ne portait qu'**une** spécificité produit :
l'appel direct à `apiGL`. Le hook est déplacé dans `src/shared/hooks/useAdminCrud.js` avec un
paramètre `request` injecté ; `useGlAdminCrud` se réduit à un adaptateur de 4 lignes qui lie
`apiGL`. Aucun autre changement — les trois panneaux GL consommateurs (`GLSpeciesEditorPanel`,
`GLGlossaryEditorPanel`, `GLSpellsEditorPanel`) sont inchangés.

**Acceptation.** `tests-ui/shared/useAdminCrud.test.jsx` (8 cas) ; les 3 tests de panneaux GL
au vert ; suite UI complète au vert.

#### A2 — `QuestionEditorPanel` consomme `useAdminCrud`

**Objectif.** Supprimer la réécriture manuelle du CRUD dans un composant **déjà partagé**, donc
gagner sur les deux produits d'un coup.

**Constat.** [`src/shared/qcm/QuestionEditorPanel.jsx`](../src/shared/qcm/QuestionEditorPanel.jsx)
(363 l.) réimplémente exactement ce que fournit désormais `useAdminCrud` : `items`,
`selectedCode`, `form`, `loading`, `error`, `info`, `loadList`, `startNewQuestion` (avec
`${questionsBase}/next-code`), `persistQuestion`, et `useDebouncedAutoSave`. Il reçoit déjà `api`
en **prop** — il était donc arrivé indépendamment au même motif de transport injecté que A1, ce
qui valide la conception du hook.

C'est aussi le **troisième appelant** (après les 3 panneaux GL et l'usage ForetMap), donc la
règle de trois du §8 est largement satisfaite.

**Périmètre.** Un seul fichier modifié : `src/shared/qcm/QuestionEditorPanel.jsx`. Les appelants
(`FMQuizQuestionEditorPanel`, `GLQcmQuestionEditorPanel`, `GLQcmLoreQuestionEditorPanel`) ne
changent pas.

**Démarche.**

1. Vérifier d'abord que les tests couvrent le comportement : `GLQcmQuestionEditorPanel.autosave.test.jsx`,
   `glQcmCatalogPanel.test.js`, et les tests des panneaux appelants.
2. Remplacer l'état CRUD par `useAdminCrud({ request: api, … })`.
3. **Conserver hors du hook** ce qui lui est étranger : `refs`, `filters`, `filterQ`, `sortBy` et
   la logique d'`autoSaveResetKey` propre au panneau. Le hook gère le cycle de vie d'une fiche,
   pas le filtrage ni le tri d'un catalogue.
4. Vérifier que `saveStatus` / `saveError` alimentent toujours `AutoSaveStatus` à l'identique.

**Acceptation.** Aucune modification de DOM ni de libellé ; tests existants au vert sans
réécriture ; le fichier perd ~60 lignes.

⚠️ **Piège.** `QuestionEditorPanel` gère un `autoSaveResetKey` **dédié** (`'empty'` par défaut) là
où `useAdminCrud` dérive la sienne de `selectedCode ?? \`new:${form[codeField]}\``. Si la sémantique
diffère, l'autosave peut se déclencher au mauvais moment (perte de brouillon ou écriture
intempestive). **Comparer les deux clés avant de basculer** ; si elles divergent réellement,
exposer un `resetKey` optionnel dans le hook plutôt que de forcer l'alignement.

#### A3 — Généraliser l'autosave côté ForetMap

**Objectif.** Corriger l'asymétrie la plus visible : `useDebouncedAutoSave` est utilisé par
17 fichiers GL et **1 seul** côté ForetMap.

**Démarche.** Recenser les panneaux prof ForetMap à formulaire long (biodiversité, tâches,
tutoriels, réglages) et n'équiper que ceux où la perte de saisie est un risque réel. **Ce n'est
pas une conversion mécanique** : un autosave sur un formulaire à effet de bord (publication,
notification) est nuisible.

**Acceptation.** Chaque panneau converti affiche un `AutoSaveStatus` et conserve un chemin
d'enregistrement explicite. Un test par panneau converti.

⚠️ **Piège.** A3 **après** A2. Le pilote A2 valide l'ergonomie du hook sur un cas réel ; s'il
frotte, on corrige le hook une fois, pas dix panneaux.

#### A4 — Doc de référence ForetMap éditable dans l'app

**Objectif.** GL permet aux MJ de lire et amender `docs/reference/gl/*.md` depuis l'onglet
Contenus (`GLReferenceDocsPanel`, stockage à deux étages non destructif : fichier versionné +
surcouche en base). ForetMap n'a pas d'équivalent alors que `docs/reference/foretmap/` existe et
suit la même convention — y compris le marqueur `🔧 À implémenter` valant demande d'évolution.

**Démarche.** Réutiliser le modèle GL (table de surcouche, route de lecture/écriture, panneau)
en l'adaptant aux permissions ForetMap. Le noyau `lib/glReferenceDocs.js` est le point de départ
naturel d'un `lib/shared/referenceDocsCore.js`.

⚠️ **À arbitrer.** C'est le seul lot de l'axe A qui crée une **fonctionnalité**, pas seulement un
outil. Il mérite sa propre décision produit : les profs ForetMap en ont-ils l'usage ?

### Axe B — Extraire les noyaux restants

| Lot    | Contenu                                                                                                              | `comm` visé | Effort | Risque | État         |
| ------ | -------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ------ | ------------ |
| **B0** | `jsonDefaultsStore` — mécanisme « défauts JSON + surcharge en base » (`helpContent` / `glHelp`)                      | ~35         | S      | Faible | ✅ **livré** |
| **B1** | Noyau d'édition riche : configuration Turndown + aller-retour Markdown ↔ HTML assaini, partagé par les deux éditeurs | ~53         | M      | Moyen  | à faire      |
| **B2** | `quiz.js` ↔ `gl/qcm.js` : étendre l'usage de `questionCrudCore` / `questionQueryFactory` déjà présents               | ~109        | M      | Moyen  | à faire      |
| **B3** | Libellés d'erreur d'authentification partagés (`auth.js` ↔ `gl/auth.js`)                                             | ~20         | S      | Faible | opportuniste |

#### B0 — `jsonDefaultsStore` ✅ livré

**Objectif.** Le mécanisme « défauts JSON versionnés + surcharge en base » était écrit deux fois.

**Ce qui a été fait.** Extraction de `createDefaultsLoader` (lecture de fichier cachée + clone
défensif) et `resolveStoredConfig` (repli sur les défauts si la valeur stockée est absente ou
illisible), consommés par `lib/helpContent.js` et `lib/glHelp.js`.

**Ce qui n'a délibérément _pas_ été extrait.** L'**écriture** (upsert) : les tables (`app_settings`
vs `gl_settings`) et les colonnes d'audit diffèrent. Et la **normalisation**, propre au modèle de
contenu de chaque produit. On factorise le noyau, pas la plomberie.

**Acceptation.** `tests/json-defaults-store.test.js` (9 cas) ; `help-content.test.js` et
`gl-help.test.js` inchangés et au vert.

#### B1 — Noyau d'édition riche

**Objectif.** [`RichTextEditor.jsx`](../src/components/RichTextEditor.jsx) (124 l. substantielles)
et [`GLRichTextEditor.jsx`](../src/gl/components/ui/GLRichTextEditor.jsx) (167 l.) partagent
53 lignes : même import de `turndown`, même `renderMarkdownToSafeHtml` / `sanitizeRichHtml`, même
aller-retour Markdown ↔ HTML.

**Périmètre.** Créer `src/shared/richtext/` avec la **logique de conversion seule** : instance
Turndown configurée, sérialisation HTML → Markdown, désérialisation Markdown → HTML assaini.

**Démarche.**

1. Écrire d'abord des tests de **conversion** sur les cas réels du corpus (listes, liens, gras,
   images, HTML collé depuis un traitement de texte) — sur les deux éditeurs, avant tout
   déplacement de code.
2. Extraire la conversion. Les deux composants restent distincts.
3. Vérifier `GLRichTextEditor.test.jsx` et `MarkdownTextarea.test.jsx` sans les réécrire.

⚠️ **Piège — le plus délicat de l'axe B.** Ne **jamais** extraire le composant. Les éditeurs
WYSIWYG sont sensibles au détail (position du curseur, collage, sélection, `contenteditable`), et
GL porte en plus l'insertion d'images inline (`GLImageInlineInsertControls`), un état propre et
`annotateEditorHtmlWithOriginalSrc`. Un composant unifié à drapeaux serait exactement le piège
du §7.1 transposé au frontend.

#### B2 — `quiz.js` ↔ `gl/qcm.js`

**Objectif.** C'est le plus gros recouvrement mesuré du dépôt (**109 lignes**), et le seul dont
le noyau n'est que partiellement partagé.

**Constat.** `lib/shared/questionCrudCore.js`, `questionQueryFactory.js` et
`questionPoolFiltering.js` **existent déjà** ; `routes/gl/qcm.js` n'importe pourtant de
`lib/shared/` que `httpHelpers`. Le travail est donc d'**étendre l'usage de noyaux existants**,
pas d'en créer un.

**Démarche.**

1. Cartographier les 109 lignes communes : lesquelles sont couvertes par un noyau existant mais
   non utilisées, lesquelles relèvent de la plomberie (auth, permissions, audit) — **ces
   dernières restent dupliquées, c'est légitime**.
2. Basculer `routes/gl/qcm.js` sur les noyaux déjà présents, un par un.
3. Aligner ensuite `routes/quiz.js` si des écarts apparaissent.

⚠️ **Piège.** Les permissions diffèrent (`plants.manage` côté ForetMap, `gl.content.manage` côté
GL) et les événements d'audit aussi. Ne pas chercher à les unifier : c'est de la plomberie, et
la tentation d'un `makeCrudRouter` reviendra ici en premier (§7.1).

#### B3 — Libellés d'erreur d'authentification

**Objectif.** Petit lot opportuniste. `routes/auth.js` et `routes/gl/auth.js` partagent 97 lignes,
dont le flux OAuth **déjà** factorisé dans `lib/shared/oauthCommon.js`. Ce qui reste est de la
plomberie **plus** une vingtaine de chaînes d'erreur identiques (« Identifiant ou mot de passe
incorrect », « Ce pseudo est déjà utilisé », « Identifiant utilisateur requis »…).

**Démarche.** Regrouper ces chaînes dans un module partagé. Gain modeste en lignes, réel en
cohérence : aujourd'hui une correction de formulation ne s'applique qu'à un produit.

⚠️ **Piège.** S'arrêter aux **libellés**. Les statuts HTTP, les permissions et les conditions
d'émission restent chez chaque produit.

### Axe C — Ce qu'on ne partage pas (décidé, à ne pas rouvrir)

| Sujet                                                       | Raison                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Forum, glossaire, tutoriels, stats                          | **Faux jumeaux** — modèles métier réellement différents (§4.1)                  |
| Composants d'aide (`HelpPanel` ↔ `GLHelpPanel`)             | Modèles d'interaction différents : modale sur bouton ↔ encadré repliable inline |
| Modèles de contenu d'aide (sections/rôles ↔ onglets à plat) | Migration de réglages en production, bénéfice nul                               |
| Transports HTTP (`api` ↔ `apiGL`)                           | **Distincts par conception** — l'isolement produit en dépend                    |
| Fabrique de routes CRUD générique (`makeCrudRouter`)        | Piège d'abstraction (§7)                                                        |
| Système de parcours découverte pour GL                      | **Fonctionnalité neuve**, pas un refactor — GL n'en a aucun aujourd'hui         |

---

## 7. Écueils à éviter

### 7.1 La fabrique de routes générique

C'est le candidat qui **paraît** le plus rentable (~100 lignes par paire) et c'est le plus
dangereux. Middleware d'authentification, noms de permissions, événements d'audit et sémantique
d'erreur diffèrent par produit. Un `makeCrudRouter` à quinze options est **pire** que cent lignes
dupliquées : il déplace la complexité au lieu de la supprimer et renchérit chaque évolution.

**Factoriser le noyau, jamais la plomberie.** C'est déjà ce que fait le dépôt, et c'est pourquoi
`learning-links` conserve 89 lignes communes **en toute légitimité**.

### 7.2 Conclure sur le ratio

Cf. §5. Le plus fort ratio de l'audit ne recouvre aucune dette.

### 7.3 Partager avant le troisième appelant

`useAdminCrud` a été promu **parce que** trois panneaux GL le consommaient déjà : la forme était
observée, pas devinée. Extraire sur un seul cas d'usage produit des abstractions mal découpées
qu'il faut ensuite défaire.

### 7.4 Casser l'isolement produit en croyant mutualiser

L'isolement porte sur le **runtime** : routage par host, `/api/gl/*`, JWT `product:'gl'` rejeté
hors GL. Partager du code utilitaire ne le viole pas ; ce qui le violerait :

| Autorisé                                         | Interdit                                       |
| ------------------------------------------------ | ---------------------------------------------- |
| Noyaux dans `lib/shared/`, `src/shared/`         | Un appel GL vers `/api/visit/*` (ou l'inverse) |
| Hooks et composants partagés, thémés par produit | Un JWT traversant                              |
| Transport **injecté** (`request`)                | Un transport partagé qui choisirait la cible   |

### 7.5 Un gros lot de refactor qui bloque tout

Chaque lot ci-dessus est livrable seul. La règle de cohérence inter-PR du projet existe pour une
raison : une PR massive touchant des fichiers partagés entre en conflit avec tout ce qui est en vol.

### 7.6 Refactoriser sans filet

Aucun lot ne démarre sans que les tests couvrant le comportement existent **déjà**. Pour B1, ce
sont `GLRichTextEditor.test.jsx` et les tests Markdown ; pour B2, les tests QCM des deux côtés.

---

## 8. Critères de décision — la grille

Avant de mutualiser, quatre questions. **Trois « oui » minimum.**

1. **Y a-t-il au moins trois appelants** (ou deux appelants et un troisième certain) ?
2. Les lignes communes sont-elles de la **logique**, et non de la donnée ou des libellés ?
3. La partie spécifique tient-elle en **une poignée de paramètres** — pas dix drapeaux booléens ?
4. Le comportement existant est-il **couvert par des tests** avant de toucher quoi que ce soit ?

Si la réponse à la 3 est « il faudrait un drapeau par produit », la réponse globale est **non** :
c'est le signal que les deux cas ne sont pas le même problème.

---

## 9. Livré à ce jour

| Lot | Livrable                                                                                 | Tests                                                    |
| --- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| A1  | `src/shared/hooks/useAdminCrud.js` + `useGlAdminCrud` réduit à un adaptateur de 4 lignes | `tests-ui/shared/useAdminCrud.test.jsx` (8 cas)          |
| B0  | `lib/shared/jsonDefaultsStore.js` consommé par `helpContent.js` et `glHelp.js`           | `tests/json-defaults-store.test.js` (9 cas)              |
| —   | `scripts/audit-duplication-fm-gl.mjs` — audit reproductible                              | —                                                        |
| —   | **Correctif** `compactVisitSeenQueue` — repli d'horodatage stable (§9.1)                 | `tests-ui/utils/visitSeenQueueStability.test.js` (9 cas) |

Non-régression vérifiée : suite UI complète (397 fichiers, 2580 tests) au vert ; tests backend
sans base de données au vert ; panneaux GL consommateurs (`GLSpeciesEditorPanel`,
`GLGlossaryEditorPanel`, `GLSpellsEditorPanel`) au vert ; ESLint sans erreur ; Prettier conforme.

### 9.1 Un bug de production démasqué par la stabilisation d'un test

Le job CI `quality` échouait sur `tests-ui/hooks/useVisitSeenSync.test.jsx` — **échec préexistant
sur `main`**, documenté dans le test lui-même comme un flake dû à la contention CPU, et « traité »
par des timeouts portés à 10 s. Le diagnostic était faux, et le correctif masquait un vrai défaut.

**Ce qui se passait réellement.** Le flush de la file « vu » est une chaîne de **pures
micro-tâches** (aucun timer dans `flushVisitSeenQueue`). Attendre dessus avec `waitFor`
(scrutation sur l'horloge) était donc inadapté. En remplaçant cette attente par un **drainage de
micro-tâches** borné en tours de boucle d'événements, l'échec est devenu reproductible **en
isolation, une fois sur cinq** — révélant une course qui n'avait rien à voir avec le CPU :

`compactVisitSeenQueue` attribuait `updated_at = Date.now()` aux entrées sans horodatage valide.
Or `loadVisitSeenQueue()` normalise à chaque lecture et `flushVisitSeenQueue()` lit la file
**deux fois** (avant les POST, puis après, pour détecter une modification concurrente). Une entrée
non horodatée recevait donc deux valeurs différentes dès que le flush franchissait une
milliseconde, était jugée « modifiée pendant le flush », et **remise en file indéfiniment** —
re-POSTée à chaque flush, avec `pendingSyncCount` bloqué à une valeur non nulle.

**Portée réelle.** Toute entrée persistée sans `updated_at` (stockage hérité d'une version
antérieure, données corrompues) ne se vidait jamais côté client. Le repli est désormais la
valeur stable `0`, qui trie ces entrées en tête et se persiste à l'identique. Les entrées créées
par `enqueueVisitSeenAction` / `replaceQueuedVisitSeenAction` portent toujours leur propre
horodatage : elles ne sont pas concernées.

**Leçon de méthode.** Un test intermittent « à cause de la CI » mérite d'être rendu déterministe
**avant** d'être considéré comme un flake d'environnement. Ici, allonger les timeouts avait
transformé un bug reproductible en nuisance aléatoire. La garde métier (« une entrée re-modifiée
pendant le flush reste en file ») est préservée et désormais couverte par un test dédié.

---

## 10. Pour aller plus loin

- [`MASCOT_ARCHITECTURE_CONVERGENCE.md`](./MASCOT_ARCHITECTURE_CONVERGENCE.md) — convergence du système mascotte (achevée)
- [`MASCOT_NARRATEUR_OLU.md`](./MASCOT_NARRATEUR_OLU.md) §15 — application de cette grille au chantier OLU
- [`GL_ARCHITECTURE.md`](./GL_ARCHITECTURE.md) — architecture et isolement du sous-produit GL
