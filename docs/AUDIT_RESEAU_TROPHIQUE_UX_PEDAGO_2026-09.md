# Audit — Réseau trophique : UI/UX, types d’affichage, pertinence pédagogique

**Date :** 14 septembre 2026  
**Version :** 1.156.4 (`2852c8c32`)  
**Méthode :** lecture statique du code + doc de référence + e2e existant  
_(pas de campagne navigateur live dans ce lot)_  
**Suite de :** [`AUDIT_RESEAU_TROPHIQUE_2026-09.md`](AUDIT_RESEAU_TROPHIQUE_2026-09.md)
(bugs d’affichage / navigation — **traités**).

> **Portée.** Évaluer la qualité d’usage et la pertinence pédagogique des **modes
> d’affichage** du réseau trophique ForetMap (élève / prof), pas rejouer les
> correctifs déjà livrés (nœud Environnement, molette, focus clavier, presets,
> pincement tablette, etc.).

---

## Verdict

| Indicateur          | Valeur                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------- |
| Score utilisabilité | **78 / 100**                                                                                 |
| Bloquants           | **0**                                                                                        |
| Majeurs / mineurs   | **5 / 7**                                                                                    |
| Verdict             | Outil pédagogique **solide** ; frictions de **cadrage** et de **signalétique**, pas de panne |

Les bases pédagogiques sont bonnes : preset **Réseau alimentaire** par défaut,
focus **Voisins / Chaîne**, orientation écologique des flèches, ancrage
carte/zone, export image. Les gains restants sont surtout ergonomiques
(simplifier les filtres, étiqueter les niveaux, rendre les gestes évidents).

---

## 1. Cartographie des types d’affichage

| Affichage                       | Où                      | Usage pédagogique attendu     | Pertinence /10 | Commentaire                                                           |
| ------------------------------- | ----------------------- | ----------------------------- | -------------- | --------------------------------------------------------------------- |
| Graphe · **Réseau alimentaire** | Preset (défaut)         | Chaîne alimentaire en classe  | **9**          | Herbivorie + prédation + décomposition — excellent cadrage            |
| Graphe · **Autres relations**   | Preset                  | Mutualismes / compétition     | **8**          | Évite de mélanger « qui mange qui » et « qui aide qui »               |
| Graphe · **Tout**               | Preset                  | Exploration libre             | **5**          | Saturé sans focus ; à réserver à l’atelier                            |
| Disposition **Cercle**          | Toolbar                 | Vue d’ensemble                | **6**          | Arcs par rôle (producteurs…) ; labels qui se chevauchent ~30+ espèces |
| Disposition **Niveaux**         | Toolbar                 | Pyramide trophique            | **7**          | Concept fort ; **pas d’étiquettes de colonnes** à l’écran             |
| Focus **Voisins** / **Chaîne**  | Toolbar (espèce isolée) | Micro-leçon « qui mange qui » | **9**          | Cœur pédagogique du module                                            |
| Vue **Liste**                   | Filtre Affichage        | Inventaire / admin            | **6**          | Groupée par type ; **sans** presets alimentaires                      |
| Export **PNG / SVG**            | Toolbar                 | Support de cours              | **8**          | Très utile vidéoprojection / polycopié                                |
| Légende (toggle types)          | Sous le graphe          | Lecture des figurés           | **8**          | Herbivorie ≠ prédation au trait (daltonisme) — à conserver            |

Sources code : `foodWebGraphModel.js` (`GRAPH_PRESETS`, layouts),
`FoodWebGraph.jsx` (toolbar), `FoodWebView.jsx` (`viewMode` liste/graphe).

---

## 2. Matrice personae (parcours « explorer le réseau »)

| Persona | Completion          | Friction principale                                  |
| ------- | ------------------- | ---------------------------------------------------- |
| Marie   | Oui avec friction   | Toolbar dense, double-clic opaque, cibles 36 px      |
| Théo    | Oui                 | Parcours fluide (presets, focus, recherche, clavier) |
| Sandra  | Oui avec friction   | Tablette : pincement OK, barre d’outils trop haute   |
| Karim   | Oui (confort moyen) | SVG accessible ; tabulation longue sur grand réseau  |

---

## 3. Constats

### Majeurs

