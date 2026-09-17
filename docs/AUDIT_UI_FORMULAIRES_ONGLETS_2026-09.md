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

## 5. Lot B — surfaces, tableaux, libellés (livré le 17 septembre 2026)

| #   | Action                                                                                                                                                                                                                                                                   | Traite |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| B1  | `src/shared/styles/surfaces.css` — `.fm-panel` (+ `--flush`, `--quiet`, `__head`, `__title`, `__body`) et ses tokens `--fm-panel-*`. `.card` en devient l'alias : les 8 écrans qui posaient une classe inexistante retrouvent une surface, sans que leur balisage change | F2     |
| B2  | `.fm-table` / `.fm-table-wrap` (+ `--dense`, `__actions`) et ses tokens `--fm-table-*` : les 5 habillages convergent, les 2 tableaux sans classe et les 2 classes fantômes sont rattachés                                                                                | F8     |
| B3  | Un seul dialecte de libellé (`.fm-label`) : les capitales interlettrées disparaissent, les 7 variantes s'alignent                                                                                                                                                        | F7     |
| B4  | **Conformité inter-produits** : les 4 entrées (ForetMap, G&L, Plan, plan des personnels) chargent les feuilles du contrat, sous garde-fou                                                                                                                                | F9     |
| B5  | La fiche de pack mascotte cesse de réécrire son tableau en styles inline                                                                                                                                                                                                 | F8     |

### F9 — 🟠 Un produit neuf repartait d'une page blanche (constat du lot B)

