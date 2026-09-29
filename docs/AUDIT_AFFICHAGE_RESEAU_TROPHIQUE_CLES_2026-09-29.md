# Audit — Affichage graphique : réseau trophique et clés d'identification

**Date :** 29 septembre 2026
**Version :** 1.196.1 (`0eeaddf7b`)
**Méthode :** lecture statique des composants, styles et tests + **sondes exécutées** sur la
fonction de disposition des clés (`src/utils/idKeySchemaLayout.js`, importée telle quelle sous
Node). Pas de campagne navigateur live dans ce lot.
**Suite de :** [`AUDIT_RESEAU_TROPHIQUE_2026-09.md`](AUDIT_RESEAU_TROPHIQUE_2026-09.md),
[`AUDIT_RESEAU_TROPHIQUE_UX_PEDAGO_2026-09.md`](AUDIT_RESEAU_TROPHIQUE_UX_PEDAGO_2026-09.md),
[`AUDIT_RESEAU_TROPHIQUE_DENSITE_2026-09-16.md`](AUDIT_RESEAU_TROPHIQUE_DENSITE_2026-09-16.md)
(lots F1–F5 livrés). **Aucun audit antérieur** sur le schéma des clés d'identification.

> **Portée.** Deux rendus SVG pédagogiques : le graphe du réseau trophique (`FoodWebGraph`,
> partagé ForetMap / GL) et le mode **Schéma** des clés d'identification (`IdKeySchemaView`).
> Pour le réseau trophique, on ne rejoue pas les constats déjà traités : on relève seulement
> ce qui reste ouvert ou n'avait pas été vu.

---

## Verdict

| Rendu                         | Bloquants | Majeurs | Mineurs | Verdict                                                                                  |
| ----------------------------- | --------- | ------- | ------- | ---------------------------------------------------------------------------------------- |
| Réseau trophique (graphe)     | 0         | 1       | 5       | Mûr : trois audits, cinq lots livrés. Restent l'accessibilité tactile/clavier et le test |
| Clé d'identification (Schéma) | **2**     | **5**   | 5       | **Pas prêt pour la classe** : un toucher peut emprunter la mauvaise branche              |

Le contraste est net. Le graphe trophique a été mesuré, retravaillé et vérifié à l'écran ; le
schéma des clés est un premier jet (disposition en arbre naïve, dimensions codées en dur) qui
n'a jamais été confronté à une clé réelle. Ses deux bloquants tiennent à la géométrie, pas au
modèle de données : ils se corrigent dans un seul fichier pur, déjà couvert par des tests.

---

## Partie A — Clés d'identification, mode Schéma

### A.1 Ce que fait le rendu

`layoutIdKeySchema()` parcourt la clé depuis le couplet n°1 et place un arbre haut → bas :
chaque feuille réserve `H_GAP = 140` px de large, chaque niveau `V_GAP = 110` px de haut. Le
composant dessine un cercle par couplet (rayon 22), une ellipse par espèce (112 × 56), et au
milieu de chaque branche une étiquette de **140 × 28 px** portant l'énoncé tronqué à 42
caractères, avec l'image de la proposition au-dessus (40 × 40). Seules les branches du couplet
courant sont cliquables (zone de 144 × 44 px).

### A.2 Bloquants

#### K1 — Toucher une proposition peut choisir l'autre _(bloquant)_

Sur un couplet dont les deux propositions mènent à des espèces — c'est le **dernier couplet de
toute clé** —, les enfants sont à ± 70 px du parent, donc les milieux de branche à ± 35 px. Les
deux étiquettes de 140 px, centrées à 70 px l'une de l'autre, **se recouvrent sur la moitié de
leur largeur**, et leurs zones de clic (144 px) aussi. Sonde exécutée sur la fonction réelle :

```
lead:11 « Feuilles opposées »  centre x=153  zone de clic [81 ; 225]
lead:12 « Feuilles alternes »  centre x=223  zone de clic [151 ; 295]
recouvrement des zones de clic : 74 px
le centre de la 1re étiquette (x=153) est dans la zone de la 2e : oui
```

La seconde zone étant dessinée par-dessus, **toucher le centre de « Feuilles opposées » emprunte
la branche « Feuilles alternes »**, et l'élève arrive sur la mauvaise espèce avec le message
« Espèce identifiée ». Le recouvrement persiste, réduit, dès qu'une feuille est voisine d'un
sous-arbre plus large (35 px pour un couplet feuille + couplet à deux feuilles). Visuellement, les
deux énoncés s'impriment l'un sur l'autre au même endroit.

