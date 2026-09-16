# Audit — Réseau trophique : densité d'affichage, isolement et niveaux trophiques

**Date :** 16 septembre 2026
**Version :** 1.157.26 (`02f0f47`)
**Méthode :** lecture statique du périmètre complet + **mesures géométriques** rejouées sur les
constantes du code + comptage du corpus versionné (`sql/biodiv_pedago_seed.sql`, migrations
`220`–`230`). Pas de campagne navigateur live dans ce lot.
**Suite de :** [`AUDIT_RESEAU_TROPHIQUE_2026-09.md`](AUDIT_RESEAU_TROPHIQUE_2026-09.md) (bugs
affichage / navigation — traités) et
[`AUDIT_RESEAU_TROPHIQUE_UX_PEDAGO_2026-09.md`](AUDIT_RESEAU_TROPHIQUE_UX_PEDAGO_2026-09.md) +
[`PLAN_RESEAU_TROPHIQUE_UX_PEDAGO_2026-09.md`](PLAN_RESEAU_TROPHIQUE_UX_PEDAGO_2026-09.md)
(lots A–D livrés : palette Okabe–Ito, presets liftés, étiquettes de colonnes, toolbar 44 px).

> **Portée.** Ce lot ne modifie **aucun code** : c'est un audit de la **densité d'affichage**,
> suivi de quatre arbitrages demandés (options d'isolement, sélection multiple d'espèces,
> sous-niveaux de consommateurs, disposition par défaut). Il prend le relais des trois constats
> restés ouverts : `PED-05` (cercle saturé), `PED-03` (pas de C1/C2), `E3` (disposition dirigée).

---

## 0. Réponses en une page

| Question posée                                     | Réponse courte                                                                                                                                                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La densité d'affichage est-elle un vrai problème ? | **Oui, et plus tôt qu'annoncé** : les étiquettes se chevauchent dès **15 espèces** (et non ~30), les cercles dès **33**. Le corpus versionné en compte **~143**, dont **50 rien que dans les 69 relations du seed**. |
| Quelles options quand on isole une espèce ?        | La plus rentable n'existe pas encore : **recomposer la scène sur le sous-réseau**. Aujourd'hui « isoler » **estompe sans désencombrer** (§2, D3). Sept options détaillées en §3.                                     |
| Peut-on sélectionner plusieurs espèces ?           | **Oui, et c'est peu coûteux** : `focusSubset()` accepte déjà une graine ; la généraliser à un ensemble est un changement de modèle **pur et testable**. Conception en §4.                                            |
| Définir les consommateurs primaire / secondaire ?  | **Oui — mais calculé depuis le graphe, pas saisi en base.** Une colonne SQL de plus se périme au premier omnivore. Algorithme, pièges et garde-fous en §5.                                                           |
| Cercle ou niveaux par défaut ?                     | **Garder le cercle aujourd'hui** (les niveaux sont actuellement _plus_ saturés), **viser les niveaux** une fois §5 + F2 livrés. Comparatif et bascule en §6.                                                         |

---

## 1. Ce que la vue affiche réellement

