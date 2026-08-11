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
| **A2** | Adopter `useAdminCrud` sur un panneau admin ForetMap (pilote — ex. biodiversité)                          | S      | Faible      | à faire      |
| **A3** | Généraliser l'autosave débouncé aux panneaux prof ForetMap qui le méritent                                | M      | Faible      | à faire      |
| **A4** | Doc de référence `docs/reference/foretmap/` éditable depuis l'app (miroir de `GLReferenceDocsPanel`)      | M      | Moyen       | à arbitrer   |

> **A2 avant A3.** Un pilote unique valide l'ergonomie du hook côté ForetMap avant toute
> généralisation. Si le pilote frotte, on corrige le hook, pas dix panneaux.

### Axe B — Extraire les noyaux restants

| Lot    | Contenu                                                                                                              | `comm` visé | Effort | Risque | État         |
| ------ | -------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ------ | ------------ |
| **B0** | `jsonDefaultsStore` — mécanisme « défauts JSON + surcharge en base » (`helpContent` / `glHelp`)                      | ~35         | S      | Faible | ✅ **livré** |
| **B1** | Noyau d'édition riche : configuration Turndown + aller-retour Markdown ↔ HTML assaini, partagé par les deux éditeurs | ~53         | M      | Moyen  | à faire      |
| **B2** | `quiz.js` ↔ `gl/qcm.js` : étendre l'usage de `questionCrudCore` / `questionQueryFactory` déjà présents               | ~109        | M      | Moyen  | à faire      |
| **B3** | Libellés d'erreur d'authentification partagés (`auth.js` ↔ `gl/auth.js`)                                             | ~20         | S      | Faible | opportuniste |

> **B1 est le plus délicat.** Les éditeurs WYSIWYG sont sensibles au détail (position du curseur,
> collage, sélection). Extraire **la logique de conversion**, jamais le composant : GL a en plus
> l'insertion d'images inline et un état propre. Couvrir par les tests existants
> (`GLRichTextEditor.test.jsx`) **avant** de toucher quoi que ce soit.

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

| Lot | Livrable                                                                                 | Tests                                           |
| --- | ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| A1  | `src/shared/hooks/useAdminCrud.js` + `useGlAdminCrud` réduit à un adaptateur de 4 lignes | `tests-ui/shared/useAdminCrud.test.jsx` (8 cas) |
| B0  | `lib/shared/jsonDefaultsStore.js` consommé par `helpContent.js` et `glHelp.js`           | `tests/json-defaults-store.test.js` (9 cas)     |
| —   | `scripts/audit-duplication-fm-gl.mjs` — audit reproductible                              | —                                               |

Non-régression vérifiée : suite UI complète (396 fichiers, 2571 tests) au vert ; tests backend
sans base de données au vert ; panneaux GL consommateurs (`GLSpeciesEditorPanel`,
`GLGlossaryEditorPanel`, `GLSpellsEditorPanel`) au vert ; ESLint sans erreur ; Prettier conforme.

---

## 10. Pour aller plus loin

- [`MASCOT_ARCHITECTURE_CONVERGENCE.md`](./MASCOT_ARCHITECTURE_CONVERGENCE.md) — convergence du système mascotte (achevée)
- [`MASCOT_NARRATEUR_OLU.md`](./MASCOT_NARRATEUR_OLU.md) §15 — application de cette grille au chantier OLU
- [`GL_ARCHITECTURE.md`](./GL_ARCHITECTURE.md) — architecture et isolement du sous-produit GL
