# Audit — affichage et navigation du Réseau trophique (septembre 2026)

Déclencheur : audit de **l'affichage et de la navigation** de l'onglet Réseau trophique
(élève et prof), c'est-à-dire tout ce qui se voit et tout ce qui se manipule dans la vue :
le graphe SVG, la vue liste, les filtres, et les chemins d'entrée depuis le reste de
l'application.

> **Portée et méthode.** Lecture statique du périmètre complet de la fonctionnalité —
> `src/components/pedago/FoodWebView.jsx`, `FoodWebGraph.jsx`, `FoodWebEdgeLegend.jsx`,
> `foodWebGraphModel.js`, `src/shared/foodWebTypes.js`, `foodWebEdgeStyle.js`, les règles
> `.pedago-foodweb*` de `src/index.css`, la route `routes/food-web.js` et les points
> d'entrée (`src/App.jsx`, `PedagoTabs.jsx`, `PlantSummaryBlocks.jsx`) — puis vérification
> de chaque hypothèse par un test qui échoue avant correction. Le comportement métier
> (types d'interaction, orientation écologique des flèches, droits) n'est pas modifié.

**12 constats**, tous corrigés dans le même lot : 4 d'affichage (§1), 8 de navigation (§2).
Chaque constat porte ses références `fichier:ligne` (état avant correction) et le test de
non-régression qui le couvre (§3).

---

## 1. Affichage

### A1. Les interactions « vers l'environnement » pointaient vers un point vide

`buildGraphModel` remplace une extrémité nulle par l'ancre `ENV_NODE_ID`
(`foodWebGraphModel.js:38-40`), et `posOf` renvoyait pour elle une position fixe en haut au
centre de la scène (`FoodWebGraph.jsx:147`) — **mais aucun nœud n'était dessiné à cet
endroit** : la boucle de rendu n'itérait que sur les espèces. Une interaction sans espèce
cible (`to_id NULL` : nitrification du sol, décomposition de la litière) traçait donc une
flèche vers le vide, et toutes ces flèches convergeaient vers le même point sans étiquette.

Le CSS `.pedago-foodweb-graph__node--env` (`src/index.css:7860`) et sa règle jumelle dans
le style d'export (`FoodWebGraph.jsx:37`) existaient pourtant : du code mort qui montre que
ce nœud était prévu. La vue liste, elle, affichait bien une pastille « Environnement »
(`FoodWebView.jsx:196-201`) — les deux vues ne racontaient pas la même chose.

**Correction.** `buildGraphModel` matérialise un nœud « 🌍 Environnement » dès qu'une arête
le touche, et lui seul ; les deux dispositions l'excluent de leur calcul (il garde son
ancrage propre) pour ne pas décaler le cercle des espèces.

### A2. Changer de disposition ne recomposait pas la scène

Les positions déplacées à la main sont mémorisées dans `overrides`
(`FoodWebGraph.jsx:243-249`) et priment sur la disposition calculée. Rien ne les purgeait au
changement de disposition : après un seul déplacement de nœud, le bouton « Niveaux » laissait
ce nœud là où l'utilisateur l'avait posé. La disposition annoncée était donc fausse, sans que
rien ne le signale — seul « ⟳ » (dont le titre parle de « réinitialiser la vue ») remettait
tout d'aplomb.

**Correction.** Changer de disposition abandonne les positions manuelles ; rester sur la même
ne change rien.

### A3. Les noms coupés se lisaient comme des noms complets

`{(node.name || '').slice(0, 16)}` (`FoodWebGraph.jsx:604`) tronquait sans marque de coupe :
« Consoude officinale de Russie » s'affichait « Consoude officin », impossible à distinguer
d'un nom réellement court.

**Correction.** `truncateNodeLabel()` (helper pur, testé) coupe à la même longueur avec une
ellipse explicite : « Consoude offici… ». Le nom complet reste dans l'infobulle et dans le
nom accessible du nœud.

### A4. L'export image ne rendait pas comme l'écran

Le style embarqué de l'export SVG/PNG duplique le CSS de la page à la main
(`FoodWebGraph.jsx:33-40`) et avait dérivé : `stroke-width` de la mise en évidence à 2.6
contre 2.5 à l'écran, et **aucune règle pour l'emoji des nœuds**.

