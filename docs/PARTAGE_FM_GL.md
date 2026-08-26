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

| Paire                    | FM ↔ GL   | `comm`  | Noyau partagé existant ?        | Lecture                                                                              |
| ------------------------ | --------- | ------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| `learning-links.js`      | 130 / 163 | **89**  | ✅ `resourceQuestionGatingCore` | Reste : **plomberie de route**                                                       |
| `context-comments.js`    | 229 / 165 | **102** | ✅ `contextCommentsCore`        | Reste : **plomberie de route** — côté GL, **API sans UI** (cf. `GL_ARCHITECTURE.md`) |
| `quiz.js` ↔ `gl/qcm.js`  | 283 / 239 | **109** | ✅ largement partagé            | ❌ **Faux positif à l’analyse** (§6, lot B2)                                         |
| `auth.js` ↔ `gl/auth.js` | 721 / 841 | **97**  | ✅ `oauthCommon`                | ❌ 8 libellés seulement — **écarté** (§6, lot B3)                                    |
| `glossary.js`            | 83 / 225  | 28      | ✅ `glossaryNormalization`      | **Faux jumeaux** — modèle GL bien plus riche (lore)                                  |
| `forum.js`               | 312 / 165 | 20      | —                               | **Faux jumeaux** — le forum GL est un pont                                           |

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
| **A3** | Autosave débouncé sur trois panneaux prof ForetMap, **en édition seule**                                  | M      | Faible      | ✅ **livré** |
| **A4** | Doc de référence `docs/reference/foretmap/` **consultable** depuis l'app (lecture seule)                  | M      | Faible      | ✅ **livré** |

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

#### A3 — Autosave côté ForetMap ✅ livré

**Objectif.** Corriger l'asymétrie la plus visible : `useDebouncedAutoSave` était utilisé par
17 fichiers GL et **1 seul** côté ForetMap.

**Le piège, mesuré.** L'avertissement « un autosave sur un formulaire à effet de bord est
nuisible » n'était pas théorique. Sur les trois panneaux retenus, **deux publient immédiatement
vers les élèves** :

| Panneau             | Sémantique de publication                                                  | Conséquence        |
| ------------------- | -------------------------------------------------------------------------- | ------------------ |
| Fiche biodiversité  | Aucune colonne de visibilité — donnée de référence                         | Sûr                |
| Édition de tâche    | Visible des élèves dès l'enregistrement ; `assign_student_ids` **assigne** | Effet de bord réel |
| Éditeur de tutoriel | `is_active TINYINT(1) DEFAULT 1` — **aucun état brouillon**                | Effet de bord réel |