La relecture des PR fusionnées les 16 et 17 septembre (#493, #495, #497, #498) a fait
apparaître un mécanisme que le lot A n'avait pas vu : **#497 a introduit un quatrième
produit**, le plan des personnels (`src/staff/`), dont l'entrée ne chargeait ni
`form-controls.css` ni la moindre feuille du contrat. Le Plan public était dans le même cas.

Ce n'est pas une négligence : rien ne le signalait. `src/plan/styles/plan.css` va jusqu'à
**réaliaser `--forest` et `--leaf` sur sa charte marine**, en toutes lettres « pour les
contrôles partagés » — l'intention de réutiliser le contrat commun est écrite, mais la
feuille n'était pas chargée. Dans les faits ces deux produits n'ont que deux champs (la
recherche de la barre haute et le formulaire de suggestion), tous deux habillés à la main :
le manque ne se voyait donc pas encore à l'écran.

Le reste de ces PR est conforme, et c'est le point important : `SurfaceVisibilityField`
(nouveau champ partagé) emploie `.fm-surface-field`, `StaffPlanSettingsPanel` (nouvel écran
d'administration) emploie `.field` et `.muted`. Le contrat est suivi **quand il est
disponible** ; ce qui manquait, c'est qu'une entrée nouvelle le charge d'office.

**Traité :** les quatre entrées chargent `form-controls.css` et `surfaces.css`, et
`tests/form-controls-guard.test.js` échoue si l'une cesse de le faire. Le Plan teinte les
tokens à sa charte marine au lieu de réécrire ses bordures. `.plan-topbar__input` reste nu,
et c'est documenté sur place : ce champ vit à l'intérieur d'une pilule de recherche qui
porte déjà la bordure.

> **Le chevron est le seul token qui ne se dérive pas.** Sa couleur est cuite dans le SVG :
> un produit à une autre palette doit remplacer `--fm-control-chevron` en entier. Aucun ne le
> fait aujourd'hui — ni le Plan ni le plan des personnels n'ont de liste déroulante.

## 6. Lot C — surfaces historiques, tableaux G&L, couleur (livré le 17 septembre 2026)

| #   | Action                                                                                                                                                                                                        | Traite |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| C1  | Les cinq surfaces historiques (`.about-card`, `.stat-card`, `.pin-card`, `.notif-panel`, `.forum-panel`) passent sur `.fm-panel` et ne gardent que leurs écarts assumés, réglés par les tokens `--fm-panel-*` | F2     |
| C2  | Les trois tableaux de G&L passent sur `.fm-table`, avec deux variantes communes nouvelles : `--zebra` (venue de G&L, désormais disponible partout) et `--wrap`                                                | F8     |
| C3  | `src/shared/styles/color-tokens.css` — l'échelle neutre qui manquait (surfaces, filets, encres), chargée par les quatre produits                                                                              | H2     |
| C4  | 505 littéraux de couleur migrés vers les tokens, dont 219 `#fff` ; les encres de texte d'état convergées                                                                                                      | H2     |
| C5  | `tests/color-tokens-guard.test.js` — un contrat fort (aucun littéral ne redit la valeur d'un token) et trois cliquets                                                                                         | H2, H3 |

### La méthode, et pourquoi elle n'est pas une simple substitution

L'audit de septembre demandait une « migration mécanique des 363 valeurs distinctes ». La
mesure montre que ce n'est **pas** réalisable d'un bloc : rapprocher les valeurs qui se
disputent un même rôle repeint l'application. Écart perceptuel (ΔE CIE76) des rapprochements
« évidents », mesuré avant d'agir :

| Littéral  | Token candidat  | ΔE   | Décision                         |
| --------- | --------------- | ---- | -------------------------------- |
| `#166534` | `--ink-success` | 6,0  | convergé (à peine perceptible)   |
| `#b91c1c` | `--ink-danger`  | 14,0 | convergé — voir ci-dessous       |
| `#92400e` | `--ink-warning` | 19,0 | convergé — voir ci-dessous       |
| `#6b7280` | `--ink-soft`    | 6,0  | **non** — tokenisé à sa valeur   |
| `#666666` | `--ink-soft`    | 15,4 | **non** — trop loin              |
| `#16a34a` | `--ink-success` | 36,0 | **non** — rôle différent (aplat) |

D'où **deux régimes**, écrits dans l'en-tête de `color-tokens.css` :

1. **La couche neutre est tokenisée à valeur identique.** Surfaces, filets et encres de texte
   prennent un nom sans changer d'un pixel. C'est une opération vérifiable, pas un choix
   esthétique — et elle règle le vrai manque : il n'existait aucun nom pour « le gris d'un
   libellé secondaire », d'où 206 gris distincts.
2. **Les encres de texte d'état sont convergées**, sur la valeur déjà déclarée dans
   `state-inks.css` puisque G&L l'aliase. 42 occurrences, toutes sur la propriété `color`.
   Les aplats et les filets gardent la leur : un fond vif et une encre lisible sur fond clair
   ne sont pas le même rôle, les confondre donnerait soit un aplat terne, soit un texte
   illisible. C'est une décision, elle est réversible en changeant un seul token.

Résultat : **1 233 → 736 littéraux hexadécimaux** en CSS (−41 %), `#ffffff` passant de 219 à
zéro hors déclarations de tokens.

### C6 — 🟡 Ce que le lot n'avait pas tranché

Il restait **deux familles de gris** : une neutre (`#222`…`#888`) et une ardoise (`--ink-*`,
teintée bleu). Les rapprocher donne un reflet bleu à toute la première — ΔE de 8 à 12 selon
la paire. Le choix (garder deux familles, ou teinter) était une décision de charte, pas un
nettoyage. **Elle est prise dans le lot D ci-dessous : on teinte.**

Idem pour les 147 styles inline qui portent encore une couleur : ce sont des teintes uniques,
sans rôle réutilisable. Le cliquet les plafonne.

## 7. Lot D — la famille de gris neutre rejoint l'échelle ardoise (livré le 17 septembre 2026)

Mesure d'abord. Sur les feuilles CSS hors `dist/`, il restait **82 gris quasi neutres écrits
en dur pour 46 valeurs distinctes** — bien moins que ne le laissait craindre le cliquet, et
surtout répartis en deux groupes qui n'appellent pas la même décision.

**Groupe traité — les gris francs, ΔE 8 à 12.** Dix-huit **encres de texte** et deux
**filets**, tous dans `src/index.css`, là où l'échelle ardoise avait déjà un rôle et
52 usages :

| Gris      | occ. | Rôle retenu    | Valeur    |   ΔE | ΔL\* | Contraste sur blanc |
| --------- | ---: | -------------- | --------- | ---: | ---: | ------------------- |
| `#222`    |    1 | `--ink-strong` | `#1f2937` | 10,8 | +3,0 | 15,91 → 14,68       |
| `#333`    |    1 | `--ink-strong` | `#1f2937` | 11,5 | −5,0 | 12,63 → 14,68       |
| `#444`    |    2 | `--ink-base`   | `#4b5563` | 11,7 | +6,9 | 9,74 → 7,56         |
| `#555`    |    4 | `--ink-base`   | `#4b5563` |  9,4 | −0,4 | 7,46 → 7,56         |
| `#666`    |    5 | `--ink-muted`  | `#6b7280` |  9,8 | +4,7 | 5,74 → 4,83         |
| `#6f6f6f` |    1 | `--ink-muted`  | `#6b7280` |  8,7 | +1,1 | 5,02 → 4,83         |
| `#888`    |    3 | `--ink-faint`  | `#8a94a0` |  8,7 | +4,2 | 3,54 → 3,08         |
| `#8a8a8a` |    1 | `--ink-faint`  | `#8a94a0` |  8,3 | +3,4 | 3,45 → 3,08         |
| `#ddd`    |    1 | `--line-soft`  | `#e5e7eb` |  4,1 | +3,5 | filet               |
| `#ccc`    |    1 | `--line-muted` | `#d1d5db` |  4,6 | +3,1 | filet               |

**Aucune paire ne bascule de part et d'autre du seuil AA (4,5:1).** Le repaint est visible
sur `#444` (+6,9 de clarté) et `#333` (−5,0), négligeable ailleurs.

### D0 — 🟠 `--ink-faint` ne passe pas AA, et ce n'est pas ce lot qui l'a cassé

Le rôle « texte tertiaire » vaut **3,08:1 sur blanc**, sous le seuil AA de 4,5 pour du texte
normal. Les quatre gris qui viennent de le rejoindre étaient déjà sous le seuil (3,45 et
3,54) : le lot ne crée pas le défaut, il le **rassemble** — ce qui le rend pour la première
fois corrigeable en un seul endroit. Le relever (vers `--ink-soft`, `#64748b`, 5,0:1)
assombrirait tout le texte tertiaire de l'application : c'est une décision de charte, pas
un nettoyage, et elle reste ouverte.

### Ce que le lot n'a délibérément pas touché

- **La traîne d'off-whites teintés vert** (`#f8fbf9`, `#eef4f0`, `#fafdfb`… ≈ 40 valeurs à
  ΔE 0,6–5,5 de `--surface-cool` / `--surface-sunken`). L'écart est invisible, mais ces
  blancs cassés penchent vers le **vert** quand l'échelle penche vers le **bleu** : les
  fusionner changerait la direction de teinte du thème forêt. Autre décision, autre lot.
- **Les traits du graphe trophique** (`#666666` dans `food-web-graph.css`) : de la
  data-visualisation, pas du texte d'interface — même exception que les illustrations.
- **Les noirs profonds de G&L** (`#000`, `#0b0805`) : palette de marque d'un sous-produit
  isolé, hors échelle d'interface par construction.

Cliquet abaissé en conséquence : `CEILING_CSS_HEX` passe de **745 à 669**, soit la valeur
réelle — il n'a plus de mou, et le prochain littéral en dur le fait échouer.

## 8. Reste à faire

| #   | Sujet                                                                                                                                            | Traite |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| D1  | ~~Trancher les deux familles de gris (C6)~~ — **fait, lot D**                                                                                    | H2     |
| D2  | Résorber la traîne des 147 couleurs inline, par écran, au fil des touches                                                                        | H3     |
| D3  | Les 577 littéraux `rgb()/rgba()` — surtout des ombres et des voiles ; une échelle d'ombres et d'opacités serait le pendant de celle des couleurs | H2     |
| D4  | Trancher `--ink-faint` sous AA (D0) : relever le rôle, ou l'assumer pour du texte non essentiel                                                  | H2     |
| D5  | Les off-whites teintés vert : décider si le thème forêt garde sa direction de teinte sur les surfaces                                            | H2     |
