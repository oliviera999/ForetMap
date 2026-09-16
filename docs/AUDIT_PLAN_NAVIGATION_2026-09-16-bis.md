# Audit — la navigation du Plan Lyautey, deuxième passe (16 septembre 2026)

> **Statut : audit, sans aucune modification du code produit.** Relevé fait sur la tête de
> `main` (`package.json` 1.157.25, commit `1ffdd16`), **sur le bundle effectivement déployé** :
> les empreintes servies par `https://planlyautey.olution.info/` (`plan-BBPVPU2y.js`,
> `plan-CuKYgKxr.css`, `planPlaces-B96xSd5r.js`, `planBrand-3VW5Kkzd.js`) sont identiques à
> celles du `dist/` versionné. La **charge publique réelle** a été téléchargée
> (`GET https://planlyautey.olution.info/api/plan/content` : 36 zones + 42 repères = 78 lieux,
> 11 catégories, 1 parcours) et rejouée telle quelle, avec le vrai fond de plan
> (`lyautey-1789299489652.jpg`, 1210 × 1437 px), devant un navigateur pilotant ce bundle.
> Ce qui est mesuré ici est donc ce que voit un visiteur aujourd'hui.
>
> **Objet.** Deuxième relevé sur la navigation, après
> [`AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md`](AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md) du même
> jour, dont les seize constats sont traités. Les blocages d'hier (recherche neutralisée,
> carte gelée par `inert`, sortie du plan à la fermeture d'une fiche) **ne se reproduisent
> plus** — c'est vérifié en §6. Ce qui reste, et qui n'avait pas été mesuré, est un problème
> de **recouvrement** : plus rien n'est désactivé, mais la feuille basse se pose sur ce dont
> on a besoin — les commandes de zoom, le lieu qu'on vient d'ouvrir, la barre de parcours.
>
> **Méthode.** Chaque constat est mesuré par `document.elementFromPoint` au centre de la cible
> (« qu'est-ce que le doigt touche vraiment ? »), pas déduit du CSS, et vérifié par un clic
> réel **sans** `force`. Reproduction : §8.

---

## 1. En une page

**Ouvrir une feuille enterre les commandes de carte.** Les deux feuilles du plan (résultats,
fiche) s'ouvrent au cran `half`, soit **55 dvh** — 365 px sur un iPhone 13. La colonne de
commandes remonte, mais sa remontée est **plafonnée à 30 dvh** (199 px,
`src/plan/styles/plan.css:965-971`). Elle remonte donc de 199 px sous une feuille haute de
365 px, et les trois dernières commandes se retrouvent **dans** la feuille. Mesuré au
`elementFromPoint` : « Zoomer » touche la poignée de la feuille, « Dézoomer » touche le bouton
« Fermer », « Voir tout le plan » touche un paragraphe de la fiche. Un clic réel sur « Voir
tout le plan » **expire au bout de 3 s**. Quand la position est active la colonne compte six
boutons : « Me situer » passe alors à `y = 145`, c'est-à-dire **sous la rangée de filtres**, et
**quatre commandes sur six** deviennent inatteignables. Même résultat sur iPhone SE et
Pixel 7 (B1).

**Le lieu qu'on vient de chercher est caché sous sa propre fiche.** Au cadrage d'ouverture le
plan tient entier dans le cadre, donc les bornes « contain » interdisent tout déplacement : le
recentrage sur le lieu sélectionné est un **coup d'épée dans l'eau**, et `focusInsets` n'est
passé qu'en mode parcours (`src/plan/AppPlan.jsx:725`). La feuille couvrant tout à partir de
`y = 299`, il reste **110 px de plan sur 463, soit 24 %** (19 % sur iPhone SE). Mesuré :
_Forêt comestible_ à `y = 577`, _Loge — entrée des visiteurs_ à `y = 569`, _Bât.H_ à `y = 501`,
_Cafétéria_ à `y = 418` — les quatre sous la fiche. On cherche un lieu, on obtient une fiche
qui redit son nom, et le plan derrière ne montre pas où il est (B2).

**Pendant un parcours, toucher un lieu gèle la barre de parcours.** Le correctif N5 d'hier
ouvre bien une fiche — mais cette fiche (365 px) recouvre **entièrement** la barre de parcours
(`y` 458 → 664). « Quitter », « Précédent » et « Suivant » ne répondent plus : le clic réel sur
« Quitter » expire. Il faut trouver « Revenir à l'étape » ou la croix (B3).

**Le reste est du même ordre :** le bandeau de première visite est posé **sur la barre haute**,
pas sur la carte, et recouvre intégralement le bouton d'aide — la seule explication du produit,
au moment précis où on en a besoin (G1) ; au cadrage d'ouverture, **glisser la carte ne produit
rien** (G2) ; un lieu encore pris dans un groupe de repères n'est **pas dessiné du tout** quand
on ouvre sa fiche (G3) ; « gymnase » renvoie _Vers Beaulieu_, _Infirmerie_ et _Studio Radio_,
« sortie » renvoie _Bât.I_ et _Direction du collège_ (G4) ; onze puces de catégories sur treize
restent hors écran (G5).

**Ce qui va bien, et qui mérite d'être dit :** le **calage GPS est excellent** — les trois
paires d'ancres donnent 0,2337 / 0,2342 / 0,2331 m/px, soit un écart de **0,5 %**, le plan fait
281,7 × 336,8 m et son nord est à **0,17°** du haut de l'image. Le point bleu, le halo, les
distances (« Sanitaires 92 m », « Fontaine à eau 37 m ») et la ligne « Y aller » sont justes.
Le problème de navigation n'est **pas** dans la géométrie : il est dans ce qui recouvre l'écran
(§5).

**Ordre de traitement :** B1 (une ligne de CSS + une hauteur publiée) → B2 (une prop) →
B3 (même famille) → G1 (un parent) → G2 → G3 → G4 → G5.

---

## 2. Périmètre et méthode

| Élément           | Valeur                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Code audité       | `main` @ `1ffdd16`, `package.json` 1.157.25                                                                                     |
| Bundle            | `dist/assets/plan-BBPVPU2y.js` — **identique** à celui servi par `planlyautey.olution.info`                                     |
| Charge            | `GET /api/plan/content` de production : 36 zones + 42 repères, 11 catégories, 1 parcours, 6 catégories par défaut               |
| Fond de plan      | `lyautey-1789299489652.jpg`, 1210 × 1437 px (téléchargé depuis la production)                                                   |
| Appareils simulés | iPhone 13 (390 × 664), iPhone SE (320 × 568), Pixel 7 (412 × 839), poste fixe 1280 × 800 — locale `fr-FR`, Chromium 1234        |
| Position simulée  | 33,59595 / −7,63480 (cœur du lycée), précision par défaut                                                                       |
| Mesure            | `document.elementFromPoint` au centre de chaque cible **+** clic réel sans `force` ; géométries lues au `getBoundingClientRect` |
| Compteurs d'usage | neutralisés (`/api/usage` renvoyé 204) : l'audit ne pollue pas les statistiques de production                                   |
| Non couvert       | PWA / hors-ligne, qualité du fond de plan, licence du fond, performance réseau, boussole réelle (pas de magnétomètre simulable) |

---

## 3. Constats bloquants

### B1 — Une feuille ouverte enterre la moitié des commandes de carte

**Ce qui se passe.** `BottomSheet` publie sa hauteur dans `--fm-bottom-sheet-inset`
(`src/shared/ui/BottomSheet.jsx:127-142`). Le plan s'en sert pour remonter sa colonne de
commandes — mais **en plafonnant à 30 dvh** :

```css
/* src/plan/styles/plan.css:965-971 */
.plan-map .plan-map-controls {
  bottom: calc(
    min(var(--fm-bottom-sheet-inset, 0px), 30dvh) + env(safe-area-inset-bottom, 0px) +
      var(--space-4, 16px)
  );
}
```

Or les deux feuilles s'ouvrent au cran `half`, c'est-à-dire **55 dvh**
(`SNAP_VIEWPORT_RATIO.half = 0.55`, `src/shared/ui/bottomSheetSnap.js:12`), imposé par
`initialSnap="half"` dans `PlanResultsSheet.jsx:67` et `PlanPlaceSheet.jsx:63`. La colonne
remonte donc de 199 px alors que la feuille en occupe 365 : l'écart de 166 px, c'est exactement
ce qui reste sous la feuille.

**Mesure** (iPhone 13, `--fm-bottom-sheet-inset` relevée à `365px`, haut de feuille `y = 299`) :

| Commande          | `y` sans feuille | `y` avec feuille | Ce que le doigt touche vraiment | Atteignable |
| ----------------- | ---------------- | ---------------- | ------------------------------- | ----------- |
| Me situer         | 396              | 197              | `span.fm-map-action__icon`      | **oui**     |
| Échelle / rose    | 448              | 249              | `span.fm-map-action__icon`      | **oui**     |
| Zoomer            | 500              | 301              | `div.fm-bottom-sheet__handle`   | **non**     |
| Dézoomer          | 552              | 353              | `button.fm-bottom-sheet__close` | **non**     |
| Voir tout le plan | 604              | 405              | `p.plan-place__lead`            | **non**     |

Clic réel (sans `force`) sur « Voir tout le plan », fiche ouverte : **échec, 30 s d'attente**,
Playwright nommant l'intercepteur (`plan-place-sheet-overlay`). Le bouton reste pourtant
« visible » au sens CSS — voir §7.

**Avec la position active**, la colonne gagne un sixième bouton (« Orienter la carte selon la
boussole », `SharedMapStage.jsx:655-674`) et la situation empire :

| Commande           | `y` avec feuille | Atteignable                         |
| ------------------ | ---------------- | ----------------------------------- |
| Suivre ma position | **145**          | **non** — sous la rangée de filtres |
| Orienter la carte  | 197              | oui                                 |
| Échelle / rose     | 249              | oui                                 |
| Zoomer             | 301              | **non**                             |
| Dézoomer           | 353              | **non**                             |
| Voir tout le plan  | 405              | **non**                             |

**Autres écrans**, feuille de résultats ouverte :

| Appareil  | Viewport  | Feuille | Commandes inatteignables                                     |
| --------- | --------- | ------- | ------------------------------------------------------------ |
| iPhone SE | 320 × 568 | 312 px  | **Me situer**, Zoomer, Dézoomer, Voir tout le plan (4 sur 5) |
| iPhone 13 | 390 × 664 | 365 px  | Zoomer, Dézoomer, Voir tout le plan (3 sur 5)                |
| Pixel 7   | 412 × 839 | 461 px  | Échelle, Zoomer, Dézoomer, Voir tout le plan (4 sur 5)       |

**Conséquence.** La feuille est ouverte **exactement** quand on a besoin de zoomer : on vient
de chercher un lieu, sa fiche s'affiche, et c'est à ce moment qu'il faut agrandir le plan pour
le situer. Le commentaire du CSS assume le compromis (« aux crans hauts, on fait glisser la
feuille vers le bas pour retrouver le zoom ») — mais le cran haut **est** le cran d'ouverture,
et rien ne dit au visiteur qu'il faut faire glisser la feuille. Vérifié : ramenée au cran bas,
la colonne redevient entièrement atteignable.

**Correctif proposé.** Ancrer la colonne **au-dessus du haut réel de la feuille** plutôt que de
plafonner à l'aveugle : publier aussi la hauteur maximale utilisable et borner par le haut
(`bottom: min(var(--fm-bottom-sheet-inset), 100dvh - <haut de la barre de filtres> - <hauteur
de la colonne>)`), ou — plus simple et plus honnête sur un téléphone — replier la colonne en
**rangée horizontale** au-dessus de la feuille quand une feuille est ouverte. Les deux tiennent
en CSS ; aucune logique produit ne change.

### B2 — Le lieu qu'on vient d'ouvrir est sous sa propre fiche

**Ce qui se passe.** Deux mécanismes se neutralisent :

1. au cadrage d'ouverture, le plan tient **entier** dans le cadre ; les bornes « contain » de
   `pctMapTransform.js` interdisent alors tout déplacement (« reste entièrement dans le cadre
   quand il est plus petit », `src/shared/pct-map/pctMapTransform.js:10-11`). Le recentrage sur
   le lieu sélectionné (`SharedMapStage.jsx:464-474`) ne peut donc **rien déplacer** ;
2. `focusInsets` — qui dirait au recentrage « garde le lieu au-dessus de ce qui est en bas » —
   n'est passé **qu'en mode parcours** : `focusInsets={activeRoute ? { bottom: … } : null}`
   (`src/plan/AppPlan.jsx:725`). Pour une fiche de lieu, il vaut `null`.

**Mesure.** Recherche puis ouverture du premier résultat, iPhone 13, haut de feuille `y = 299` :

| Recherche            | Lieu ouvert                 | Centre du lieu | Verdict                   |
| -------------------- | --------------------------- | -------------- | ------------------------- |
| « forêt comestible » | Forêt comestible            | `y = 577`      | **caché sous la fiche**   |
| « loge »             | Loge — entrée des visiteurs | `y = 569`      | **caché sous la fiche**   |
| « bât.h »            | Bât.H                       | `y = 501`      | **caché sous la fiche**   |
| « cafétéria »        | Cafétéria et restauration   | `y = 418`      | **caché sous la fiche**   |
| « infirmerie »       | Infirmerie                  | —              | **pas dessiné** (voir G3) |

Part du plan encore visible au cran d'ouverture d'une feuille :

| Appareil  | Plan (hauteur) | Bande visible | Part du plan |
| --------- | -------------- | ------------- | ------------ |
| iPhone SE | 380 px         | 73 px         | **19 %**     |
| iPhone 13 | 463 px         | 110 px        | **24 %**     |
| Pixel 7   | 489 px         | 114 px        | **23 %**     |

**Conséquence.** Les trois quarts du lycée sont sous la feuille, et le lieu cherché tombe
statistiquement dedans. La seule fonction du produit — « montre-moi où c'est » — n'est pas
rendue. Un contre-exemple révélateur : toucher un repère **directement sur la carte** marche
(`Vers Beaulieu`, `y = 203` → reste à `y = 212`, visible), parce qu'on a touché un point déjà
dans la bande visible. Le défaut ne se voit donc que par la recherche — c'est-à-dire par le
chemin principal.

**Correctif proposé.** Passer `focusInsets={{ bottom: <hauteur de la feuille ouverte> }}` dès
qu'une feuille est ouverte (la hauteur est déjà publiée en `--fm-bottom-sheet-inset`), et
autoriser le recentrage à **zoomer** jusqu'à une échelle minimale quand le lieu ne peut pas
entrer dans la bande visible autrement (`focusOnPct` accepte déjà `targetScale`,
`usePctMapViewport.js:581`).

### B3 — Pendant un parcours, ouvrir un lieu gèle la barre de parcours

**Ce qui se passe.** Le correctif N5 d'hier fait bien apparaître une fiche quand on touche un
lieu pendant un parcours (`routePeekPlace`, `AppPlan.jsx:266-276`). Mais cette fiche s'ouvre au
cran `half` (365 px, haut à `y = 299`) et la barre de parcours occupe `y` 458 → 664 : elle est
**intégralement** recouverte.

**Mesure** (lien profond `?parcours=faire-le-tour-du-lycee`, puis tap sur un repère) :

| Cible                       | Boîte             | Ce que le doigt touche | Atteignable |
| --------------------------- | ----------------- | ---------------------- | ----------- |
| « Quitter »                 | 309, 471, 69 × 44 | `p.plan-place__lead`   | **non**     |
| « Précédent » / « Suivant » | 12, 608, 103 × 44 | boutons de la fiche    | **non**     |
| barre de parcours           | 0, 458, 390 × 206 | boutons de la fiche    | **non**     |

Clic réel sur « Quitter » : **échec** (3 s). Après fermeture de la fiche, le même clic passe et
le parcours se termine correctement (« Pour reprendre : puce Parcours, ou Reprendre. »).

**Conséquence.** On sort du parcours par un chemin qu'on n'a aucune raison de deviner. Le
parcours n'est pas cassé — il est inaccessible tant qu'une fiche est ouverte.

**Correctif proposé.** Même famille que B1 : quand une feuille non bloquante est ouverte, la
barre de parcours doit remonter au-dessus d'elle (elle publie déjà sa hauteur), ou la fiche
« consultée pendant un parcours » doit s'ouvrir au cran `peek`.

---

## 4. Constats gênants

### G1 — Le bandeau de première visite recouvre le bouton d'aide

`.plan-welcome` est en `position: absolute; top: 12px` **dans `.plan-shell`**
(`src/plan/styles/plan.css:658-672`), donc au-dessus de la barre haute et non « en haut de la
carte » comme le voulait le correctif N7 d'hier. Mesures au premier lancement (iPhone 13) :
bandeau `12, 12, 366 × 68` ; bouton d'aide `334, 12, 44 × 44` ; champ de recherche
`52, 64, 314 × 44`.

- `elementFromPoint(356, 34)` — centre du bouton d'aide → **`button.plan-welcome__close`**.
  Le bouton d'aide est donc **entièrement** inatteignable ;
- `elementFromPoint(209, 68)` — haut du champ de recherche → `div.plan-welcome`. Les 16 px
  hauts du champ sont mangés (le centre reste touchable).

Le bouton d'aide (`.plan-help-btn`, qui **pulse** pour attirer l'œil) est la seule explication
du produit, et il est masqué au moment exact où le visiteur est neuf. Correctif : poser le
bandeau dans `.plan-main` (sous la barre haute), ou lui donner `top` égal à la hauteur de la
barre haute.

