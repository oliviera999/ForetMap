# Plan — Réseau trophique : UX, pédagogie, couleurs

**Date :** 14 septembre 2026  
**Base :** [`AUDIT_RESEAU_TROPHIQUE_UX_PEDAGO_2026-09.md`](AUDIT_RESEAU_TROPHIQUE_UX_PEDAGO_2026-09.md)

- [`AUDIT_RESEAU_TROPHIQUE_2026-09.md`](AUDIT_RESEAU_TROPHIQUE_2026-09.md) (déjà livré)
- constat **couleurs / tons trop proches** (palette actuelle)

> Instantané de planification. La vérité vivante après livraison reste
> `docs/reference/foretmap/pedagogie-quiz-glossaire-reseau.md`, `CHANGELOG`, tests.

---

## 0. Objectifs et non-objectifs

### Objectifs

1. **Lisibilité en classe** (vidéoprojection + tablette) : chaque type de relation
   se distingue par **couleur + figuré + épaisseur**, y compris en vision daltonienne.
2. **Cadrage pédagogique unique** : un élève sait en ≤ 2 gestes s’il regarde une
   chaîne alimentaire ou « le reste ».
3. **Parité Liste / Graphe** pour les presets et la légende des couleurs.
4. **Découvrabilité** des gestes (fiche espèce, chaîne, flèche) sans jargon.
5. **Accessibilité tactile / clavier** alignée sur les conventions projet (≥ 44 px).

### Non-objectifs (hors plan, sauf lot dédié ultérieur)

- Disposition force-directed / clustering automatique au-delà de ~30 nœuds.
- Sous-niveaux C1/C2 consommateurs (nécessite enrichissement des rôles en BDD).
- Pont Quiz ↔ réseau (gating / rattachements).
- Refonte GL-spécifique au-delà du graphe partagé (`FoodWebGraph`).
- Changer le sens écologique des flèches (« est mangée par ») — **déjà correct**.

### Principes de design

- **Source unique de vérité visuelle** : `src/shared/foodWebEdgeStyle.js`
  (`INTERACTION_EDGE_STYLES`) → CSS page (`index.css`) + CSS export
  (`buildEdgeExportCss`) + pastilles vue liste (`--fw-edge-color`) **dérivés**,
  jamais recopiés à la main sans test de sync.
- **Ne jamais distinguer deux types par la seule teinte** : toujours un second
  canal (tirets / double flèche / épaisseur / symbole légende).
- **Preset = cadrage** ; **légende = masquage fin** ; pas de troisième bouton
  qui refait le même métier (« Flux trophiques » à simplifier).

---

## 1. Diagnostic couleurs (à traiter en priorité)

### Palette actuelle (`INTERACTION_EDGE_STYLES`)

| Type          | Couleur   | Figuré          | Cluster problématique                                   |
| ------------- | --------- | --------------- | ------------------------------------------------------- |
| herbivorie    | `#c2410c` | tirets 12 5     | **Chauds** avec prédation & décomposition               |
| predation     | `#b91c1c` | plein 2.4       | Rouge voisin de l’orange herbivorie                     |
| decomposition | `#78350f` | tirets 8 4      | Brun trop proche des rouges en projection / petit trait |
| pollinisation | `#ca8a04` | tirets 6 3      | OK (jaune)                                              |
| plante_hote   | `#15803d` | points 2 4      | **Verts/teal** avec symbiose                            |
| nitrification | `#1d4ed8` | tirets mixtes   | OK (bleu)                                               |
| symbiose      | `#0f766e` | plein 2.2       | Teal trop proche du vert plante hôte                    |
| competition   | `#4b5563` | tirets 4 4      | OK (gris)                                               |
| _sélection_   | `#16a34a` | (conserve dash) | **Tous** deviennent verts → perte d’identité du type    |

### Constats couleur (nouveaux IDs)

| ID       | Sév.   | Description                                                                                      |
| -------- | ------ | ------------------------------------------------------------------------------------------------ |
| COLOR-01 | majeur | Cluster chaud herbivorie / prédation / décomposition trop homogène au coup d’œil                 |
| COLOR-02 | majeur | Cluster vert plante_hôte / symbiose trop proche                                                  |
| COLOR-03 | mineur | Survol/sélection en vert unique efface la couleur de type (légende ment)                         |
| COLOR-04 | mineur | Tests n’exigent que « couleurs toutes différentes » (égalité hex), pas une distance perceptuelle |

### Cible palette (proposition à valider en lot A)

Répartition par **famille sémantique** + écart de teinte / luminosité :

