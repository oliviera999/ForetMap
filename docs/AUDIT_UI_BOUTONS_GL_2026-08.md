# Audit UI — boutons GL & modernité de l'interface (août 2026)

Portée : sous-produit **Gnomes & Licornes** (`src/gl/**`, `src/gl/styles/*.css`), avec
comparaison au socle ForetMap (`src/index.css`).
Méthode : analyse statique du CSS et du JSX + **mesure des styles calculés dans Chromium**
(sonde Playwright rendant `gl-base.css` + `gl-theme.css` sur du markup GL réel).

> **Aucune correction n'est appliquée par cet audit.** Les correctifs proposés sont décrits
> mais laissés à arbitrage.

---

## 1. Synthèse

L'impression d'« apparence ancienne » de certains boutons GL n'est pas subjective : elle a
**deux causes mécaniques, mesurées et reproductibles**.

| #     | Constat                                                                                                            | Gravité      |
| ----- | ------------------------------------------------------------------------------------------------------------------ | ------------ |
| **A** | Tous les boutons GL s'affichent en **Arial 13,3 px** (police par défaut du navigateur) au lieu de **Caudex 16 px** | 🔴 Critique  |
| **B** | Dans un `.gl-form`, les variantes `secondary` / `ghost` / `danger` s'affichent toutes en **primaire foncé**        | 🔴 Critique  |
| **C** | ~80 lignes de CSS bouton **mort** (`.gl-primary`, `.gl-danger`, `.gl-btn-secondary`) — plus aucun usage JSX        | 🟠 Moyen     |
| **D** | **27 variables CSS jamais définies**, dont `--gl-primary` (28 usages) : ces zones **ignorent le thème de marque**  | 🟠 Moyen     |
| **E** | Palette générique slate/blue (Tailwind) mélangée au thème médiéval : **201 occurrences**                           | 🟡 Cohérence |
| **F** | `.gl-btn--sm` = 36 px : sous la cible tactile de 44 px imposée par `CLAUDE.md` (57 usages)                         | 🟡 A11y      |

**Cause racine commune à A :** le reset de `src/gl/styles/gl-base.css` couvre
`input, select, textarea { font-family: inherit }` mais **omet `button`**. Les contrôles de
formulaire n'héritent pas de la police du `body` : les `<input>` sont rattrapés par le reset,
les `<button>` restent sur la feuille de style du navigateur.

---

## 2. Constat A — les boutons ne portent pas la police de l'application

### Mesure (Chromium, styles calculés)

| Élément                        | `font-family` | `font-size`  |
| ------------------------------ | ------------- | ------------ |
| `.gl-btn.gl-btn--primary`      | **Arial**     | **13,33 px** |
| `.gl-btn.gl-btn--secondary`    | **Arial**     | **13,33 px** |
| `.gl-btn.gl-btn--ghost`        | **Arial**     | **13,33 px** |
| `<input>`                      | Caudex        | 16 px        |
| Texte courant                  | Caudex        | 16 px        |
| `.gl-primary` _(classe morte)_ | Caudex        | 16 px        |

Sur **84 règles CSS ciblant des boutons** dans `gl-theme.css` + `gl-admin.css`,
**une seule** fixe la police (`.gl-market-trades-list li > button { font: inherit }`).

Un libellé Arial 13 px sur une application entièrement composée en Caudex serif 16 px :
c'est exactement la signature visuelle « bouton d'un autre âge ».

### Régression par rapport à ForetMap

`.gl-btn` est une version appauvrie du `.btn` ForetMap, qui lui est correct :

| Propriété                         | `.btn` (ForetMap)  | `.gl-btn` (GL) |
| --------------------------------- | ------------------ | -------------- |
| `font-family`                     | `var(--font-sans)` | ❌ absent      |
| `font-size`                       | `1rem`             | ❌ absent      |
| `display`                         | `inline-flex`      | ❌ absent      |
| `align-items` / `justify-content` | `center`           | ❌ absent      |
| `gap`                             | `8px`              | ❌ absent      |
| `user-select`                     | `none`             | ❌ absent      |
| `-webkit-tap-highlight-color`     | `transparent`      | ❌ absent      |

Conséquences de l'absence de `display:inline-flex` : le `gap` est inopérant sur les
**15 boutons icône + libellé** de GL, et dans un parent flex/grid le bouton est _blockifié_
(`display: block` mesuré dans `.gl-form`), ce qui casse l'alignement.

### Correctif proposé

Une ligne dans le reset `gl-base.css` traite la police pour **tous** les boutons GL,
y compris ceux stylés par sélecteur descendant :

```css
/* src/gl/styles/gl-base.css */
input,
select,
textarea,
button {
  /* ← `button` ajouté */
  font-size: 0.95rem;
  font-family: inherit;
}
```

Puis aligner `.gl-btn` sur `.btn` dans `gl-theme.css` :

```css
.gl-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 1rem;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
```

---

