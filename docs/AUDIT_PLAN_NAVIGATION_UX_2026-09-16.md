# Audit UI/UX — la navigation sur `planlyautey.olution.info` (16 septembre 2026)

> **Statut : audit, sans aucune modification du code produit.** Relevé fait sur la tête de
> `main` (`package.json` 1.157.20, commit `409002e`) **confronté à la production** :
> la charge publique réelle (`GET https://planlyautey.olution.info/api/plan/content`,
> 78 lieux, 11 catégories, 1 parcours) a été rejouée dans un navigateur pilotant **le bundle
> effectivement déployé** — les empreintes des assets de `https://planlyautey.olution.info/`
> et celles de `dist/` après `npm run build` sont identiques (`plan-8tIJq_95.js`,
> `plan-Dz74fINa.css`, treize fichiers sur treize). Ce qui est mesuré ici est donc ce que voit
> un visiteur aujourd'hui, pas une approximation.
>
> **Objet.** « Naviguer » a deux sens pour ce produit, et les deux sont audités : **naviguer
> dans l'interface** (trouver, chercher, filtrer, ouvrir une fiche, revenir) et **naviguer
> dans les lieux** (se repérer, viser une destination, suivre un parcours). Chaque constat
> porte une référence `fichier:ligne` et une mesure reproductible (§10).
>
> **Suite donnée (même lot).** Les quinze constats ont été corrigés dans la foulée, et un
> seizième — plus grave — a été découvert en vérifiant les correctifs : fermer la fiche d'un
> lieu ouvert depuis les résultats **quittait le plan** (N16). Le détail constat par constat
> est en §11 ; chaque constat traité porte la mention **« Traité »** sans que son relevé
> d'origine soit modifié. Les mesures d'après-correctif ont été refaites dans le même
> navigateur, sur le même profil d'appareil et la même charge publique.
>
> **Contexte.** Troisième relevé sur ce produit, après
> [`AUDIT_PLAN_AFFICHAGE_2026-09.md`](AUDIT_PLAN_AFFICHAGE_2026-09.md) (4 sept.) et
> [`AUDIT_PLAN_AFFICHAGE_2026-09-13.md`](AUDIT_PLAN_AFFICHAGE_2026-09-13.md) (13 sept.), qui
> portaient sur **l'affichage**. Celui-ci porte sur **la navigation**, et il trouve la maison
> ouverte : la barre de recherche, cœur du produit, n'accepte plus une seule lettre.

---

## 1. En une page

**La recherche est inutilisable sur un téléphone, et c'est la fonction principale du plan.**
Toucher le champ ouvre la feuille de résultats ; cette feuille est **modale** : elle pose
`inert` sur toute l'application (barre haute comprise) et déplace le focus sur son bouton
« Fermer ». Le clavier s'ouvre, puis le champ est neutralisé. Mesuré : après un tap suivi de
la frappe de « cdi », **la valeur du champ est vide** et la liste affiche les 40 premiers
lieux, non filtrés. Un second tap sur le champ ne le reprend pas : il touche la surcouche,
qui referme la feuille. Au clavier, la première tabulation produit exactement le même piège.
Ce n'est pas une gêne, c'est un mur : **il n'existe aujourd'hui aucun moyen de chercher un
lieu sur `planlyautey.olution.info`** autre que de le repérer à l'œil sur la carte (N1).

**Le même mécanisme gèle le plan dès qu'une fiche s'ouvre.** Un voile sombre à 52 % couvre
l'écran entier, la carte devient `inert`, le défilement du corps est verrouillé et les
commandes de zoom passent sous la feuille. La bande de carte encore visible (288 px sur 664)
n'est plus une carte : c'est un grand bouton « fermer ». L'aide du produit promet pourtant
qu'« au cran bas, le plan reste visible derrière » — il est visible, mais mort (N2).

**Sur un plan dont la première question est « par où j'entre ? », les entrées sont hors du
plan par défaut.** Neuf lieux de production n'ont aucune catégorie — dont _Entrée collège —
rue Réunion_, _Entrée élèves — 2nd cycle_, _Entrée parking — rue d'Indochine_, _Loge — entrée
des visiteurs_ et _Vers Beaulieu_. Le filtre par défaut de l'établissement (six catégories)
les retire de la carte **et de l'index de recherche**, qui est construit sur la liste déjà
filtrée. Mesuré : taper « entrée » au premier lancement renvoie **une seule vraie entrée**
(la porte latérale _Delacroix_) noyée dans dix résultats hors sujet ; après avoir touché
« Tout », les cinq apparaissent (N3). Le constat N2 du 13 septembre disait que les entrées
étaient au dernier rang d'affichage ; neuf jours plus tard, elles ne sont plus affichées du
tout.

