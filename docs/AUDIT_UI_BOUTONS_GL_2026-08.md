# Audit UI — boutons GL & modernité de l'interface (août 2026)

Portée : sous-produit **Gnomes & Licornes** (`src/gl/**`, `src/gl/styles/*.css`), avec
comparaison au socle ForetMap (`src/index.css`).
Méthode : analyse statique du CSS et du JSX + **mesure des styles calculés dans Chromium**
(sonde Playwright rendant `gl-base.css` + `gl-theme.css` sur du markup GL réel).

> **Statut : corrigé.** Le diagnostic ci-dessous a été établi d'abord, puis traité dans le même
> lot. Chaque constat porte son état et la forme retenue. Le document reste la trace du
> raisonnement — notamment de deux constats initialement surévalués, corrigés en §7.

---

## 1. Synthèse

L'impression d'« apparence ancienne » des boutons GL n'était pas subjective : elle avait
**deux causes mécaniques, mesurées et reproductibles**.

| #     | Constat                                                                                                         | Gravité      | État                    |
| ----- | --------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------- |
| **A** | Tous les boutons GL s'affichaient en **Arial 13,3 px** au lieu de **Caudex 16 px**                              | 🔴 Critique  | ✅ Corrigé              |
| **B** | Dans un `.gl-form`, les variantes `secondary` / `ghost` / `danger` s'affichaient toutes en **primaire foncé**   | 🔴 Critique  | ✅ Corrigé              |
| **C** | ~80 lignes de CSS bouton **mort** (`.gl-primary`, `.gl-danger`, `.gl-btn-secondary`, `.gl-btn-danger`)          | 🟠 Moyen     | ✅ Supprimé             |
| **D** | **27 variables CSS jamais définies**, dont `--gl-primary` (28 usages) : ces zones ignoraient le thème de marque | 🟠 Moyen     | ✅ Corrigé              |
| **E** | Palette générique slate/blue (Tailwind) mélangée au thème médiéval : **201 occurrences**                        | 🟡 Cohérence | ✅ Ramenée à 2          |
| **F** | Cibles tactiles et sélecteurs dupliqués                                                                         | 🟡 A11y      | ⚠️ Constat corrigé (§7) |

**Cause racine commune à A :** le reset de `src/gl/styles/gl-base.css` couvrait
`input, select, textarea { font-family: inherit }` mais **omettait `button`**. Les contrôles de
formulaire n'héritent pas de la police du `body` : les `<input>` étaient rattrapés par le reset,
les `<button>` restaient sur la feuille de style du navigateur.

---

## 2. Constat A — les boutons ne portaient pas la police de l'application

### Mesure avant correction (Chromium, styles calculés)

| Élément                        | `font-family` | `font-size`  |
| ------------------------------ | ------------- | ------------ |
| `.gl-btn.gl-btn--primary`      | **Arial**     | **13,33 px** |
| `.gl-btn.gl-btn--secondary`    | **Arial**     | **13,33 px** |
| `<input>`                      | Caudex        | 16 px        |
| Texte courant                  | Caudex        | 16 px        |
| `.gl-primary` _(classe morte)_ | Caudex        | 16 px        |

Sur **84 règles CSS ciblant des boutons**, **une seule** fixait la police
(`.gl-market-trades-list li > button { font: inherit }`).

### Régression par rapport à ForetMap

`.gl-btn` était une version appauvrie du `.btn` ForetMap, qui lui est correct : la migration
avait conservé les couleurs et perdu la typographie.

| Propriété                     | `.btn` (ForetMap)  | `.gl-btn` (avant) |
| ----------------------------- | ------------------ | ----------------- |
| `font-family`                 | `var(--font-sans)` | ❌ absent         |
| `font-size`                   | `1rem`             | ❌ absent         |
| `display`                     | `inline-flex`      | ❌ absent         |
| `gap`                         | `8px`              | ❌ absent         |
| `user-select`                 | `none`             | ❌ absent         |
| `-webkit-tap-highlight-color` | `transparent`      | ❌ absent         |

L'absence de `display: inline-flex` rendait le `gap` inopérant sur les **15 boutons
icône + libellé**, et dans un parent flex/grid le bouton était _blockifié_.