Le graphe ne dessine que les espèces **portées par au moins une relation** (`buildGraphModel`,
`foodWebGraphModel.js:96`). Le volume utile n'est donc pas le catalogue entier, mais il en est
proche. Comptage sur le contenu **versionné** (le seul mesurable ici — la base de production
n'est pas accessible depuis ce dépôt, cf. règle « pas de dump versionné ») :

| Source                                                    | Espèces  | Relations |
| --------------------------------------------------------- | -------- | --------- |
| `sql/biodiv_pedago_seed.sql`                              | 78       | 69        |
| `migrations/223_pedago_species_and_detritivore_foods.sql` | 17       | 33        |
| `migrations/224_pedago_med_moroccan_potager.sql`          | 27       | 36        |
| `migrations/225_pedago_garden_auxiliaires_gl.sql`         | 19       | 43        |
| `229` / `230`                                             | 2        | —         |
| **Total ordre de grandeur**                               | **~143** | **~181**  |

Répartition des rôles trophiques saisis : **~78 producteurs, ~37 consommateurs, ~13 décomposeurs**.

Mesure directe sur le seed seul : ses 69 relations mobilisent **50 espèces distinctes**. Le graphe
« Toutes les cartes », preset **Réseau alimentaire**, se situe donc entre **50 et 100 nœuds** —
soit **trois à six fois** le seuil de lisibilité mesuré ci-dessous. Le filtrage carte/zone
(`routes/food-web.js`) ramène ce chiffre, mais il est facultatif : la vue s'ouvre sur la carte
active et l'option « Toutes les cartes » reste à un clic.

---

## 2. Mesures de densité

Géométrie rejouée sur les constantes réelles : `BASE_W = 880`, `BASE_H = 560`, `NODE_R = 20`
(`FoodWebGraph.jsx:38-40`), rayon du cercle `min(880, 560) / 2 − 70 = 210` px
(`foodWebGraphModel.js:273-286`), étiquette en `600 10px` tronquée à 16 caractères
(`NODE_LABEL_MAX`, `foodWebGraphModel.js:78`) — soit **≈ 88 px** de large à pleine longueur
(~5,5 px/caractère).

### D1 — Cercle : chevauchement des étiquettes dès 15 espèces _(majeur)_

Circonférence utile : **1 319 px**, répartis à pas constant.

| Nœuds | Pas entre voisins | Cercles (Ø 40 px) | Étiquettes (≈ 88 px) |
| ----- | ----------------- | ----------------- | -------------------- |
| 10    | 132 px            | ✅                | ✅                   |
| 15    | 88 px             | ✅                | **limite**           |
| 25    | 53 px             | ✅                | ❌                   |
| 33    | 40 px             | **limite**        | ❌                   |
| 50    | 26 px             | ❌                | ❌                   |
| 80    | 16 px             | ❌                | ❌                   |

Le seuil réel de lisibilité est donc **~15**, pas « ~30 espèces » comme l'estimait l'audit de
septembre (§5, constat non traité). Les ~30 correspondent au moment où les **pastilles** se
touchent — bien après que les **noms** soient devenus illisibles, alors que le nom est ce qui
fait le contenu pédagogique.

Nuance utile pour la correction : le chevauchement est **anisotrope**. En haut et en bas du
cercle la tangente est horizontale, les étiquettes se heurtent de plein fouet ; sur les flancs
elle est verticale et il suffit de ~14 px de pas. Le regroupement par rôle en arcs contigus
(livré, `orderNodesForCircle`) place précisément l'arc **producteurs** — le plus fourni des
trois — sur une portion continue : c'est là que la bouillie se forme.

### D2 — Niveaux : une colonne sature à 10 espèces _(majeur)_

`computeTrophicLayout` (`foodWebGraphModel.js:306-324`) répartit chaque colonne entre `y = 60` et
`y = height − 60`, soit **440 px**. Un nœud occupe 40 px de pastille plus son étiquette 14 px
sous le bord, ≈ **48 px** utiles.

| Espèces dans la colonne | Pas        | Verdict                                |
| ----------------------- | ---------- | -------------------------------------- |
| 8                       | 62,9 px    | ✅                                     |
| 10                      | 48,9 px    | **limite**                             |
| 12                      | 40,0 px    | ❌                                     |
| 37 (≈ consommateurs)    | 12,2 px    | ❌ pastilles empilées                  |
| 78 (≈ producteurs)      | **5,7 px** | ❌ colonne illisible, un trait continu |

**La disposition « Niveaux » est aujourd'hui plus dense que le cercle**, parce qu'elle contraint
les ~78 producteurs sur une seule verticale au lieu de les étaler sur 1 319 px. C'est un point
décisif pour la question « cercle ou niveaux par défaut » (§6) : le concept est le bon, le
placement ne suit pas.

### D3 — Isoler une espèce n'enlève rien de la scène _(majeur — cœur du sujet)_

`focusSubset()` calcule bien le sous-réseau, mais il ne sert qu'à **estomper** :

- `baseLayout` est calculé sur `nodes`, c'est-à-dire **tous** les nœuds
  (`FoodWebGraph.jsx:157-164`) — le focus n'entre pas dans la formule ;
- le rendu itère sur `visibleEdges` puis `nodes` entiers (`FoodWebGraph.jsx:868`, `:944`) ;
- les éléments hors focus reçoivent seulement `opacity: .18` (nœuds/étiquettes) et `.12`
  (traits) — `src/shared/styles/food-web-graph.css:17`, `:219-222`.

Conséquence concrète : sur un réseau de 80 espèces, isoler le Merle noir laisse ses 5 voisins
**dispersés aux quatre coins du cercle**, séparés par 75 fantômes qui continuent d'occuper la
place, de porter leur étiquette et de rester cliquables et tabulables. Zoomer ne sauve rien : le
zoom est homothétique, agrandir pour lire un nom sort les autres du cadre. **Le geste central du
module (« clique une espèce pour isoler sa chaîne ») ne produit donc pas de désencombrement** —
seulement un contraste. C'est le premier levier à actionner, et c'est un changement local
(§3, O1).

### D4 — Le nœud « Environnement » chevauche le haut du cercle _(mineur, mais dans la vue par défaut)_

`ENV_POS = { x: 440, y: 28 }` est un ancrage fixe (`FoodWebGraph.jsx:41`). Or
`computeCircleLayout` démarre son premier nœud à l'angle `−π/2`, soit exactement `(440, 70)`. Le
nœud environnement occupe `y ∈ [8 ; 48]`, le premier nœud du cercle `y ∈ [50 ; 90]` — 2 px
d'écart —, et **l'étiquette « Environnement » est tracée à `y = 62`, donc à l'intérieur de la
pastille du premier nœud**. Le cas n'est pas théorique : le seed porte 4 relations sans cible
(`predation`, `decomposition`), présentes dans le preset **Réseau alimentaire**, donc dans
l'affichage par défaut.

### D5 — Rien n'est jamais retiré du DOM, et tout se re-rend au survol _(mineur, effet tablette)_

Chaque arête produit trois éléments SVG (halo optionnel, tracé, cible de clic de 12 px de rayon)
et chaque nœud quatre (pastille, emoji, étiquette, `<title>`). À ~180 arêtes et ~80 nœuds, on est
autour de **850 éléments**, tous conservés en focus comme hors focus. `hoverNode` / `hoverEdge`
étant du state du composant, **chaque survol re-rend l'ensemble du graphe**. Sur tablette — le
terrain réel, cf. arbitrage B8 — c'est le survol au doigt (via `onFocus`) et le glissement qui en
paient le prix. Masquer au lieu d'estomper (O2) réglerait la densité **et** ce coût.

### D6 — La projection n'ajoute pas d'espace, elle grossit tout _(mineur)_

Le `viewBox` est figé à `0 0 880 560` et le SVG est en `width: 100%` (`food-web-graph.css:2-12`).
Brancher un vidéoprojecteur multiplie la taille apparente mais **pas la place disponible** : le
rapport étiquette/pas reste identique, donc les chevauchements de D1 et D2 sont exactement les
mêmes sur un téléphone et sur un écran de classe. La densité est aujourd'hui une propriété du
modèle, pas de l'affichage.

### D7 — Aucun traitement des étiquettes _(mineur)_

Pas de dé-chevauchement, pas de halo de lisibilité (`paint-order: stroke`), pas de masquage
conditionnel, pas de rotation tangentielle : l'étiquette est posée systématiquement sous la
pastille. Deux noms qui se croisent produisent un empilement de glyphes illisible, d'autant que
la troncature à 16 caractères ne distingue plus « Consoude offici… » de « Consoude offici… ».

### Récapitulatif

| ID  | Sév.   | Constat                                                    | Preuve                                     |
| --- | ------ | ---------------------------------------------------------- | ------------------------------------------ |
| D1  | majeur | Cercle : étiquettes illisibles dès 15 nœuds (et non ~30)   | `foodWebGraphModel.js:273-286` + mesure    |
| D2  | majeur | Niveaux : colonne saturée à 10 ; ~78 producteurs à placer  | `foodWebGraphModel.js:306-324` + mesure    |
| D3  | majeur | Le focus estompe sans recomposer ni retirer                | `FoodWebGraph.jsx:157-164`, `:868`, `:944` |
| D4  | mineur | Nœud « Environnement » superposé au premier nœud du cercle | `FoodWebGraph.jsx:41` vs angle `−π/2`      |
| D5  | mineur | ~850 éléments SVG permanents, re-rendus à chaque survol    | `FoodWebGraph.jsx:868-1000`                |
| D6  | mineur | `viewBox` figé : la vidéoprojection n'apporte pas de place | `food-web-graph.css:2-12`                  |
| D7  | mineur | Étiquettes sans dé-chevauchement ni halo ni masquage       | `FoodWebGraph.jsx:975-985`                 |

---

## 3. Quelles options d'affichage quand on isole une espèce ?

État actuel : clic (ou Entrée) sur un nœud → `focusId`, plus deux profondeurs **Voisins** /
**Chaîne**, plus « Tout afficher » et « Voir la fiche ». Le vocabulaire est bon ; c'est le rendu
qui manque (D3). Sept options, indépendantes les unes des autres.

| ID  | Option                                                          | Apport pédagogique                                   | Effort | Avis                       |
| --- | --------------------------------------------------------------- | ---------------------------------------------------- | ------ | -------------------------- |
| O1  | **Recomposer la disposition sur le sous-réseau**                | Le sous-réseau devient lisible sans zoom             | faible | **À faire en premier**     |
| O2  | **Masquer** le reste au lieu de l'estomper (au-delà d'un seuil) | Supprime le bruit visuel et le coût DOM              | faible | **Oui, avec seuil**        |
| O3  | **Vue « fiche trophique » : mange ← espèce → est mangée par**   | C'est la phrase que l'élève doit produire            | moyen  | **Oui — plus fort gain**   |
| O4  | Profondeur 3 + « remonter jusqu'aux producteurs »               | Chaîne complète, sens du flux de matière             | faible | Oui                        |
| O5  | Couronnes concentriques par distance                            | Rend visible « à un cran / à deux crans »            | moyen  | Optionnel (alternative O1) |
| O6  | Épingler l'espèce au centre, reste en fantôme de contexte       | Garde le repère « où on est dans le réseau »         | faible | Optionnel                  |
| O7  | Panneau texte structuré de l'espèce isolée                      | Trace écrite, lecteurs d'écran, copie dans le cahier | faible | Oui                        |