**Le reste est du même ordre :** la fiche d'un lieu s'ouvre sur **12 px de contenu**
(199 px de feuille, dont 36 de poignée, 56 d'en-tête et 104 de pied) pour 745 px de texte
(N4) ; le mode parcours neutralise silencieusement la carte **et** la recherche (N5) ; onze
puces de catégories sur treize sont hors écran, sur une rangée cinq fois plus large que le
téléphone, y compris celle qui porte 31 lieux (N6) ; le bandeau d'accueil de la première
visite recouvre le bouton « Voir tout le plan », c'est-à-dire la sortie de secours (N7) ;
« wc », « toilettes », « cantine », « bibliothèque », « gymnase » et « parking » ne renvoient
rien, alors que l'aide promet noir sur blanc que « bibliothèque » trouve le CDI — **aucun des
78 lieux ne porte le moindre alias** (N8).

**Pourquoi rien n'a sonné.** Le scénario e2e du plan tape sa recherche avec `fill()`, qui
n'échoue pas mais ne remplit rien non plus ; le test passe parce qu'il cherche ensuite son
lieu **dans la liste non filtrée** qui s'affiche justement quand la saisie est vide. Les
tests Vitest, eux, appellent `fireEvent.change` sur le champ : jsdom ignore `inert`. Les deux
filets miment un utilisateur qui n'existe pas (§8).

**Ordre de traitement :** N1 (deux props, quelques lignes) → N2 (même correctif) → N3
(donnée + une ligne d'index) → N4 → N5 → N6 → N7 → N8. Les trois premiers rendent le produit
utilisable ; les autres le rendent bon.

---

## 2. Périmètre et méthode

| Élément         | Valeur relevée                                                                                                                                             |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hôte audité     | `https://planlyautey.olution.info`                                                                                                                         |
| Bundle servi    | `/assets/plan-8tIJq_95.js` — **identique** au `dist/` produit par `npm run build` sur `409002e`                                                            |
| Charge publique | `GET /api/plan/content` → 36 zones + 42 repères = **78 lieux**, 11 catégories, 1 parcours publié                                                           |
| Appareil simulé | iPhone 13 (390 × 664 px utiles, `devicePixelRatio` 3), locale `fr-FR`, Chromium 1194                                                                       |
| Comparaison     | 1280 × 800 (poste fixe) pour le mode `wideAsDialog`                                                                                                        |
| Non couvert     | l'installation PWA et le hors-ligne (audités ailleurs), la qualité du fond de plan, la licence du fond (§8.2 de l'audit de cadrage), la performance réseau |

Le contenu de production a été rejoué localement (même JSON, même image de fond) pour pouvoir
**mesurer** dans le navigateur — géométries, éléments réellement touchés sous le doigt, ordre
de tabulation — plutôt que de déduire du CSS. Chaque mesure est reproductible : §10.

---

## 3. Constats bloquants

### N1 — Toucher la recherche rend la recherche impossible (bloquant)

**Ce qui se passe.** `PlanTopBar` ouvre la feuille de résultats sur le `focus` du champ
(`src/plan/components/PlanTopBar.jsx:49` → `src/plan/AppPlan.jsx:549`). Cette feuille est une
`BottomSheet` montée **sans** `blockBackground` (`src/plan/components/PlanResultsSheet.jsx:30-42`),
donc avec la valeur par défaut `true` (`src/shared/ui/BottomSheet.jsx:340`). Deux effets se
déclenchent alors :

1. `useInertSiblings` pose l'attribut `inert` sur **tous les enfants directs de `body`** autres
   que la surcouche (`src/shared/ui/BottomSheet.jsx:53-70`, appelé ligne 114). Le seul enfant
   concerné est `#root`, qui contient la barre haute : le champ de recherche devient
   non focusable et non éditable ;
2. `useDialogA11y` déplace le focus sur le premier élément focusable de la feuille
   (`src/shared/platform/useDialogA11y.js:26-30`), soit le bouton « Fermer les résultats ».

**Mesure.** Sur le bundle de production, appareil iPhone 13 :

| Geste                     | Résultat mesuré                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| Tap sur le champ          | feuille ouverte, `#root[inert]`, focus sur `button.fm-bottom-sheet__close`                    |
| Frappe de « cdi »         | **valeur du champ : `""`** — 40 résultats, liste non filtrée                                  |
| Second tap sur le champ   | l'élément sous le doigt est `div.fm-bottom-sheet-overlay` → la feuille se **referme**         |
| 1ʳᵉ tabulation au clavier | même piège : focus arraché vers « Fermer les résultats »                                      |
| Échap                     | feuille fermée, focus rendu au `body` (pas au champ) ; la tabulation suivante rouvre le piège |

À l'écran (capture de la session d'audit, non versionnée) : le champ porte encore son texte
d'invite « Rechercher un lieu… » après la frappe, toute la barre haute est grisée par le
voile, et l'anneau de focus est posé sur la croix de la feuille.

**Conséquence.** La recherche est la fonction que le produit met en premier (« Pas de menu,
pas de connexion : le plan n'a qu'une seule chose à faire », `PlanTopBar.jsx:5-6`). Elle est
inopérante pour **tout** visiteur : doigt ou clavier, mobile ou poste fixe. Le compteur
d'usage le dit à sa façon : les événements `search` remontés
(`src/plan/AppPlan.jsx:272-284`) ne peuvent plus provenir que d'un lien profond.

**Correction proposée (minimale).**

- `PlanResultsSheet` et `PlanPlaceSheet` : passer `blockBackground={false}` — la surcouche
  devient traversante (`--pass-through`, `src/shared/styles/bottom-sheet.css:40-48`), plus
  d'`inert`, plus de verrou de défilement ;
- `BottomSheet` : ne pas prendre le focus initial quand `blockBackground` est faux (ajouter un
  paramètre à `useDialogA11y`, par exemple `autoFocus`) — une feuille non modale ne doit pas
  voler le curseur d'un champ resté actif derrière elle ; garder Échap et le retour navigateur ;