| Famille                | Types         | Direction couleur                           | Figuré (inchangé ou renforcé)           |
| ---------------------- | ------------- | ------------------------------------------- | --------------------------------------- |
| Flux trophiques        | prédation     | Rouge franc saturé                          | Trait plein épais                       |
| Flux trophiques        | herbivorie    | Orange / ambre **plus clair**               | Tirets longs (déjà)                     |
| Flux trophiques        | décomposition | Brun-violet ou ocre **distinct**            | Tirets moyens + éventuellement plus fin |
| Interactions positives | pollinisation | Jaune / or (garder)                         | Tirets                                  |
| Interactions positives | plante_hôte   | Vert feuille (garder)                       | Pointillés                              |
| Interactions positives | symbiose      | **Cyan / bleu-vert clair**, pas teal sombre | Trait plein + double flèche (déjà)      |
| Cycles / sol           | nitrification | Bleu roi (garder)                           | Tirets mixtes                           |
| Négatif / stress       | compétition   | Gris-violet ou prune (légèrement teinté)    | Tirets                                  |

**Sélection / survol :** plutôt **halo / stroke externe** ou **opacité + anneau**,
pas un remplacement de couleur ; ou bien souligner en gardant la teinte de type

- bordure `#16a34a`.

**Critère d’acceptation :** test automatisé de **distance minimale** entre paires
(ex. ΔE ou distance RGB normalisée + assertion dash/width différents pour paires
chaudes) ; revue visuelle tablette + projection ; check mental deutan/protan
(figuré suffit si ΔE faible).

Inspiration : palettes **Okabe–Ito** / **Wong** (daltonisme) adaptées au thème
forêt — à citer dans le commit si on reprend une table publiée.

---

## 2. Architecture cible des contrôles

```
FoodWebView
├── Preset pédagogique (Alimentaire | Autres | Tout)   ← UNIQUE cadrage
├── Filtres contexte : Carte / Zone
├── Affichage : Graphe | Liste
├── [optionnel] Filtre type fin — UNIQUEMENT si preset = Tout,
│                 sinon retiré ou synchronisé au preset
└── FoodWebGraph / Liste
    ├── Disposition : Cercle | Niveaux (+ labels colonnes)
    ├── Zoom / recherche / focus Voisins|Chaîne
    ├── Légende : toggle types présents (masquage fin)
    └── ✗ bouton « Flux trophiques » (supprimé ou fusionné légende)
```

---

## 3. Lots de livraison (ordonnés)

### Lot A — Couleurs & signalétique visuelle _(fondation)_

| #   | Tâche                                                                                     | Fichiers                                            | Effort | IDs         |
| --- | ----------------------------------------------------------------------------------------- | --------------------------------------------------- | ------ | ----------- |
| A1  | Nouvelle palette + figurés ; sync `index.css` + export + liste                            | `foodWebEdgeStyle.js`, `index.css`, pastilles liste | moyen  | COLOR-01/02 |
| A2  | Sélection/survol sans écraser la teinte de type                                           | `FoodWebGraph.jsx`, CSS, export                     | moyen  | COLOR-03    |
| A3  | Tests distance / dual-canal (couleur ≠ seule distinction)                                 | `foodWebEdgeStyle.test.js`                          | rapide | COLOR-04    |
| A4  | Étiquettes colonnes « Producteurs / Consommateurs / Décomposeurs » en disposition Niveaux | `FoodWebGraph.jsx`, CSS                             | rapide | PED-01      |
| A5  | Doc référence : mentionner la nouvelle lecture visuelle des traits                        | `docs/reference/foretmap/pedagogie-…`               | rapide | —           |

**DoD A :** `npm run test:ui` (styles) vert ; export PNG légende cohérente ; revue ΔE documentée dans le commit.

---

### Lot B — Cadrage pédagogique & filtres

| #   | Tâche                                                                       | Fichiers                              | Effort | IDs            |
| --- | --------------------------------------------------------------------------- | ------------------------------------- | ------ | -------------- |
| B1  | Remonter `GRAPH_PRESETS` dans `FoodWebView` (état partagé liste+graphe)     | `FoodWebView.jsx`, `FoodWebGraph.jsx` | moyen  | PED-02, UX-01  |
| B2  | Supprimer ou reléguer « Flux trophiques » (redondant avec preset + légende) | `FoodWebGraph.jsx`                    | rapide | UX-01          |
| B3  | Filtre « Type d’interaction » : masqué si preset ≠ Tout, ou sync auto       | `FoodWebView.jsx`                     | rapide | UX-01          |
| B4  | Intro + hint réécrits (relation sous le graphe, chaîne, pincement, fiche)   | `FoodWebView.jsx`, `FoodWebGraph.jsx` | rapide | WORD-01, UX-02 |

**DoD B :** un seul endroit pour « Réseau alimentaire » ; liste et graphe montrent le même sous-ensemble ; tests `FoodWebView.test.jsx` mis à jour.

---

### Lot C — Découvrabilité & tactile