### O1 — Recomposer la scène sur le sous-réseau _(le socle)_

Une seule ligne de principe : quand `focusId` est posé, calculer la disposition sur
`subset.visibleNodes` au lieu de `nodes`. Six nœuds se répartissent alors sur les mêmes 1 319 px
(pas de 220 px) ou sur les quatre colonnes de niveaux, et tout redevient lisible sans toucher au
zoom. Le changement est confiné à `baseLayout` (`FoodWebGraph.jsx:157-164`) et se teste sur les
helpers purs déjà couverts (`tests-ui/components/pedago/foodWebGraphModel.test.js`).

Deux précautions : **animer** la transition (ou au minimum conserver `overrides` vidé) pour que
l'élève comprenne que la scène s'est recomposée et n'a pas changé de sujet ; et **réutiliser la
même disposition** à la sortie du focus, ce que fait déjà `changeLayout`.

### O2 — Masquer plutôt qu'estomper, au-delà d'un seuil

L'estompage est la bonne réponse **sur un petit réseau** : il garde le contexte. Au-delà de ~25
nœuds il ne garde plus qu'un brouillard. Proposition : conserver l'estompage jusqu'au seuil,
**ne plus rendre** les nœuds et arêtes hors focus au-delà — ce qui retire aussi leurs cibles de
clic et leur place dans la tabulation (répond en partie à `A11Y-02`). Un bouton « Montrer le
reste en fond » permet de récupérer le contexte à la demande.