**Correction.** Alignement des deux valeurs et ajout de la règle manquante. (La duplication
elle-même reste : le CSS de la page ne s'applique pas à un SVG sérialisé hors DOM.)

---

## 2. Navigation

### N1. Arriver depuis une fiche plante ne montrait pas l'espèce

« Voir le réseau trophique » depuis une fiche plante (`PlantSummaryBlocks.jsx:174-180`)
passe l'identifiant jusqu'au graphe via `highlightPlantId` (`App.jsx:824-831`). Le seul
effet était une **teinte légèrement différente** sur un nœud (`FoodWebGraph.jsx:585`) : ni
focus, ni recentrage, ni défilement. Sur un réseau fourni, l'espèce d'où l'on vient était
introuvable — le geste de navigation n'aboutissait pas.

Pire, si l'espèce n'avait **aucune** interaction enregistrée (ou aucune dans la carte/zone
choisie), rien n'était teinté et **rien ne l'expliquait** : la vue semblait avoir ignoré le
clic.

**Correction.** L'arrivée avec une espèce mise en avant isole d'emblée son sous-réseau
(le mode focus existant, réversible par « Tout afficher ») ; et quand l'espèce est absente du
jeu courant, un bandeau le dit et oriente vers l'élargissement de la carte ou de la zone.

### N2. La molette faisait défiler la page au lieu de zoomer

Le zoom molette annulait l'événement dans un `onWheel` JSX (`FoodWebGraph.jsx:217-231`).
**React enregistre `wheel` en écouteur passif** sur la racine — vérifiable dans
`react-dom` : `passiveBrowserEventsSupported && (domEventName === 'touchstart' |
'touchmove' | 'wheel')` force `{ passive: true }`. Un `preventDefault()` y est donc sans
effet : la page défilait pendant le zoom et le navigateur émettait l'avertissement « Unable
to preventDefault inside passive event listener ».

**Correction.** L'écouteur est posé à la main sur le SVG en `{ passive: false }`. Il est
attaché via une ref de rappel stockée en state, car le SVG n'existe pas au premier rendu
lorsque le graphe est vide.

### N3. Déplacer un nœud à la verticale déclenchait un clic

Le seuil qui distingue un clic d'un glissement ne regardait que l'axe **X** :
`Math.abs(p.x - drag.last.x) > CLICK_MOVE_THRESHOLD` (`FoodWebGraph.jsx:298`). Un
déplacement purement vertical laissait `moved` à `false` : au relâchement, le graphe
basculait en mode focus sur ce nœud, comme si l'on avait cliqué.

**Correction.** Le seuil porte sur la distance réelle (`Math.hypot(dx, dy)`).

### N4. Cliquer une flèche semblait sans effet

L'en-tête promet « clique une flèche pour le glossaire ». En mode graphe, le panneau
résultant était rendu dans la **colonne latérale gauche**, qui est défilante et bornée à
300 px (`src/index.css:7080-7086`) : le clic se fait à droite, la réponse apparaît à gauche,
souvent hors du champ de vision.

Et ce panneau ne montrait **que** les termes de glossaire liés (`FoodWebView.jsx:426-450`) :
ni le type de la relation, ni son sens, ni sa description. Sur une relation sans terme lié,
le seul retour visible était « Aucun terme glossaire lié » — le clic paraissait perdu.

**Correction.** Le panneau passe **sous le graphe**, dans la même colonne que lui, et porte
d'abord la relation elle-même : pastille de couleur du type, intitulé, phrase orientée
(« Lapin → est mangée par Renard ») puis la description, avant les termes de glossaire.

### N5. Le graphe était inutilisable sans souris

Les nœuds (`<g>`) et les cibles de clic des arêtes (`<circle>`) n'avaient ni `tabIndex`, ni
rôle, ni gestionnaire clavier : aucun ne pouvait être atteint autrement qu'à la souris.
S'ajoutait un `role="img"` sur le `<svg>` (`FoodWebGraph.jsx:449`), qui rend **tout son
contenu** présentationnel pour les technologies d'assistance : même le contenu textuel des
nœuds et des infobulles était masqué.

**Correction.** Le `<svg>` devient un `role="group"` ; nœuds et arêtes sont focusables
(`tabIndex`, `role="button"`, nom accessible explicite) et actionnables au clavier — Entrée
ou Espace isole le réseau d'un nœud, Maj+Entrée ouvre sa fiche, Entrée sur une arête
sélectionne la relation. Le nom accessible d'une arête énonce la relation complète
(« Prédation : Lapin est mangée par Renard — chasse au crépuscule »). Un anneau de focus
visible est ajouté côté CSS, `outline` n'étant pas fiable sur les éléments SVG.

### N6. Focus et sélection survivaient à leur objet

Ni le mode focus (`focusId`) ni l'arête sélectionnée (`selectedEdgeId`) n'étaient revus
quand le jeu de données changeait (carte, zone, filtre de type). On pouvait donc rester sur
un focus dont le nœud a disparu — toute la scène estompée, sans explication — ou garder un
panneau décrivant une relation qui n'est plus affichée.

**Correction.** Un focus dont le nœud n'existe plus est abandonné ; une sélection sortie du
jeu filtré est levée avec son panneau.

### N7. Le filtre de type restait bloqué sur une valeur absente

Les options du filtre « Type d'interaction » sont dérivées des données courantes
(`FoodWebView.jsx:180-183`). En changeant de carte ou de zone, la valeur sélectionnée
pouvait ne plus exister : le `<select>` s'affichait alors **vide** (aucune option ne
correspond) et la vue annonçait « Aucune interaction enregistrée » alors que la nouvelle
carte en contenait.

