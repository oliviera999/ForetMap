---
name: gl-banc
description: Banc de simulation « Tenir à deux » de Gnomes & Licornes (tools/gl-sim) — préparer la base _sim, lancer un scénario, choisir une graine, lire le rapport, attendus d'équilibrage. À lire avant de lancer npm run gl:sim, d'ajouter un scénario, de changer une règle qui touche l'équilibre du jeu, ou pour vérifier un contenu sur le corpus réel. Le banc ne tourne jamais sur la base de production.
---

# Banc de simulation (`tools/gl-sim/`)

Le banc joue des chapitres entiers contre le **vrai moteur** : un prof et des élèves virtuels
pilotent l'API par supertest, en mémoire. Vue d'ensemble : `docs/GL_SIMULATION.md` ; mode
d'emploi fichier par fichier : `tools/gl-sim/README.md`.

## Jamais la base de production

`tools/gl-sim/garde.js` refuse toute base dont le nom ne finit pas par `_sim` ou `_test`, et
`NODE_ENV=production` sans `GL_SIM_ALLOW=1`. Ne jamais contourner ce garde-fou, ne jamais
pointer `DB_NAME` vers une base réelle. Aucune donnée d'élève : classes et élèves sont créés
par le banc (`sim-<scenario>-<n>`).

## Préparer la base

```bash
npm run gl:sim:db                       # foretmap_sim par défaut (GL_SIM_DB ou -- --db <nom>_sim)
```

Ce que fait `db.js` : schéma et migrations, vidage des tables G&L, chargement de l'instantané
de contenu `data/gl/sim/contenu-prod-*.json` (13 tables de contenu, aucune table de personnes),
**rejeu des migrations postérieures à l'instantané** (leurs corrections de contenu s'appliquent
ainsi au corpus chargé), synchronisation forcée des catalogues `data/gl/tenir/`. La sortie
liste les fichiers `refuses` : elle doit être vide.

La base `_sim` sert aussi à vérifier un contenu sur le corpus réel :

```bash
TEST_DB_NAME=foretmap_sim FORETMAP_ALLOW_NON_TEST_DB=1 \
  node --test --test-concurrency=1 --test-force-exit tests/content/gl-*.test.js
DB_NAME=foretmap_sim npm run gl:import:tenir -- --fichier tous --strict --dry-run
```

## Lancer

```bash
npm run gl:sim -- --liste
npm run gl:sim -- --scenario hybride-reference --runs 5 --seed 14
npm run gl:sim -- --scenario equilibrage --runs 20 --seed 1     # grille × classes × plateaux
npm run test:sim                                                 # fumée de CI, graine fixe
```

Options utiles : `--seances N`, `--plateaux 1,3`, `--mots-interdits souple|strict`,
`--fuites-bourses echouer|avertir`, `--arret-premier-echec`, `--sortie <dossier>`.

- **Graine** : `--seed` fixe l'aléa du serveur (`GL_RANDOM_SEED`) et celui des personas. Même
  graine, même scénario, même code → même partie. Changer de graine pour chercher un cas rare,
  garder la graine pour comparer avant / après.
- **Scénarios** : `tools/gl-sim/scenarios/` (`base.js` porte les variantes, `equilibrage.js` la
  grille, `regression-7nov.js` les assertions C1-C10). Un scénario nouveau s'ajoute à `index.js`.

- **Plusieurs appareils** : `multi-appareils` joue le chapitre 1 avec deux tablettes par équipe,
  qui envoient chaque geste au même instant (`equipe.js › appelADeuxAppareils`). Ses assertions
  (`DOUBLONS`, `LIVRE`, `MAINS`…) font échouer la fumée `npm run test:sim`. À relancer dès qu'on
  touche à `lib/glEquipeEtat.js`, à une route d'équipe ou aux sessions d'équipe.

- **Une monnaie** : `une-monnaie` joue une année (plateaux 1 à 4, bourses gardées) pour une classe
  moyenne et une classe en difficulté. Ses mesures `uneMonnaie` (bourse moyenne, élèves au plafond
  et à zéro, pot des équipes à l'ouverture de chaque séance) se lisent dans `summary.json` ; ses
  assertions `COEURS` et `PARURES` sont dures, `PLAFOND` et `BOURSES-FIN` sont des signaux. À
  relancer dès qu'on touche au prix d'un sort, à un gain ou au plafond.

## Ce qui fait échouer

Après **chaque geste** : `checkTenirInvariantsFromDb`, réponse 5xx, mot interdit dans une
chaîne du **moteur**, bourse d'une autre équipe servie à un élève. Un mot interdit dans le
**corpus** (feuillet, question, retour) est un avertissement, sauf `--mots-interdits strict`.
Un refus 4xx attendu (fenêtre fermée, quota) est compté, pas fatal.

## Lire le rapport

`reports/gl-sim/<date>-<scenario>/summary.json` et `index.html` (autonome). Regarder d'abord :
échecs et invariants, puis par plateau la part d'équipes sous le voile, de pages pâlies et
tenues, le carnet complet, la durée en séances, les bourses au plafond. L'outil MCP
`gl_sim_reports` lit `summary.json`.

## Attendus d'équilibrage

`tools/gl-sim/attendus.js` : des **avertissements**, jamais des échecs. Médianes de référence
par classe (moyenne, en difficulté) et par plateau dans `docs/GL_SIMULATION.md` § 5. Une règle
qui déplace ces médianes se dit dans la description de PR, avec les deux résultats (avant,
après) à graine égale. Exploration rapide sans base : `npm run gl:sim:rapide`.
