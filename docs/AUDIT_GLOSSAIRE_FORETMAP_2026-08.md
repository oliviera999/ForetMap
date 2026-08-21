# Audit — Glossaire ForetMap : hyperliens de termes et « popover » de définition

> Portée : produit **ForetMap** (le glossaire GL n'est examiné que comme référence de
> comparaison, et pour un bug jumeau constaté au passage — constat **A6**).
> Cet audit suit la chaîne complète « un terme du glossaire cité dans un contenu » — de la
> table `glossary_terms` jusqu'au clic de l'élève — et confronte le **code**, l'**écran**,
> la **documentation de référence** et les **tests**.
> Rédigé le 2026-08-21, sur `claude/foretmap-glossaire-popover-audit-u9eudz` @ `ecbc8fc`
> (v1.101.0).
>
> Fichiers lus : `lib/foretmapGlossaryAutolink.js`, `lib/tutorialRouteHelpers.js`,
> `lib/inlineLegacyTutorialHtml.js`, `lib/glossarySearch.js`, `routes/tutorials.js`,
> `routes/glossary.js`, `routes/quiz.js`, `routes/plants.js`, `routes/food-web.js`,
> `server.js`, `src/App.jsx`, `src/components/TutorialPreviewModal.jsx`,
> `src/components/app/PedagoTabs.jsx`, `src/components/pedago/GlossaryView.jsx`,
> `src/components/pedago/QuizView.jsx`, `src/components/pedago/FoodWebView.jsx`,
> `src/components/biodiv/PlantSummaryBlocks.jsx`, `src/components/MarkdownContent.jsx`,
> `src/utils/markdown.js`, `src/utils/glTermAutolink.js`, `src/utils/glGlossaryAutolink.js`,
> `src/gl/components/GLGlossaryPopover.jsx`, `src/gl/components/GLGlossaryMarkdown.jsx`,
> `sql/schema_foretmap.sql`, `sql/biodiv_pedago_seed.sql`, `migrations/126_glossary.sql`,
> `tutos/*.html`, `docs/reference/foretmap/pedagogie-quiz-glossaire-reseau.md`,
> `tests/`, `tests-ui/`, `e2e/pedago-glossary.spec.js`.
>
> Les mesures chiffrées de **A3** et **A4** sont reproductibles : voir §5.

Légende gravité : 🔴 à traiter en priorité · 🟠 gênant au quotidien · 🟡 nettoyage /
clarification.

---

## 0. Verdict en une page

**Le popover n'existe pas dans ForetMap.** Ce n'est pas une panne : il n'a jamais été écrit.
Ce que le code appelle « ouvrir un terme » est un **changement d'onglet** vers le Glossaire
(`src/App.jsx:794`). Dans un tutoriel, cet onglet est `tuto` : basculer sur `glossary`
**démonte la vue Tutoriels**, donc **ferme la modale de lecture** et perd la position dans le
document. De l'extérieur, cela ressemble exactement à « le popover ne fonctionne pas sur les
tutos » — c'est en réalité « le clic fait sauter l'élève hors de son tutoriel ». La
documentation de référence décrit d'ailleurs le comportement actuel sans jamais promettre de
popover : « les termes s'ouvrent en fiche depuis les autres écrans quand ils y sont cités »
(`docs/reference/foretmap/pedagogie-quiz-glossaire-reseau.md:27`).

Le contraste avec GL est frappant : GL a un vrai popover (`GLGlossaryPopover`, 349 lignes,
avec cache, a11y, termes liés, acquittement « appris », import journal), un composant de
rendu dédié (`GLGlossaryMarkdown`), un index d'auto-liens côté client
(`useGlGlossaryLinkIndex`) et une fabrique mutualisée (`src/utils/glTermAutolink.js`).
ForetMap a **121 lignes** de fork serveur, appliquées **à un seul écran** (les tutoriels HTML
en base), **sans un seul test**.

Et ce fork est cassé sur trois points, dont deux visibles en classe :