- laisser `closeOnOverlay` à `true` **uniquement** si la surcouche ne capte plus les gestes,
  sinon la carte redevient un bouton « fermer » (N2).

Coût estimé : deux props et une garde. Le reste du kit (crans, glisser, historique) est déjà
correct.

### N2 — Une fiche ouverte gèle le plan (majeur)

Même racine que N1, conséquence distincte. Avec une fiche ouverte au cran d'ouverture :

| Mesure                                              | Valeur                                             |
| --------------------------------------------------- | -------------------------------------------------- |
| Voile sur l'écran entier                            | `rgba(12, 30, 20, 0.52)`, `pointer-events: auto`   |
| `#root`                                             | `inert`                                            |
| `body`                                              | `overflow: hidden`                                 |
| Bande de carte visible                              | 177 → 465 px, soit **288 px sur 664**              |
| Élément touché au milieu de cette bande             | `div.fm-bottom-sheet-overlay` → **ferme la fiche** |
| Commandes de zoom (`+`, `−`, « Voir tout le plan ») | sous la feuille, à partir de y = 500 px            |

Sur un plan, le geste naturel après avoir ouvert une fiche est de **regarder autour** :
glisser pour voir la rue d'à côté, pincer pour situer le bâtiment. Ici, glisser ne fait rien
et toucher referme. L'aide affirme l'inverse (« au cran bas, le plan reste visible derrière »,
`src/plan/components/PlanHelp.jsx:46-49`) : la promesse est tenue au pixel près et trahie au
doigt. Le mode parcours, lui, a déjà le bon comportement — sa barre est une `aside` posée en
`z-index: calc(var(--fm-z-modal) - 1)` qui laisse la carte vivante
(`src/plan/styles/plan.css:396-402`) : c'est le modèle à suivre pour les deux feuilles.

### N3 — Les entrées du lycée sont invisibles au premier lancement (majeur)

`filterPlacesByCategories` retire les lieux qui ne portent **aucune** des catégories cochées,
et l'index de recherche est construit sur cette liste déjà filtrée
(`src/plan/AppPlan.jsx:167-186`). Or la charge de production contient **neuf lieux sans
aucune catégorie** :

> Bât.G · Caisse · **Entrée collège — rue Réunion** · **Entrée élèves — 2nd cycle** ·
> **Entrée parking — rue d'Indochine** · **Loge — entrée des visiteurs** · Magasin — service
> intérieur · **Vers Beaulieu** · Zone téléphone

Le réglage d'établissement `default_category_ids` en coche six au premier lancement. Résultat
mesuré :

| Saisie     | Filtre par défaut                                     | Après « Tout »                          |
| ---------- | ----------------------------------------------------- | --------------------------------------- |
| « entrée » | 11 résultats, **1 seule entrée** (_Entrée Delacroix_) | 20 résultats, **les 5 entrées en tête** |
| « loge »   | 2 résultats, aucun n'est la loge                      | la loge en premier                      |

51 lieux sur 78 passent le filtre par défaut : **27 lieux sont hors du produit** tant que le
visiteur n'a pas trouvé la puce « Tout » — qui, elle, est visible (N6 dit que les autres ne le
sont pas). Un parent qui arrive rue de la Réunion et cherche par où entrer ne trouve donc pas
l'entrée du collège, et rien ne lui indique qu'un filtre est en cause.

Trois correctifs possibles, du moins au plus structurant :

1. **donnée** : rattacher les entrées à une catégorie d'audience (10 min côté admin) — soulage
   le symptôme, pas la cause ;
2. **index** : construire `searchIndex` sur `places` (tous les lieux) plutôt que sur
   `filteredPlaces`, et signaler dans la liste les résultats masqués par le filtre courant
   (« masqué par vos filtres — afficher ») ;
3. **règle** : traiter « sans catégorie » comme « toujours visible », comme le fait déjà
   `MapCategoryChips` pour ne pas proposer une puce vide
   (`src/shared/map-discover/MapCategoryChips.jsx:28-33`).

La recommandation est **2 + 1** : chercher doit toujours trouver, un filtre ne doit jamais
faire disparaître un lieu **de la recherche**, seulement de la carte.

---

## 4. Constats majeurs de parcours

### N4 — La fiche d'un lieu s'ouvre sur 12 px de contenu

`PlanPlaceSheet` ouvre au cran `peek` (`src/plan/components/PlanPlaceSheet.jsx:57`), soit
30 dvh. Anatomie mesurée sur iPhone 13 :

| Bloc                                        | Hauteur                           |
| ------------------------------------------- | --------------------------------- |
| Feuille                                     | 199 px                            |
| Poignée                                     | 36 px                             |
| En-tête (titre + fermer)                    | 56 px                             |
| Pied (« Y aller » + phrase d'avertissement) | 104 px                            |
| **Corps visible**                           | **12 px** (contenu réel : 745 px) |

À l'écran, la fiche « Infirmerie » montre son titre, une rangée de catégories **coupée en deux
dans la hauteur**, et rien d'autre : ni l'horaire (« présence
assurée en continu de 7 h 50 à 18 h 00 »), ni l'emplacement (« au-dessus de la salle des
professeurs »), qui sont exactement ce qu'on vient chercher. Le pied occupe cinq fois le corps.

