# Audit — Page « Visite » : interface et parcours utilisateur

> Portée : l'écran **Visite de la carte** de ForetMap, tel que le voient l'élève connecté,
> le visiteur public (« Visiter sans compte ») et le professeur en édition. Du bandeau
> au-dessus du plan jusqu'au panneau détail d'une zone ou d'un repère, en incluant l'accueil
> mascotte de la visite publique. Rédigé le 2026-09-05, sur `main` à `3b7d6c2` (v1.146.0).
>
> **Hors portée** : la mascotte du plan (comportements, packs, dialogues) — auditée dans
> `docs/AUDIT_MASCOTTES_2026-08.md` ; le moteur de carte partagé `usePctMapViewport` (pan,
> zoom, inertie) ; l'éditeur éditorial prof (`VisitEditorPanel`) au-delà de son insertion dans
> le panneau détail ; le sous-produit GL.
>
> **État au 2026-09-05** : les huit constats ci-dessous sont **corrigés dans le même lot**.
> Chaque constat porte une ligne **« Corrigé »** qui dit où. Le document reste rédigé au
> présent de l'audit : ce qui est décrit est l'état constaté avant correction.
>
> Fichiers lus : `src/components/visit-views.jsx`, `src/components/visit/*.jsx`,
> `src/components/VisitMapMarkerButton.jsx`, `src/hooks/useVisitContent.js`,
> `src/hooks/useVisitSeenSync.js`, `src/index.css` (§ visite), `src/shared/platform/useDialogA11y.js`,
> `src/shared/hooks/usePrefersReducedMotion.js`, `src/components/map/ZonePolygonsLayer.jsx`,
> `src/components/map/MapViewToolbar.jsx`, `e2e/visit-mode.spec.js`, `tests-ui/**`.
>
> **Note d'exécution** : `npm run lint` (0 erreur), `npm run format:check` et `npm run test:ui`
> (suite entière) sont verts après le lot. Les tests backend et les scénarios Playwright n'ont
> pas pu être joués ici (ni MySQL ni navigateur applicatif dans l'environnement) ; le lot ne
> touche aucun fichier backend, et la suite `npm test` affiche le même nombre de succès avant
> et après (les échecs restants sont l'absence de base).

---

## 1. Ce que fait la page

La visite est une **lecture guidée du plan** : l'élève tape une zone ou un repère, la mascotte
s'y rend, un panneau s'ouvre avec le contenu éditorial du lieu, sa biodiversité et ses
tutoriels, et un bouton « Marquer comme vu » alimente un donut de progression. Le professeur y
dessine zones et repères, et rédige le contenu depuis le même panneau.

| Maillon                   | Où                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| Vue et orchestration      | `src/components/visit-views.jsx` (`VisitView`)                                            |
| Bandeau au-dessus du plan | `src/components/visit/VisitMapChrome.jsx`                                                 |
| Calques du plan           | `visit/VisitZonesSvgLayer.jsx`, `visit/VisitMarkersLayer.jsx`, `VisitMapMarkerButton.jsx` |
| Commandes de zoom         | `visit/VisitMapZoomControls.jsx`                                                          |
| Panneau détail            | `visit/VisitDetailPanel.jsx` (+ `visit/VisitEditorPanel.jsx` pour le prof)                |
| Accueil visiteur          | `visit/VisitGuestMascotOnboarding.jsx`                                                    |
| Données                   | `src/hooks/useVisitContent.js`, `src/hooks/useVisitSeenSync.js`                           |
| Styles                    | `src/index.css`, § « visite » (~l. 4000–4800)                                             |
| Doc de référence          | `docs/reference/foretmap/visite-et-mascottes.md`                                          |

---

## 2. Constats

### 2.1 — Les zones du plan sont inaccessibles au clavier (bloquant)

Sur le plan, un **repère** est un `<button>` (`VisitMapMarkerButton`) : il se tabule et
s'ouvre à l'Entrée. Une **zone** est un `<g class="visit-zone-hit" onClick=…>` nu
(`VisitZonesSvgLayer`) : ni `role`, ni `tabIndex`, ni gestion clavier, ni nom accessible. Elle
n'est ni atteignable au clavier, ni annoncée par un lecteur d'écran, ni activable autrement
qu'à la souris ou au doigt.

L'écart est d'autant plus net que **la carte principale a déjà corrigé exactement ce point** :
`src/components/map/ZonePolygonsLayer.jsx` pose `role="button"`, `tabIndex`, `aria-label` et un
`onKeyDown` Entrée/Espace, avec le commentaire « sinon un élève au clavier ne pouvait pas
l'ouvrir (les repères, eux, sont déjà des boutons) ». La visite est restée en arrière.

Conséquence concrète : sur une carte dont les lieux sont majoritairement des zones, un élève
au clavier ne peut ouvrir **aucun** contenu de la visite — donc rien marquer comme vu, donc
jamais avancer sur le donut de progression.

> **Corrigé** — `VisitZonesSvgLayer` expose chaque zone comme un bouton (`role`, `tabIndex=0`,
> `aria-label` sur le nom sans son emoji de tête, `onKeyDown` Entrée/Espace), calqué sur
> `ZonePolygonsLayer`. Un nom de repli (« Zone de visite ») couvre les zones sans titre.
> Tests : `tests-ui/components/visit/VisitZonesSvgLayer.test.jsx`.

### 2.2 — Le panneau détail s'annonce modal sans l'être

`VisitDetailPanel` porte `role="dialog"` et `aria-modal="true"`, mais :

1. **aucun focus n'entre dans le panneau** à l'ouverture — le lecteur d'écran reste sur la
   carte, et l'utilisateur clavier doit re-tabuler toute la page pour atteindre le contenu qui
   vient de s'ouvrir ;
2. **la tabulation n'est pas piégée** : elle repart dans le bandeau et les repères, derrière
   le dialogue ;
3. **le focus n'est pas rendu** à la zone ou au repère d'origine à la fermeture — il retombe
   sur `<body>`, et la navigation clavier repart du début de la page ;
4. sur grand écran (≥ 980 px) le panneau est une carte centrée **sans voile** : la carte reste
   cliquable dessous. Un clic à côté du panneau déplace la mascotte ou ouvre une autre zone
   _derrière_ un dialogue déclaré modal, et le contenu du panneau change sous les yeux du
   lecteur.

L'application dispose pourtant déjà de la coque adéquate — `useDialogA11y`
(`src/shared/platform/useDialogA11y.js`), utilisée par `DialogShell` et `ImageLightbox` :
focus initial, piège Tab, Échap, restitution du focus.

> **Corrigé** — `VisitDetailPanel` utilise `useDialogA11y` et rend un voile
> (`.visit-detail-panel__scrim`) qui ferme le panneau au clic, comme le fait `DialogShell`.
> La garde Échap existante (une lightbox ou un aperçu de tutoriel ouvert par-dessus doit se
> fermer seul, sans emporter le panneau) est conservée : elle passe par la nouvelle prop
> `onRequestClose`, et l'écouteur `keydown` ad hoc de `visit-views.jsx` disparaît.
> Tests : `tests-ui/components/visit/VisitDetailPanel.test.jsx`.

### 2.3 — Sur grand écran, le panneau saute horizontalement à chaque ouverture

`.visit-detail-panel` est centré par `left: 50%` + `transform: translateX(-50%)` au-dessus de
980 px. Son animation d'ouverture, elle, est déclarée sans ce décalage :

```css
@keyframes visitDetailPanelIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

Une animation qui anime `transform` **remplace** la valeur déclarée pendant toute sa durée. Le
panneau (820 px de large) s'affiche donc décalé d'une demi-largeur vers la droite pendant les
200 ms de l'animation, puis saute de ~410 px à sa place. C'est visible à chaque ouverture de
zone ou de repère sur ordinateur.

> **Corrigé** — le décalage de centrage passe par une variable
> (`--visit-detail-panel-x`, `0px` par défaut, `-50%` au-delà de 980 px) que les keyframes
> reprennent : `transform: translate(var(--visit-detail-panel-x), …)`. L'animation conserve
> donc le centrage, sur toutes les tailles d'écran.

### 2.4 — Le clignotement « pas encore vu » ignore `prefers-reduced-motion`

Chaque zone et chaque repère non visités clignotent en rouge en boucle
(`animation: visitFadeRed 2.2s ease-in-out infinite`). Sur une carte fraîche, ce sont **tous**
les lieux qui pulsent en permanence, sans aucune garde `prefers-reduced-motion: reduce`.

La vue connaît pourtant la préférence : `visit-views.jsx` la lit pour la mascotte et pour la
pulsation du bouton « Présentation du lieu », et cette dernière est doublement gardée (JS +
`@media (prefers-reduced-motion: no-preference)`). L'animation la plus envahissante de la page
est la seule à ne pas l'être.

Effet secondaire : une composition permanente sur des dizaines d'éléments SVG, sur des
tablettes d'établissement.

> **Corrigé** — `@media (prefers-reduced-motion: reduce)` neutralise `visitFadeRed` sur
> `.visit-zone-poly.is-unseen` et `.visit-marker-indicator.is-unseen`. Le rouge et le vert
> restent : le contraste, seul porteur d'information, est inchangé.

### 2.5 — Toute la vue disparaît à chaque rechargement

`VisitView` remplace la page entière par le loader « Préparation de la visite… » dès que
`loading` est vrai — et `loading` couvre **tous** les chargements, pas seulement le premier :

- **changement de carte** : le plan disparaît, puis revient ;
- **chaque enregistrement du professeur** : `VisitEditorPanel` appelle `onSaved` → `loadData`,
  donc la vue, le panneau détail ouvert et le formulaire en cours d'édition sont démontés puis
  remontés. Le prof enregistre un paragraphe et voit toute la page clignoter.

> **Corrigé** — `useVisitContent` expose `initialLoading` (vrai tant qu'aucun chargement n'est
> allé au bout) ; le loader plein écran n'est plus rendu que dans ce cas. Les rechargements
> gardent la carte et le panneau affichés et n'affichent qu'une pastille discrète
> « Actualisation… » dans le bandeau (`role="status"`).
> Tests : `tests-ui/hooks/useVisitContent.test.jsx`, `tests-ui/components/visit/VisitMapChrome.test.jsx`.

### 2.6 — Accueil du visiteur : des boutons déguisés en éléments de liste

`VisitGuestMascotOnboarding` rend la grille de mascottes avec `role="list"`, et pose
`role="listitem"` **sur les boutons eux-mêmes**. Un rôle ARIA explicite remplace le rôle natif :
ces `<button aria-pressed>` sont donc exposés comme de simples éléments de liste, sans rôle
« bouton » et sans état pressé. Pour un lecteur d'écran, le visiteur ne sait ni que ces
éléments sont activables, ni quelle mascotte est actuellement choisie.

> **Corrigé** — la grille devient un `role="group"` nommé (« Mascottes disponibles ») et les
> boutons gardent leur rôle natif avec `aria-pressed`.
> Tests : `tests-ui/components/visit/VisitGuestMascotOnboarding.test.jsx`.

### 2.7 — Commandes de zoom : cible tactile de 30 px

`.visit-map-ctrl` (＋ / － / ⊡, superposées au plan) fait 30 × 30 px. La convention projet
(CLAUDE.md, § Front, et le lot 4 de `docs/AUDIT_GENERAL_2026-08.md`) fixe les cibles tactiles
à **44 px minimum**, et la barre de la carte principale applique déjà cette borne sous
`@media (pointer: coarse)`. Les commandes de la visite y ont échappé — sur la surface même où
l'on manipule le plan au doigt.

Ces trois boutons n'avaient par ailleurs **aucun style `:focus-visible`** : au clavier, rien
n'indique lequel est atteint (les zones et les repères non plus, désormais focusables).

> **Corrigé** — `min-width` / `min-height` à 44 px sous `@media (pointer: coarse)`, et un
> `:focus-visible` commun aux commandes de zoom, aux repères et aux zones.

### 2.8 — Deux noms accessibles réduits à « Aa »

Le bouton de lecture confortable du panneau détail n'a qu'un `title` : son nom accessible est
donc son contenu, « Aa ». Un lecteur d'écran annonce « Aa, bouton » — sans indiquer ce que le
bouton fait. (`title` n'est lu de façon fiable ni au clavier, ni au toucher.)

À l'inverse, le bouton de taille de texte du bandeau porte `aria-label="Changer la taille du
texte sur la carte"`, qui ne contient pas son libellé visible (« Aa » / « A+ » / « A++ ») :
c'est le cas de figure exact que WCAG 2.5.3 « Label in Name » interdit — une commande vocale
prononçant l'étiquette visible ne l'atteint pas.

> **Corrigé** — `aria-label="Lecture confortable (Aa)"` sur le premier ; sur le second, un
> `aria-label` construit sur le libellé courant (« Taille du texte sur la carte (Aa) »). Les
> deux noms accessibles contiennent désormais leur libellé visible.
> Tests : `tests-ui/components/visit/VisitDetailPanel.test.jsx`, `…/VisitMapChrome.test.jsx`.

---

## 3. Nettoyage joint au lot

`visit-views.jsx` réimplémentait `prefers-reduced-motion` (état + `matchMedia` +
`addEventListener`) alors que `src/shared/hooks/usePrefersReducedMotion.js` fait exactement
cela, au caractère près. Le hook partagé remplace la copie locale : sept lignes de moins et
une seule implémentation à faire évoluer.

---

## 4. Points examinés et laissés en l'état

| Point                                                                                             | Pourquoi on n'y touche pas                                                                                                                                               |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Retour arrière Android sur le panneau détail réservé au visiteur public (`useOverlayHistoryBack`) | Asymétrie assumée ailleurs dans l'app (l'élève connecté navigue par onglets) : le corriger touche la navigation générale, hors portée d'un audit d'écran.                |
| Bouton « Plein écran » : `aria-label` différent du texte visible                                  | Le libellé visible (« Plein écran ») est bien **contenu** dans les deux `aria-label` : WCAG 2.5.3 est respecté.                                                          |
| Course entre deux chargements (`loadData` obsolète qui repasse `loading` à faux)                  | La garde anti-réponse obsolète protège déjà le **contenu** ; seul l'indicateur peut clignoter une fraction de seconde. À traiter avec la file de requêtes, pas ici.      |
| Cible tactile des boutons `.btn-sm` du bandeau                                                    | Ils portent un libellé, donc une largeur : la convention projet limite volontairement l'élargissement aux commandes en icône seule (`src/index.css`, § cibles tactiles). |

---

## 5. Second passage — agencement du bandeau (2026-09-05)

Le premier passage traitait les défauts pris un à un. Une relecture de l'**agencement** a suivi,
cette fois **mesurée dans Chromium** sur un fac-similé statique du balisage réel avec le CSS
compilé du projet, à quatre largeurs. La police du projet n'étant pas chargeable hors ligne,
la pile système a été forcée : les largeurs de texte sont approchées à quelques pour cent
près, les hauteurs et la structure sont fidèles.

### 5.1 — Le sélecteur de mascotte se posait sur deux lignes

`.visit-mascot-picker` impose `flex-direction: column` — sa disposition dans les réglages et
dans le studio. Le style **en ligne** du bandeau posait bien `display: inline-flex` et
`align-items: center`, mais **ne réinitialisait jamais `flex-direction`**. Dans le bandeau, le
libellé « Mascotte » se retrouvait donc _au-dessus_ du menu, et le `margin-top: 8px` de la même
classe décalait le bloc vers le bas : ~30 px de hauteur en trop, sur toutes les largeurs, et
l'élément le plus disgracieux de la barre.

Deux pièges de cascade sont apparus en le corrigeant, tous deux dus à l'ordre de déclaration :
une règle de compacité posée **avant** `.visit-mascot-picker select` (spécificité 0,1,1 contre
0,1,0) restait sans effet, et une media query placée avant la règle qu'elle devait écraser
était ignorée — une media query n'ajoute aucune spécificité. Les règles du bandeau sont
désormais déclarées **après** les règles génériques du sélecteur.

### 5.2 — Une file unique de neuf éléments, quatre registres mélangés

Le cluster de droite alignait, à la même gouttière et sans séparateur : de l'état (réseau,
rechargement, donut de progression), des commandes de vue (plein écran, taille du texte), une
préférence (mascotte) et du rôle (aperçu élève, retour connexion) — dans cinq styles visuels
différents. Rien n'indiquait ce qui allait ensemble.

Le sélecteur de mascotte, à lui seul, occupait jusqu'à 194 px mesurés : **le plus gros élément
du bandeau pour le réglage qu'on touche le moins souvent** (l'invité l'a déjà choisi dans la
modale d'accueil).

### 5.3 — Aucune règle responsive

Le bandeau ne comptait pas une seule media query : sous 560 px, tout s'empilait aligné à droite,
en escalier. Mesuré : **274 px de haut sur un écran de 390 px**, soit plus de 40 % de la hauteur
utile consommés avant la carte — sur l'écran dont la carte est le sujet.

### 5.4 — Ce qui a été fait

Trois zones lisibles, et les commandes d'affichage compactées :

1. **identité et progression** — titre, donut, « Présentation du lieu ». Le donut est une
   _donnée_ : sa place est auprès du titre, pas entre un menu de préférence et le bouton d'aide.
2. **affichage du plan** — plein écran, taille du texte, mascotte réunis dans un groupe visuel
   unique (`.visit-display-group`, `role="group"`), qui rime avec les commandes de zoom posées
   sur le plan. « Plein écran » passe en icône seule (variante partagée
   `.fm-map-fullscreen-open--compact` ; la carte principale garde son libellé), et le libellé
   visible « Mascotte » disparaît — il doublait la valeur affichée. Les deux gardent leur nom
   accessible et gagnent une infobulle.
3. **contexte et rôle** — état réseau, aperçu élève, aide, retour connexion.

Plus les seuils manquants : commandes alignées à gauche dès 900 px (elles laissaient un vide en
L sous le titre quand elles passaient seules à la ligne), titre et donut resserrés sous 560 px.

**« Aperçu comme élève » n'a pas été renommé** malgré ses 185 px : le libellé est cité mot pour
mot dans `src/constants/help.js` et `src/constants/discoveryTour.js`. Le raccourcir imposait de
réécrire l'aide et le tour guidé pour gagner 50 px sur un bouton réservé au professeur — qui
édite sur ordinateur, pas sur téléphone.

### 5.5 — Mesures (hauteur du bandeau, Chromium)

| Largeur | Prof avant → après        | Élève / invité avant → après |
| ------- | ------------------------- | ---------------------------- |
| 1440 px | 151 → **121 px** (−20 %)  | 151 → **121 px** (−20 %)     |
| 1024 px | 193 → **181 px** (−6 %)   | 151 → **121 px** (−20 %)     |
| 768 px  | 196 → **187 px** (−5 %)   | 196 → **187 px** (−5 %)      |
| 390 px  | 274 → **273 px** (−0,4 %) | 274 → **219 px** (−20 %)     |

Le gain est franc partout sauf pour le **professeur sur téléphone**, où « Aperçu comme élève »
occupe une rangée à lui seul (cf. ci-dessus). Le gain y est structurel — trois rangées au lieu
de six, registres séparés — plutôt que vertical. C'est un compromis assumé : le profil qui passe
ses heures sur téléphone est l'élève, et il gagne 55 px.

### 5.6 — Ce qui reste ouvert

- **Descendre les commandes d'affichage sur le plan**, avec le zoom (piste « D » écartée pour
  l'instant) : cohérence maximale, mais sur 390 px la carte ne fait que ~370 px de large et
  trois boutons de plus en surimpression y mordent davantage qu'ils ne libèrent. À réévaluer
  sur appareil réel.
- **Le sélecteur de carte occupe une rangée entière** même avec deux cartes (44 px). Le fondre
  dans la ligne de titre demanderait de restructurer `chrome-top`.
- **La pulsation de « Présentation du lieu »** reste la seconde animation d'appel de l'écran,
  après le clignotement rouge des lieux non vus (§2.4) — les deux tournent en même temps sur une
  carte fraîche. À trancher : garder une seule sollicitation visuelle.

---

## 6. Vérifications

```bash
npm run lint            # 0 erreur
npm run format:check    # OK
npm run test:ui         # suite entière verte (dont les 5 fichiers de tests visite)
```

Les scénarios `e2e/visit-mode.spec.js` restent valides : ils ciblent `.visit-zone-hit`,
`visit-detail-panel` et le bouton « Fermer », tous conservés. Le voile introduit en §2.2
intercepte désormais les clics visant le bandeau **pendant** que le panneau est ouvert — c'est
le comportement modal attendu, et le scénario « aperçu comme élève » cliquait déjà ce bouton
par `evaluate(el => el.click())`.