| #   | Tâche                                                                                    | Fichiers                              | Effort | IDs     |
| --- | ---------------------------------------------------------------------------------------- | ------------------------------------- | ------ | ------- |
| C1  | Action explicite « Voir la fiche » dans le panneau / long-press ou bouton sur nœud focus | `FoodWebGraph.jsx`, `FoodWebView.jsx` | moyen  | UX-02   |
| C2  | Toolbar `min-height` / padding ≥ 44 px ; recherche confortable                           | `index.css` / `food-web-graph.css`    | rapide | A11Y-01 |
| C3  | Toolbar compacte mobile : regrouper Export + Zoom dans un menu « … » sous 768 px         | CSS + éventuellement sous-composant   | moyen  | UX-03   |

**DoD C :** parcours tablette (Sandra) : isoler → chaîne → fiche sans double-clic ; cibles ≥ 44 px.

---

### Lot D — Tests & non-régression

| #   | Tâche                                                               | Fichiers                       | Effort | IDs       |
| --- | ------------------------------------------------------------------- | ------------------------------ | ------ | --------- |
| D1  | e2e graphe : preset alimentaire, clic arête → panneau, focus Chaîne | `e2e/pedago-food-web.spec.js`  | moyen  | TEST-01   |
| D2  | UI tests presets partagés + labels Niveaux                          | `tests-ui/components/pedago/*` | rapide | PED-01/02 |
| D3  | Smoke export CSS contient nouvelles couleurs                        | `foodWebEdgeStyle.test.js`     | rapide | A1        |

**DoD D :** `npm test` + `npm run test:ui` + scénario e2e food-web vert en CI.

---

### Lot E — Améliorations différées _(backlog, pas bloquant)_

| #   | Tâche                                                   | Effort   | IDs     |
| --- | ------------------------------------------------------- | -------- | ------- |
| E1  | Roving tabindex (grille de nœuds)                       | moyen    | A11Y-02 |
| E2  | Rôles C1/C2 + colonne supplémentaire Niveaux            | complexe | PED-03  |
| E3  | Disposition force-directed / collapsible clusters       | complexe | PED-05  |
| E4  | Pont « Question liée » après exploration d’une relation | moyen    | PED-04  |
| E5  | Scénario guidé prof (3 étapes overlay)                  | moyen    | —       |

---

## 4. Ordre recommandé et dépendances

```
A (couleurs + labels Niveaux)
 └─► B (presets / filtres / wording)
      └─► C (tactile / fiche / toolbar)
           └─► D (e2e / tests)   ← peut démarrer en parallèle dès A3/B1
E (backlog) indépendant, après D
```

**Ne pas** ouvrir E2/E3 dans la même PR que A–D (risque de conflit CHANGELOG / scope).

**Anti-conflit PR :** une seule PR versionnante à la fois ; bump tardif ; vérifier
autres PR ouvertes sur `CHANGELOG.md` / migrations (aucune migration attendue ici).

---

## 5. Risques et arbitrages

| Risque                                                             | Mitigation                                                                         |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Changer les couleurs casse la « mémoire » des élèves déjà habitués | Légende toujours visible ; mention courte dans l’intro une version ; doc référence |
| Duplication CSS page / export / liste                              | Helper unique + test « mêmes hex dans export et styles »                           |
| Preset dans View vs état local Graph                               | State lifté ; Graph reçoit `preset` contrôlé (prop)                                |
| GL partage `FoodWebGraph`                                          | Lot A/C profitent à GL automatiquement ; vérifier `GLFoodWebPanel` après A         |
| Sélection sans vert exclusif                                       | Contraste anneau vs fond ; ne pas baisser l’accessibilité focus                    |

---

## 6. Critères de succès globaux

- [ ] En mode **Réseau alimentaire**, herbivorie / prédation / décomposition
      distinguables **sans légende** à 1,5 m d’un écran de classe (revue humaine).
- [ ] En mode **Autres relations**, plante hôte ≠ symbiose au premier regard.
- [ ] Liste et graphe : même preset → mêmes relations.
- [ ] Élève tablette : isoler une espèce + ouvrir sa fiche **sans double-clic**.
- [ ] Aucune régression sur les correctifs sept. 2026 (tests existants verts).
- [ ] Doc `docs/reference/foretmap/pedagogie-quiz-glossaire-reseau.md` à jour.

---

## 7. Estimation indicative

| Lot           | Effort global | Contenu                                           |
| ------------- | ------------- | ------------------------------------------------- |
| A             | ~1–1,5 j      | Palette + sélection + labels + tests couleurs     |
| B             | ~1 j          | Presets liftés + simplification filtres + wording |
| C             | ~0,5–1 j      | Fiche tactile + 44 px + toolbar compacte          |
| D             | ~0,5 j        | e2e + UI tests                                    |
| **Total A–D** | **~3–4 j**    | Plan « exhaustif actionnable »                    |
| E             | backlog       | Selon priorité produit                            |

---

## 8. Première action proposée

Démarrer par **Lot A** (couleurs + labels Niveaux) : gain immédiat en classe,
faible risque métier, bénéficie aussi à GL, et débloque la confiance visuelle
avant de toucher à l’architecture des filtres (Lot B).
