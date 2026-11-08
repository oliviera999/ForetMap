# Banc de simulation « Tenir à deux » (`tools/gl-sim/`)

Le banc joue des **chapitres entiers** de Gnomes & Licornes (mouture « Tenir à deux » v2) contre
le **vrai moteur** : un prof virtuel et une classe d'élèves virtuels pilotent l'API réelle par
supertest, en mémoire, sur une base dédiée chargée avec un instantané du contenu de production.
Il mesure l'équilibre du jeu (voile, pages, bourses, séances), rejoue les invariants après chaque
geste, passe au crible ce qui est servi aux élèves et écrit un rapport autonome par scénario.
Le mode d'emploi détaillé (architecture fichier par fichier, options) est dans
`tools/gl-sim/README.md` ; ce document donne la vue d'ensemble, les attendus et les résultats.

Documents voisins : `GL_TENIR_A_DEUX.md` (architecture du mode), `GL_TENIR_A_DEUX_REGLES.md`
(règles jouées), `GL_TESTS.md` (suites), `REWARDS_ENGINE.md` (badges).

## 1. Garde-fous tenus par le code

| Garde-fou                          | Comment le banc le tient                                                                                                                                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jamais la base de prod             | `garde.js` refuse une base dont le nom ne finit pas par `_sim` ou `_test`, et `NODE_ENV=production` sans `GL_SIM_ALLOW=1` (testé dans `tests/gl-sim-pur.test.js`).                                                                           |
| Aucune donnée d'élève              | Classes et élèves créés par le banc (`sim-<scenario>-<n>`), rapports en agrégats ; l'instantané de contenu (`snapshot.js`) n'exporte que 13 tables de contenu et refuse toute table de personnes ou colonne nominative.                      |
| Souffle jamais personnifié, oiseau | Tout corps servi à un élève passe par `findForbiddenString` : une chaîne du **moteur** arrête l'exécution ; une chaîne du **corpus** (feuillet, question, retour de QCM) est comptée en avertissement (`--mots-interdits strict` la bloque). |
| L'erreur ne punit pas              | « Pas encore… » vérifié dans les retours ; `faux / raté / perdu` interdits côté moteur.                                                                                                                                                      |
| Ressources par les seules sources  | Invariant `GAIN_NON_DOCUMENTE` du grand livre (`lib/glTenirInvariants.js`) à chaque geste.                                                                                                                                                   |
| Soldes privés                      | Toute bourse d'une autre équipe servie à un élève arrête l'exécution (`--fuites-bourses avertir` la compte).                                                                                                                                 |
| Tout le réel passe par le prof     | Classe, élèves, partie, profil, équipes, démarrage, phases, absences, retraits, clôture : API prof uniquement.                                                                                                                               |
| Isolation G&L                      | Jetons signés comme à la connexion (`signAuthToken`, produit `gl`), aucune route ForetMap appelée.                                                                                                                                           |

## 2. Commandes

```bash
# 1. Instantané de contenu (tables de contenu seulement) depuis une base LOCALE (jamais la prod)
npm run gl:sim:snapshot -- --from-db foretmap_local --out data/gl/sim/contenu-prod-2026-11-07.json

# 2. Base du banc : schéma + migrations, vidage des tables G&L, instantané, catalogues data/gl/tenir
npm run gl:sim:db                              # GL_SIM_DB ou -- --db <nom>_sim (défaut foretmap_sim)

# 3. Exécutions (rapport dans reports/gl-sim/<date>-<scenario>/)
npm run gl:sim -- --liste
npm run gl:sim -- --scenario regression-7nov --runs 5 --seed 7
npm run gl:sim -- --scenario equilibrage --runs 20 --seed 1      # grille × classes × plateaux
npm run gl:sim -- --scenario badges --runs 10 --seed 3
npm run gl:sim -- --scenario all --runs 3 --seed 1               # tous sauf equilibrage
#   options : --seances N  --plateaux 1,3  --jours-veillee 7  --grille <fichier>
#             --fuites-bourses echouer|avertir  --mots-interdits souple|strict
#             --sortie <dossier>  --arret-premier-echec  --db <nom>_sim

# 4. Modèle rapide (Python 3 sans dépendance, quelques secondes)
npm run gl:sim:rapide -- --voile 3,4,5,6 --e2 --e3 --classe moyenne --runs 4000 [--json]

# 5. Fumée en CI (hybride + tablette, 1 exécution, 3 séances, graine fixe)
npm run test:sim                               # TEST_DB_NAME=foretmap_test (ou <nom>_sim en local)
node --test tests/gl-sim-pur.test.js           # fonctions pures : garde, personas, stats, attendus
```