Point rassurant vérifié au passage : **aucune notification** n'est émise à l'enregistrement d'une
tâche (`routes/tasks.js` n'en déclenche aucune).

**Mitigation retenue : autosave en édition seule.** L'enregistrement automatique n'est actif que
sur un enregistrement **déjà créé**. Une tâche, un tutoriel ou une fiche neuve n'est créé que par
une action explicite — jamais publié à moitié construit. Conséquence directe côté tâches : les
**assignations initiales**, qui n'ont lieu qu'à la création, ne peuvent pas être déclenchées par
l'autosave.

Cas particulier des tâches : l'**image** reste hors du circuit d'autosave (`taskImageData` n'est
ni surveillé ni transmis), pour ne pas réémettre le même envoi à chaque frappe. Elle est
enregistrée par le bouton explicite, comme avant.

**Baseline sur le formulaire envoyé.** Les trois persistances renvoient le formulaire _transmis_,
et non une version serveur : une frappe saisie pendant la requête en vol reste donc détectée comme
non enregistrée et repart au tour suivant.

**Risque résiduel assumé.** Un élève peut voir un titre en cours de frappe pendant quelques
secondes s'il consulte une tâche ou un tutoriel pendant que le professeur le modifie.

**Acceptation.** Chaque panneau affiche un `AutoSaveStatus` (jamais en création) et conserve son
bouton d'enregistrement explicite. Couvert par `tests-ui/components/PlantEditFormAutoSave.test.jsx`,
dont le cas central vérifie qu'**aucune requête** ne part en création.

#### A4 — Doc de référence ForetMap consultable dans l'app ✅ livré

**Objectif.** GL permet aux MJ de lire et amender `docs/reference/gl/*.md` depuis l'onglet
Contenus. ForetMap disposait de `docs/reference/foretmap/` (8 documents) sans aucun accès depuis
l'application.

**Décision : lecture seule.** L'étage d'édition de GL (surcouche en base, non destructive) n'est
pas repris. Côté ForetMap, les fichiers versionnés dans Git font foi et amender un document reste
un acte de développement. Cela supprime la migration, la table de surcouche et les routes
d'écriture — l'essentiel du bénéfice (rendre la documentation accessible aux professeurs sans
passer par le dépôt) est obtenu sans cette complexité.

**Extraction associée.** La couche **fichiers** de `lib/glReferenceDocs.js` était entièrement
générique : validation de slug, extraction du titre et du résumé Markdown, listage et tri selon un
sommaire de lecture. Elle est désormais dans `lib/shared/referenceDocsFiles.js`, consommée par les
deux produits — seuls le répertoire et l'ordre de lecture sont injectés. La couche de **surcouche
en base** reste chez GL : on factorise le noyau, pas la plomberie.

**Livrables.**

| Fichier                                              | Rôle                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `lib/shared/referenceDocsFiles.js`                   | Noyau fichiers partagé (nouveau)                               |
| `lib/foretmapReferenceDocs.js`                       | Lecteur ForetMap, lecture seule (nouveau)                      |
| `routes/reference-docs.js`                           | `GET /api/admin/reference-docs[/:slug]`, `admin.settings.read` |
| `src/components/help/ForetMapReferenceDocsPanel.jsx` | Sommaire + lecture, onglet « Doc de référence »                |
| `lib/glReferenceDocs.js`                             | Délègue désormais sa couche fichiers au noyau partagé          |

⚠️ **Traversée de chemin.** Les slugs proviennent de l'URL et servent à composer un chemin de
fichier. `isValidReferenceSlug` (kebab-case borné, sans séparateur) est appliqué **avant** toute
lecture, et un test dédié vérifie que `../secret` et `a/b` ne lisent rien.

### Axe B — Extraire les noyaux restants

| Lot    | Contenu                                                                                                              | `comm` visé | Effort | Risque | État          |
| ------ | -------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ------ | ------------- |
| **B0** | `jsonDefaultsStore` — mécanisme « défauts JSON + surcharge en base » (`helpContent` / `glHelp`)                      | ~35         | S      | Faible | ✅ **livré**  |
| **B1** | Noyau d'édition riche : configuration Turndown + aller-retour Markdown ↔ HTML assaini, partagé par les deux éditeurs | ~53         | M      | Moyen  | à faire       |
| **B2** | `quiz.js` ↔ `gl/qcm.js` : analyse ligne à ligne — occasion réelle ~6 lignes, pas 109                                 | ~6          | S      | Faible | ✅ **livré**  |
| **B3** | Libellés d'erreur d'authentification — analyse : 8 chaînes seulement sur 97 lignes communes                          | ~8          | S      | —      | ❌ **écarté** |
| **B4** | Échelle d'empilement commune (`z-layers.css`) — remplace deux échelles produit divergentes                           | ~40         | M      | Moyen  | ✅ **livré**  |
| **B5** | Auto-lien de glossaire : délégation de clic + mécanique de rendu, partagées                                          | ~45         | S      | Faible | ✅ **livré**  |

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

#### B1 — Noyau d'édition riche ✅ livré

**Le seul vrai positif de l'axe B.** Contrairement à B2 et B3, l'examen ligne à ligne confirme
ici de la **logique** : sur les 53 lignes communes entre
[`RichTextEditor.jsx`](../src/components/RichTextEditor.jsx) et
[`GLRichTextEditor.jsx`](../src/gl/components/ui/GLRichTextEditor.jsx), une quarantaine sont du
code exécutable — configuration Turndown, garde-fou d'aller-retour, exécution de commande — et
non des imports ou des noms de champs.

**Extrait** dans `src/shared/richtext/richTextCore.js`, strictement ce qui était **identique à
l'octet près** :

| Primitive                         | Rôle                                                             |
| --------------------------------- | ---------------------------------------------------------------- |
| `createRichTextTurndownService()` | Instance Turndown configurée (`atx`, `-`, `*`, `remove`, `keep`) |
| `htmlToMarkdownWith()`            | Assainissement → conversion → rognage                            |
| `normalizeHtmlForCompare()`       | Comparaison de HTML insensible aux espaces                       |
| `runExecCommand()`                | Commande d'édition, sans échec hors navigateur                   |

**La garantie centrale : une instance neuve par appel.** GL ajoute ses règles d'images
(`glImageFigure`, `glImage`) à **son** instance ; ForetMap ne doit jamais les voir. Un test dédié
vérifie cette isolation — c'est la condition qui rend la mutualisation sûre.

**Ce qui reste délibérément dans chaque composant**, conformément à l'avertissement du plan
(« extraire la logique de conversion, jamais le composant ») :

- `markdownToEditableHtml` — signatures et comportements différents : GL résout les sources
  d'affichage et annote le HTML.
- `syncFromDom` — ForetMap tronque sur `maxLength` et propage `name` ; GL non.
- L'effet de synchronisation `value` → DOM — **structurellement identique**, mais son seul appel
  variable est `markdownToEditableHtml`. Le factoriser supposerait d'injecter cette fonction pour
  **deux** appelants : de la machinerie, pas une abstraction (§8).

⚠️ **Deux comportements découverts en écrivant les tests**, et documentés plutôt que corrigés
(aucun n'est un défaut, mais tous deux surprennent) :

1. `turndownService.keep(['hr'])` **ne conserve pas** la balise : `<hr />` devient la rupture
   thématique Markdown `* * *`.
2. `sanitizeRichHtml(html, { allowImages: true })` **retire le `src`** d'une image à URL relative ;
   seules les URL absolues sont conservées, et elles sont alors encadrées dans une
   `<figure class="gl-content-image-wrap">`.

#### B2 — `quiz.js` ↔ `gl/qcm.js` ✅ analysé, réduit à sa juste mesure

**Ce que promettait le chiffre.** 109 lignes communes : le plus gros recouvrement mesuré du
dépôt, et le seul dont le noyau semblait n'être que partiellement partagé.

**Ce que l'analyse ligne à ligne a montré.** Le chiffre surestime l'occasion d'environ **six
fois** :

| Nature des lignes communes                                                                          | ~Lignes | Factorisable ?                                |
| --------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------- |
| Plomberie Express : `express.Router()`, `asyncHandler`, réponses `res.status(4xx).json`             | ~30     | ❌ légitime                                   |
| **Imports de noyaux déjà partagés** (`questionCrudCore`, `questionQueryFactory`, `glGlossaryMatch`) | ~12     | ❌ preuve que la mutualisation a déjà eu lieu |
| Listes de noms de champs (`question_code:`, `difficulte:`, `choix_a, choix_b…`)                     | ~10     | ❌ donnée, pas logique (même cas qu'au §5)    |
| Requêtes d'agrégats admin                                                                           | ~15     | ❌ tables **et** colonnes différentes         |
| Enrobage glossaire (`loadGlossaryLookup`, `enrichQuestionWithGlossary`)                             | ~13     | ⚠️ voir ci-dessous                            |
| **`normalizeQuestionCode`** — duplicata **exact**                                                   | **~6**  | ✅ **extrait**                                |

`questionCrudCore` est déjà consommé par `lib/fmQuizCrud.js`, `lib/glQcmCrud.js` et
`lib/glQcmLoreCrud.js` ; `routes/quiz.js` importe déjà `lib/glGlossaryMatch`. Le travail
imaginé — « étendre l'usage de noyaux existants » — était **déjà fait**.

**Pourquoi l'enrobage glossaire n'a pas été extrait.** Les deux implémentations sont identiques
au nom de table près, ce qui rendait l'extraction tentante. Trois signaux l'ont écartée :

1. **Deux appelants seulement**, là où la grille du §8 demande trois (ou deux et un troisième certain).
2. Un **troisième variant existe** — `routes/gl/games/markers.js` — mais il **branche** sur les
   questions lore avec un autre index de glossaire. L'y faire entrer supposerait un drapeau par
   produit : le signal, précisément, que les cas ne sont pas le même problème.
3. L'extraction demandait une fabrique avec injection de `queryAll`, de `combineKeywords` (dont
   l'implémentation diffère par produit) et une liste blanche de tables — soit de la **machinerie
   pour deux appelants**. C'est la définition de l'abstraction prématurée.

**Livré.** `lib/shared/questionRouteHelpers.js` : `normalizeQuestionCode` seul, duplicata exact et
sans machinerie, consommé par les deux routes. Couvert par `tests/question-route-helpers.test.js`.

**Leçon.** Le plus gros recouvrement du dépôt était, comme le plus fort ratio (§5), largement un
faux positif. Deux fois sur deux, l'indicateur a désigné une piste que l'examen a refermée — ce
qui est le rôle d'un indicateur, à condition de ne jamais s'arrêter à lui.

#### B3 — Libellés d'erreur d'authentification ❌ écarté à l'analyse

**Ce que promettait le chiffre.** 97 lignes communes entre `routes/auth.js` et
`routes/gl/auth.js`, dont une vingtaine estimée de chaînes d'erreur identiques.

**Ce que l'analyse a montré.** Sur les 97 lignes, **8 seulement** sont des libellés d'erreur
(« Identifiant ou mot de passe incorrect », « Ce pseudo est déjà utilisé », « Aucun champ de
profil à mettre à jour »…). Le reste se répartit en ~28 lignes d'imports — dont ceux
d'`oauthCommon`, déjà partagé —, ~6 de plomberie de réponse, ~4 de SQL et une cinquantaine de
configuration OAuth et de noms de champs.

**Décision : ne pas faire.** Huit chaînes ne justifient pas une indirection supplémentaire, encore
moins dans la zone la plus sensible du projet. Le bénéfice invoqué — « une correction de
formulation ne s'applique aujourd'hui qu'à un produit » — reste vrai, mais se traite mieux par une
relecture ponctuelle que par un module partagé qui n'aurait que ce contenu.

#### B4 — Échelle d'empilement commune ✅ livré

**Objectif.** Une seule échelle de `z-index` pour les deux produits, au lieu de deux
échelles sans rapport (ForetMap de 80 à 99 999, G&L de 55 à 12 050).

**Pourquoi ce n'était pas cosmétique.** Les surfaces _partagées_ — coque de modale,
popover de contrôle de compréhension, visite guidée — portaient une valeur en dur, donc
calibrée pour un seul des deux produits. Cinq surfaces s'ouvraient derrière ce qui venait
de les appeler, dont la fiche glossaire des deux côtés. Et faute de pouvoir raisonner sur
l'ordre, **deux patchs identiques** avaient été écrits de chaque côté pour remonter les
modales au-dessus du plein écran.

**Ce qui a été fait.** `src/shared/styles/z-layers.css` déclare les paliers par _rôle_
(chrome, conteneur de vue, dialogue, popover, fiche terminale, signalement, média). Toutes
les surfaces globales des deux produits s'y rattachent ; `gl-theme.css` ne redéfinit plus
aucun palier. Le plein écran devient un conteneur de vue, sous les dialogues — ce qui rend
les deux patchs inutiles, et ils sont supprimés. Les jetons doublons (`--fm-toast-z` /
`--fm-z-toast`, double déclaration de `--fm-z-nav`) sont fusionnés.

**L'invariant qui ferme les inversions** : _ce qui appelle est sous ce qui est appelé._ La
chaîne réelle va du contenu à la fiche, puis de la fiche à sa validation — d'où l'ordre
`popover < quiz-popover < glossary < learning-ack`.

⚠️ **Piège découvert en intégrant `main`.** La validation (« j'ai appris ce terme ») et la
simple _fenêtre_ du quiz partagent la classe `.fm-quiz-popover` alors qu'elles sont aux deux
bouts de cette chaîne : la fenêtre du quiz ouvre des fiches, la validation est ouverte depuis
une fiche. Seule la seconde doit passer au-dessus des fiches. Le modificateur
`.fm-quiz-popover--ack` les distingue, et un test vérifie qu'aucun des quatre sites de
validation ne l'oublie — sans quoi la question se rouvrirait derrière la fiche d'où on l'a
demandée.

**Acceptation.** `tests-ui/utils/zLayers.test.js` (6 cas) verrouille l'ordre des paliers,
interdit qu'une feuille redéclare l'un d'eux ou rechoisisse un `z-index` global en dur, et
vérifie que les patchs de plein écran ne reviennent pas. Vérifié aussi sur le **CSS
compilé** : plus aucun `z-index` en dur au-dessus de 30 dans `dist/`.

⚠️ **Piège.** Les `z-index` **locaux** (petits entiers ordonnant des éléments dans un même
composant : marqueurs de carte, pastilles) ne relèvent pas de l'échelle et restent en dur.
Le test le formalise par un seuil à 30 : au-delà, la valeur arbitre entre surfaces et doit
passer par un palier.

#### B5 — Auto-lien de glossaire ✅ livré

**Objectif.** Les deux produits liaient les termes de glossaire dans un texte rendu avec la
même mécanique, écrite deux fois.

**Ce qui a été fait.** La délégation de clic (un écouteur sur le conteneur, `preventDefault`
pour ne pas naviguer vers `#` ni basculer le bouton radio d'un choix de quiz) était
identique **à l'attribut de données près** — `data-glossary-code` contre
`data-gl-glossary-code`. Elle devient `src/shared/utils/glossaryLinkClick.js`, l'attribut
passant en paramètre. La mécanique qui l'entoure — produire le HTML lié, **retomber sur un
texte sans liens plutôt que casser l'écran** si l'auto-lien échoue, brancher l'écouteur —
était répétée dans quatre composants (`GlossaryMarkdown`, `GlossaryInlineText`,
`GLGlossaryMarkdown`, `GLGlossaryInlineText`) : elle devient le hook
`src/shared/hooks/useGlossaryLinkedHtml.js`.

Ce repli méritait d'être écrit une seule fois : un terme mal formé en base ne doit jamais
faire disparaître le texte que l'élève est en train de lire.

**Acceptation.** `tests-ui/shared/glossaryLinkClick.test.js` (5 cas) ; les tests des quatre
composants au vert sans réécriture.

⚠️ **Piège rencontré.** En déplaçant le rendu dans un hook, les options de rendu
(`allowImages`, `allowJournalEmbeds`) sortent des dépendances du `useMemo` puisqu'elles sont
capturées par une fermeture. Elles sont réinjectées explicitement via `renderDeps` : sans
cela, changer l'option n'aurait plus recalculé le HTML.

**Non retenu.** Fusionner `GlossaryPopover` et `GLGlossaryPopover` : 502 lignes de
différence sur 753 (API, actions de pied de fiche, catégories et palette propres à chaque
produit). Le gain serait faible au regard du risque, et le mélanger à B4 aurait rendu toute
régression difficile à imputer. À réévaluer isolément si les deux fiches se rapprochent.

---

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
| B4  | `src/shared/styles/z-layers.css` — échelle commune ; 2 patchs et 2 surcharges supprimés  | `tests-ui/utils/zLayers.test.js` (6 cas)                 |
| B5  | `glossaryLinkClick.js` + `useGlossaryLinkedHtml.js` — 4 composants allégés               | `tests-ui/shared/glossaryLinkClick.test.js` (5 cas)      |
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