### G2 — Au cadrage d'ouverture, glisser la carte ne produit rien

Glisser de (195, 400) à (105, 300), 14 pas tactiles : `transform` inchangée
(`matrix(1, 0, 0, 1, 0, 0)`) — aucun mouvement, aucun effet élastique perceptible. Le
pincement d'écartement fonctionne (× 4,33), le double tap aussi (× 1,35), et une fois zoomé, le
glissement fonctionne. C'est conforme aux bornes « contain », mais le **premier geste** d'un
visiteur devant un plan sur téléphone est le glissement : il obtient un écran mort et en
conclut que le plan n'est pas manipulable. Correctif : au cadrage d'ouverture, rendre le
dépassement élastique visible (il est déjà implémenté, `PCT_MAP_ELASTIC_RATIO`), ou laisser un
léger dézoom sous l'ajustement pour que le geste ait toujours une réponse.

### G3 — Un lieu pris dans un groupe n'est pas dessiné du tout

« infirmerie » ouvre bien la fiche _Infirmerie_ — mais aucun `.fm-pct-marker.is-active` ni
`.fm-pct-zone.is-active` n'existe dans le DOM : le repère est encore **agrégé** dans un groupe
(« 2 lieux regroupés, dont Infirmerie »). Le recentrage n'ayant pas d'échelle cible, le
regroupement ne se défait pas. Résultat : la fiche parle d'un lieu que **rien** sur la carte ne
montre. Correctif : recentrer avec l'échelle de séparation du groupe
(`clusterZoomTargetScale`, déjà utilisée au tap sur un groupe, `SharedMapStage.jsx:359`).