Correctifs : ouvrir au cran `half` comme la feuille de résultats ; ou réduire le pied (la
phrase « Direction à vol d'oiseau… » a sa place dans l'aide, pas sous chaque bouton) ; ou
afficher l'accroche dans l'en-tête, visible dès le cran bas.

### N5 — Le mode parcours neutralise la carte et la recherche, sans le dire

Pendant un parcours, `AppPlan` remplace le gestionnaire de tap de la carte par une fonction
vide, supprime l'ouverture des groupes et empêche l'affichage de toute fiche
(`src/plan/AppPlan.jsx:594-595` et `675`). Mesuré :

- tap sur n'importe quel lieu de la carte : **aucun effet, aucun retour** — ni fiche, ni toast,
  ni mise en avant ;
- recherche pendant un parcours : la frappe fonctionne (la feuille de résultats ne s'ouvre pas
  ici sur le focus puisque la barre de parcours n'est pas modale), **2 résultats** pour « cdi » —
  mais toucher un résultat ne fait rien non plus : la fiche est supprimée et l'étape courante
  reprend immédiatement la sélection.

Autrement dit, le visiteur qui suit un parcours et veut vérifier où sont les toilettes doit
d'abord comprendre qu'il faut **quitter** le parcours. L'intention (ne pas perdre le fil) est
juste ; son exécution est muette. Deux sorties possibles : autoriser la fiche en lecture
pendant un parcours (avec un bouton « revenir à l'étape »), ou, a minima, répondre au tap par
un toast « Vous suivez un parcours — quittez-le pour explorer ».

### N6 — Onze puces de filtre sur treize sont hors de l'écran

| Mesure                                       | Valeur                                            |
| -------------------------------------------- | ------------------------------------------------- |
| Largeur de la rangée de puces                | **1 935 px** pour un écran de 390 px (≈ 5 écrans) |
| Puces entièrement visibles                   | **3 sur 13** (« Parcours », « Tout », « Elèves ») |
| Position de « 🏗️ Infrastructure » (31 lieux) | x = 1 750 px                                      |
| Catégories cochées au premier lancement      | 6, dont **4 hors écran**                          |
| Sur poste fixe 1280 px                       | la rangée déborde encore (2 045 px)               |

Rien n'indique qu'une sélection est active : la puce « Tout » est simplement en état non
pressé. Le visiteur voit donc un plan amputé de 27 lieux (N3) sans le moindre signal, et la
commande qui le lui expliquerait est à quatre écrans de défilement horizontal. Les puces
elles-mêmes sont correctes (44 px de haut, pastille de couleur faisant légende) : c'est le
**contenant** qui ne tient pas. Une piste éprouvée : un bouton « Filtres (6) » qui ouvre une
feuille de cases à cocher, en gardant deux ou trois puces de raccourci.

### N7 — Le bandeau d'accueil recouvre « Voir tout le plan »

Au premier lancement, `plan-welcome` est posé en bas d'écran (x = 12, y = 580, 366 × 68 px,
`z-index: 4`, `src/plan/styles/plan.css:650-664`). Mesuré par `elementFromPoint` sur chacune
des cinq commandes de carte : quatre répondent, la cinquième — **« Voir tout le plan »** —
renvoie `button.plan-welcome__close`. La commande qui rattrape un visiteur perdu dans le zoom
est donc masquée précisément pendant sa première visite. Le bandeau chevauche par ailleurs la
carte d'échelle et la rose des vents en bas à gauche : à l'écran, la phrase « Touchez un lieu,
ou cherchez-le. » y est coupée par la carte d'échelle.

### N8 — La recherche ne connaît aucun synonyme, et ne dit pas pourquoi elle répond

Le moteur (`src/shared/search/placeSearch.js`) est bon : insensible à la casse et aux accents
(« entree » = « entrée », vérifié), pondéré par champ, tous les mots exigés. Mais :

- **aucun des 78 lieux n'a d'alias** (`search_aliases` vide partout dans la charge de
  production), alors que le champ existe, qu'il pèse 70 au classement, et que l'aide du produit
  promet explicitement : « Les autres noms d'un lieu fonctionnent aussi (« bibliothèque » trouve
  le CDI) » (`src/plan/components/PlanHelp.jsx:37-40`). Mesuré : « bibliotheque » → **0 résultat**.
- Le vocabulaire du visiteur n'est pas celui de l'administration. Mesuré, avec le filtre par
  défaut : « wc » → 0, « toilettes » → 0 (les lieux s'appellent _Sanitaires_), « cantine » → 0
  (_Cafétéria et restauration scolaire_), « gymnase » → 0, « parking » → 0, « salle 12 » → 0.
- À l'inverse, les descriptions sont indexées (`src/shared/search/placeSearch.js:86-88`, poids 15) : « entrée »
  remonte _Cafétéria_, _CDI_, _DAE_, _Bât.D_… parce que le mot figure dans leur description.
  `searchPlaces` renvoie pourtant `matchedFields` — la feuille de résultats ne s'en sert pas
  (`src/plan/components/PlanResultsSheet.jsx:66-88`), donc rien n'explique la présence d'un
  résultat.

Correctifs : une passe d'alias côté données (30 termes couvrent l'essentiel : wc, toilettes,
cantine, self, bibliothèque, CDI, gymnase, parking, secrétariat, vie sco…), et l'affichage
discret du champ ayant produit la correspondance quand ce n'est ni le nom ni un alias.

---

## 5. Constats moyens

### N9 — « Tous les lieux » n'est ni « tous », ni signalé comme tronqué