Preuve : `IdKeySchemaView.jsx:134-168` (rect 140 / tap 144 centrés sur `midX`),
`idKeySchemaLayout.js:7,164` (`H_GAP`, `midX` = milieu parent–enfant).

#### K2 — Un couplet partagé est dessiné deux fois, avec des branches dans le vide _(bloquant)_

Le serveur refuse les **cycles** (`routes/id-keys.js:131`) mais accepte qu'un même couplet soit
atteint par deux propositions — cas légitime (« deux chemins mènent au même critère »), et que
l'éditeur ne peut pas empêcher : la liste « Couplet suivant » propose tous les couplets sauf le
courant. La disposition, elle, suppose un arbre strict : `measure()` compte le sous-arbre deux
fois, `place()` le place deux fois et la seconde position écrase la première. Sonde (couplet 3
atteint depuis les couplets 1 et 2) :

```
arêtes : 8 dont 6 uniques — lead:31, lead:32 en double
couplet 3 placé en (608, 158)
arête lead:21 → pointe vers (188, 268) : aucun nœud à cet endroit
```

Conséquences : une branche qui s'arrête dans le vide, un sous-arbre fantôme dessiné une seconde
fois depuis un point vide, des **clés React en double** (`key={edge.id}`) — donc un rendu
instable au fil des mises à jour —, et un schéma plus large que nécessaire. Aucun test ne couvre
ce cas (`tests/id-key-schema-layout.test.js` n'utilise qu'un arbre strict).

### A.3 Majeurs

| ID  | Constat                                                                                                                                                                                                                                                                                                                                                         | Preuve                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| K3  | **L'énoncé est illisible.** Tronqué à 42 caractères (~260 px en `600 11px`) dans une boîte de 140 px : le texte **déborde** de son fond des deux côtés, dès ~22 caractères. Aucun `<title>` ni autre moyen de lire l'énoncé complet dans le schéma — or l'énoncé _est_ le contenu de la clé.                                                                    | `idKeySchemaLayout.js:45` (42), `IdKeySchemaView.jsx:134-148` (140 px, pas de `<title>`)          |
| K4  | **Schéma inaccessible au clavier et au lecteur d'écran.** Le conteneur porte `role="img"` : tout son contenu devient présentationnel. Les zones de clic sont des `<rect>` / `<path>` sans `tabIndex`, sans rôle, sans nom. Le mode Questions reste accessible (repli existant), mais rien ne l'indique à l'utilisateur.                                         | `IdKeySchemaView.jsx:64`, `:87-106`, `:150-168`                                                   |
| K5  | **Les images contournent le mode confidentialité.** Le mode Questions passe l'URL par `resolveExternalImageUrl()` (proxy `/api/media/remote` en mode `local`) ; le Schéma pose l'URL brute dans `<image href>`. En mode `local`, afficher le schéma envoie une requête directe à l'hébergeur tiers (IP de l'élève). La CSP (`img-src https:`) ne l'empêche pas. | `IdKeysView.jsx:145` vs `IdKeySchemaView.jsx:124-125` ; `src/shared/privacy/externalAssets.js:63` |
| K6  | **Le couplet courant n'est jamais ramené à l'écran.** Largeur mesurée : **2 336 px pour une clé de 16 espèces** (4 niveaux), dans une zone défilante de 70 vh. Après chaque choix, le nouveau couplet peut être hors cadre ; aucun défilement automatique, aucun zoom ni « ajuster à l'écran ». Sur tablette, l'élève cherche où il est.                        | `idKeySchemaLayout.js:203`, `index.css:3190-3195` (`overflow:auto`, SVG à taille naturelle)       |
| K7  | **Le schéma donne les réponses.** Toutes les espèces sont affichées et **toutes** sont touchables (`onOpenPlant`), y compris celles estompées hors du chemin : l'élève peut ouvrir la fiche finale sans avoir observé un seul caractère, et sans passer par l'écran « Espèce identifiée ». Utile au professeur, contraire à l'exercice pour l'élève.            | `IdKeySchemaView.jsx:202-209` (tap posé sans condition de chemin)                                 |

### A.4 Mineurs