**Correction.** Un filtre de type absent du jeu chargé revient à « Tous ». Même logique que
la remise à zéro de la zone au changement de carte, déjà en place.

### N8. Les commandes de zoom n'utilisaient pas les icônes du produit

La barre d'outils affichait « − », « ⟳ », « + » en caractères bruts, alors que
`src/shared/icons.jsx` expose `IconZoomOut` / `IconZoomReset` / `IconZoomIn` — utilisés
partout ailleurs. Le bouton de réinitialisation n'avait par ailleurs pas de nom accessible
(seulement un `title`).

**Correction.** Icônes du design system et `aria-label` sur les trois boutons.

---

## 3. Couverture de non-régression

Chaque constat est couvert par un test qui **échoue sur le code d'avant** (vérifié en
rejouant la suite sur les fichiers d'origine) :

| Constat | Test                                                                                     |
| ------- | ---------------------------------------------------------------------------------------- |
| A1      | `foodWebGraphModel.test.js` — nœud environnement présent / absent, hors layouts          |
| A1      | `FoodWebGraph.test.jsx` — « rend un nœud « environnement » … », « n'ouvre aucune fiche » |
| A2      | `FoodWebGraph.test.jsx` — « changer de disposition abandonne les positions … »           |
| A3      | `foodWebGraphModel.test.js` + `FoodWebGraph.test.jsx` — troncature avec ellipse          |
| N1      | `FoodWebGraph.test.jsx` — « l'espèce mise en avant est isolée d'emblée »                 |
| N1      | `FoodWebView.test.jsx` — bandeau « espèce sans interaction » (et son absence)            |
| N2      | `FoodWebGraph.test.jsx` — « la molette est écoutée en non passif »                       |
| N3      | `FoodWebGraph.test.jsx` — « un glissement purement vertical … »                          |
| N4      | `FoodWebView.test.jsx` — détail de la relation, rendu dans la colonne du graphe          |
| N5      | `FoodWebGraph.test.jsx` — focusabilité, rôle du SVG, Entrée / Maj+Entrée                 |
| N6      | `FoodWebGraph.test.jsx` + `FoodWebView.test.jsx` — focus et sélection périmés            |
| N7      | `FoodWebView.test.jsx` — « remet à zéro un type d'interaction absent … »                 |

A4 et N8 sont des alignements de valeurs et d'icônes, sans comportement à verrouiller.

---

## 4. Second lot — améliorations demandées après l'audit

Les huit points ci-dessous ne sont pas des régressions mais des manques relevés
pendant l'audit, traités dans un second temps à la demande. Les deux derniers ont été
arbitrés en tenant compte d'un fait de terrain : **les élèves travaillent sur tablette**.

### B1. Deux relations entre les mêmes espèces se superposaient

`uq_interaction` (`migrations/124_species_interactions_views.sql:13`) porte sur le triplet
_(source, cible, type)_ : deux espèces peuvent donc être reliées par plusieurs relations de
types différents. Elles étaient tracées comme des segments droits centre-à-centre, donc
strictement confondus — une seule visible, et les deux cibles de clic au même point.

**Correction.** `parallelEdgeRanks()` / `parallelEdgeOffset()` (helpers purs) donnent à
chaque arête son rang parmi ses parallèles ; le tracé devient une courbe quadratique
écartée de l'axe, et la cible de clic suit la courbe. Une arête seule reste droite.

### B2. Herbivorie et prédation ne se distinguaient que par la teinte

C'étaient les **deux seuls types à trait plein** de `INTERACTION_EDGE_STYLES`, avec des
rouges voisins (`#c2410c` / `#b91c1c`). Tous les autres types portent un figuré propre :
en vision deutan/protan, les deux relations les plus structurantes du réseau devenaient
indiscernables l'une de l'autre.