### O3 — La « fiche trophique » : ce qu'elle mange | l'espèce | ce qui la mange

C'est la lecture qu'attend un élève de collège, et aucune des deux dispositions actuelles ne la
produit : le cercle ne dit rien du sens, les niveaux placent l'espèce dans une colonne mais pas
_ses_ proies en face d'elle. Trois colonnes, l'espèce au centre, ses **ressources** à gauche
(arêtes entrantes du flux de matière), ses **consommateurs** à droite (arêtes sortantes), les
relations non trophiques en bas ou masquées. L'orientation est déjà disponible sans calcul
supplémentaire : `interactionMatterFlow()` (`src/shared/foodWebTypes.js:104`) distingue
`to_from` / `from_to` / `none`, ce qui évite de rejouer la sémantique par type.

C'est aussi l'affichage qui s'exporte le mieux en PNG pour un polycopié, et celui qui se lit sur
un téléphone en portrait — les deux dispositions actuelles, non.

### O4 — Profondeur 3 et « remonter jusqu'aux producteurs »

`FOCUS_DEPTHS = [1, 2]` (`foodWebGraphModel.js:176`) ; la constante accepte une troisième valeur
sans autre changement. Plus intéressant : une profondeur **orientée**, qui ne suit que le flux de
matière et remonte jusqu'aux espèces sans proie — c'est-à-dire **la chaîne alimentaire complète
au-dessus et au-dessous de l'espèce**, sans ramener au passage les pollinisateurs de ses voisins.
Deux boutons suffisent : « Chaîne » (ce qui existe, non orienté) et « Toute la chaîne »
(orientée, sans limite de profondeur).