1. **Le filtre « ne pas lier ici » (`SKIP_TAGS`) est inopérant** — la ligne qui devait
   protéger `<style>`, `<script>`, `<a>` et `<code>` renvoie la même valeur dans les deux
   branches du ternaire. Résultat mesuré sur les 10 fiches de `tutos/` : **26 balises `<a>`
   injectées à l'intérieur de blocs `<style>`**, sur 6 fiches sur 10. C'est du CSS corrompu,
   servi à l'élève.
2. **Les tutoriels servis en fichier statique n'ont ni lien ni script.** `/tutos/*.html` passe
   par `express.static` (`server.js:285`) : aucun enrichissement. Seul `/api/tutorials/:id/view`
   enrichit — et la modale n'y passe que si `type === 'html'`.
3. **Le coût est réel** : 108 ms de CPU **bloquant** par affichage de tutoriel à chaud,
   657 ms à froid, sans aucun cache de sortie. Une classe de 30 élèves qui ouvre un tuto en
   même temps fait la queue derrière un seul thread Node.

Classement : **3 points rouges** (A1, A2, A3), **3 orange** (A4, A5, A6), **6 jaunes**
(A7 → A12). Aucun n'est un risque de sécurité majeur ; A3 dégrade visiblement le rendu des
tutoriels **aujourd'hui, en production**.

---

## 1. La chaîne actuelle, de bout en bout

### 1.1 Les données

`glossary_terms` (migration `126_glossary.sql`) : `glossary_code` (PK), `terme`, `variantes`
(séparateurs `,` `;` `|` retour ligne), `categorie`, `niveau`, `definition_courte`,
`definition_longue`, `exemple`, `etymologie`, `statut`. Le jeu versionné
(`sql/biodiv_pedago_seed.sql`) contient **175 termes**, soit **318 libellés** une fois les
variantes éclatées.

Tables de liaison : `glossary_term_species`, `glossary_term_tutorials`,
`glossary_term_interactions`, `glossary_term_relations`, `quiz_question_glossary`.

### 1.2 Les deux mécanismes distincts (à ne pas confondre)

| Mécanisme               | Où                                                         | Comment le terme est repéré                        | Ce que fait le clic                 |
| ----------------------- | ---------------------------------------------------------- | -------------------------------------------------- | ----------------------------------- |
| **Puces (« chips »)**   | Fiche plante, Quiz, Réseau trophique, fiche du Glossaire   | Liaison **explicite** en base (tables de liaison)  | `onOpenGlossaryTerm(code)` → onglet |
| **Auto-liens (inline)** | **Uniquement** les tutoriels HTML servis par `/…/:id/view` | Détection **automatique** du libellé dans le texte | `postMessage` → écouteur → onglet   |

Les deux aboutissent au même endroit : `openPedagoGlossaryTerm` (`src/App.jsx:794`), qui fait
`setPedagoGlossaryCode(c)` **puis `setTab('glossary')`**.

### 1.3 Le chemin des auto-liens de tutoriel, pas à pas

```
GET /api/tutorials/:id/view                                  routes/tutorials.js:959
  └─ loadTutorialHtml(tutorial)                              routes/tutorials.js:269
       html_content ? on l'utilise
       sinon source_file_path ? lecture disque sous /tutos/
  └─ enrichTutorialHtmlWithGlossary(html)                     routes/tutorials.js:54
       ├─ loadGlossaryAutolinkEntries()   cache mémoire 5 min, SELECT statut='actif'
       ├─ autolinkHtmlTextNodes()          lib/foretmapGlossaryAutolink.js:87
       │    → <a href="#" class="fm-glossary-inline-link" data-glossary-code="FM0001">…</a>
       ├─ injectTutorialViewIframeLinkScript()   lib/tutorialRouteHelpers.js:173
       └─ injectGlossaryAutolinkScript()         lib/foretmapGlossaryAutolink.js:99
            → écoute le clic dans l'iframe, parent.postMessage({type:'foretmap:glossary'}, '*')

<iframe src="/api/tutorials/:id/view"                        TutorialPreviewModal.jsx:75
        sandbox="allow-same-origin allow-scripts allow-popups allow-forms">

window.addEventListener('message', …)                        src/App.jsx:827
  └─ openPedagoGlossaryTerm(code)                            src/App.jsx:794
       setPedagoGlossaryCode(code)  +  setTab('glossary')
          → App.jsx:1428  `tab === 'tuto'` devient faux
          → <TutorialsViewLazy> démonté → l'état `preview` disparaît → modale fermée
          → GlossaryView monte, charge /api/glossary/terms/:code, affiche la fiche
```

