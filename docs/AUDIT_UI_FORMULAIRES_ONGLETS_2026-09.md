# Audit — homogénéité des formulaires, des listes déroulantes et des onglets (septembre 2026)

Déclencheur : « suivant les zones du site, les menus déroulants, les choix d'onglet, les
formulaires n'ont pas une apparence homogène […] comme dans certains onglets de
administration. Homogénise en choisissant l'apparence la plus moderne et la plus pratique. »

> **Portée et méthode.** Lecture statique de `src/**` au commit de tête de la branche
> `claude/gracious-keller-zaulfx` : 685 champs de saisie (`input` / `select` / `textarea`),
> 34 feuilles `.css`, ~24 000 lignes de CSS. Les comptages viennent de scripts d'analyse du
> balisage JSX (les opérateurs de diffusion et les commentaires sont exclus), pas de `grep`
> naïfs. Rendu vérifié au navigateur (Chromium) sur le bundle de production.
>
> **Ce qui n'est pas réaudité ici.** [`AUDIT_UI_HOMOGENEITE_2026-09.md`](AUDIT_UI_HOMOGENEITE_2026-09.md)
> (typographie, emojis des plans, densité) et [`AUDIT_UI_2026-09-16.md`](AUDIT_UI_2026-09-16.md)
> (nommage des champs H1, tokenisation de la couleur H2, styles inline H3, hauteurs de la
> barre de filtres H5) restent les points d'entrée de leurs sujets. Le présent audit traite
> la couche que ni l'un ni l'autre n'avait ouverte : **l'apparence du contrôle lui-même**.

---

## 1. Constats

### F1 — 🔴 Six apparences pour le même `<select>`

| Contexte                              | Bordure                           | Rayon | Fond      | Hauteur |
| ------------------------------------- | --------------------------------- | ----- | --------- | ------- |
| `.field select` (formulaires)         | 1,5 px `--mint`                   | 10 px | `--cream` | ~45 px  |
| `.task-filters select`                | 1,5 px `--mint`                   | 8 px  | blanc     | 38→44px |
| `.media-library-menu__filter select`  | **1 px `#cbd5e1`** (hors palette) | 8 px  | `#fff`    | 34 px   |
| `.profiles-admin-list-toolbar select` | **aucune** → widget natif de l'OS | —     | —         | 44 px   |
| `.moodle-table select`                | **aucune** → widget natif de l'OS | —     | —         | 36 px   |
| `className="form-select"` (42 cas)    | **aucune** → widget natif de l'OS | —     | —         | ~22 px  |

`#cbd5e1` est un gris ardoise : c'était le seul endroit du dépôt à employer une couleur
étrangère à la palette forêt pour une bordure de champ.

### F2 — 🔴 Deux familles de classes n'existaient dans aucune feuille

`form-select` (42 occurrences, 16 fichiers) et `form-input` (42 occurrences, 15 fichiers)
étaient posées dans le balisage **sans qu'aucune règle CSS ne les définisse**. Les 84 champs
concernés sortaient donc avec le widget natif du système — un rendu qui ne changeait pas
seulement d'un écran à l'autre, mais **d'un appareil à l'autre pour le même écran** (iOS,
Android et Windows ne dessinent pas la même liste déroulante).

Écrans touchés, tous côté professeur ou administration : réglages de validation des lectures,
rattachement des questions aux contenus, catalogue et éditeur de QCM, glossaire, réseau
trophique, studio mascotte (métadonnées, images, états, comportements, profils d'interaction,
alias d'état, action groupée), studio des dialogues.

Même mécanisme, un cran plus loin : **`.card` n'existe pas non plus** (8 usages —
`QuizView`, `FoodWebView`, `FMLearningLinksPanel`, `FMLearningGatingSettings`,
`stats-views`). Ces écrans croient poser une carte et rendent un bloc transparent. Plus
largement, **ForetMap n'a aucune primitive de surface** : chaque écran réinvente la sienne
(`.about-card`, `.stat-card`, `.pin-card`, `.notif-panel`, `.forum-panel`…).

### F3 — 🔴 186 champs n'étaient dans aucun conteneur habillé

Sur 72 fichiers, aucun wrapper `.field` n'est employé : barres d'outils de profils, tableaux
Moodle, bibliothèque de médias, éditeurs de packs mascotte, panneaux d'usage et de suivi.
Ces champs-là ne portaient ni classe utile ni conteneur habillé — rendu natif intégral, et
cible tactile d'environ 22 px là où la convention du projet demande 44 px.