`RESULTS_LIMIT` vaut 40 (`src/plan/AppPlan.jsx:52`) et la liste sans saisie affiche les
40 premiers lieux **du filtre courant** sous le titre « Tous les lieux »
(`src/plan/components/PlanResultsSheet.jsx:35`). En production : 78 lieux, 51 après le filtre
par défaut, **40 affichés**. Onze lieux manquent sans un mot, et le titre affirme le
contraire. Le commentaire du code assume la limite (« au-delà, affiner la recherche est plus
rapide que défiler ») : il manque juste de le dire à l'écran, et d'accorder le titre au filtre
(« 40 lieux sur 51 · filtre actif »).

### N10 — Des lieux rigoureusement indiscernables dans la liste

Relevé dans la charge de production : **4 × « Sanitaires »**, **3 × « Fontaine à eau »**,
**2 × « DAE »**, **2 × « Salle de rendez-vous parents »**, **2 × « Table d'échecs »**, plus un
**« Point de nourrissage des chats (copie) »** — un doublon de saisie resté publié. Le
correctif du 13 septembre (distance à vol d'oiseau dans le bouton,
`src/plan/components/PlanResultsSheet.jsx:55-65`) ne les sépare **que si la position est
active** : sans GPS, ou avant l'autorisation, les quatre « Sanitaires » restent quatre lignes
identiques. Une mention de contexte (bâtiment, étage) dans `visit_subtitle` — vide sur les
42 repères — réglerait le cas pour tout le monde.

### N11 — Un nom de lieu sur trois est tronqué au cadrage d'ouverture

Mesuré au chargement (`scrollWidth > clientWidth`) : **14 étiquettes sur 43** sont coupées,
dont « CDI — Centre de documentation et d'information », « Cafétéria et restauration
scolaire », « Vie scolaire du collège », « Salle Delacroix », « n³ — salle aérée (Nature,
Numérique, Nomade) ». La largeur maximale est plafonnée à 168 px pour une zone
(`src/shared/pct-map/pctMapLabels.js:52`). Le plafond protège la lisibilité de la carte, et
c'est un bon arbitrage ; mais « Sanitair… » et « Salle de rendez-v… » n'aident personne. Piste :
un nom d'affichage court (`map_label`) distinct du nom complet, comme le font les cartes web.

### N12 — Des zones se touchent en dessous de 44 px

Les zones sont des polygones SVG focusables ; leur boîte réelle, au cadrage d'ouverture,
descend très bas : « Bât.P est » **13 × 25 px**, « Bât.K — SNT et NSI » **28 × 14 px**,
« Bât.I — Intendance et services » **19 × 98 px**, « Bât.D — collège » 54 × 19 px. La règle
maison est pourtant « cibles tactiles ≥ 44 px » (CLAUDE.md, `--tap-target: 44px` défini en
tête de `plan.css`) et elle est tenue partout ailleurs (puces, commandes, aide : 44 px pile).
C'est sur la carte — le seul endroit où l'on pointe vraiment au pouce — qu'elle ne l'est pas.
Le regroupement en pastilles chiffrées traite les repères trop proches, pas les petites zones.

### N13 — Le seul parcours publié n'a qu'une étape (déjà signalé le 13 septembre)

La puce annonce « Parcours 1 » et le parcours _Faire le tour du lycée_ (audience : « Nouveaux
professeurs ») contient **une seule étape** — le CDI. Une fois lancé : une barre de 206 px
occupe le bas de l'écran, « Étape 1 sur 1 », et **les deux boutons « Précédent » et
« Suivant » sont désactivés**. Le mécanisme est sain (`MapRoutePicker` refuse déjà les
parcours sans étape) ; c'est le contenu qui est resté en brouillon depuis neuf jours. Tant
qu'il l'est, la puce coûte 96 px de la rangée de filtres (N6) pour une impasse.

### N14 — La marque du produit s'arrête au bord des feuilles

Le plan est marine (`--plan-navy: #183058`) et l'override existe
(`.plan-shell .shared-btn--primary`, `src/plan/styles/plan.css:62-65`). Mais les feuilles sont
montées **en portail sous `body`** (`src/shared/ui/BottomSheet.jsx:232`), donc **hors de
`.plan-shell`** : le sélecteur ne s'applique pas. Mesuré : le bouton « Y aller » est
`rgb(26, 71, 49)` — le vert forêt de ForetMap — sous une barre haute `rgb(24, 48, 88)`. Le
même raisonnement vaut pour le thème d'établissement du lot 7 (`brandStyle` est posé sur
`.plan-shell`, `src/plan/AppPlan.jsx:543`) : **une identité visuelle configurée ne descendra
jamais dans les feuilles**. Correctif : poser les variables de marque sur `:root` (ou sur le
portail) plutôt que sur la coquille.

### N15 — Parcours au clavier : 44 formes SVG avant la première commande

Hors du piège N1, l'ordre de tabulation suit le DOM : barre haute, puces, puis **44 formes de
carte focusables**, puis seulement les commandes de zoom et de localisation. Un utilisateur au
clavier ou au commutateur traverse tout le lycée avant d'atteindre « Voir tout le plan ». Par
ailleurs, Échap rend le focus au `body` et non au champ d'origine
(`src/shared/platform/useDialogA11y.js:61-64` restaure `previousActive`, qui est déjà perdu quand `inert` est
passé par là). Pistes : sortir les commandes de carte avant le calque des lieux dans le DOM
(elles sont déjà positionnées en absolu), et un lien d'évitement « Aller aux commandes de la
carte ».