### Correction appliquée

`button` ajouté au reset de `gl-base.css` — une ligne qui traite **tous** les boutons GL, y
compris ceux stylés par sélecteur descendant. Le `!important` mobile à 16 px reste
volontairement réservé aux champs (il existe contre le zoom iOS à la saisie) : l'étendre aux
boutons aurait cassé `.gl-btn--sm`.

`.gl-btn` a par ailleurs retrouvé `display: inline-flex`, `gap`, `font-size`, `user-select`,
`-webkit-tap-highlight-color`, un `:active` et — ce qui manquait aussi — un état `:disabled`.

---

## 3. Constat B — les variantes étaient écrasées dans les formulaires

### Diagnostic

`gl-theme.css` regroupait trois sélecteurs dans une même règle :

```css
.gl-btn,
.gl-form button,          /* ← spécificité (0,1,1) */
.gl-inline-actions button {
  background: var(--gl-color-primary);
  color: #fff;
}
```

`.gl-form button` vaut **(0,1,1)** ; `.gl-btn--secondary` ne vaut que **(0,1,0)**.
Le sélecteur descendant l'emportait donc sur la variante.

### Mesure avant correction

| Variante      | Hors `.gl-form`      | Dans `.gl-form`       |
| ------------- | -------------------- | --------------------- |
| `--primary`   | `rgb(1,58,64)` ✔     | `rgb(1,58,64)` ✔      |
| `--secondary` | `rgb(255,255,255)` ✔ | **`rgb(1,58,64)`** ❌ |
| `--ghost`     | quasi-blanc ✔        | **`rgb(1,58,64)`** ❌ |
| `--danger`    | `rgb(255,226,226)` ✔ | **`rgb(1,58,64)`** ❌ |

**Impact.** `.gl-form` est utilisé dans une trentaine d'écrans. Dans chacun, « Annuler » était
visuellement identique à « Valider », et surtout **« Supprimer » perdait son rouge** — un bouton
destructeur déguisé en bouton de confirmation.

Le cas `.gl-inline-actions` avait **déjà été rattrapé** par des surcharges dédiées ; `.gl-form`
ne l'avait jamais été.

### Correction appliquée

Les sélecteurs descendants sont gardés par `:not(.gl-btn)` : ils ne rattrapent plus que les
`<button>` nus, et les variantes s'appliquent d'elles-mêmes.

```css
.gl-btn,
.gl-form button:not(.gl-btn),
.gl-inline-actions button:not(.gl-btn) { … }
```

Effet de bord bénéfique : les ~25 lignes de surcharges `.gl-inline-actions .gl-btn--*`
deviennent inutiles et ont été supprimées. Les survols par variante ont été ajoutés au passage —
`filter: brightness()` ne produisait rien de visible sur les fonds clairs, qui restaient inertes.

---

## 4. Constat C — CSS bouton mort

`.gl-primary`, `.gl-btn-secondary`, `.gl-btn-danger` : **0 usage** dans tout `src/`.

`.gl-danger` en avait **2**, dans des composants _partagés_ — un premier relevé limité à
`src/gl/` les avait manqués. Ces deux usages ont été migrés avant suppression (§4 bis).

Ironie du diagnostic : ces classes mortes étaient les **seules** à déclarer correctement
`font-family`, `font-size` et `display: inline-flex`. La migration vers `GLButton` avait laissé
derrière elle le CSS le mieux écrit et promu celui qui l'était le moins.

La règle `.gl-kingdom-map-zones > li > button.gl-danger` de `gl-admin.css` ne matchait plus rien
non plus (le bouton y est un `GLButton variant="danger"`) : retargetée sur `.gl-btn`, elle ne
conserve que son intention de mise en page.

### 4 bis — incohérence inter-produits découverte au passage

`MediaLibraryMenu` est rendu par **les deux produits** mais mélangeait des classes propres à un
seul : `.btn*` (définie dans `src/index.css`, donc absente de GL) et `.gl-hint` / `.gl-danger`
(définies dans `gl-theme.css`, donc absentes de ForetMap). La bibliothèque de médias affichait
donc des boutons non stylés — d'un côté ou de l'autre selon la commande.