### F4 — 🔴 Quatre barres d'onglets dans la seule administration

| Apparence                                 | Écrans                                                      |
| ----------------------------------------- | ----------------------------------------------------------- |
| `.top-tabs` / `.top-tab` (rail parchemin) | Profils & utilisateurs, Audit                               |
| `.gl-subtabs` (pilules, style **G&L**)    | Paramètres : Cartographie, Aide, Sections                   |
| `btn btn-sm btn-primary/btn-ghost`        | Studio mascotte, outil de packs, rattachement des questions |
| `.auth-tabs` (segment compact)            | Connexion / inscription                                     |

Deux problèmes distincts s'y superposent. D'abord la **forme** change d'un écran à l'autre.
Ensuite les deux premières lignes disent la même chose de deux façons : `.top-tabs` est la
barre de navigation **principale** du professeur, réemployée telle quelle un niveau plus bas
— deux niveaux de navigation empilés avec la même apparence, sans hiérarchie lisible.

Accessibilité au passage : la barre de l'Audit (`audit-views.jsx:261`) n'avait ni
`role="tablist"`, ni `role="tab"`, ni `aria-selected`, ni `type="button"`.

### F5 — 🟠 Huit boutons portaient une variante sans sa classe de base

`btn-primary`, `btn-ghost` ou `btn-secondary` posées **sans** `btn`. Or `.btn` porte la boîte
(padding, rayon, hauteur 44 px, fonte) et la variante ne porte que la couleur : le résultat
est un aplat de couleur sur un bouton natif. Six dans `FMLearningLinksPanel.jsx`, un dans
`RecurringSeriesOverview.jsx:171`, un dans `TourOverridesEditor.jsx:155`.

Ce dernier est un composant **partagé** avec G&L, qui ne charge jamais `src/index.css` : son
bouton n'était pas seulement mal habillé d'un côté, il était entièrement nu de l'autre.

### F6 — 🟡 Quatre classes de texte d'aide et d'erreur également fantômes

`.hint` (5 fichiers), `.muted` (4), `.form-error` (2), `.text-danger` (6). Conséquence la
plus gênante : l'erreur d'enregistrement automatique de la fiche espèce
(`PlantEditForm.jsx:681`) et de l'éditeur de tutoriel (`TutorialEditorPanel.jsx:189`)
s'affichait dans l'encre du corps de texte — rien ne la distinguait d'une phrase ordinaire.

### F7 — 🟡 Deux dialectes de libellé de champ

`.field label` : majuscules, interlettrage `.07em`, gras, vert `--leaf`.
`.pedago-filter-field` : minuscules, demi-gras, gris-vert `#6b7f72`. Les deux cohabitent dans
le même écran pédagogique.

### F8 — 🟡 Cinq habillages de tableau côté ForetMap

`moodle-table`, `pedago-links__table`, `data-table`, `visit-mascot-pack-detail-table`, plus
deux tableaux sans aucune classe (`LearningGatingLocksPanel`, `DataList`). G&L en a trois de
plus de son côté.

---

## 2. Ce qui va bien (à ne pas casser)

- **Boutons** : `.btn` et ses variantes couvrent 1 407 usages sur 140 fichiers ; hors les
  huit cas de F5, la famille est homogène et bien tenue.
- **Modales** : une seule coque partagée (`DialogShell` + `shared/styles/modal-shell.css`),
  effectivement employée des deux côtés.
- **Typographie et empilement** : les acquis des audits précédents tiennent (tokens `--text-*`
  sous garde-fou CI, `z-index` entièrement tokenisé).

---

## 3. Décisions

| Sujet              | Décision                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Listes déroulantes | **Chevron dessiné** (`appearance:none` + SVG). Seul moyen d'obtenir le même champ fermé sur iOS, Android et Windows.               |
| Sous-onglets       | **Rail parchemin dérivé de `.top-tabs`** : `.top-tabs` reste la navigation principale, `.fm-subtabs` en est la version secondaire. |
| Périmètre du lot   | **Champs et onglets.** La primitive de surface (F2, `.card`) et l'unification des tableaux (F8) sont hors lot.                     |
| Ampleur            | **Les 685 champs**, par une couche de base qui les rattrape tous — non par la réécriture de 685 appels.                            |