| ID  | Constat                                                                                                                                                                                                                                                                                   | Preuve                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| K8  | L'image d'une proposition empiète sur le cercle du couplet parent (coin de l'image à 16,6 px du centre, rayon 22) et l'ensemble tap + image descend à 1 px de l'ellipse espèce.                                                                                                           | sonde ; `IdKeySchemaView.jsx:124-154`              |
| K9  | Consigne « Touchez une branche depuis le couplet mis en évidence (**nœud plein**) » : tous les nœuds sont pleins ; le courant se distingue par sa teinte seule, pas par une forme ou un libellé.                                                                                          | `IdKeySchemaView.jsx:237`, `index.css:3225-3233`   |
| K10 | Couleurs codées en dur (`#6b8f71`, `#2f6b3a`, `#86efac`, `#bbf7d0`, `#fef9c3`…) au lieu des jetons du thème ; courant / chemin / reste se distinguent par des verts proches — peu robustes au daltonisme.                                                                                 | `index.css:3197-3236`                              |
| K11 | Pas de **trace du chemin** : l'historique ne stocke que des couplets, pas les propositions choisies. On ne peut donc pas afficher « feuilles opposées → écorce lisse → Hêtre », qui est la justification attendue d'un élève. L'écran d'arrivée n'a pas non plus de « Retour » d'un cran. | `IdKeysView.jsx:30,46-56,59-85`                    |
| K12 | Proposition sans suite ni espèce, ou vers un couplet supprimé : ignorée en silence par le schéma, mais affichée en mode Questions comme un bouton qui ne fait rien. Couplets non reliés : invisibles dans le schéma.                                                                      | `idKeySchemaLayout.js:90-110`, `IdKeysView.jsx:46` |

### A.5 Pistes de correction (un lot, un fichier pur + le composant)

1. **Disposition** (K1, K2, K8) : remplacer la largeur fixe de feuille par une largeur qui
   **inclut l'étiquette** (≥ largeur de boîte + marge), ou poser les étiquettes **sur le segment
   vertical sous le parent** en disposition « orthogonale » (coude parent → barre horizontale →
   enfants), où chaque étiquette occupe la colonne de son enfant. Traiter la clé comme un **DAG** :
   placer chaque couplet une seule fois (au niveau le plus profond de ses parents) et relier les
   autres parents par une arête supplémentaire. Référence de principe : l'algorithme de
   Reingold–Tilford (« Tidier Drawings of Trees », _IEEE TSE_ 7(2), 1981) tel que repris par
   **d3-hierarchy** `tree()` (<https://github.com/d3/d3-hierarchy>, ISC) — dépendance légère à
   préférer à une réécriture si l'on veut aussi l'espacement des sous-arbres.
2. **Énoncé** (K3) : boîte dimensionnée au texte sur deux lignes (`<foreignObject>` ou découpage
   en `<tspan>`), `<title>` avec l'énoncé complet, et énoncé intégral dans un panneau sous le
   schéma pour le couplet courant.
3. **Accessibilité** (K4) : retirer `role="img"`, faire des branches actives de vrais boutons
   (`role="button"`, `tabIndex=0`, `aria-label` = énoncé complet, Entrée/Espace), comme le graphe
   trophique le fait déjà.
4. **Confidentialité** (K5) : passer `edge.image_url` par `resolveExternalImageUrl()`.
5. **Cadrage** (K6) : `scrollIntoView({ block: 'nearest', inline: 'center' })` sur le couplet
   courant après chaque choix ; option « ajuster à l'écran ».
6. **Pédagogie** (K7, K11) : pour les élèves, masquer les noms des espèces hors chemin (ellipse
   « ? ») et ne rendre touchable que la fiche atteinte ; mémoriser les propositions choisies pour
   afficher le chemin et le récapituler à l'arrivée.

**Tests à ajouter :** `tests/id-key-schema-layout.test.js` — aucune paire d'étiquettes voisines ne
se recouvre (clé à deux feuilles, clé équilibrée à 16 espèces), couplet partagé placé une fois et
identifiants d'arêtes uniques ; `tests-ui/components/pedago/IdKeySchemaView.test.jsx` — toucher
l'étiquette A appelle `onChooseLead` avec A, navigation clavier, URL d'image proxifiée.

---

## Partie B — Réseau trophique, état résiduel

Rappel : densité (D1–D7), isolement recomposé, sélection multiple, niveaux calculés (Levine),
disposition « Fiche », palette Okabe–Ito, barre d'outils à 44 px — **traités** (voir les trois
audits cités en tête). Ce qui reste :

| ID  | Sév.   | Constat                                                                                                                                                                                                                                                                                                                  | Preuve                                                    |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| T1  | majeur | **Cibles tactiles sous 44 px hors barre d'outils.** L'audit UX (`A11Y-01`) ne visait que la barre : les nœuds font 40 px (rayon 20), les cibles de flèche **24 px** (rayon 12), les puces de sélection 32 px, les bascules de légende 28 px. Sur tablette, toucher une flèche entre deux nœuds rapprochés est aléatoire. | `FoodWebGraph.jsx:58,1288` ; `food-web-graph.css:355,451` |
| T2  | mineur | **Tabulation toujours linéaire** (`A11Y-02` ouvert) : chaque nœud et chaque flèche est un arrêt de tabulation — ~260 arrêts sur un réseau de 80 espèces et 180 relations hors mode isolé.                                                                                                                                | `FoodWebGraph.jsx:1290,1329`                              |
| T3  | mineur | **Le survol re-rend tout le graphe** hors mode isolé (`hoverNode` / `hoverEdge` en state du composant) : le constat D5 n'est traité qu'en mode isolé.                                                                                                                                                                    | `FoodWebGraph.jsx:153-154,323-347`                        |
| T4  | mineur | **Test e2e permissif** : `pedago-food-web.spec.js` sort en succès si le graphe est vide et saute chaque étape si l'élément manque — il ne peut pas échouer sur une base sans relations. Aucun scénario ne couvre les dispositions Niveaux / Fiche ni l'export.                                                           | `e2e/pedago-food-web.spec.js:17-20,25,31,35`              |
| T5  | mineur | **Couleurs codées en dur** hors palette d'arêtes : résumé `#f7fbf8`, puce `#14532d`, légende `#f1f8f3` / `#1a3d2e`, menu `#eef4f0` — à rattacher aux jetons (cf. `AUDIT_UI_2026-09-16.md`, tokenisation de la couleur).                                                                                                  | `food-web-graph.css:360,373,389,407,416`                  |
| T6  | mineur | **Consigne trop longue** : le paragraphe d'aide sous le graphe enchaîne six gestes en cinq lignes ; sur téléphone il pousse la légende hors de vue. Un bouton « Aide » repliable suffirait.                                                                                                                              | `FoodWebGraph.jsx:1420-1426`                              |

Pistes : cible de toucher invisible élargie à 22 px de rayon autour des nœuds et 22 px sur les
flèches (le cercle visible ne change pas) ; tabulation itinérante (un seul arrêt pour le graphe,
flèches pour passer d'un nœud à ses voisins) ; survol porté par une classe CSS sur le groupe
plutôt que par un state React ; e2e alimenté par une fixture de relations au lieu de retours
anticipés.

GL : `GLFoodWebPanel` monte le même graphe, il hérite de T1–T6 et de leurs correctifs.

---

## Priorités

1. **K1 + K2** (bloquants, un seul fichier pur testé) — avant toute séance utilisant le Schéma.
2. **K5** (une ligne : confidentialité, cohérent avec l'audit RGPD du 28/09).
3. **K3 + K4 + K6** — lisibilité, accessibilité, cadrage du schéma.
4. **T1** — cibles tactiles du graphe trophique (tablettes en classe).
5. **K7 + K11** — arbitrage pédagogique à valider avec les professeurs (masquer les réponses,
   trace du chemin), puis mise à jour de `docs/reference/foretmap/plantes-et-biodiversite.md`.
6. T2–T6, K8–K12 au fil de l'eau.

## Références externes citées

| Source                                                                  | Usage ici                                | Licence |
| ----------------------------------------------------------------------- | ---------------------------------------- | ------- |
| Reingold & Tilford, « Tidier Drawings of Trees », _IEEE TSE_ 7(2), 1981 | Principe de disposition d'arbre (A.5)    | article |
| d3-hierarchy `tree()` — <https://github.com/d3/d3-hierarchy>            | Implémentation de référence / dépendance | ISC     |

Aucun code externe n'est repris dans ce lot : il ne contient que de la documentation.

## Limites

- **Pas de campagne navigateur** : les recouvrements de la partie A sont calculés sur les
  coordonnées réelles produites par la fonction de disposition et les dimensions codées dans le
  composant ; la largeur de texte (~6,2 px/caractère en `600 11px`) est estimée.
- **Aucune clé versionnée** : les clés sont rédigées par les professeurs en production ; les sondes
  utilisent des clés minimales construites pour l'audit. K1 se produit sur toute clé réelle (dernier
  couplet à deux espèces) ; K2 seulement si un couplet est partagé.