Pour paralléliser une grille longue, lancer plusieurs bases `_sim` (`--db foretmap_b1_sim
--plateaux 1,2 --sortie reports/gl-sim/equilibrage-p12`, etc.) : les graines dérivent de
`--seed`, du scénario, de la variante et du rang d'exécution, pas de la base.

Variables : `GL_SIM_DB` (base par défaut), `GL_RANDOM_SEED` et `GL_SIM_ALLOW=1` (posées par le
banc : aléa serveur rejouable, horloge `X-GL-Sim-Clock`), `LOG_LEVEL` (défaut `warn`).

## 3. Personas et déroulé

Un élève virtuel = `{ justesse, assiduite, veillee, strategieFouille, penchants: { marche,
sorts, dons } }`. Classes : `moyenne` (justesse ~ N(0,65 ; 0,12)), `difficulte` (N(0,45 ; 0,12)),
`experte` (N(0,8 ; 0,1)) ; assiduité ~ N(0,92 ; 0,06) ; veillée ~ N(0,35 ; 0,2) ; stratégie de
fouille `aveugle` / `futee` / `mixte` ; penchants uniformes. L'**opérateur** d'un geste tourne
parmi les présents ; un geste porté par le prof (surface `tableau`) prend la justesse moyenne.

Une exécution : classe, élèves, partie, profil et surface, équipes (répartition ronde ou
composition automatique de l'app pour `annee-complete`), démarrage ; puis des séances
(présences et absences, retraits, `tour/ouvrir`, phase jeu, fenêtre de fouille en hybride,
chaque équipe : sorts avant le jet, jet, arrivée — question de case ou péripétie —, sorts après le
jet et d'entraide, fouilles, lecture / tenue, Marché ; relecture des écrans d'un élève par
équipe ; bilan Team Spirit ; phase souffle ou `dort` ; clos) séparées par une semaine de veillée
(horloge avancée de 7 jours : lecture / tenue, étude d'une espèce, Marché) ; fin au camp ou à la
6e séance (`POST /end` : caravane, honneurs, badges). **À chaque geste** :
`checkTenirInvariantsFromDb`, 5xx, mots interdits, bourses d'une autre équipe.

## 4. Scénarios (23)

| Scénario                                  | Particularité                                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `hybride-reference`, `tablette-reference` | 20 élèves, classe moyenne, plateau 1, 6 séances au plus ; en tablette les élèves lancent (dés serveur)      |
| `tableau-pur`                             | le prof porte les cinq gestes de l'équipe active ; Marché en veillée                                        |
| `classe-en-difficulte`, `classe-experte`  | justesse ~ N(0,45) / N(0,8)                                                                                 |
| `effectif-24`, `effectif-17`              | équipes de 6 / de 4-5                                                                                       |
| `absences-retraits`                       | deux absents aux séances 2 et 4, retraits posés par le prof aux séances 2-3 et 5                            |
| `economie-agressive`                      | penchants sorts 0,95, Marché 0,9, dons 0,6                                                                  |
| `chasse-aveugle`, `chasse-futee`          | stratégie de fouille imposée                                                                                |
| `voile-max`, `voile-dort`                 | bonus {6,6,7,8} ; dé gris une séance sur deux                                                               |
| `prologue`                                | profil `prologue` (sans voile, Marché, chapardeur)                                                          |
| `plateau-2`, `plateau-3`, `plateau-4`     | un plateau                                                                                                  |
| `annee-complete`                          | 4 chapitres, mêmes élèves, composition automatique (peuples inversés), double plafond mesuré en fin d'année |
| `concurrence`                             | équipes en parallèle (`Promise.all`), tablette                                                              |
| `veillee-semaine`                         | veillée ~ N(0,8 ; 0,1)                                                                                      |
| `regression-7nov`                         | C1-C10 en assertions (Progression hors fenêtre, retrait, parure sans image…)                                |
| `equilibrage`                             | grille × {moyenne, difficulté} × plateaux 1-4, variantes côte à côte, écart aux références du modèle rapide |
| `badges`                                  | `GET /api/gl/rewards/me` : part d'élèves avec un palier Fil, Spearman justesse ↔ paliers, aucun classement  |

## 5. Grille d'équilibrage et attendus

`data/gl/sim/grilles/grille-voile.json` (`gl-sim-grille v1`) : `actuel` {4,4,5,6} sans E2 / E3 /
E4 ; `e1` {3,4,5,6} + E2 + E3 (**réglage livré**) ; `douce` {3,3,4,4} ; `3-3-4-5` ;
`e1-sans-e2` ; `e1-sans-e3` ; `e1-e2-e3-e4` (réserve de la caravane en plus).

Attendus (`attendus.js`, § 7.6 du cahier des charges) : **avertissements** du rapport, jamais des
échecs. Médianes du banc par classe et par plateau :

| Indicateur                                       | Classe moyenne                    | Classe en difficulté    |
| ------------------------------------------------ | --------------------------------- | ----------------------- |
| Chapitre en 4 à 6 séances (% des exécutions)     | ≥ 95                              | ≥ 90                    |
| Équipes passées sous le voile (%)                | P1 15-30 · P2 30-45 · P3-P4 50-70 | P1-P2 ≤ 50 · P3-P4 ≤ 80 |
| Pages pâlies au Seuil (% des zones)              | P1-P2 ≤ 30 · P3-P4 ≤ 50           | P1-P2 ≤ 40 · P3-P4 ≤ 65 |
| Pages tenues au Seuil (% des zones)              | P1-P2 ≥ 70 · P3-P4 ≥ 50           | P1-P2 ≥ 55 · P3-P4 ≥ 33 |
| Carnet complet (% des exécutions)                | P1-P2 20-40 · P3-P4 ≥ 1           | —                       |
| Part des Gnomes dans les pages (%)               | 40-55                             | 40-55                   |
| Élèves à 0 / 0 en fin de chapitre (%)            | ≤ 5                               | ≤ 5                     |
| Double plafond 8/8 en fin d'année (%)            | ≤ 20                              | —                       |
| Indice Matthieu (Spearman justesse ↔ ressources) | ≤ 0,3                             | ≤ 0,3                   |
| Gini des bourses                                 | ≤ 0,25                            | ≤ 0,25                  |
| Élèves avec un palier Fil fin chapitre 1 (%)     | ≥ 90                              | ≥ 85                    |
| Spearman justesse ↔ paliers                      | ≤ 0,3                             | ≤ 0,3                   |

`experte` lit la colonne moyenne. Le rapport d'`equilibrage` compare aussi ses médianes aux
références du modèle rapide (`data/gl/sim/modele-rapide-reference.json`, variantes `actuel` et
`e1`) et signale tout écart de plus de 10 points.

## 6. Modèle rapide et banc

Le modèle Monte-Carlo (`tools/gl-sim/modele-rapide/sim_tenir_modele.py`) **explore** : 4 000
chapitres par plateau en quelques secondes sur les vraies cases et zones, options `--voile --e2
--e3 --e4 --classe --fouille --tenue --sorts-avance --reparation-facteur`. Le banc **confirme**
contre le moteur réel. Calibrage (graine 7) : le modèle reproduit les références avec un écart
maximal de 4,6 points (`actuel`) et 4,8 points (`e1`) ; hypothèses documentées dans l'aide du
script (justesse 65 %, fouille touchée 30 % × 8/N au-delà de 8 zones, tenue 80 % par séance,
sorts d'avance 0,65 case par équipe et par séance, E2 = une fouille de réparation par séance pour
les gnomes, E3 = aucun pâlissement sous le plancher 8).

## 7. Rapport

`reports/gl-sim/<AAAA-MM-JJ>-<scenario>/summary.json` et `index.html` (autonome, hors ligne,
SVG faits main). Par plateau et par variante : médiane, p10, p90 des indicateurs, parts
d'exécutions (4-6 séances, carnet complet, chapardeur), double plafond en fin d'année, mouvements
du grand livre par cause, attendus, écart modèle / banc, badges, assertions du scénario, fuites de
bourses et mots de corpus relevés, détail de chaque exécution (graine, appels, 5xx, durée,
contexte d'échec). `reports/` est ignoré par git sauf `reports/gl-sim/README.md`.

## 8. Ce que le banc a relevé le 8 novembre 2026 (et ce qui en a été fait)

Bogues du moteur, tous **corrigés dans le même lot** (`tests/gl-tenir-correctifs-banc.test.js`) :

1. **Fuite de bourses** : le payload de `spell_cast` portait contributions, lanceurs (avec nom
   affiché) et soldes des membres d'une autre équipe, et `replay.timeline` de `GET /games/:id`
   n'était pas expurgé. En partie tenir l'événement est désormais `private` (clés publiques :
   sort, équipe, coût, réserve) et le replay passe par `redactGameEventsForViewer`.
2. `seuil_clos.honneurs` était toujours `null` (le résumé est maintenant porté).
3. L'import des questions de lecture plantait (clé étrangère) dès qu'une zone était écartée par
   `chasse-zones` : la question est écartée avec avertissement.
4. Les cases Souffle « passe ton tour » (`passTurn`) n'étaient portées que dans les payloads :
   le jet suivant de l'équipe est maintenant refusé (`TOUR_PASSE`, 409, sans mot punitif), l'équipe
   fouille et lit quand même, le prof peut la porter (`mode: 'libre'`).
5. **Interblocage InnoDB en parallèle** (`concurrence`) : deux équipes qui jouent au même
   instant écrivaient le même tour (`gl_game_rounds.dernier_jet_json`) et l'une recevait une 500. `withTransaction` (`database.js`) rejoue le travail sur un interblocage (1213), deux
   fois au plus, comme le recommande MySQL (`tests/db-transaction-deadlock-retry.test.js`).
   Le banc, lui, lit désormais les invariants dans une transaction (instantané cohérent) : la
   violation `LIVRE_SOLDE` qu'il relevait en parallèle était un artefact de lecture.

Observations de **contenu** laissées à la relecture d'Oliv (avertissements du banc, non
bloquants) : « corbeau » dans 58 textes de feuillets, « attaque » / « faux » dans des retours de
QCM, « Grise » dans `sortileges_markdown` du chapitre 2 (le libellé de case « La Grise s'étend »
est corrigé par la migration 337).

## 9. Résultats du 8 novembre 2026

Campagne sur l'instantané de production (migrations 337 et 340 appliquées), moteur de cette PR,
quatre bases `_sim` en parallèle : **aucune exécution en échec** (invariants, 5xx, mots interdits
du moteur, fuites de bourses) sur l'ensemble.

| Commande                                                                                  | Exécutions | Chapitres | Échecs |
| ----------------------------------------------------------------------------------------- | ---------- | --------- | ------ |
| `equilibrage --runs 20 --seed 1` (7 variantes × 2 classes × 4 plateaux, par `--plateaux`) | 1 120      | 1 120     | 0      |
| `all --runs 3 --seed 1` (22 scénarios, `annee-complete` = 4 chapitres)                    | 66         | 75        | 0      |
| `regression-7nov --runs 5 --seed 7`                                                       | 5          | 5         | 0      |
| `badges --runs 10 --seed 3`                                                               | 10         | 10        | 0      |
| `concurrence --runs 5 --seed 1` (équipes en parallèle, après le correctif d'interblocage) | 5          | 5         | 0      |

### Ce que dit la grille (médianes sur 20 exécutions)

- **E1 fait ce qu'on lui demande au plateau 1** : avec `actuel` {4,4,5,6}, 50 % des équipes
  passent sous le voile (classe moyenne comme classe en difficulté) ; avec `e1` {3,4,5,6}, 0 %
  (moyenne) et 25 % (difficulté), pages pâlies 12 → 6 %, carnet complet 15 → 30 %. L'attendu
  « 15-30 % sous le voile » est manqué **par le bas** pour la classe moyenne : le voile ne mord
  presque plus au plateau 1, ce qui est le choix d'Oliv (apprendre les gestes avant la pression).
- **Plateaux 3-4** : 75 % des équipes passent sous le voile quelle que soit la variante (attendu
  50-70, légèrement au-dessus), mais les pages pâlies restent à 25-40 % (attendu ≤ 50) et les
  pages tenues à 50-70 % (attendu ≥ 50) : E2 (réparation) et E3 (plancher) tiennent la chasse.
  `douce` {3,3,4,4} est la seule variante qui ramène le voile à 25-50 % aux plateaux 3-4.
- **Part des Gnomes** : 55-70 % dans la plupart des cases (attendu 40-55). La mesure compte
  « pages trouvées + réparées » et E2 donne aux gnomes une fouille de plus par tour : au plateau 1
  `e1` tombe à 46-50 % (dans l'attendu), aux plateaux 3-4 les réparations font pencher la balance.
  Décision de règle à prendre (voir § « après le déploiement » de la PR), pas de code.
- **Bourses** : Gini 0,06-0,12 partout, indice Matthieu |ρ| ≤ 0,2 sur la grille, aucun élève à
  0 / 0. En `annee-complete`, **75 % des élèves finissent l'année au double plafond 8/8**
  (attendu ≤ 20 %) : la réserve E4 absorbe le surplus des équipes mais l'année reste riche.
- **Modèle rapide vs banc** : le modèle surestime la casse du voile (pâlies 37-63 % contre 6-40 %
  au banc) et sous-estime la chasse réelle (tenues 35-60 % contre 60-93 %) ; il reste juste sur le
  sens des variantes. Les écarts > 10 points sont listés dans la colonne « Modèle rapide ».
- **Badges** (10 exécutions) : 100 % des élèves ont au moins un palier Fil en fin de chapitre 1
  (attendu ≥ 90), Spearman justesse ↔ paliers −0,06 (attendu ≤ 0,3) : les badges récompensent
  l'effort, pas la justesse.

**Plateau 1** — médianes sur les exécutions ; % = part des équipes / zones / exécutions

| Variante      | Classe     | Exéc. | Séances | Sous le voile % | Pâlies % | Tenues % | Carnet complet % | Gnomes % | Gini | Attendus tenus (manqués)                           | Modèle rapide                                                                              |
| ------------- | ---------- | ----- | ------- | --------------- | -------- | -------- | ---------------- | -------- | ---- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `actuel`      | moyenne    | 20    | 5       | 50              | 12       | 88       | 15               | 67       | 0.07 | 9/12 (equipesSousVoile, carnetComplet, partGnomes) | equipesSousVoile 50 vs 36, pagesPalies 12 vs 37, pagesTenues 88 vs 60, partGnomes 67 vs 37 |
| `actuel`      | difficulte | 20    | 5       | 50              | 25       | 62       | 10               | 63       | 0.08 | 9/10 (partGnomes)                                  |                                                                                            |
| `e1`          | moyenne    | 20    | 5       | 0               | 6        | 75       | 30               | 46       | 0.08 | 11/12 (equipesSousVoile)                           | equipesSousVoile 0 vs 20, pagesPalies 6 vs 18                                              |
| `e1`          | difficulte | 20    | 5       | 25              | 12       | 69       | 30               | 50       | 0.07 | 10/10                                              |                                                                                            |
| `douce`       | moyenne    | 20    | 5       | 12              | 12       | 81       | 20               | 50       | 0.07 | 11/12 (equipesSousVoile)                           |                                                                                            |
| `douce`       | difficulte | 20    | 6       | 50              | 19       | 69       | 10               | 50       | 0.09 | 10/10                                              |                                                                                            |
| `3-3-4-5`     | moyenne    | 20    | 5       | 25              | 12       | 88       | 25               | 43       | 0.07 | 12/12                                              |                                                                                            |
| `3-3-4-5`     | difficulte | 20    | 6       | 12              | 25       | 69       | 15               | 50       | 0.09 | 10/10                                              |                                                                                            |
| `e1-sans-e2`  | moyenne    | 20    | 5       | 25              | 12       | 81       | 10               | 50       | 0.07 | 11/12 (carnetComplet)                              |                                                                                            |
| `e1-sans-e2`  | difficulte | 20    | 5       | 25              | 25       | 62       | 0                | 50       | 0.09 | 10/10                                              |                                                                                            |
| `e1-sans-e3`  | moyenne    | 20    | 5       | 25              | 12       | 75       | 5                | 50       | 0.08 | 11/12 (carnetComplet)                              |                                                                                            |
| `e1-sans-e3`  | difficulte | 20    | 5       | 25              | 12       | 75       | 10               | 50       | 0.08 | 10/10                                              |                                                                                            |
| `e1-e2-e3-e4` | moyenne    | 20    | 5       | 38              | 6        | 75       | 25               | 54       | 0.07 | 11/12 (equipesSousVoile)                           |                                                                                            |
| `e1-e2-e3-e4` | difficulte | 20    | 5       | 25              | 12       | 75       | 5                | 43       | 0.09 | 10/10                                              |                                                                                            |

**Plateau 2** — médianes sur les exécutions ; % = part des équipes / zones / exécutions

| Variante      | Classe     | Exéc. | Séances | Sous le voile % | Pâlies % | Tenues % | Carnet complet % | Gnomes % | Gini | Attendus tenus (manqués)                           | Modèle rapide                                                                                                    |
| ------------- | ---------- | ----- | ------- | --------------- | -------- | -------- | ---------------- | -------- | ---- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `actuel`      | moyenne    | 20    | 5       | 50              | 0        | 93       | 50               | 57       | 0.07 | 8/11 (equipesSousVoile, carnetComplet, partGnomes) | equipesSousVoile 50 vs 39, pagesPalies 0 vs 38, pagesTenues 93 vs 60, partGnomes 57 vs 41, carnetComplet 50 vs 8 |
| `actuel`      | difficulte | 20    | 5       | 50              | 14       | 86       | 20               | 71       | 0.07 | 8/9 (partGnomes)                                   |                                                                                                                  |
| `e1`          | moyenne    | 20    | 5       | 25              | 21       | 71       | 20               | 59       | 0.08 | 9/11 (equipesSousVoile, partGnomes)                | equipesSousVoile 25 vs 38                                                                                        |
| `e1`          | difficulte | 20    | 5       | 38              | 21       | 71       | 20               | 67       | 0.10 | 8/9 (partGnomes)                                   |                                                                                                                  |
| `douce`       | moyenne    | 20    | 5       | 25              | 0        | 86       | 30               | 63       | 0.08 | 9/11 (equipesSousVoile, partGnomes)                |                                                                                                                  |
| `douce`       | difficulte | 20    | 5       | 25              | 0        | 86       | 30               | 59       | 0.08 | 8/9 (partGnomes)                                   |                                                                                                                  |
| `3-3-4-5`     | moyenne    | 20    | 5       | 25              | 0        | 86       | 40               | 57       | 0.07 | 9/11 (equipesSousVoile, partGnomes)                |                                                                                                                  |
| `3-3-4-5`     | difficulte | 20    | 5       | 12              | 14       | 71       | 40               | 54       | 0.08 | 9/9                                                |                                                                                                                  |
| `e1-sans-e2`  | moyenne    | 20    | 5       | 25              | 14       | 86       | 30               | 50       | 0.09 | 10/11 (equipesSousVoile)                           |                                                                                                                  |
| `e1-sans-e2`  | difficulte | 20    | 5       | 50              | 14       | 79       | 30               | 46       | 0.07 | 9/9                                                |                                                                                                                  |
| `e1-sans-e3`  | moyenne    | 20    | 5       | 25              | 14       | 86       | 25               | 54       | 0.08 | 10/11 (equipesSousVoile)                           |                                                                                                                  |
| `e1-sans-e3`  | difficulte | 20    | 5       | 50              | 14       | 79       | 30               | 62       | 0.08 | 8/9 (partGnomes)                                   |                                                                                                                  |
| `e1-e2-e3-e4` | moyenne    | 20    | 5       | 38              | 0        | 86       | 40               | 67       | 0.07 | 10/11 (partGnomes)                                 |                                                                                                                  |
| `e1-e2-e3-e4` | difficulte | 20    | 5       | 50              | 14       | 71       | 20               | 57       | 0.08 | 8/9 (partGnomes)                                   |                                                                                                                  |

**Plateau 3** — médianes sur les exécutions ; % = part des équipes / zones / exécutions

| Variante      | Classe     | Exéc. | Séances | Sous le voile % | Pâlies % | Tenues % | Carnet complet % | Gnomes % | Gini | Attendus tenus (manqués)         | Modèle rapide                                                         |
| ------------- | ---------- | ----- | ------- | --------------- | -------- | -------- | ---------------- | -------- | ---- | -------------------------------- | --------------------------------------------------------------------- |
| `actuel`      | moyenne    | 20    | 5       | 50              | 30       | 60       | 0                | 67       | 0.08 | 9/11 (carnetComplet, partGnomes) | pagesPalies 30 vs 53, pagesTenues 60 vs 43, partGnomes 67 vs 35       |
| `actuel`      | difficulte | 20    | 5       | 50              | 40       | 60       | 5                | 63       | 0.09 | 8/9 (partGnomes)                 |                                                                       |
| `e1`          | moyenne    | 20    | 5       | 75              | 25       | 70       | 10               | 50       | 0.08 | 10/11 (equipesSousVoile)         | equipesSousVoile 75 vs 57, pagesPalies 25 vs 40, pagesTenues 70 vs 56 |
| `e1`          | difficulte | 20    | 5       | 75              | 35       | 55       | 5                | 59       | 0.08 | 8/9 (partGnomes)                 |                                                                       |
| `douce`       | moyenne    | 20    | 5       | 25              | 15       | 65       | 10               | 41       | 0.08 | 10/11 (equipesSousVoile)         |                                                                       |
| `douce`       | difficulte | 20    | 5       | 50              | 30       | 50       | 0                | 55       | 0.09 | 9/9                              |                                                                       |
| `3-3-4-5`     | moyenne    | 20    | 5       | 50              | 20       | 70       | 0                | 54       | 0.08 | 10/11 (carnetComplet)            |                                                                       |
| `3-3-4-5`     | difficulte | 20    | 6       | 50              | 30       | 70       | 10               | 54       | 0.07 | 9/9                              |                                                                       |
| `e1-sans-e2`  | moyenne    | 20    | 5       | 38              | 20       | 65       | 5                | 50       | 0.07 | 10/11 (equipesSousVoile)         |                                                                       |
| `e1-sans-e2`  | difficulte | 20    | 5       | 75              | 35       | 55       | 5                | 54       | 0.09 | 9/9                              |                                                                       |
| `e1-sans-e3`  | moyenne    | 20    | 5       | 62              | 20       | 75       | 0                | 58       | 0.07 | 9/11 (carnetComplet, partGnomes) |                                                                       |
| `e1-sans-e3`  | difficulte | 20    | 5       | 62              | 40       | 55       | 0                | 50       | 0.10 | 9/9                              |                                                                       |
| `e1-e2-e3-e4` | moyenne    | 20    | 5       | 50              | 30       | 60       | 5                | 56       | 0.06 | 10/11 (partGnomes)               |                                                                       |
| `e1-e2-e3-e4` | difficulte | 20    | 5       | 75              | 40       | 55       | 0                | 50       | 0.10 | 9/9                              |                                                                       |

**Plateau 4** — médianes sur les exécutions ; % = part des équipes / zones / exécutions

| Variante      | Classe     | Exéc. | Séances | Sous le voile % | Pâlies % | Tenues % | Carnet complet % | Gnomes % | Gini | Attendus tenus (manqués)            | Modèle rapide                                                   |
| ------------- | ---------- | ----- | ------- | --------------- | -------- | -------- | ---------------- | -------- | ---- | ----------------------------------- | --------------------------------------------------------------- |
| `actuel`      | moyenne    | 20    | 5       | 75              | 15       | 70       | 10               | 71       | 0.09 | 9/11 (equipesSousVoile, partGnomes) | pagesPalies 15 vs 63, pagesTenues 70 vs 35, partGnomes 71 vs 38 |
| `actuel`      | difficulte | 20    | 5       | 75              | 40       | 50       | 0                | 63       | 0.08 | 8/9 (partGnomes)                    |                                                                 |
| `e1`          | moyenne    | 20    | 5       | 75              | 30       | 70       | 10               | 63       | 0.09 | 9/11 (equipesSousVoile, partGnomes) | pagesPalies 30 vs 48, pagesTenues 70 vs 50                      |
| `e1`          | difficulte | 20    | 5       | 75              | 40       | 50       | 0                | 75       | 0.12 | 8/9 (partGnomes)                    |                                                                 |
| `douce`       | moyenne    | 20    | 5       | 50              | 10       | 70       | 5                | 56       | 0.10 | 10/11 (partGnomes)                  |                                                                 |
| `douce`       | difficulte | 20    | 5       | 50              | 25       | 60       | 5                | 50       | 0.08 | 9/9                                 |                                                                 |
| `3-3-4-5`     | moyenne    | 20    | 5       | 50              | 30       | 65       | 10               | 54       | 0.08 | 11/11                               |                                                                 |
| `3-3-4-5`     | difficulte | 20    | 5       | 75              | 30       | 60       | 5                | 62       | 0.10 | 8/9 (partGnomes)                    |                                                                 |
| `e1-sans-e2`  | moyenne    | 20    | 5       | 50              | 20       | 70       | 5                | 53       | 0.07 | 11/11                               |                                                                 |
| `e1-sans-e2`  | difficulte | 20    | 5       | 75              | 40       | 50       | 0                | 60       | 0.10 | 8/9 (partGnomes)                    |                                                                 |
| `e1-sans-e3`  | moyenne    | 20    | 5       | 75              | 30       | 70       | 5                | 67       | 0.08 | 9/11 (equipesSousVoile, partGnomes) |                                                                 |
| `e1-sans-e3`  | difficulte | 20    | 5       | 75              | 35       | 55       | 0                | 75       | 0.10 | 8/9 (partGnomes)                    |                                                                 |
| `e1-e2-e3-e4` | moyenne    | 20    | 5       | 75              | 25       | 60       | 5                | 62       | 0.07 | 9/11 (equipesSousVoile, partGnomes) |                                                                 |
| `e1-e2-e3-e4` | difficulte | 20    | 5       | 88              | 30       | 60       | 0                | 66       | 0.09 | 7/9 (equipesSousVoile, partGnomes)  |                                                                 |

### Scénarios (`all`, 3 exécutions, graine 1)

Attendus manqués les plus fréquents : `equipesSousVoile` (voile trop doux au plateau 1 avec E1,
voir ci-dessus), `partGnomes`, `carnetComplet` (rare aux plateaux 3-4 : 10 zones). `chasse-aveugle`
est le seul scénario où la chasse s'effondre (88 % de pages pâlies, 13 % tenues) : la stratégie de
fouille compte plus que tout réglage. `concurrence` tient 5/5 après le correctif d'interblocage.
Rapports complets : `reports/gl-sim/2026-11-08-*/index.html` (non versionnés, régénérables).

## 10. Campagne du 8 novembre 2026 après fusion (défauts restants)

Après la fusion de la PR #644, 658 exécutions supplémentaires (967 chapitres) sur cinq bases
`_sim` : `all --runs 10 --seed 11`, `all --runs 10 --seed 23 --jours-veillee 14`, `all --runs 5
--seed 99 --seances 4`, `concurrence --runs 20 --seed 5`, `regression-7nov --runs 10 --seed 3`,
`annee-complete --runs 5 --seed 5` et `--runs 3 --seed 77 --seances 4`, `equilibrage --runs 5
--seed 9` ; plus `all --runs 3 --seed 7 --mots-interdits strict`.

**Moteur** : 0 échec, 0 réponse 5xx, 0 violation d'invariant, 0 fuite de bourses, assertions C1-C10
toutes tenues (18 exécutions de `regression-7nov`). Les refus 4xx relevés (≈ 2 900) sont tous
attendus : `TOUTES_AU_CAMP`, `TOUR_PASSE`, `FOUILLES_EPUISEES` (le prof virtuel insiste en mode
tableau), fenêtres et limites de sorts, Marché en retrait. Deux cas méritent une décision de règle :

1. **Question de case perdue par une poussée** (`concurrence` seulement, 13 fois sur 30
   chapitres joués en parallèle) : une équipe arrive sur une carte question et, avant de répondre,
   une Bourrasque ou un Relais d'une autre équipe la déplace ; `present-question` refuse alors
   « Votre équipe n'est pas sur ce repère » (409). Jamais observé en jeu séquentiel. Pistes : lier
   la question à l'arrivée du tour plutôt qu'à la position, ou refuser Bourrasque / Relais sur une
   équipe qui a une question en attente.
2. **Nommer sur une page réparée entre-temps** (`concurrence`, 12 fois) : le prof applique
   l'effet alors qu'une autre équipe vient de réparer la page ; refus `PAGE_PAS_PALIE` correct,
   l'écran du prof gagnerait à se rafraîchir avant le bouton.

**Équilibre** (médianes) : mêmes tendances que la grille (§ 9). Avec des chapitres bornés à
4 séances (`--seances 4`), le double plafond 8/8 en fin d'année tombe de 70-75 % à 20 % des
élèves : la richesse vient des 5e et 6e séances, pas de la règle.

**Contenu servi aux élèves** (copie de prod, `--mots-interdits strict` fait tomber 66/66
exécutions) : « corbeau » dans 52 feuillets actifs et des fiches d'espèces (l'oiseau du Souffle ne
doit jamais être nommé ; ici ce sont les textes du lore et des fiches nature) ; « Grise » dans
11 feuillets du plateau 2 et les textes du chapitre 2 ; « ennemi » dans un feuillet (`cz-p1-08`) ;
« attaque » dans 6 QCM (énoncés ou choix, contenu nature) ; **28 QCM actifs dont un retour dit
« faux », « raté » ou « perdu »** (« Non, c'est faux : … ») alors que l'erreur ne punit pas ;
faux positif de la liste : « couleurs perdues » (case 54). Décisions d'auteur : une migration
gardée peut réécrire les 28 retours en « Pas encore : … ».