**Correction.** L'herbivorie prend des tirets longs (`12 5`) ; la prédation garde le trait
plein, épaissi (2.4). Le CSS de la page et celui de l'export suivent la table, qui fait foi.

### B3. L'ordre des nœuds sur le cercle était arbitraire

`computeCircleLayout` indexait la liste dans l'ordre d'arrivée de l'API — triée par type
d'interaction puis par nom de source, donc sans rapport avec la structure du graphe : les
liens d'un même niveau trophique traversaient tout le cercle.

**Correction.** `orderNodesForCircle()` regroupe les espèces par rôle trophique en arcs
contigus (producteurs → consommateurs → décomposeurs → rôle inconnu), triées par nom à
l'intérieur de chaque arc.

### B4. Modifier une interaction était impossible depuis l'interface

`PUT /api/food-web/interactions/:id` existait, était monté et testé côté serveur, mais
`FoodWebView` n'appelait que `POST` et `DELETE` : corriger une description imposait de
supprimer puis recréer — et donc de perdre les termes de glossaire rattachés à
l'identifiant (`glossary_term_interactions.interaction_id`).

**Correction.** Le panneau de la relation sélectionnée — présent en mode graphe **et** en
mode liste — porte un bouton « Modifier cette relation » (gestionnaire des plantes
seulement) : type, espèce cible et description. L'espèce source reste fixe : la changer
reviendrait à créer une autre relation.

### B5. Aucune recherche d'espèce dans le graphe

Le seul chemin vers une espèce précise passait par sa fiche plante.

**Correction.** Champ de recherche dans la barre d'outils, avec propositions
(`<datalist>`) ; « Isoler » focalise l'espèce trouvée.

### B6. Le focus ne montrait que les voisins directs

Or l'objet même d'un réseau trophique est la **chaîne** — qui mange qui mange qui.

**Correction.** `focusSubset(edges, focusId, depth)` accepte une profondeur ; deux boutons
(« Voisins » / « Chaîne ») apparaissent dès qu'une espèce est isolée. À profondeur 2, les
arêtes entre voisins sont également retenues, ce qui fait apparaître la chaîne et non un
simple éventail.

### B7. Le filtre par zone masquait les relations sortantes — _arbitré : afficher et marquer_

`routes/food-web.js` exigeait que **les deux** extrémités soient dans la zone ou la carte.
Une espèce de la zone mangée par un prédateur de la zone voisine disparaissait entièrement.

**Arbitrage.** Un réseau trophique enseigne l'interdépendance ; un filtre qui coupe les
liens franchissant la limite enseigne l'inverse. La relation est donc **conservée dès
qu'une** extrémité est dans le périmètre, et l'espèce extérieure est **marquée** (contour
orangé pointillé, mention dans l'infobulle et le nom accessible) plutôt que masquée. La
réponse filtrée porte `from_in_scope` / `to_in_scope` ; la liste non filtrée, non.

### B8. Pas de zoom au pincement — _arbitré : implémenté_

`touch-action: none` est nécessaire au déplacement mais neutralise le pincement natif du
navigateur : sur tablette, seuls les boutons de la barre d'outils zoomaient.

**Arbitrage.** Les élèves travaillent sur tablette : le geste le plus naturel du support
doit fonctionner. Un suivi à deux pointeurs gère l'échelle en gardant le milieu des deux
doigts fixe ; le pincement annule tout glissement en cours, et lever un doigt d'un
pincement n'est plus interprété comme un clic (qui enclenchait le mode focus).

---

## 5. Constats non traités (hors périmètre de ce lot)

- **Lisibilité au-delà de ~30 espèces.** La disposition circulaire répartit les nœuds à
  intervalle constant : au-delà d'une trentaine, les étiquettes se chevauchent. Le
  regroupement par rôle (B3), le mode focus, la recherche (B5) et les filtres de type y
  répondent en pratique ; une vraie réponse serait une disposition dirigée par les forces —
  un lot en soi.
- **Ordre de tabulation.** Rendre chaque nœud et chaque arête focusable (N5) rend le graphe
  utilisable au clavier, mais allonge la séquence de tabulation à proportion du réseau. Un
  `tabindex` glissant (roving) sur une grille de nœuds serait plus confortable.
- **`loadEnrichedInteraction` ne relit pas les rôles trophiques** (`routes/food-web.js:24-31`) :
  sans conséquence visible, la vue rechargeant la liste complète après création.