Corrigé par `src/shared/styles/shared-controls.css`, chargée par les deux entrées : des classes
neutres (`.shared-btn`, `.shared-hint`…) qui n'imposent aucune typographie (`font: inherit`) et
lisent les tokens du produit hôte avec repli. Chaque produit les habille de sa propre palette
sans que le composant ait à savoir où il est rendu.

---

## 5. Constat D — 27 variables CSS jamais définies

| Variable                        | Usages | Effet avant correction                                                 |
| ------------------------------- | ------ | ---------------------------------------------------------------------- |
| `--gl-primary`                  | 28     | ⚠️ Retombait sur `#047c8c` → **le thème de marque du MJ était ignoré** |
| `--gl-color-accent`             | 20     | Retombait sur `#52b788` (vert ForetMap, hors palette GL)               |
| `--gl-color-border`             | 7      | Retombait sur `#e2e8f0` (gris slate générique)                         |
| `--gl-color-surface` / `-muted` | 5      | Retombaient sur `#fff` / `#f8fafc`                                     |
| `--gl-color-text-muted`         | 2      | Aucun équivalent défini                                                |
| `--gl-accent-warm`              | 2      | 🔴 **Sans repli** → déclaration invalide, silencieusement ignorée      |
| 21 autres                       | 1-4    | Retombaient sur des valeurs en dur                                     |

Il s'agissait presque toujours d'une **faute de nommage** : les variables réellement définies
sont `--gl-color-primary`, `--gl-border`, `--gl-surface`, `--gl-surface-muted`. Les replis
masquaient le bug — l'interface _paraissait_ fonctionner, mais des pans entiers (carnet Selene,
panneaux admin, vue plateau, aperçu feuillets) s'affichaient en **turquoise `#047c8c` figé**,
insensibles aux couleurs de marque choisies par le MJ.

### Correction appliquée