Le mécanisme technique **fonctionne** : le `postMessage` part, l'écouteur le reçoit, la fiche
s'affiche. C'est le **résultat** qui n'est pas celui qu'on attend d'un popover.

---

## 2. Constats

### A1 — 🔴 Il n'y a pas de popover dans ForetMap ; le clic éjecte l'élève de son tutoriel

**Constat.** `openPedagoGlossaryTerm` (`src/App.jsx:794-802`) ne fait que trois choses :
mémoriser le code, forcer `setTab('glossary')`, fermer l'aperçu catalogue. Aucun composant de
type popover n'existe côté ForetMap — recherche exhaustive : `Popover` n'apparaît dans
**aucun** fichier de `src/` hors `src/gl/`.

Conséquence dans un tutoriel : la vue Tutoriels est conditionnée par `tab === 'tuto'`
(`src/App.jsx:1428`). Le passage à `glossary` la démonte ; `preview` est un état **local** de
`TutorialsView` (`src/components/tutorials-views.jsx:376`), il est détruit avec elle. L'élève
qui clique sur « écosystème » au milieu d'une fiche perd la fiche, sa position de lecture, et
doit rouvrir le tutoriel et refaire défiler. Même effet depuis la carte
(`src/components/map-views.jsx:467`) et depuis la visite
(`src/components/visit-views.jsx:948`).

**Ce n'est donc pas une panne du popover : c'est l'absence de popover.** La demande initiale
(« le popover ne fonctionne pas sur les tutos ») décrit exactement ce symptôme.

**Référence GL, pour mesurer l'écart.** `GLGlossaryPopover.jsx` : portail React, `useDialogA11y`
(focus trap + Échap), animation de fermeture respectant `prefers-reduced-motion`, cache des
définitions (`detailCache`), accent de couleur par catégorie, navigation entre termes liés
**dans le popover**, bouton « appris », import journal, lien « voir tout le glossaire » — le
tout **sans quitter l'écran courant**.

---

### A2 — 🔴 Les tutoriels servis en fichier statique n'ont ni auto-liens ni script

**Constat.** Deux chemins mènent au contenu d'un tutoriel, et **un seul** enrichit :

| `type`                   | `preview_url` calculé (`TutorialPreviewModal.jsx:11-22`) | Auto-liens ? |
| ------------------------ | -------------------------------------------------------- | ------------ |
| `html`                   | `/api/tutorials/:id/view`                                | **oui**      |
| `link`                   | `source_url` (site externe)                              | non (normal) |
| autre (`pdf`, `file`, …) | `source_file_path` s'il existe, **sinon** `/…/view`      | **non**      |

Or `/tutos` est monté en statique (`server.js:285`) : un `source_file_path` du type
`/tutos/fiche-sol-punk.html` est servi **brut**, sans enrichissement et sans le script de
`postMessage`. Le `type` est une simple `VARCHAR(16)` sans contrainte
(`sql/schema_foretmap.sql:214`) : rien n'empêche un tutoriel HTML fichier d'être typé
autrement que `html`.

`inlineLegacyTutorialHtmlToDb` (`lib/inlineLegacyTutorialHtml.js`) rapatrie bien les
tutoriels legacy en base — mais **uniquement ceux de `type = 'html'`**. Tout ce qui a échappé
à ce filtre reste sur le chemin statique, donc sans glossaire.