| ID      | Catégorie        | Description                                                                                                                                      | Preuve technique                                                                                  | Effort |
| ------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------ |
| UX-01   | Charge cognitive | **Quatre** couches de filtrage : Type (aside) + presets + légende cliquable + « Flux trophiques ». Sur « Tout », la structure n’est plus claire. | `FoodWebView.jsx` filtre type ; `FoodWebGraph.jsx` presets / `hiddenTypes` / `toggleTrophicEdges` | moyen  |
| PED-01  | Pédagogie        | Disposition **Niveaux** sans libellés Producteurs / Consommateurs / Décomposeurs (seulement `title` du bouton).                                  | `FoodWebGraph.jsx` ~639–656 ; `computeTrophicLayout` sans labels SVG                              | rapide |
| UX-02   | Découvrabilité   | Ouvrir une fiche = double-clic / Maj+Entrée ; **pas de geste tactile** dédié. Intro encore centrée « flèche → glossaire ».                       | Intro `FoodWebView.jsx` ~601–604 ; hint `FoodWebGraph.jsx` ~967–970                               | rapide |
| PED-02  | Pédagogie        | Presets **Réseau alimentaire / Autres / Tout** absents de la vue **Liste**.                                                                      | Presets uniquement dans `FoodWebGraph` ; liste via `filteredItems` sans preset                    | rapide |
| A11Y-01 | Accessibilité    | Boutons toolbar `min-height: 36px` &lt; seuil tactile projet **44 px**.                                                                          | `src/index.css` `.pedago-foodweb-graph__tbtn`                                                     | rapide |

### Mineurs

| ID      | Catégorie     | Description                                                                                                | Effort   |
| ------- | ------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| PED-03  | Pédagogie     | Un seul rôle « consommateur » (pas C1/C2) — pyramide grossière.                                            | complexe |
| UX-03   | Densité UI    | Toolbar trop riche sur tablette (hauteur graphe réduite).                                                  | moyen    |
| A11Y-02 | Accessibilité | Tabulation nœud×arête sans roving tabindex (déjà hors périmètre sept. 2026).                               | moyen    |
| PED-04  | Parcours      | Pas de pont Quiz ↔ réseau après exploration.                                                               | moyen    |
| TEST-01 | Couverture    | e2e `pedago-food-web.spec.js` cible `.pedago-foodweb__edge` (liste) alors que le défaut est le **graphe**. | rapide   |
| PED-05  | Lisibilité    | Cercle saturé au-delà ~30 espèces (force-directed = lot séparé).                                           | complexe |
| WORD-01 | Wording       | Intro / hint incomplets (pincement, clavier, Voisins↔Chaîne, panneau relation).                            | rapide   |

---

## 4. Top 5 priorités (impact × effort)

1. **Étiquettes de colonnes** sur disposition Niveaux (PED-01) — rapide, fort gain classe.
2. **Presets dans `FoodWebView`** (liste + graphe) + simplification « Flux trophiques » vs preset (UX-01, PED-02).
3. **Intro / hint / geste fiche** (tactile + wording) (UX-02, WORD-01).
4. **min-height ≥ 44 px** sur la toolbar (A11Y-01).
5. **e2e mode graphe** : preset, focus, panneau sous le graphe (TEST-01).

---

## 5. Points forts à conserver

- Preset **Réseau alimentaire** par défaut — bon choix pour une séance SVT.
- Focus **Voisins → Chaîne** — fait vivre la chaîne alimentaire.
- Orientation écologique (« est mangée par ») + styles distincts herbivorie / prédation.
- Filtre carte/zone avec espèces hors périmètre **marquées** (pas coupées).
- Accessibilité clavier du SVG (`role="group"`, nœuds/arêtes actionnables).
- Contenu ancré jardin (détritivores, méditerranéen) documenté dans
  `docs/reference/foretmap/pedagogie-quiz-glossaire-reseau.md`.

---

## 6. Trois chantiers structurels

1. **Cadrage pédagogique unique** : un seul endroit pour choisir « ce qu’on montre »
   (presets au niveau vue), légende = lecture/masquage fin, retirer ou reléguer
   « Flux trophiques » quand le preset alimentaire est actif.
2. **Signalétique des niveaux trophiques** : labels de colonnes + (plus tard) C1/C2
   si le catalogue de rôles le permet.
3. **Parcours classe** : scénario guidé court (isoler → chaîne → flèche → glossaire)
   - e2e graphe ; pont optionnel vers une question Quiz liée.

---

## 7. Hors périmètre / déjà traités

Voir [`AUDIT_RESEAU_TROPHIQUE_2026-09.md`](AUDIT_RESEAU_TROPHIQUE_2026-09.md) :
nœud Environnement, molette, focus depuis fiche plante, panneau sous le graphe,
arêtes parallèles, pincement, édition PUT, etc. — **ne pas rouvrir** sans régression.

GL réutilise `FoodWebGraph` (`GLFoodWebPanel.jsx`) : les correctifs graphe
bénéficient aux deux produits ; la vue liste / presets côté GL n’ont pas été
audités en profondeur ici.