Les fautes de frappe ont été **renommées vers les tokens canoniques** (et non aliasées, ce qui
aurait entériné la faute), et les rôles réellement manquants ont été **ajoutés au système** :
`--gl-color-accent`, `--gl-color-accent-soft`, `--gl-color-text-muted`, `--gl-color-on-dark`,
`--gl-surface-dark`, `--gl-surface-elevated`, `--gl-shadow-lg`, `--gl-accent-warm`, les encres
d'état (`--gl-ink-danger`…), une échelle d'espacement `--gl-space-1..6` (il n'y en avait aucune)
et `--gl-tap-target`.

Reste **0** variable non définie, hors les 11 injectées au runtime en JS (`--gl-team-color`,
`--gl-marker-*`, `--map-overlay-scale`…), qui sont légitimes.

---

## 6. Constat E — cohérence de la palette

| Fichier         | Occurrences hex | dont palette slate/blue générique |
| --------------- | --------------- | --------------------------------- |
| `gl-theme.css`  | 502             | **140** (28 %)                    |
| `gl-admin.css`  | 150             | **61** (41 %)                     |
| **Total avant** | **652**         | **201**                           |
| **Total après** | **332**         | **2**                             |

Les teintes `#f8fafc`, `#e2e8f0`, `#cbd5e1`, `#64748b`, `#475569`, `#0f172a`, `#1d4ed8`,
`#dbeafe`, `#eff6ff`, `#bfdbfe` formaient une palette Tailwind slate/blue par défaut, greffée
sur un thème médiéval-fantastique vert sombre et parchemin — particulièrement marqué côté
**admin (41 %)**, qui rendait un « back-office générique » plutôt qu'un poste de MJ du Royaume.

### Correction appliquée

Substitution **guidée par la propriété**, et non aveugle : `#f8fafc` sert à la fois de surface
claire et de _texte clair sur fond sombre_ (barre supérieure), deux rôles opposés qu'un
remplacement global aurait confondus.

Le cas le plus structurant est la famille bleue (`#dbeafe`, `#1d4ed8`, `#eff6ff`, `#bfdbfe`,
54 occurrences). Elle encodait partout le même rôle — **sélection / état actif** (`.is-selected`,
`.is-active`, `:focus-visible`, badges du journal) — dans un bleu système étranger au produit.
Elle est devenue une famille de tokens dérivée de l'accent : `--gl-select-surface`,
`--gl-select-surface-soft`, `--gl-select-border`, `--gl-select-ink`. Même sémantique, palette du
produit.

Les 2 occurrences restantes sont la définition du token `--gl-color-on-dark` lui-même et un
repli runtime `var(--gl-team-color, #94a3b8)`.

---

## 7. Constat F — deux constats initialement surévalués

Deux chiffres de la première version de cet audit étaient faux. Ils sont corrigés ici.

### 7.1 Sélecteurs dupliqués : 1, et non 27

Le premier comptage ne suivait pas le contexte des at-rules : il comptait comme doublon toute
règle répétée dans un `@media`, c'est-à-dire **une surcharge responsive parfaitement légitime**.
Un parcours suivant la pile d'at-rules donne le vrai chiffre :

| Fichier        | Règles | Vrais doublons |
| -------------- | ------ | -------------- |
| `gl-theme.css` | 870    | **1**          |
| `gl-admin.css` | 252    | **0**          |

Le seul vrai doublon, `.gl-board-marker.is-selected`, était un conflit réel : l'`outline` de la
seconde définition gagnait, mais le halo bleu de la première (`rgba(147,197,253,.85)`, un
bleu-300 Tailwind) subsistait par-dessus. Les deux règles ont été fusionnées et alignées sur les
tokens de sélection.

### 7.2 Cibles tactiles : la règle était déjà appliquée

Le relevé « 7 cibles sous 44 px » ignorait une technique en place depuis le lot 4 de
`docs/AUDIT_GENERAL_2026-08.md` : un pseudo-élément centré étend la zone **cliquable** à
`max(100%, 44px)` sans toucher au visuel. `.gl-subtabs button`, `.gl-help-panel > header button`
et `.gl-forum-thread > header > button` en bénéficient déjà — ils sont conformes.

Ce lot-là avait aussi tranché sciemment sur les boutons **à libellé** : les élargir en hauteur
seule n'ajoute rien (ils ont déjà de la largeur) et risque de voler le clic du voisin dans une
rangée dense. `.gl-btn--sm` reste donc à 36 px : c'est une **dérogation assumée et désormais
documentée dans le CSS**, pas un oubli. Une hausse à 44 px avait été essayée puis annulée — elle
contredisait cette décision et alourdissait 57 boutons.

---

## 8. Modernité générale

**Acquis conservés :** `focus-visible` largement couvert (37 occurrences) avec `outline-offset` ;
`prefers-reduced-motion` respecté ; usage moderne de `color-mix()` (82), `dvh` (12), `clamp()` (9),
`backdrop-filter` (6) ; système de mascottes et thème de marque paramétrable.

**Ajouté dans ce lot :** `color-scheme: light` (sans quoi le mode sombre du système repeint les
contrôles natifs sur des surfaces claires), `accent-color` sur cases/radios/curseurs (ils étaient
au bleu système), ascenseurs teintés, `::selection` dans la palette, `text-wrap: balance` sur les
titres et `pretty` sur les paragraphes, et un alignement des champs de formulaire sur la famille
de formes des boutons (rayon, transitions, `:hover`, `:disabled`, `::placeholder`).

**Chantiers laissés ouverts :** aucun mode sombre ; aucune `@layer` — l'introduire changerait la
cascade de 8 400 lignes d'un coup et mérite son propre lot ; `gl-theme.css` reste un fichier
unique de ~6 600 lignes qui gagnerait à être scindé par domaine.

---

## 9. Vérification

Mesures reproduites par sonde Playwright rendant `motion.css` + `shared-controls.css` +
`gl-base.css` + `gl-theme.css` sur du markup GL réel, lecture de `getComputedStyle` sur chaque
variante de bouton, hors et dans un `.gl-form`. Chromium 1228.

Après correction, toutes les variantes rendent en **Caudex 16 px** (14 px pour `--sm`), avec le
bon fond dans les trois contextes (`.gl-form`, `.gl-inline-actions`, racine), `min-height` à
44 px et `display: inline-flex`.

`npm run lint` (0 erreur), `npm run format:check`, `npm run build`, `npm run test:ui` et
`npm test` passent.