### G4 — La recherche répond au-delà du raisonnable

`scoreTokenInField` accepte **n'importe quelle sous-chaîne** dans les descriptions
(`field.text.includes(token)`, `src/shared/search/placeSearch.js:121`), sans seuil de
pertinence ni écart minimal au meilleur score. Relevés sur la charge de production :

| Saisie         | n   | Cinq premiers résultats                                                                  |
| -------------- | --- | ---------------------------------------------------------------------------------------- |
| « entrée »     | 31  | les 5 vraies entrées en tête — **puis 26 lieux sans rapport**                            |
| « gymnase »    | 3   | Vers Beaulieu · Infirmerie · Studio Radio Lyautey — **aucun gymnase**                    |
| « sortie »     | 2   | Bât.I — Intendance et services · Direction du collège                                    |
| « parking »    | 5   | Parking · Parking · Entrée parking · **Point de nourrissage des chats** (× 2)            |
| « cdi »        | 3   | CDI · CIO · Reprographie                                                                 |
| « infirmerie » | 9   | Infirmerie · DAE · Espace professeurs · Reprographie · DAE                               |
| « bâtiment A » | 23  | Jardin du bâtiment S · Potager du bâtiment M · Accueil administration · … (pas de Bât.A) |
| « wc »         | 8   | Sanitaires × 4 (indiscernables) · Sanitaires du collège · Fontaine à eau                 |