---

## 6. Ce qui fonctionne, et qu'il faut garder

Le produit n'est pas mal conçu : il est cassé à un endroit précis, et ce qui l'entoure est
soigné.

- **Le retour navigateur est exemplaire.** Chaque surcouche empile une entrée d'historique
  (`useOverlayHistoryBack`), le retour Android/Safari referme la feuille au lieu de quitter le
  plan, et `?lieu=` est réaffirmé après coup — un bug subtil, déjà trouvé et corrigé, documenté
  en douze lignes de commentaire (`src/plan/AppPlan.jsx:229-259`, effet lignes 246-259). Mesuré : retour → fiche
  fermée, adresse nettoyée.
- **Les liens profonds tiennent.** `?lieu=<id>` ouvre la bonne fiche même quand le lieu est
  masqué par le filtre courant (vérifié sur le CDI) ; `?parcours=<slug>` inconnu **le dit** au
  lieu de laisser un plan nu. C'est exactement ce qu'il faut pour des QR codes imprimés.
- **Les états de position sont traités avec soin** : six retours possibles, tous en toast
  discret, aucun bandeau permanent. Refus de géolocalisation → « Localisation refusée.
  Autorisez l'accès à votre position dans le navigateur. » (mesuré).
- **L'honnêteté de « Y aller »** : ligne droite et distance à vol d'oiseau, dit deux fois
  plutôt qu'un itinéraire inventé. C'est le bon arbitrage pour un plan qui ne connaît pas les
  chemins.
- **Le mode parcours ne bloque pas la carte** (barre `aside` sous le niveau modal) : c'est le
  modèle que les deux feuilles devraient suivre (N2).
- **La sortie de parcours est rattrapable** : « Reprendre le parcours » + toast explicatif.
- **Le kit de feuille basse est solide** : crans, glisser avec inertie, aimantation,
  `prefers-reduced-motion`, mode panneau centré au-delà de 1024 px (vérifié : 560 × 680 px
  centré). Tout cela est juste — c'est la modalité par défaut qui ne convient pas à une carte.

---

## 7. Parcours mesurés, bout en bout

**Un parent arrive rue de la Réunion et cherche l'entrée du collège.** Il ouvre le plan,
touche la loupe, tape « entrée » : rien ne s'écrit (N1). Il abandonne la recherche et lit la
carte ; l'entrée du collège n'y est pas (N3). Il ne verra pas non plus la puce qui la
ramènerait : elle est à quatre écrans (N6). **Échec.**

**Un nouveau professeur cherche l'infirmerie.** Il la trouve à l'œil sur la carte (le repère
⛑️ est dans un groupe « 2 »), ouvre la pastille, touche la fiche : titre, catégories coupées
en deux, « Y aller » (N4). Les horaires sont à un glisser vers le haut — geste que rien
n'annonce hormis une poignée de 44 × 5 px. S'il veut vérifier où c'est par rapport à la salle
des profs, il doit fermer la fiche : la carte est gelée (N2). **Réussite au prix de trois
gestes non évidents.**

**Un élève suit le parcours « Faire le tour du lycée ».** La barre lui annonce « Étape 1 sur
1 », les deux boutons de navigation sont grisés (N13). Il touche un bâtiment voisin par
curiosité : rien (N5). **Impasse.**

---

## 8. Pourquoi les filets n'ont rien vu — et comment les refermer

| Filet                                                 | Ce qu'il fait                                              | Pourquoi N1 lui échappe                                                                                                                                                                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/plan-mobile-shell.spec.js:46`                    | `search.fill(name)` puis clique le résultat portant ce nom | `fill()` ne remplit rien (le champ est déjà `inert` quand l'insertion a lieu) — **mesuré : valeur vide, 40 résultats**. Le test passe quand même : la liste sans saisie affiche « Tous les lieux », et le lieu cherché (`places[0]`) s'y trouve |
| `tests-ui/plan/AppPlanMount.test.jsx:152` et suivants | `fireEvent.change` sur le champ                            | jsdom n'implémente pas `inert` et l'événement est posé directement : la saisie « réussit » toujours                                                                                                                                             |
| `tests-ui/plan/PlanResultsSheet.test.jsx`             | rend la feuille isolément                                  | ne monte jamais la barre haute : le conflit n'existe pas dans ce montage                                                                                                                                                                        |

**Trois tests à ajouter dans le même lot que le correctif :**

1. **e2e — la frappe réelle.** `await search.click(); await search.pressSequentially('CDI');`
   puis `await expect(results.getByRole('heading', { name: /Résultats \(/ })).toBeVisible();`
   Le titre « Résultats (n) » est le seul marqueur qui distingue une saisie prise en compte de
   la liste par défaut ; l'assertion actuelle, fondée sur la présence d'un bouton, ne le fait pas.
2. **e2e — la carte reste vivante.** Fiche ouverte, un glisser sur la bande de carte visible
   doit modifier la transformation du calque `.plan-map__world` et **ne pas** fermer la fiche.
3. **Vitest — pas de vol de focus.** Monter `AppPlan`, `fireEvent.focus` sur le champ, vérifier
   que `document.activeElement` est toujours le champ après l'ouverture de la feuille.