### O5 — Couronnes concentriques

Espèce au centre, voisins directs sur une première couronne, voisins de voisins sur la seconde.
Lit immédiatement la distance dans le réseau et s'accommode mieux d'un voisinage nombreux qu'un
cercle unique. C'est une **alternative** à O1 pour le mode focus, pas un complément ; référence
d'implémentation : disposition `concentric` de **Cytoscape.js**
(<https://js.cytoscape.org/#layouts/concentric>, MIT) — à reprendre comme principe, pas comme
dépendance : la formule tient en dix lignes dans `foodWebGraphModel.js`.

### O6 — Épingler l'espèce

Verrouiller l'espèce isolée au centre de la scène (et non à sa place sur le cercle) fait du focus
une vraie « loupe ». Se combine avec O1 : le centre est libre, puisque la disposition circulaire
n'y place personne.

### O7 — Panneau texte de l'espèce isolée

Sous le graphe, là où se trouve déjà le panneau de relation : « **Merle noir** — mange : vers de
terre, lombric, escargot, baies de sureau ; est mangé par : — ; autres relations : — ». Zéro
géométrie, lisible par un lecteur d'écran, copiable dans un cahier, et cela donne un retour
immédiat quand la scène graphique reste confuse. C'est le complément le moins cher de tous.

---

## 4. Sélectionner plusieurs espèces et exclure le reste

**Verdict : oui, c'est faisable sans refonte, et c'est probablement la fonction la plus utile
pour un professeur.** Construire à l'écran « la chaîne du potager » avec cinq espèces choisies,
puis l'exporter en PNG, est exactement l'usage de classe que l'export sert déjà à moitié.

### Ce qui existe déjà et qui porte la fonction

- `focusSubset(edges, focusId, depth)` part d'une graine unique mais son algorithme est un
  parcours en largeur banal : **le remplacement de la graine par un ensemble est mécanique**
  (`foodWebGraphModel.js:187-214`).
- `neighborIds()`, `parallelEdgeRanks()`, les deux dispositions et `itemsForPreset()` sont des
  **fonctions pures déjà testées** — aucune n'a besoin de changer.
- Le graphe sait déjà **marquer** un nœud « hors périmètre » sans le retirer
  (`--outside`, arbitrage B7) : la même signalétique sert à distinguer « espèce choisie » de
  « espèce ramenée par le voisinage ».

### Conception proposée

| Élément          | Proposition                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| État             | `focusId` (scalaire) → `focusIds` (`Set`). Un seul élément = comportement actuel, strictement.                                                                             |
| Modèle           | `focusSubset(edges, seeds, depth)` : `seeds` accepte un identifiant **ou** un itérable ; frontière initiale = l'ensemble.                                                  |
| Ajout            | **⌘/Ctrl + clic** sur un nœud (bureau) ; bouton **« + Ajouter à la sélection »** dans la barre (tablette) ; « Isoler » de la recherche ajoute si la sélection est ouverte. |
| Retrait          | Re-clic sur un nœud sélectionné ; puce ✕ dans la liste des sélectionnés ; « Tout afficher » vide la sélection (comportement actuel conservé).                              |
| Étendue          | Trois boutons au lieu de deux : **Sélection seule** (profondeur 0) · **Voisins** (1) · **Chaîne** (2).                                                                     |
| Lisibilité       | Les espèces **choisies** gardent l'anneau de mise en évidence ; celles ramenées par le voisinage sont dessinées normalement — on voit ce qu'on a demandé.                  |
| Sélection en lot | « Ajouter tous les décomposeurs », « ajouter les espèces de cette zone » : même mécanisme, graines multiples.                                                              |
| Mémoire          | Sélection sérialisable (`?focus=12,45,88`) → un prof prépare son tableau chez lui et ouvre le lien en classe. Optionnel, mais c'est là que la fonction prend sa valeur.    |

Avec O1 (§3), « sélection seule » donne un **réseau propre des seules espèces retenues, toutes
leurs relations mutuelles comprises** — c'est littéralement la demande « voir un réseau avec une
sélection d'espèces et exclure le reste ».

### Coût et risques

Modèle : faible (une signature, un `Set`). Interface : moyen (barre d'outils déjà dense, cf.
`UX-03` — les puces de sélection doivent aller **sous** le graphe, pas dans la barre). Tests :
`foodWebGraphModel.test.js` pour la graine multiple, `FoodWebGraph.test.jsx` pour l'ajout/retrait
et la non-régression du cas à une espèce. **GL hérite gratuitement** (`GLFoodWebPanel.jsx` monte
le même composant) : vérifier son rendu après coup.

---

## 5. Faut-il définir les niveaux de consommateurs (primaire, secondaire, tertiaire) ?

**Oui pour l'affichage — et calculé depuis le graphe, pas saisi en base.** L'audit UX de septembre
classait `PED-03` « complexe » en supposant un enrichissement des rôles en BDD (`E2` du plan) ;
c'est précisément l'option que je déconseille.

### Pourquoi le rôle actuel ne suffit pas

`trophic_role` est un ENUM à trois valeurs (`migrations/122_biodiv_plants_enriched.sql:10`) :
`producteur`, `consommateur`, `decomposeur`. Les ~37 consommateurs du corpus tombent donc dans un
seul seau : la « pyramide » affichée est une colonne unique qui mélange le puceron et la
pipistrelle. Pédagogiquement, c'est le niveau qui porte le concept (transfert d'énergie, pertes
entre maillons, pourquoi il y a peu de prédateurs au sommet) — pas le rôle.

