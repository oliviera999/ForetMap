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

Observations de **contenu** laissées à la relecture d'Oliv (avertissements du banc, non
bloquants) : « corbeau » dans 58 textes de feuillets, « attaque » / « faux » dans des retours de
QCM, « Grise » dans `sortileges_markdown` du chapitre 2 (le libellé de case « La Grise s'étend »
est corrigé par la migration 340).

## 9. Résultats du 8 novembre 2026

_(Section complétée en fin de lot à partir des rapports `reports/gl-sim/2026-11-08-*`.)_