Un contrôle de contenu (`tests/content/`) vaut aussi pour N3 et N8 : « tout lieu dont le nom
commence par _Entrée_ porte au moins une catégorie » et « les termes d'usage courant
(wc, toilettes, cantine…) trouvent au moins un lieu ».

---

## 9. Ordre de traitement

| #   | Constat                                     | Effet                                     | Coût estimé                        |
| --- | ------------------------------------------- | ----------------------------------------- | ---------------------------------- |
| 1   | **N1** — recherche neutralisée              | rend le produit utilisable                | 2 props + 1 garde de focus         |
| 2   | **N2** — carte gelée sous une fiche         | même correctif que N1                     | inclus                             |
| 3   | **N3** — entrées hors du plan               | rend le plan utile à son public principal | 1 ligne (index) + passe de données |
| 4   | **N4** — fiche à 12 px                      | rend les fiches lisibles                  | 1 prop (`initialSnap`)             |
| 5   | **N5** — parcours muet                      | supprime une impasse                      | 1 toast, ou fiche en lecture       |
| 6   | **N6** — filtres hors écran                 | rend le filtrage compréhensible           | ½ journée (feuille de filtres)     |
| 7   | **N7** — accueil sur la commande de secours | 1 règle CSS                               | 10 min                             |
| 8   | **N8** — vocabulaire du visiteur            | qualité de la recherche                   | passe de données + 1 affichage     |
| 9   | N9 → N15                                    | finitions                                 | à planifier                        |

Les huit premiers points tiennent dans un lot de correction ; N6 et N8 méritent le leur.

---

## 10. Annexe — mesures brutes et reproduction

**Confrontation production ↔ dépôt.** Les treize assets référencés par
`https://planlyautey.olution.info/` portent les mêmes empreintes que `dist/` après
`npm run build` sur `409002e` (`plan-8tIJq_95.js`, `plan-Dz74fINa.css`, `placeSearch-BCSeYLu5.js`,
`planPlaces-Bjd7MJgc.js`, `react-vendor-ClBrELym.js`…). Le front audité est celui de production.

**Charge publique du jour** (`GET /api/plan/content`) : 36 zones, 42 repères, 11 catégories,
1 parcours publié (1 étape), 6 catégories cochées par défaut, 9 lieux sans catégorie,
**0 lieu avec alias de recherche**, 4 zones sur 36 avec sous-titre et **0 repère sur 42**.

**Reproduction.** Rejouer la charge publique sur un serveur statique servant `dist/plan.html`
(réponses `/api/plan/content` et `/uploads/*` figées), puis piloter Chromium en profil
iPhone 13. Les mesures citées sont obtenues par `getBoundingClientRect`,
`document.elementFromPoint`, `getComputedStyle` et lecture de `document.activeElement` après
chaque geste — jamais par lecture du CSS seul.

**Captures** (profil iPhone 13, 390 × 664, non versionnées — elles accompagnent la session
d'audit) : accueil, champ de recherche après frappe, fiche de lieu au cran d'ouverture, liste
de parcours, barre de parcours, rendu poste fixe.

---

## 11. Traitement (même lot)

Mesures d'après-correctif, mêmes conditions que §2 (iPhone 13, 390 × 664, charge publique du
16 septembre) :