**Pourquoi une couche de base plutôt qu'une migration du balisage.** Réécrire 685 `className`
sur plus de 100 fichiers produit un diff illisible et laisse forcément passer des cas. Une
règle au niveau de l'élément (`input, select, textarea`) les couvre tous, **y compris ceux
qui seront écrits demain**. Elle pèse (0,0,1) : n'importe quelle règle de classe existante la
bat, donc rien de ce qui était déjà juste ne bouge. Les six contextes qui réécrivaient
l'apparence ont ensuite été repris un par un — non pas pour redéfinir une bordure, mais pour
ne régler que leur **densité**, via les tokens `--fm-control-*` posés sur le conteneur.

**Pourquoi la liste ouverte reste native.** `appearance:none` n'habille que le champ fermé.
Le menu déroulé continue d'être rendu par le système : on garde son accessibilité, son
ergonomie tactile et son comportement au clavier. Un menu recréé en JavaScript aurait payé
tout cela pour un gain purement esthétique.

---

## 4. Ce que ce lot livre

| #   | Action                                                                                                                                                                                                    | Traite |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| A1  | `src/shared/styles/form-controls.css` — `.fm-field`, `.fm-input`, `.fm-select`, `.fm-textarea`, variantes `--sm` / `--auto`, tokens `--fm-control-*`, chargée par les deux produits                       | F1, F2 |
| A2  | `form-input` / `form-select` deviennent des alias de cette famille : les 84 champs fantômes sont habillés sans toucher leur balisage                                                                      | F2     |
| A3  | Couche de base ForetMap sur `input` / `select` / `textarea` dans `src/index.css` — les 186 champs sans conteneur sont rattrapés                                                                           | F3     |
| A4  | Les six contextes divergents passent aux tokens de densité (`.field`, `.task-filters`, `.moodle-table`, `.media-library-menu__filter`, chrome de carte, forum/commentaires) ; le gris `#cbd5e1` disparaît | F1     |
| A5  | `src/shared/styles/subtabs.css` — `.fm-subtabs`, une seule barre secondaire ; les 4 apparences y convergent (9 barres migrées)                                                                            | F4     |
| A6  | Rôles ARIA et `type="button"` posés sur la barre de l'Audit                                                                                                                                               | F4     |
| A7  | Les 8 variantes de bouton retrouvent leur classe de base ; celle du composant partagé passe à `.shared-btn`                                                                                               | F5     |
| A8  | `.hint`, `.muted`, `.form-error`, `.text-danger` définies auprès des champs qu'elles accompagnent                                                                                                         | F6     |
| A9  | Garde-fou CI `tests/form-controls-guard.test.js` (7 assertions) + `tests-ui/components/FmSubtabs.test.jsx`                                                                                                | F1–F6  |

**Le garde-fou interdit le retour de chacun des mécanismes ci-dessus** : une classe de
contrat sans règle CSS, une variante de bouton sans sa base, `.gl-subtabs` dans un écran
ForetMap, `.top-tabs` hors du chrome professeur, une bordure de champ réécrite hors de la
couche de base, et toute règle qui effacerait le chevron (`background` ou `padding` en
raccourci sur un `<select>`).

### Exceptions assumées

- **`shared/components/TourOverridesEditor.jsx`** garde `.gl-subtabs` : il est rendu par les
  deux produits, et `subtabs.css` n'est chargée que par ForetMap. Le faire basculer
  changerait l'apparence de G&L, ce qui n'était pas demandé. Le garde-fou nomme cette
  exception explicitement.
- **Trois fonds de champ restent différents** — `.map-switch-select` (parchemin),
  `.visit-map-switch-select` et `.visit-mascot-picker` (blanc opaque). Ce sont des contrôles
  posés **sur la carte** : un fond crème y serait illisible. C'est documenté sur place.

---

## 5. Reste à faire

| #   | Sujet                                                                                                                                       | Traite |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| B1  | Primitive de surface `.fm-panel` et réparation des 8 `.card` fantômes (Quiz, réseau trophique, rattachement, réglages de validation, stats) | F2     |
| B2  | Un seul habillage de tableau pour les cinq de ForetMap                                                                                      | F8     |
| B3  | Un seul dialecte de libellé de champ (`.field label` contre `.pedago-filter-field`)                                                         | F7     |
| B4  | Poursuivre la tokenisation de la couleur et la résorption des styles inline (lot C de `AUDIT_UI_2026-09-16.md`, toujours ouvert)            | —      |