### Option A — une colonne en base (`consumer_level`) : déconseillée

- **Coût de curation** : ~37 espèces à qualifier à la main, plus chaque ajout futur.
- **Faux en soi pour les omnivores** : le Merle noir mange des vers (C2) _et_ des baies de sureau
  (C1) — le corpus versionné porte littéralement ces deux relations
  (`migrations/225:315-318`). Aucun entier ne décrit correctement cette espèce.
- **Dérive garantie** : la valeur saisie ne bouge pas quand on ajoute une relation, donc elle
  contredit le graphe sans que rien ne le signale.
- **Dépendance au périmètre ignorée** : filtrée sur une zone où le prédateur sommital est absent,
  l'espèce n'a plus le même niveau — une colonne fixe ne peut pas le dire.

### Option B — calculer la position trophique depuis le graphe : recommandée

Définition standard en écologie des réseaux (position trophique fractionnaire) :

```
niveau(espèce) = 1 + moyenne( niveau(proies) )
niveau(producteur ou espèce sans proie) = 1
```

C'est la formulation de **Levine, « Several measures of trophic structure applicable to complex
food webs », _Journal of Theoretical Biology_ 83(2), 1980**
(<https://doi.org/10.1016/0022-5193(80)90288-X>), reprise par les outils standard du domaine
(p. ex. le paquet R **cheddar**, <https://github.com/quicklizard99/cheddar>, licence BSD-2 —
cité comme référence d'implémentation, pas comme code repris).

Mise en œuvre proposée, entièrement côté client, dans `foodWebGraphModel.js` :

1. Ne retenir que les arêtes dont `interactionMatterFlow(type) === 'to_from'` — la table de
   `foodWebTypes.js` le dit déjà, aucune liste à réécrire.
2. Initialiser à 1 les nœuds `producteur` et ceux sans proie.
3. Itérer la moyenne jusqu'à stabilisation, avec un **plafond d'itérations** (les boucles
   détritus → décomposeur → sol → plante existent : sans plafond, l'algorithme ne converge pas
   proprement).
4. Colonne d'affichage = `round(niveau)`, borné à 4 ; **la valeur fractionnaire va dans
   l'infobulle** : « niveau 2,4 — omnivore », qui est une information juste et intéressante,
   plutôt qu'un arrondi qui ment.
5. **Les décomposeurs restent hors échelle** : ils ne sont pas un « 4ᵉ niveau » mais un retour de
   matière. Les placer dans une voie distincte (bandeau latéral ou bas de scène) est un point
   scientifique, pas cosmétique — c'est l'erreur classique des pyramides de manuel.

Trois garde-fous à écrire noir sur blanc dans l'interface :

- Le niveau vaut **dans le réseau affiché** : changer de carte, de zone ou de preset peut le
  changer. Le libellé doit le dire (« niveau dans ce réseau »), sinon on enseigne un absolu faux.
- Une espèce sans relation trophique saisie n'a **pas** de niveau : la ranger en « non
  déterminé » plutôt que la coller d'office au niveau 1.
- Le preset **Autres relations** n'a pas de niveau du tout : le bouton « Niveaux » doit y être
  désactivé ou basculer sur les rôles.

Bénéfices annexes : aucune migration, aucune dette de contenu, et un **test de contenu** possible
dans `tests/content/` (« aucune espèce du corpus ne dépasse le niveau 4 », « toute espèce marquée
`producteur` calcule bien 1 ») qui transforme une incohérence de saisie en échec CI nommé — ce
qui est exactement l'usage prévu du job `contenu`.

Si, après usage, les professeurs veulent forcer une valeur, **alors** une colonne optionnelle
`consumer_level` prenant le pas sur le calcul se justifie. Dans cet ordre, pas l'inverse.

---

## 6. Cercle ou niveaux par défaut ?

### Comparatif

| Critère                          | Cercle                                      | Niveaux (état actuel)                                                    |
| -------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| Message porté                    | « qui est là », structure du voisinage      | **« qui mange qui », sens du flux**                                      |
| Accord avec le preset par défaut | neutre                                      | **direct** (Réseau alimentaire)                                          |
| Densité mesurée (§2)             | lisible jusqu'à ~15 nœuds                   | **colonne saturée à 10** → pire sur ce corpus                            |
| Répartition réelle du corpus     | arcs déséquilibrés mais étalés sur 1 319 px | ~78 producteurs sur 440 px — inutilisable                                |
| Orientation                      | sans a priori                               | **gauche → droite**, alors que la convention scolaire est **bas → haut** |
| Rôles inconnus                   | arc « autres » en fin de cercle             | 4ᵉ colonne « Autres » : ressemble à un niveau qu'elle n'est pas          |
| Aptitude au mode focus           | correcte une fois O1 livré                  | **excellente** (la chaîne se lit d'un bout à l'autre)                    |

### Arbitrage

1. **Aujourd'hui : garder le cercle par défaut.** Basculer maintenant remplacerait un affichage
   médiocre par un affichage pire sur le corpus réel (D2). Ce n'est pas un jugement sur le
   concept, c'est la géométrie.
2. **Cible : les niveaux par défaut quand le preset est « Réseau alimentaire »**, une fois les
   trois conditions réunies : (a) niveaux **calculés** (§5), (b) **répartition intra-niveau** sur
   plusieurs sous-colonnes ou en quinconce pour tenir au-delà de 10 espèces, (c) orientation
   **bas → haut**, décomposeurs sur une voie à part. C'est à ce moment-là que la vue portera son
   nom.
3. **En attendant, deux gestes gratuits** : **mémoriser la dernière disposition choisie** (un prof
   qui projette en niveaux ne doit pas le redemander à chaque séance) et, **en mode focus, passer
   d'office en niveaux** — sur 5 nœuds, la contrainte D2 disparaît et la chaîne devient lisible
   immédiatement.
4. Le preset « Autres relations » reste au cercle : sans flux de matière, les niveaux n'ont pas
   de sens (§5).

---

## 7. Lots proposés

Aucune migration ; aucun changement de comportement métier. Les identifiants continuent la série
du plan de septembre (lots A–D livrés, E en backlog).

| Lot    | Contenu                                                                                                                                            | IDs traités        | Effort |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------ |
| **F1** | Focus utile : disposition recalculée sur le sous-réseau (O1), masquage au-delà d'un seuil (O2), correction de l'ancrage Environnement (D4)         | D3, D4, D5, PED-05 | faible |
| **F2** | Densité : répartition intra-niveau au-delà de 10 (D2), halo + masquage conditionnel des étiquettes (D7), `viewBox` qui grandit avec le réseau (D6) | D1, D2, D6, D7     | moyen  |
| **F3** | Sélection multiple d'espèces (§4) + « Sélection seule / Voisins / Chaîne »                                                                         | nouveau            | moyen  |
| **F4** | Position trophique calculée (§5) + décomposeurs hors échelle + infobulle fractionnaire + test de contenu                                           | PED-03 / E2        | moyen  |
| **F5** | Fiche trophique 3 colonnes (O3) + panneau texte (O7) ; bascule du défaut vers Niveaux (§6.2)                                                       | O3, O7             | moyen  |

**Ordre :** F1 → F2 → (F3 ∥ F4) → F5. F1 seul règle l'essentiel du ressenti « c'est illisible » ;
F4 est le préalable de la bascule décidée en §6.

**DoD commun :** helpers purs testés dans `foodWebGraphModel.test.js` ; montage testé dans
`FoodWebGraph.test.jsx` ; `npm run lint`, `npm run format:check`, `npm test`, `npm run test:ui`
verts ; `GLFoodWebPanel` vérifié après F1/F2 (composant partagé) ; doc de référence
`docs/reference/foretmap/pedagogie-quiz-glossaire-reseau.md` mise à jour dès qu'un comportement
visible change (F1, F3, F4, F5).

---

## 8. Ce qui n'est pas proposé, et pourquoi

- **Disposition dirigée par les forces généralisée** (`E3` du plan). Elle règle le cas « 80 nœuds
  d'un coup », mais elle est **non déterministe** : deux ouvertures de la même carte ne donnent
  pas la même image, ce qui casse l'export comme support de cours et la comparaison d'une séance
  à l'autre. F1 + F3 + F4 traitent la densité par **réduction du sujet affiché**, qui est la
  bonne réponse pédagogique : on ne montre pas 80 espèces à une classe. Si le besoin persiste,
  `d3-force` (<https://github.com/d3/d3-force>, ISC) est la dépendance à préférer — avec graine
  fixe pour la reproductibilité.
- **Regroupement automatique en clusters repliables.** Suppose une taxonomie d'affichage que le
  corpus ne porte pas encore ; la sélection multiple (F3) rend le même service en explicite.
- **Rendu WebGL / canvas.** Hors sujet à ces volumes : D5 se règle en cessant de dessiner
  l'inutile, pas en changeant de technologie de rendu.
- **Réécriture du sens des flèches ou des types d'interaction.** Déjà correct
  (`orientInteraction`), hors périmètre, et `AUDIT_RESEAU_TROPHIQUE_UX_PEDAGO_2026-09.md` le
  classe explicitement en non-objectif.

---

## 9. Références externes citées

| Source                                                                                  | Usage ici                                      | Licence        |
| --------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------- |
| Levine, _J. Theor. Biol._ 83(2), 1980 — <https://doi.org/10.1016/0022-5193(80)90288-X>  | Définition de la position trophique (§5)       | article        |
| cheddar — <https://github.com/quicklizard99/cheddar>                                    | Référence d'implémentation du calcul (§5)      | BSD-2          |
| Cytoscape.js, disposition `concentric` — <https://js.cytoscape.org/#layouts/concentric> | Principe des couronnes (O5)                    | MIT            |
| d3-force — <https://github.com/d3/d3-force>                                             | Piste écartée, citée pour mémoire (§8)         | ISC            |
| Okabe & Ito, palette sûre pour le daltonisme — <https://jfly.uni-koeln.de/color/>       | Déjà en place (lot A), rappelée pour cohérence | domaine public |

Aucun code externe n'est repris dans ce lot : il ne contient que de la documentation.

---

## 10. Limites de cet audit

- **Mesures géométriques, pas mesures terrain** : les seuils de §2 sont calculés sur les
  constantes du code et une largeur d'étiquette estimée (~5,5 px/caractère à `600 10px`). Une
  vérification au navigateur les affinera de quelques nœuds ; elle ne changera pas les ordres de
  grandeur ni les conclusions.
- **Corpus versionné, pas base de production** : les comptages de §1 viennent du seed et des
  migrations (la production n'est pas accessible depuis le dépôt, et aucun dump ne doit y être
  versionné). La base réelle est vraisemblablement **plus** fournie, ce qui va dans le sens des
  constats.
- **GL non mesuré séparément** : `GLFoodWebPanel` monte le même graphe, donc hérite de D1–D7,
  mais son corpus (par biome) n'a pas été compté ici.