## 3. Constat B — les variantes de bouton sont écrasées dans les formulaires

### Diagnostic

`gl-theme.css:863` regroupe trois sélecteurs dans une même règle :

```css
.gl-btn,
.gl-form button,          /* ← spécificité (0,1,1) */
.gl-inline-actions button {
  background: var(--gl-color-primary);
  color: #fff;
}
```

`.gl-form button` vaut **(0,1,1)** ; `.gl-btn--secondary` ne vaut que **(0,1,0)**.
Le sélecteur descendant l'emporte donc sur la variante.

### Mesure (mêmes boutons, hors puis dans `.gl-form`)

| Variante      | Hors `.gl-form`      | Dans `.gl-form`       |
| ------------- | -------------------- | --------------------- |
| `--primary`   | `rgb(1,58,64)` ✔     | `rgb(1,58,64)` ✔      |
| `--secondary` | `rgb(255,255,255)` ✔ | **`rgb(1,58,64)`** ❌ |
| `--ghost`     | quasi-blanc ✔        | **`rgb(1,58,64)`** ❌ |
| `--danger`    | `rgb(255,226,226)` ✔ | **`rgb(1,58,64)`** ❌ |

**Impact.** `.gl-form` est utilisé dans ~30 écrans. Dans chacun, « Annuler » est visuellement
identique à « Valider » (perte totale de hiérarchie d'action), et surtout **« Supprimer » perd
son rouge** — un bouton destructeur déguisé en bouton de confirmation. C'est un problème
d'ergonomie et de sécurité d'usage, pas seulement d'esthétique.

Le cas `.gl-inline-actions` a **déjà été rattrapé** par des surcharges dédiées
(`gl-theme.css:996-1018`) ; `.gl-form` ne l'a jamais été.

### Correctif proposé

Retirer `.gl-form button` / `.gl-inline-actions button` de la règle de base et laisser
`.gl-btn` porter seul le style, ou — moins invasif — remonter la spécificité des variantes :

```css
.gl-btn.gl-btn--secondary {
  background: #fff;
  color: var(--gl-color-primary);
}
.gl-btn.gl-btn--ghost {
  background: color-mix(in srgb, #fff 75%, var(--gl-color-secondary) 25%);
}
.gl-btn.gl-btn--danger {
  background: var(--gl-accent-danger);
  color: #991b1b;
}
```

---

## 4. Constat C — CSS bouton mort

`.gl-primary`, `.gl-danger`, `.gl-btn-secondary`, `.gl-btn-danger` : **0 usage** dans
`src/gl/**/*.jsx`. Environ **80 lignes** de `gl-theme.css` (l. 945-1020) sont inatteignables.

Ironie du diagnostic : ces classes mortes sont les **seules** à déclarer correctement
`font-family`, `font-size` et `display:inline-flex`. La migration vers le composant `GLButton`
a laissé derrière elle le CSS le mieux écrit et promu celui qui l'était le moins.

Ces règles restent référencées par des sélecteurs de focus (`gl-theme.css:901`) et par
`gl-admin.css` (`.gl-kingdom-map-zones > li > button.gl-danger`) : **vérifier ces deux points
avant suppression**.

---

## 5. Constat D — 27 variables CSS jamais définies

Aucune n'est déclarée dans `gl-base.css` / `gl-theme.css` / `gl-admin.css` / `src/shared/styles/`,
ni injectée en JS par le thème de marque.

| Variable                        | Usages | Effet                                                                     |
| ------------------------------- | ------ | ------------------------------------------------------------------------- |
| `--gl-primary`                  | 28     | ⚠️ Retombe sur `#047c8c` en dur → **le thème de marque du MJ est ignoré** |
| `--gl-color-accent`             | 20     | Retombe sur `#52b788` (vert ForetMap, hors palette GL)                    |
| `--gl-color-border`             | 7      | Retombe sur `#e2e8f0` (gris slate générique)                              |
| `--gl-color-surface` / `-muted` | 5      | Retombe sur `#fff` / `#f8fafc`                                            |
| `--gl-color-text-muted`         | 2      | Aucun équivalent défini                                                   |
| `--gl-accent-warm`              | 2      | 🔴 **Sans fallback** → déclaration invalide, silencieusement ignorée      |
| 21 autres                       | 1-4    | Retombent sur des valeurs en dur                                          |

Il s'agit presque toujours d'une **faute de nommage** : les variables réellement définies sont
`--gl-color-primary`, `--gl-border`, `--gl-surface`, `--gl-surface-muted`. Les fallbacks masquent
le bug — l'interface _paraît_ fonctionner, mais des pans entiers (carnet Selene, panneaux admin,
vue plateau, aperçu feuillets) s'affichent en **turquoise `#047c8c` figé**, insensibles aux
couleurs de marque choisies par le MJ.

`--gl-accent-warm` est le seul cas de casse dure : sans fallback, `color-mix()` devient invalide
et la propriété `background` est abandonnée (`gl-theme.css:1853` et `1865`).