| Constat                                                              | État                | Vérification d'après-correctif                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **N1** recherche neutralisée                                         | **Traité**          | Tap sur le champ puis frappe de « cdi » : le focus **reste au champ** (`document.activeElement`), `#root` n'est plus `inert`, la valeur s'inscrit, le titre passe à « Résultats (3) ». Les deux feuilles sont montées `blockBackground={false}` ; une feuille non modale ne prend plus le focus initial ni ne piège la tabulation (`useDialogA11y({ manageFocus })`).                                                                                                                                          |
| **N2** carte gelée                                                   | **Traité**          | Fiche ouverte : surcouche transparente (`pointer-events: none`), aucun `inert`, l'élément sous le doigt au milieu de la carte est le polygone — et un glisser déplace bien le plan (vérifié après zoom ; au cadrage d'ouverture le plan est déjà entier, le déplacement est borné). Les commandes de carte remontent au-dessus de la feuille (variable `--fm-bottom-sheet-inset`, plafonnée à 30 dvh) : au cran bas, les cinq sont atteignables.                                                               |
| **N3** entrées hors du plan                                          | **Traité**          | « entrée » au premier lancement renvoie les **cinq** entrées en tête (contre une seule). L'index de recherche porte sur tous les lieux ; un résultat hors filtre est marqué « masqué par vos filtres » et reste ouvrable — la carte le montre alors quand même. Les lieux sans catégorie ne sont plus filtrés (`keepUncategorized`).                                                                                                                                                                           |
| **N4** fiche à 12 px                                                 | **Traité**          | Cran d'ouverture `half` : **186 px** de contenu visible au lieu de 12 ; pied ramené à une ligne.                                                                                                                                                                                                                                                                                                                                                                                                               |
| **N5** parcours muet                                                 | **Traité**          | Pendant un parcours, toucher un lieu (carte ou résultats) ouvre sa fiche avec un bouton **« Revenir à l'étape »** ; la barre de parcours reste en place et reprend la main au retour.                                                                                                                                                                                                                                                                                                                          |
| **N6** filtres hors écran                                            | **Traité**          | Bouton **« Filtres (n) »** en tête de rangée, toujours visible, ouvrant la liste des **11** catégories avec leurs comptes et le résumé « 60 lieux affichés sur 78 ».                                                                                                                                                                                                                                                                                                                                           |
| **N7** accueil sur la commande de secours                            | **Traité**          | Bandeau déplacé en haut de la carte : les cinq commandes répondent à `elementFromPoint`, et l'échelle n'est plus recouverte.                                                                                                                                                                                                                                                                                                                                                                                   |
| **N8** vocabulaire du visiteur                                       | **Traité**          | Table de synonymes scolaires partagée (`placeSearchSynonymsFr.js`, 26 groupes) : « wc » et « toilettes » → _Sanitaires_, « cantine » → _Cafétéria_, « bibliothèque » → _CDI_, « parking » → _Parking_. Le mot littéral passe devant son synonyme (décote de 25). Les résultats venus d'une description le disent.                                                                                                                                                                                              |
| **N9** liste tronquée en silence                                     | **Traité**          | Titre « n lieux sur m » dès que la liste est écrêtée, « Lieux affichés (n) » quand un filtre est actif, et une ligne « Affinez la recherche pour atteindre les N autres lieux ».                                                                                                                                                                                                                                                                                                                               |
| **N10** doublons indiscernables                                      | **Partiel**         | La distance les sépare dès que la position est active (déjà livré le 13/09) ; sans position, il faut un sous-titre. **Donnée** : 4 « Sanitaires », 3 « Fontaine à eau », 2 « DAE » et un « Point de nourrissage des chats (copie) » restent à distinguer côté contenu.                                                                                                                                                                                                                                         |
| **N11** noms tronqués                                                | **Traité**          | Plancher de largeur porté à 96 px et **repli sur deux lignes** (moteur de collisions aligné, `ZONE_LABEL_MAX_LINES`) : **0 étiquette tronquée** au cadrage d'ouverture contre 14 sur 43, et aucun recouvrement à ×2,5 comme à ×4.                                                                                                                                                                                                                                                                              |
| **N12** cibles sous 44 px                                            | **Traité**          | Le nom écrit sur le plan est devenu une cible tactile de sa zone (`labelsClickable`) : 27 étiquettes cliquables, **aucune sous 44 px**. Les étiquettes étant déjà résolues sans recouvrement, une cible n'empiète jamais sur sa voisine. Le polygone reste la cible clavier et le nom accessible.                                                                                                                                                                                                              |
| **N13** parcours à une étape                                         | **Ouvert (donnée)** | Rien à corriger dans le code : `MapRoutePicker` refuse déjà un parcours sans étape. Le parcours _Faire le tour du lycée_ reste à compléter côté contenu.                                                                                                                                                                                                                                                                                                                                                       |
| **N14** marque arrêtée aux feuilles                                  | **Traité**          | « Y aller » est passé du vert forêt `rgb(26, 71, 49)` au marine `rgb(24, 48, 88)` ; les variables de marque sont posées sur la racine du document, donc atteignent le portail des feuilles.                                                                                                                                                                                                                                                                                                                    |
| **N15** ordre de tabulation                                          | **Traité**          | Commandes de carte placées avant le calque des lieux dans le DOM : la tabulation donne champ → aide → Parcours → Filtres → puces, sans traverser les 44 formes du plan.                                                                                                                                                                                                                                                                                                                                        |
| **N16** _(découvert en vérifiant)_ fermer une fiche quittait le plan | **Traité**          | Mesuré sur le bundle déployé : ouvrir un lieu depuis les résultats puis fermer sa fiche naviguait **hors de l'application**. Cause : quand une feuille en remplace une autre dans le même rendu React, le `history.back()` immédiat du démontage partait avant le `pushState` du montage ; la fermeture suivante reculait une entrée de trop. La profondeur d'historique est désormais réconciliée en différé sur le nombre de surcouches ouvertes (`overlayHistory`). Après correctif : on reste sur le plan. |

**Filets ajoutés** (§8) : frappe réelle et « on reste sur le plan » dans `e2e/plan-mobile-shell.spec.js` ;
`tests-ui/platform/overlayHistory.test.js` (profondeur d'historique) ;
`tests-ui/shared/placeSearchSynonyms.test.js` (vocabulaire) ; quatre scénarios ajoutés à
`tests-ui/plan/AppPlanMount.test.jsx` (focus conservé, feuilles non bloquantes, résultat hors
filtre, feuille de filtres) ; cas `keepUncategorized` dans `tests-ui/plan/planPlaces.test.js`.

---

## 12. Suite

Ce document ne modifie aucun code produit. Il complète — sans les remplacer — les deux audits
d'affichage de septembre. Deux liens avec le relevé du 13 septembre méritent d'être notés :

- son **N1** (la carte orientée boussole retournait les étiquettes) est traité dans le code
  d'aujourd'hui — étiquettes, emojis et pastilles portent une contre-rotation
  `rotate(calc(-1 * var(--pct-orient)))` (`src/shared/styles/pct-map-layers.css:117-152`).
  Constat de lecture de code : la vérification à la boussole sur le terrain reste à faire ;
- son **N2** (les entrées reléguées au dernier rang d'affichage, parce que `sort_order` est
  devenu un ordre d'audience) n'est pas seulement encore ouvert : il s'est **aggravé**. Les
  entrées ne sont plus mal classées, elles sont absentes — c'est le N3 ci-dessus.