Le bon résultat est presque toujours **en tête** — le classement fait son travail. Ce qui
manque est un **plancher** : sous un certain score, ou trop loin du meilleur, un lieu ne
devrait pas figurer dans la liste. « Aucun gymnase sur ce plan » est une réponse ; trois lieux
au hasard n'en est pas une.

### G5 — Onze puces de catégories sur treize restent hors écran

Rangée `.plan-filters__row` : `scrollWidth` **2027 px** pour `clientWidth` **390 px**
(`overflow-x: auto`, donc défilable). Puces réellement visibles : **Parcours · Filtres · Tout ·
Elèves**. Les neuf autres, dont _Infrastructure_ (31 lieux) et _Enseignement_ (16), demandent un
défilement horizontal qui ne s'annonce pas. Le bouton « Filtres (6) » ajouté hier compense —
mais la rangée reste un leurre qui occupe 52 px de haut, soit 8 % de l'écran, pour montrer une
puce et demie.

### Deux constats de **donnée**, déjà ouverts et toujours vrais

- le seul parcours publié, _Faire le tour du lycée_, n'a **qu'une étape** : « Précédent » et
  « Suivant » sont désactivés d'emblée, le mode parcours est un cul-de-sac (N13 d'hier) ;
- quatre repères s'appellent exactement « Sanitaires », trois « Fontaine à eau », deux « DAE »,
  et un « Point de nourrissage des chats (copie) » traîne en production (N10 d'hier). La
  distance les sépare quand la position est active — pas autrement.

---

## 5. Ce qui va bien (et qu'il faut cesser de suspecter)

**Le calage GPS est bon.** Contrôle indépendant des trois ancres de production, en espace
pixel (image 1210 × 1437) :

| Paire d'ancres | Distance réelle | Distance image | Échelle     |
| -------------- | --------------- | -------------- | ----------- |
| 1 – 2          | 149,8 m         | 640,8 px       | 0,2337 m/px |
| 1 – 3          | 205,0 m         | 875,6 px       | 0,2342 m/px |
| 2 – 3          | 191,1 m         | 819,9 px       | 0,2331 m/px |

Écart maximal entre paires : **0,5 %**. Taille du plan déduite : **281,7 × 336,8 m**, soit
0,2328 m/px en largeur et 0,2344 m/px en hauteur — cohérent à 0,7 % près avec le rapport de
l'image, donc **pas de distorsion** de calage. Nord de l'image : **0,17°** (le plan est au
nord). `assessAnchorsGeoPlausibility` : `ok`, aplatissement 0,65, ratio d'échelles 1,13.

**Ce qui en découle est juste**, position simulée au cœur du lycée : point bleu posé, distances
annoncées dans la liste (« Sanitaires 92 m / 93 m / 98 m / 100 m », « Sanitaires du collège
78 m », « Fontaine à eau 37 m »), ligne directe « Y aller » tracée, bouton passant à « Suivre ma
position ». **Si la navigation sur le terrain déçoit, ce n'est pas le calage** — c'est B1 et B2.

**Les correctifs d'hier tiennent.** Vérifiés sur le bundle déployé :

| Constat d'hier                        | Vérification d'aujourd'hui                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| N1 recherche neutralisée              | frappe réelle : le focus **reste** au champ, `#root` n'est pas `inert`, la valeur s'inscrit                           |
| N2 `inert` sur la carte               | aucun `inert` posé, surcouche `--pass-through`                                                                        |
| N3 entrées hors du plan               | « entrée » → les 5 vraies entrées **en tête** dès le premier lancement                                                |
| N16 fermer une fiche quittait le plan | 4 retours navigateur enchaînés : filtres → fiche → plan nu → sortie normale, jamais de saut                           |
| liens profonds                        | `?lieu=` ouvre la fiche ; `?parcours=` valide démarre ; `?parcours=` inconnu → « Ce parcours n'est plus disponible. » |
| poste fixe 1280 × 800                 | feuille en panneau centré (`wideAsDialog`), frappe clavier opérante, 3 résultats sur « cdi »                          |

---

## 6. Pourquoi le filet n'a rien vu

- **716 tests Vitest passent** (87 fichiers, `tests-ui/**`). Ils ne pouvaient pas voir ces
  constats : jsdom n'a **pas de mise en page** — pas de `getBoundingClientRect` utile, pas
  d'`elementFromPoint`. Un recouvrement est invisible par construction ;
- **l'e2e vérifie la mauvaise chose.** `e2e/plan-mobile-shell.spec.js:42` et `:91` affirment
  `expect(page.getByRole('button', { name: /Voir tout le plan/ })).toBeVisible()`. Or
  `toBeVisible()` de Playwright teste la visibilité **CSS** et une boîte non vide : un bouton
  **recouvert** reste « visible ». C'est précisément le bouton de B1.

**Ce qu'il faudrait ajouter** (un seul patron couvre B1, B3 et G1) : pour chaque commande
superposée à la carte, feuille ouverte, asserter que `document.elementFromPoint(centre)`
appartient au bouton, **et** faire un `click()` sans `force` — un clic Playwright échoue quand
la cible est interceptée, c'est exactement le filet manquant. Pour B2, asserter que le lieu
`.is-active` a son centre **au-dessus** du haut de la feuille.

---

## 7. Correctifs proposés, par ordre de valeur

| #   | Constat | Nature du correctif                                                                                    | Ampleur           |
| --- | ------- | ------------------------------------------------------------------------------------------------------ | ----------------- |
| 1   | **B1**  | borner la remontée par le **haut réel disponible** au lieu de `30dvh`, ou replier la colonne en rangée | CSS + 1 mesure    |
| 2   | **B2**  | passer `focusInsets` dès qu'une feuille est ouverte ; autoriser une échelle cible au recentrage        | 1 prop + 1 option |
| 3   | **B3**  | remonter la barre de parcours au-dessus de la feuille, ou ouvrir la fiche « consultée » au cran `peek` | CSS ou 1 prop     |
| 4   | **G1**  | déplacer `.plan-welcome` sous la barre haute (parent `.plan-main` ou `top` décalé)                     | CSS               |
| 5   | **G3**  | recentrer un lieu groupé avec `clusterZoomTargetScale`                                                 | 1 option          |
| 6   | **G2**  | réponse visible au glissement au cadrage d'ouverture                                                   | réglage           |
| 7   | **G4**  | plancher de pertinence sur `searchPlaces` (score minimal et/ou écart au meilleur)                      | ~10 lignes        |
| 8   | **G5**  | réduire la rangée de puces à ce qui tient, le reste dans la feuille « Filtres »                        | CSS + rendu       |
|     | données | compléter le parcours _Faire le tour du lycée_ ; distinguer les homonymes ; supprimer la « (copie) »   | contenu           |

Aucun de ces correctifs ne change une règle métier : ce sont des questions de **place à
l'écran** et de **seuil**.

---

## 8. Reproduire les mesures

1. `npm run build` puis servir `dist/` avec `plan.html` en entrée, `/api/plan/content` renvoyant
   la charge publique (`curl https://planlyautey.olution.info/api/plan/content`) et
   `/uploads/maps/lyautey-*.jpg` le fond de plan téléchargé ;
2. piloter ce serveur avec Chromium en profil iPhone 13 (390 × 664, tactile, `fr-FR`), en
   posant `localStorage['plan:welcome-seen']` pour les scénarios hors première visite ;
3. pour chaque cible, relever `getBoundingClientRect`, puis
   `document.elementFromPoint(cx, cy)` — et confirmer par un `click()` **sans** `force` ;
4. pour la position : accorder `geolocation` et poser 33,59595 / −7,63480 ;
5. neutraliser `POST /api/usage` pour ne pas polluer les compteurs de production.

Les captures d'écran de la session (bandeau d'accueil, commandes sous la feuille, barre de
parcours recouverte, lieu caché) ne sont pas versionnées : elles se régénèrent par la procédure
ci-dessus.