---

## 6. Constat E — cohérence de la palette

| Fichier        | Occurrences hex | dont palette slate/blue générique |
| -------------- | --------------- | --------------------------------- |
| `gl-theme.css` | 502             | **140** (28 %)                    |
| `gl-admin.css` | 150             | **61** (41 %)                     |
| **Total**      | **652**         | **201**                           |

Les teintes `#f8fafc`, `#e2e8f0`, `#cbd5e1`, `#64748b`, `#475569`, `#0f172a`, `#1d4ed8`,
`#dbeafe`, `#eff6ff`, `#bfdbfe` forment une palette Tailwind slate/blue par défaut, greffée sur
un thème médiéval-fantastique vert sombre et parchemin. C'est particulièrement marqué côté
**admin (41 %)**, qui donne un rendu « back-office générique » plutôt que « MJ du Royaume ».

À cela s'ajoute l'absence de **tokens d'espacement** (`--gl-space-*` : 0 défini) — les marges et
paddings sont en px littéraux sur les 8 416 lignes de CSS GL.

---

## 7. Constat F — accessibilité & modernité générale

**Cibles tactiles sous 44 px** (convention `CLAUDE.md`) :

| Sélecteur                                           | Hauteur |
| --------------------------------------------------- | ------- |
| `.gl-btn--sm` _(57 usages)_                         | 36 px   |
| `.gl-help-panel > header button`                    | 36 px   |
| `.gl-mascots-filters button`                        | 36 px   |
| `.gl-forum-thread > header > button`                | 38 px   |
| `.gl-marker-question-list__header > button`         | 38 px   |
| `.gl-subtabs button`, `.gl-mascot-card-body button` | 40 px   |

**Composant `GLButton`** (`src/gl/components/ui/GLButton.jsx`) :

- l'état `loading` **remplace** le libellé par « Chargement… » : le contexte de l'action est
  perdu, et un lecteur d'écran n'annonce pas le changement (ni `aria-busy`, ni `aria-live`) ;
- pas de support d'icône de première classe (`iconLeft` / `iconRight`) — d'où les emojis
  inline dans le libellé ;
- 6 `aria-label` seulement sur l'ensemble des `GLButton`, dont plusieurs boutons icône-seule.

**Points positifs à conserver :**

- `focus-visible` largement couvert (37 occurrences) avec `outline-offset` ;
- `prefers-reduced-motion` respecté (6 blocs dans `gl-theme.css` + 3 dans `motion.css`) ;
- usage moderne de `color-mix()` (82), `dvh` (12), `clamp()` (9), `backdrop-filter` (6) ;
- système de mascottes, thème de marque paramétrable, transitions travaillées.

**Absences notables :** aucun mode sombre (`prefers-color-scheme` : 0 occurrence sur tout GL et
`src/shared/styles/`), aucune `@container` query, aucun `@layer` — d'où les guerres de
spécificité décrites en §3. `gl-theme.css` fait **6 514 lignes** en un seul fichier, avec
**27 sélecteurs dupliqués** (dont `.gl-forum-thread > header > button` défini deux fois, l. 2762
et 6499).

---

## 8. Priorisation proposée

| Priorité | Action                                                                 | Effort     |
| -------- | ---------------------------------------------------------------------- | ---------- |
| **P1**   | Ajouter `button` au reset `gl-base.css` (§2)                           | 1 ligne    |
| **P1**   | Corriger la spécificité des variantes dans `.gl-form` (§3)             | ~6 lignes  |
| **P2**   | Aligner `.gl-btn` sur `.btn` : `inline-flex`, `gap`, `font-size` (§2)  | ~8 lignes  |
| **P2**   | Renommer les 27 variables fantômes vers les tokens réels (§5)          | mécanique  |
| **P2**   | Ajouter le fallback manquant de `--gl-accent-warm` (§5)                | 2 lignes   |
| **P3**   | Supprimer le CSS bouton mort après vérification des références (§4)    | ~80 lignes |
| **P3**   | `.gl-btn--sm` 36 → 44 px, ou dérogation assumée et documentée (§7)     | 1 ligne    |
| **P4**   | Rapatrier la palette slate/blue vers les tokens de marque (§6)         | chantier   |
| **P4**   | Introduire `@layer` + tokens d'espacement, scinder `gl-theme.css` (§7) | chantier   |

Les deux P1 sont **7 lignes de CSS au total** et corrigent à elles seules l'intégralité du
symptôme « boutons d'apparence ancienne », sur tous les écrans GL simultanément.

---

## 9. Vérification

Reproduction des mesures : sonde Playwright rendant `motion.css` + `gl-base.css` +
`gl-theme.css` sur du markup GL réel, lecture de `getComputedStyle` sur chaque variante de
bouton, hors et dans un `.gl-form`. Chromium 1228, viewport 720×330.
Aucun fichier du dépôt n'a été modifié pour produire cet audit.