**À vérifier en production** (non vérifiable ici, pas d'accès BDD) :

```sql
SELECT id, title, type,
       (html_content IS NOT NULL AND CHAR_LENGTH(TRIM(html_content)) > 0) AS a_du_html,
       source_file_path
  FROM tutorials
 WHERE is_active = 1
   AND type <> 'link'
   AND source_file_path IS NOT NULL
   AND TRIM(source_file_path) <> '';
```

Toute ligne retournée est un tutoriel **sans glossaire**, quel que soit l'état de A1.

---

### A3 — 🔴 Le filtre `SKIP_TAGS` est inopérant : le CSS et le JS des tutoriels sont pollués

**Constat.** `lib/foretmapGlossaryAutolink.js:87-97` :

```js
return String(html).replace(/(<[^>]+>)|([^<]+)/g, (token, tag, text) => {
  if (tag) {
    const tagName = (tag.match(/^<\/?\s*([a-z0-9]+)/i) || [])[1]?.toLowerCase();
    return SKIP_TAGS.has(tagName) ? token : tag; // ← token === tag : les deux branches
  } //   sont identiques, rien n'est ignoré
  if (!text) return '';
  return autolinkPlainText(text, entries); // ← appelé pour TOUS les nœuds texte
});
```

Aucun état n'est tenu entre les jetons : la fonction ne sait jamais qu'elle est « à
l'intérieur » d'un `<style>`. `SKIP_TAGS` est du code mort. Tout le contenu textuel du
document est lié, y compris celui de `<style>`, `<script>`, `<a>` et `<code>`.

**Reproduction (5 lignes) :**

```js
const {
  buildGlossaryLinkEntries,
  autolinkHtmlTextNodes,
} = require('./lib/foretmapGlossaryAutolink');
const e = buildGlossaryLinkEntries([{ glossary_code: 'SOL', terme: 'sol' }]);
console.log(autolinkHtmlTextNodes('<style>.sol{color:red}</style>', e));
// <style>.<a href="#" class="fm-glossary-inline-link" data-glossary-code="SOL">sol</a>{color:red}</style>
```

**Impact réel, mesuré sur les 10 fiches de `tutos/` avec les 175 termes du seed versionné :**

| Fiche                        | liens totaux | dont dans `<style>` |
| ---------------------------- | ------------ | ------------------- |
| `fiche-rempotage-punk.html`  | 69           | **13**              |
| `fiche-arrosage-punk.html`   | 68           | **7**               |
| `fiche-desherbage-punk.html` | 99           | **3**               |
| `fiche-jardin-punk-n3.html`  | 90           | **1**               |
| `fiche-semences-punk.html`   | 54           | **1**               |
| `fiche-sol-vivant-punk.html` | 108          | **1**               |
| 4 autres fiches              | 39 → 106     | 0                   |

Les 10 fiches ont **toutes** un `<style>` en ligne, 7 ont aussi un `<script>`. Une règle CSS
dont le sélecteur ou la valeur contient un libellé de glossaire (`.sol`, `.compost`,
`--mousse`…) est **cassée**, et le parseur CSS abandonne la règle : mise en page dégradée pour
l'élève. Le même mécanisme peut casser un `<script>` en ligne (aucune occurrence dans le
corpus actuel, mais rien ne l'empêche — un `var sol = …` suffit).

**Le correctif existe déjà dans le dépôt.** `src/utils/glTermAutolink.js:139-164` implémente
la même fonction **avec** une machine à états `skipDepth` qui fonctionne. Voir A5.

---

### A4 — 🟠 108 ms de CPU bloquant par affichage de tutoriel, sans cache de sortie

**Constat.** `autolinkPlainText` compile **un `RegExp` neuf par libellé et par nœud texte**
(`lib/foretmapGlossaryAutolink.js:47`). Avec 318 libellés et quelques centaines de nœuds
texte, on atteint plusieurs dizaines de milliers de compilations de regex par requête.

Mesures sur `tutos/fiche-jardin-punk-n3.html` (32,6 ko), 175 termes du seed :

| Situation                    | Durée par requête |
| ---------------------------- | ----------------- |
| Premier appel (à froid, JIT) | **657 ms**        |
| Moyenne sur 10 appels chauds | **108 ms**        |

Sur `fiche-sol-vivant-punk.html` (20,9 ko) : ~165 ms par appel.

Le cache de 5 minutes (`routes/tutorials.js:38-52`) ne met en cache que **l'index des termes**,
pas le HTML enrichi : le calcul est refait **à chaque ouverture, par chaque élève**. Node est
mono-thread : 30 élèves qui ouvrent un tutoriel dans la même minute sérialisent ~3 s de CPU
pendant lesquelles **toutes** les autres requêtes de l'application attendent.

**Pistes.** (a) une seule regex alternée par index plutôt qu'une par libellé ; (b) précompiler
les regex dans `buildGlossaryLinkEntries` au lieu de les recréer à chaque nœud ; (c) mettre en
cache le HTML enrichi par `(tutorial.id, updated_at, version de l'index)`. (a) + (b) sont
locales et sans effet de bord ; (c) supprime le problème.

---

### A5 — 🟠 `lib/foretmapGlossaryAutolink.js` est un fork dégradé de `src/utils/glTermAutolink.js`

**Constat.** Les deux fichiers partagent, **à l'identique**, `escapeRegex`, `splitLabels`,
`buildLabelRegex`, `buildEntries` / `buildGlossaryLinkEntries`, `autolinkPlainText` et la
constante `SKIP_TAGS`. Seuls diffèrent le format de module (CJS vs ESM), la classe CSS
(`fm-` vs `gl-`), l'attribut `data-` — et `autolinkHtmlTextNodes`, **où la version ForetMap a
perdu la machine à états**.

`src/utils/glTermAutolink.js` a justement été écrit comme _fabrique paramétrable_
(`createTermAutolink({ codeField, cssClass, dataAttr })`) pour éviter cette duplication — le
CHANGELOG le dit explicitement (« mutualisant le tronc commun byte-identique des autolinks de
glossaire »). ForetMap ne s'y est pas branché : la copie a divergé en silence, et la
divergence est précisément le bug A3.

**Recommandation.** Extraire le tronc dans `lib/shared/` (CJS, consommable par le serveur
**et** par le front via un miroir, comme `lib/visit-pack/` et `lib/gl-pack/` déjà en place —
cf. `sync:*-pack-lib`), et faire de ForetMap et GL deux paramétrages du même code. Un seul
correctif, deux produits couverts.

---

### A6 — 🟠 Bug jumeau côté GL : une image coupe tous les auto-liens qui suivent

**Constat** (hors périmètre ForetMap strict, mais découvert en comparant les deux
implémentations, et **actif en production GL**). `src/utils/glTermAutolink.js:159` :

```js
const open = /^<(\w+)/i.exec(token);
if (open && SKIP_TAGS.has(open[1].toLowerCase()) && !/\/>$/.test(token.trim())) {
  skipDepth += 1; // ← <img …> est dans SKIP_TAGS mais n'a pas de balise fermante
}
```

`img` est un élément **vide** : il n'a jamais de `</img>` pour décrémenter `skipDepth`. Si la
balise n'est pas auto-fermée (`<img …>` et non `<img … />`), `skipDepth` reste ≥ 1 **jusqu'à
la fin du document** et plus rien n'est lié. Or DOMPurify sérialise en HTML5 : il **retire**
la barre oblique.

**Reproduction de bout en bout** (`renderGlMarkdownWithGlossaryLinks`, terme « sol ») :

```
<p>Le <a … data-gl-glossary-code="SOL">sol</a> est vivant.</p>
<p><figure class="gl-content-image-wrap"><img src="…" …></figure></p>
<p>Encore le sol apres l'image.</p>     ← plus aucun lien
```

Tout contenu GL en markdown (chapitres, lore, feuillets, pages éditoriales, fiches espèces)
qui comporte **une image** perd ses hyperliens de glossaire pour tout ce qui suit. Correctif :
traiter les éléments vides (`img`, `br`, `hr`, `input`, `source`, `track`…) sans toucher à
`skipDepth`.

---

### A7 — 🟡 Aucun test ne couvre le module ForetMap

**Constat.** `tests/gl-glossary-autolink.test.js` teste la version **GL** — y compris,
ironiquement, le cas « ignore le contenu déjà dans un lien » qui est cassé côté ForetMap.
Recherche exhaustive : `foretmapGlossaryAutolink` n'apparaît dans **aucun** fichier de
`tests/`, `tests-ui/` ou `e2e/`. `tests/tutorials.test.js` ne mentionne jamais le glossaire.
`e2e/pedago-glossary.spec.js` ne couvre que la recherche et la fiche dans l'onglet Glossaire —
jamais un clic sur un terme depuis un contenu.

C'est ce qui explique que A3 ait pu passer inaperçu : `SKIP_TAGS` **a l'air** correct à la
lecture rapide, et rien ne l'exécute.

**Attendu (règle projet, `CLAUDE.md`)** : « toute nouvelle route/règle/utilitaire →
`tests/*.test.js` ; flux UI critique → scénario `e2e/` ».

---

### A8 — 🟡 Aucun style : les termes liés ne se distinguent pas dans les tutoriels

**Constat.** `fm-glossary-inline-link` n'est défini dans **aucune** feuille de style du dépôt.
Côté GL, `src/gl/styles/gl-theme.css:1106-1120` style explicitement
`a.gl-glossary-inline-link` (couleur, soulignement pointillé, survol).

Dans l'iframe, les auto-liens héritent donc du style `a` **de la fiche elle-même** — c'est-à-dire
de dix chartes graphiques différentes, souvent sans style de lien du tout. L'élève ne voit pas
qu'un mot est cliquable, et rien ne distingue un terme de glossaire d'un lien hypertexte
ordinaire du tutoriel. Le style doit être **injecté dans l'iframe** (comme le script),
puisqu'aucune CSS de l'application n'y pénètre.

---

### A9 — 🟡 L'index d'auto-liens reste périmé jusqu'à 5 minutes après une édition

**Constat.** `glossaryAutolinkCache` (`routes/tutorials.js:38-52`) a un TTL fixe de 5 minutes
et **aucune invalidation** sur écriture. Un professeur qui ajoute un terme, corrige une
variante ou passe un terme en `statut = 'inactif'` ne voit son changement dans les tutoriels
qu'après expiration — sans indication à l'écran. En classe, cela ressemble à « ça n'a pas
marché », et invite à refaire la manipulation.

Le cache est par ailleurs un module global : en cluster (plusieurs processus), chaque worker a
le sien, avec des expirations désynchronisées.

---

### A10 — 🟡 Détails de robustesse et d'innocuité

Regroupés ici parce qu'aucun n'est exploitable seul, mais tous mériteraient d'être traités
avec A3/A5 :

- **`data-glossary-code` n'est pas échappé** (`lib/foretmapGlossaryAutolink.js:78`). Un
  `glossary_code` contenant `"` casse l'attribut. Saisi par un professeur authentifié
  (surface faible), mais gratuit à corriger.
- **La tokenisation `<[^>]+>` ne connaît pas les guillemets.** Un attribut contenant un `>`
  littéral (`alt="a > b"`), ou un commentaire HTML contenant un `>`, décale le découpage et
  peut injecter un lien au milieu d'une balise. Le HTML des tutoriels est **écrit à la main**,
  donc non normalisé — le risque est réel, contrairement au HTML sanitizé de GL.
- **`postMessage(…, '*')`** (`lib/foretmapGlossaryAutolink.js:108`) : la cible devrait être
  l'origine de l'application.
- **L'écouteur ne vérifie pas `event.origin`** (`src/App.jsx:827-832`). Un tutoriel de
  `type = 'link'` pointant vers un site tiers est affiché dans une iframe de la même page : ce
  site peut émettre `{type:'foretmap:glossary'}` et forcer la navigation de l'élève vers
  l'onglet Glossaire. Nuisance, pas fuite de données — mais le contrôle d'origine coûte une
  ligne.
- **Les libellés contenant une apostrophe ne matcheront pas** si le HTML source utilise
  `&#39;` ou `&rsquo;` : la détection travaille sur le texte **encodé**, sans normalisation
  des entités ni des apostrophes typographiques.

---

### A11 — 🟡 Les auto-liens s'arrêtent aux tutoriels ; partout ailleurs, seules les puces

**Constat.** Hors tutoriels, un terme cité dans un texte ForetMap n'est **jamais** détecté.
Seules les liaisons saisies à la main en base produisent des puces cliquables :

| Écran                                 | Contenu textuel                                          | Auto-liens | Puces |
| ------------------------------------- | -------------------------------------------------------- | ---------- | ----- |
| Tutoriel HTML (`/…/:id/view`)         | corps de la fiche                                        | oui        | —     |
| Fiche du Glossaire                    | `definition_longue`, `exemple`, `etymologie` (Markdown)  | **non**    | oui   |
| Fiche plante / catalogue biodiversité | description, rôle, utilité (Markdown)                    | **non**    | oui   |
| Quiz élève                            | énoncé, choix, feedback (texte brut, `QuizView.jsx:309`) | **non**    | oui   |
| Réseau trophique                      | description d'interaction                                | **non**    | oui   |
| Tâches, zones, forum, visite          | descriptions Markdown                                    | **non**    | non   |

Côté GL, **tous** ces contenus sont auto-liés (CHANGELOG : « histoire, biotope, biocénose,
sortilèges, pages éditoriales, tutoriels » + énoncés, choix et feedback de QCM). L'écart de
couverture entre les deux produits est très large, alors que le corpus ForetMap (175 termes
scientifiques) s'y prête au moins autant.

À noter : la fiche du Glossaire elle-même n'auto-lie pas ses définitions — un élève lisant
« biocénose » dans la définition d'« écosystème » n'a aucun moyen d'y rebondir, sauf si la
relation a été saisie à la main dans `glossary_term_relations`.

---

### A12 — 🟡 Le sanitizer bloquerait toute extension au Markdown ForetMap

**Constat.** `src/utils/markdown.js:51` :

```js
const ALLOWED_ATTR_WITH_GLOSSARY = [...ALLOWED_ATTR, 'class', 'data-gl-glossary-code'];
```

Seul l'attribut **GL** est autorisé, et l'option `allowGlossaryLinks` n'est jamais passée par
`MarkdownContent` (`src/components/MarkdownContent.jsx:10`, appel sans options). Toute
tentative d'auto-lier du Markdown ForetMap avec `data-glossary-code` verrait l'attribut
**supprimé par DOMPurify** — le lien resterait, muet.

C'est un prérequis technique à traiter **avant** A11, pas un bug en soi.

---

### Hors périmètre, signalé au passage

`/api/tutorials/:id/view` est **accessible sans authentification** : `authenticate`
(`middleware/requireTeacher.js:138-153`) pose `req.auth = null` et laisse passer, et le
gestionnaire ne vérifie rien (`routes/tutorials.js:959`). Le contenu intégral de tout tutoriel
actif est lisible par un anonyme qui devine un identifiant numérique. Sans rapport avec le
glossaire, mais constaté sur le même chemin de code — à arbitrer séparément (le module Visite
publique rend peut-être ce choix volontaire).

---

## 3. Réponse directe : pourquoi « le popover ne fonctionne pas sur les tutos »

Trois causes se superposent, dans cet ordre d'importance :

1. **Il n'y a pas de popover** (A1). Le clic bascule d'onglet et ferme le tutoriel. Sur un
   tutoriel, c'est le symptôme le plus visible, parce que c'est le seul écran où le clic
   **détruit** le contexte de lecture.
2. **Sur certains tutoriels, il ne se passe rien du tout** (A2) : ceux servis depuis
   `/tutos/…` n'ont ni lien ni script. Si les tutoriels observés sont de ceux-là, le clic est
   littéralement sans effet — et c'est indiscernable, pour l'utilisateur, du cas 1.
3. **Et là où ça marche, le rendu est abîmé** (A3, A8) : du CSS cassé sur 6 fiches sur 10, et
   des termes que rien ne distingue visuellement.

---

## 4. Plan de correction proposé

Découpage en lots livrables indépendamment, du plus rentable au moins urgent. **Aucun n'a été
implémenté** : cet audit est une photographie, l'arbitrage revient au porteur du projet.

### Lot 1 — Assainir le moteur d'auto-liens (corrige A3, A5, A6, A7, A10)

Extraire le tronc commun de `src/utils/glTermAutolink.js` vers `lib/shared/termAutolink.js`
(CJS), paramétré par `{ codeField, cssClass, dataAttr }` ; y corriger la machine à états
(`skipDepth` fonctionnel **et** éléments vides traités correctement) ; rebrancher
`lib/foretmapGlossaryAutolink.js` **et** `src/utils/glTermAutolink.js` dessus ; échapper
l'attribut ; restreindre `postMessage` et vérifier `event.origin`. Tests `node:test` sur les
cas : `<style>`, `<script>`, `<a>` imbriqué, `<code>`, `<img>` non auto-fermé, chevauchement
de libellés, variantes, casse et accents.

Effet immédiat : le CSS des tutoriels cesse d'être corrompu, et GL retrouve ses auto-liens
après les images. **Aucun changement de comportement visible attendu, sauf en mieux.**

### Lot 2 — Un vrai popover ForetMap (corrige A1, A8)

Composant `GlossaryPopover` côté ForetMap, sur le modèle de `GLGlossaryPopover` (portail,
`useDialogA11y`, cache de définitions, termes liés navigables, lien « voir la fiche
complète » qui, lui, bascule d'onglet). Le message `foretmap:glossary` **ouvre le popover
au-dessus de la modale de tutoriel** au lieu de changer d'onglet — l'iframe n'a pas besoin de
connaître le changement. Injecter aussi une petite CSS `.fm-glossary-inline-link` dans
l'iframe, à côté du script existant.

Point d'attention : le popover doit se poser **au-dessus** de l'iframe, dans le document
parent ; l'iframe n'a aucun moyen de le rendre elle-même.

### Lot 3 — Couvrir tous les tutoriels (corrige A2)

Faire passer **tous** les tutoriels à contenu local par `/api/tutorials/:id/view`, quel que
soit leur `type` — c'est-à-dire ne plus jamais pointer `preview_url` vers `/tutos/…`. Étendre
`inlineLegacyTutorialHtmlToDb` aux types non-`html`, ou lever le filtre `type = 'html'`.
Prévoir la requête de contrôle du §A2 avant/après.

### Lot 4 — Cache de sortie (corrige A4, A9)

Mettre en cache le HTML **enrichi** par `(id, updated_at, version de l'index glossaire)`, et
invalider l'index sur écriture d'un terme au lieu d'attendre le TTL. Optionnel si le Lot 1
inclut la précompilation des regex, mais c'est le seul correctif qui supprime vraiment le coût.

### Lot 5 — Étendre les auto-liens au reste de ForetMap (A11, A12)

Prérequis A12 : ajouter `data-glossary-code` aux attributs autorisés et exposer
`allowGlossaryLinks` depuis `MarkdownContent`. Puis, dans l'ordre de valeur pédagogique
décroissante : définitions du glossaire lui-même → fiches plantes → énoncés et feedback de
quiz → réseau trophique → descriptions de tâches. Un hook `useGlossaryLinkIndex` côté
ForetMap, calqué sur `useGlGlossaryLinkIndex`.

**Décision attendue** : ce lot change le rendu de nombreux écrans. À arbitrer explicitement
(cf. `docs/EVOLUTION.md` : ne pas modifier le comportement métier sans demande).

---

## 5. Ce qui a été vérifié, et comment

**Vérifié par exécution** (dépendances installées, `node` 22) :

- A3 : `autolinkHtmlTextNodes` appliqué aux 10 fichiers de `tutos/` avec les 175 termes
  extraits de `sql/biodiv_pedago_seed.sql`, comptage des `fm-glossary-inline-link` tombant
  dans un bloc `<style>` / `<script>`. Chiffres du tableau A3.
- A4 : chronométrage à froid (1 passe) et à chaud (moyenne de 10 passes) sur
  `tutos/fiche-jardin-punk-n3.html` et `tutos/fiche-sol-vivant-punk.html`.
- A6 : `renderGlMarkdownWithGlossaryLinks` sur un Markdown contenant une image, sortie
  reproduite telle quelle dans le constat.

**Vérifié par lecture du code** : A1, A2, A5, A7, A8, A9, A10, A11, A12 et la note hors
périmètre — chaque affirmation renvoie à un fichier et une ligne.

**Non vérifié, faute d'accès** :

- L'**état réel de la table `tutorials` en production** — donc l'ampleur exacte de A2. La
  requête de contrôle est fournie au §A2.
- Le rendu visuel dans un navigateur (aucune session applicative disponible ici). Les effets
  décrits en A3 et A8 sont déduits du HTML produit, qui est reproductible hors ligne.
- Les tests backend (`npm test`) et e2e, qui exigent une base MySQL.
