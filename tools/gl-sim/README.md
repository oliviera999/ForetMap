# Banc de simulation en série « Tenir à deux » (`tools/gl-sim/`)

Le banc joue des **chapitres entiers** de Gnomes & Licornes, mouture « Tenir à deux » v2, contre le **vrai moteur** : un prof virtuel et une classe d'élèves virtuels pilotent l'API réelle par supertest, en mémoire (`require('../../server').app`, comme les suites `tests/gl-tenir-*`), sur une base dédiée chargée avec un instantané du contenu de production. Il mesure l'équilibre du jeu (voile, pages, bourses, séances), rejoue les invariants après chaque geste, passe au crible ce qui est servi aux élèves, et écrit un rapport autonome par scénario.

Garde-fous tenus par le code : Souffle jamais personnifié et oiseau jamais nommé (tout corps servi à un élève passe par `findForbiddenString`), l'erreur ne punit pas (« Pas encore… » vérifié), ressources seulement par les sources documentées (invariant `GAIN_NON_DOCUMENTE`), soldes privés (aucune bourse d'une autre équipe ne doit sortir), **aucune donnée d'élève** (pseudos `sim-<scenario>-<n>`, rapports en agrégats), isolation G&L, tout le réel passe par le prof virtuel, et **jamais la base de prod** : le banc refuse une base dont le nom ne finit pas par `_sim` ou `_test`, et `NODE_ENV=production` sans `GL_SIM_ALLOW=1` (`garde.js`, testé).

## Commandes

```bash
# 1. Instantané de contenu (tables de contenu seulement) depuis une base LOCALE
npm run gl:sim:snapshot -- --from-db foretmap_local            # → data/gl/sim/contenu-prod-<date>.json
npm run gl:sim:snapshot -- --from-db foretmap_local --out data/gl/sim/contenu-prod-2026-11-07.json

# 2. Base du banc : schéma + migrations, vidage des tables G&L, instantané, catalogues data/gl/tenir
npm run gl:sim:db                                              # DB_NAME=foretmap_sim (ou -- --db <nom>_sim)

# 3. Exécutions
npm run gl:sim -- --liste
npm run gl:sim -- --scenario hybride-reference --runs 10 --seed 7
npm run gl:sim -- --scenario regression-7nov --runs 2 --seed 7
npm run gl:sim -- --scenario equilibrage --runs 5 --seed 7 --grille data/gl/sim/grilles/grille-voile.json
npm run gl:sim -- --scenario all --runs 3 --seed 11           # tous les scénarios sauf equilibrage
#   options : --seances N (plafond de séances) --plateaux 1,3 --jours-veillee 7
#             --fuites-bourses echouer|avertir  --mots-interdits souple|strict
#             --sortie reports/gl-sim --arret-premier-echec --db foretmap_sim

# 4. Modèle rapide (Python 3 sans dépendance, quelques secondes)
npm run gl:sim:rapide -- --voile 3,4,5,6 --e2 --e3 --classe moyenne --runs 4000 [--json]

# 5. Fumée en CI (hybride + tablette, 1 exécution, 3 séances, graine fixe, base _test)
npm run test:sim                                               # TEST_DB_NAME=foretmap_test ; en local : TEST_DB_NAME=foretmap_sim
node --test tests/gl-sim-pur.test.js                           # fonctions pures (sans base)
```

Variables : `GL_SIM_DB` (base par défaut), `GL_RANDOM_SEED` (posée par le banc : aléa serveur rejouable, une graine par partie), `GL_SIM_ALLOW=1` (posée par le banc : horloge `X-GL-Sim-Clock`), `LOG_LEVEL` (défaut `warn`).

## Architecture

| Fichier                                  | Rôle                                                                                                                                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `garde.js`                               | Garde-fou n° 10 (nom de base, production).                                                                                                                                                                                                              |
| `env.js`                                 | `.env`, base cible, `GL_SIM_ALLOW`, `GL_RANDOM_SEED`, rate limit coupé, sync des catalogues laissée au banc.                                                                                                                                            |
| `snapshot.js`                            | Instantané `gl-sim-contenu v1` : 13 tables de contenu (liste blanche), refus de toute table de personnes / colonne nominative.                                                                                                                          |
| `db.js`                                  | Préparation de la base : `initSchema()`, vidage des tables de jeu et de contenu, chargement (colonnes communes), adaptation d'un instantané antérieur (fusion des chapitres 4-5, niveaux de QCM), `syncTenirCatalogues({ force })`, réglages, contrôle. |
| `reglages.js`                            | Réglages de base de la mouture, réglages d'un scénario ou d'une variante (`upsertGlSetting`, repli SQL paramétré), remise en l'état.                                                                                                                    |
| `rng.js`, `personas.js`                  | Aléa reproductible (mulberry32 de `lib/glRandom.js`), classes d'élèves virtuels.                                                                                                                                                                        |
| `strategie.js`                           | Fouilles `aveugle` / `futee` / `mixte` à partir des seules réponses de l'API.                                                                                                                                                                           |
| `client.js`                              | Supertest + horloge + compteurs ; 5xx → échec ; crible élève (mots interdits moteur / corpus, bourses d'une autre équipe).                                                                                                                              |
| `oracle.js`                              | Le prof virtuel connaît la bonne réponse (base) et laisse l'élève répondre juste avec sa `justesse`.                                                                                                                                                    |
| `partie.js`                              | Classe, élèves, partie, profil / surface, composition des équipes, démarrage — par l'API prof.                                                                                                                                                          |
| `equipe.js`                              | Les cinq gestes d'une équipe (jeter / lancer, répondre, fouiller, lire / tenir) + sorts et Marché, selon la surface.                                                                                                                                    |
| `seance.js`, `veillee.js`, `chapitre.js` | Tour à phases, semaine de veillée (horloge), chapitre jusqu'au Seuil et clôture.                                                                                                                                                                        |
| `mesures.js`, `stats.js`, `attendus.js`  | Indicateurs (base + grand livre), Spearman / Gini / quantiles, attendus d'équilibrage (avertissements).                                                                                                                                                 |
| `rapport.js`                             | `summary.json` + `index.html` autonome (SVG faits main : barres, boîtes à moustaches), variantes côte à côte, écart modèle / banc.                                                                                                                      |
| `run.js`, `ci.js`, `rapide.js`           | CLI, fumée CI, lanceur du modèle rapide.                                                                                                                                                                                                                |
| `scenarios/`                             | 23 scénarios (voir ci-dessous).                                                                                                                                                                                                                         |
| `modele-rapide/sim_tenir_modele.py`      | Monte-Carlo des règles v2 (exploration).                                                                                                                                                                                                                |

## Personas

Élève virtuel = `{ justesse, assiduite, veillee, strategieFouille, penchants: { marche, sorts, dons } }`. Profils de classe : `moyenne` (justesse ~ N(0,65 ; 0,12)), `difficulte` (N(0,45 ; 0,12)), `experte` (N(0,8 ; 0,1)), bornée [0,05 ; 0,98] ; assiduité ~ N(0,92 ; 0,06) bornée [0,5 ; 1] ; veillée ~ N(0,35 ; 0,2) bornée [0 ; 0,9] ; stratégie tirée parmi aveugle / futée (×2) / mixte sauf forçage ; penchants uniformes (Marché 0,1-0,6, sorts 0,2-0,7, dons 0,1-0,5) sauf forçage. Graine reproductible : `hashSeed(seed, scenario, variante, sous-scénario, run)`.

Rôles : l'**opérateur** d'un geste tourne parmi les présents (les rôles changent à chaque cours) ; sa persona décide de la stratégie de fouille et de la justesse de la réponse. Un geste porté par le prof (surface `tableau`, lancer et répondre en `hybride`) prend la justesse moyenne des présents.

## Déroulé d'une exécution

1. Classe et élèves créés par `POST /api/gl/admin/classes` et `/players` ; partie `POST /api/gl/games` ; `PUT /tenir/profil { profil, overrides: { surface } }` ; équipes par `POST /teams/compose/apply` (répartition ronde 2 gnomes / 2 licornes) ou, pour `annee-complete`, par la **composition automatique** de l'app (`compose/preview` → `apply` : rebrassage, peuples inversés d'un plateau à l'autre) ; `POST /start`.
2. Séance : présences (assiduité, absences du scénario → `POST /tenir/tour/absences`), retraits du scénario (`POST /tenir/retrait`), `tour/ouvrir`, `phase jeu`, fenêtre de fouille en hybride, équipes dans l'ordre inverse du plateau (en parallèle avec `parallele: true`), relecture des écrans d'un élève par équipe (état de partie, tenir, tour, carnet, journal), bilan Team Spirit, `phase souffle` (ou `dort: true`), `phase clos`.
3. Gestes d'une équipe : sorts « avant le jet » (Boussole / Sentier), jet (`/tenir/lancer` : dés serveur en tablette, faces physiques en hybride / tableau, saisie validée par le prof si besoin), arrivée (question de case : `present-question` → `qcm/answer`, relance une fois ; péripétie : `peripetie/passer`), sorts « après le jet » (Progression) et d'entraide (Abri, Bourrasque, Relais, Grand Regard, Farce), fouilles (`GET /chasse` → stratégie → `fouiller` → `repondre` ; Lanterne avant ; Nommer sur une page pâlie, appliqué par le prof), lecture / tenue (`pages/:zone/ouvrir` → `tenir`, deux tentatives, deux pages par séance ; lecture d'une page de l'équipe pour éviter le pâlissement), Marché (don du plus riche au moins riche, annonce « cherche » d'un élève à sec, parure).
4. Veillée : l'horloge avance de 7 jours (en-tête `X-GL-Sim-Clock`), chaque élève agit un soir avec sa probabilité `veillee` : lecture / tenue (limite hebdomadaire), étude d'une espèce du biome (`POST /api/gl/learning/species/:code` → piste), Marché.
5. Fin : les quatre équipes au camp, ou la 6e séance ; `POST /end` (la caravane porte les retardataires, honneurs, badges). Mesures.

**À chaque geste** : `checkTenirInvariantsFromDb` (bourses, livre, pions, voile, pages, relances). Toute violation, toute 5xx et tout mot interdit du **moteur** arrêtent l'exécution avec le contexte (scénario, graine, séance, geste, équipe). Un mot interdit dans un champ de **corpus** (texte de feuillet, question, retour de QCM, description de case…) est un avertissement compté (le corpus réel en porte : « corbeau », « attaque », « Grise ») ; `--mots-interdits strict` le rend bloquant. Une **bourse d'une autre équipe** servie à un élève arrête l'exécution par défaut ; `--fuites-bourses avertir` la compte (voir « Bogues du moteur »).

## Scénarios

| Scénario                    | Particularité                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `hybride-reference`         | hybride, 20 élèves, classe moyenne, plateau 1, 6 séances au plus                                                |
| `tablette-reference`        | tablette : élèves lancent (dés serveur), répondent, fouillent                                                   |
| `tableau-pur`               | le prof porte les cinq gestes pour l'équipe active ; Marché en veillée                                          |
| `classe-en-difficulte`      | justesse ~ N(0,45 ; 0,12)                                                                                       |
| `classe-experte`            | justesse ~ N(0,8 ; 0,1)                                                                                         |
| `effectif-24` / `-17`       | équipes de 6 / de 4-5                                                                                           |
| `absences-retraits`         | deux absents aux séances 2 et 4, retraits posés par le prof aux séances 2-3 et 5                                |
| `economie-agressive`        | penchants sorts 0,95, Marché 0,9, dons 0,6                                                                      |
| `chasse-aveugle` / `-futee` | stratégie imposée                                                                                               |
| `voile-max`                 | bonus {6,6,7,8}                                                                                                 |
| `voile-dort`                | le dé gris une séance sur deux                                                                                  |
| `prologue`                  | profil `prologue` (sans voile, Marché, chapardeur)                                                              |
| `plateau-2` / `-3` / `-4`   | un plateau                                                                                                      |
| `annee-complete`            | 4 chapitres, mêmes élèves, composition automatique (peuples inversés), double plafond mesuré en fin d'année     |
| `concurrence`               | équipes en parallèle (`Promise.all`), tablette                                                                  |
| `veillee-semaine`           | veillée ~ N(0,8 ; 0,1)                                                                                          |
| `regression-7nov`           | C1-C10 en assertions (sondes actives : Progression hors fenêtre, retrait, parure sans image)                    |
| `equilibrage`               | grille × {moyenne, difficulté} × plateaux 1-4 ; variantes côte à côte ; écart aux références du modèle rapide   |
| `badges`                    | `GET /api/gl/rewards/me` ; « badges non disponibles » si la route manque (approximation par `gl_player_badges`) |

Un scénario = `{ id, description, classe, effectif, surface, plateaux, seances, reglages, profil, composition, parallele, personas, prof: { voileDort, absences, retraits }, crochets, assertions }` (`scenarios/base.js`).

## Grilles et attendus

`data/gl/sim/grilles/grille-voile.json` (`gl-sim-grille v1`) : `actuel` {4,4,5,6} sans E2/E3/E4 ; `e1` {3,4,5,6} + E2 + E3 ; `douce` {3,3,4,4} + E2 + E3 ; `3-3-4-5` + E2 + E3 ; `e1-sans-e2` ; `e1-sans-e3` ; `e1-e2-e3-e4`. Les clés `tenir_fouilles_reparation_gnome`, `tenir_palissement_rang_plancher`, `tenir_surplus_reserve` (E2, E3, E4) sont posées dans `gl_settings` par variante et lues par le moteur.

Les attendus (`attendus.js`, tableau du § 7.6 du cahier des charges) sont des **avertissements** du rapport, par classe (moyenne ; difficulté ; experte lit la colonne moyenne) et par plateau. `data/gl/sim/modele-rapide-reference.json` porte les médianes du modèle rapide pour `e1` et `actuel` ; le rapport d'`equilibrage` signale tout écart de plus de 10 points (comparaison sur la médiane du banc).

## Modèle rapide vs banc

Le modèle (`modele-rapide/`) **explore** : Monte-Carlo des règles sur les vraies cases et zones, 4 000 chapitres par plateau en quelques secondes, options `--voile --e2 --e3 --e4 --classe --fouille --tenue --sorts-avance --reparation-facteur --json`. Le banc **confirme** contre le moteur réel.

Calibrage (4 000 chapitres par plateau, graine 7) : le modèle reproduit les références de `modele-rapide-reference.json` avec un écart maximal de **4,6 points** (`actuel`) et **4,8 points** (`e1`). Hypothèses ajustées pour y parvenir, toutes documentées dans l'aide du script : justesse 65 % ; fouille touchée 30 %, multipliée par 8/N au-delà de 8 zones (les plateaux 3-4 à dix zones demandent plus de clics par page) ; tenue 80 % par séance ; **sorts d'avance 0,65 case par équipe et par séance** (Progression, Bourrasque, Relais, Cordée — sans eux, le voile rattrape 8 à 10 points d'équipes de plus que la référence) ; **E2** = une fouille de réparation par séance pour les gnomes, qui touche une page pâlie avec une chance ×1,5 (contour public) ; **E3** = aucun pâlissement tant que le voile n'a pas atteint le plancher (8). Résultat : `actuel` voile 36/39/55/66, pâlies 36/38/54/58, tenues 60/59/41/38, carnet 5/6/0/0, gnomes 37/40/35/37 ; `e1` voile 24/39/54/66, pâlies 16/18/39/43, tenues 76/77/54/53, carnet 25/30/2/2, gnomes 50/55/52/55 (P1/P2/P3/P4, en %). Le modèle finit ses chapitres en 4,8 séances en moyenne (médiane 5) contre « 5,2 » dans la référence ; le banc, lui, va presque toujours à la 6e séance avec l'instantané provisoire (voir « Écarts observés »).

## Écarts observés

Les résultats de la grille et des scénarios sur l'instantané de production (migrations 340 et 343 appliquées) sont consignés dans `docs/GL_SIMULATION.md` § 9. Les premières exécutions tournaient sur un instantané **provisoire** tiré de `foretmap_local` (migration 259, chapitre 5 fusionné dans le plateau 4 par `db.js`) : cinq catégories de questions des cases du plateau 1 y manquaient, `present-question` répondait 404 et presque tous les chapitres allaient à la 6e séance ; l'instantané réel a levé ce point (4 à 6 séances au plateau 1, graine 7). Les attendus « part des Gnomes 40-55 % » se lisent sur les médianes de 5 à 20 exécutions, jamais sur une seule.

## Bogues et observations du moteur relevés (corrigés dans le même lot, `tests/gl-tenir-correctifs-banc.test.js`)

1. **Fuite de bourses (garde-fou n° 6)** — `hybride-reference`, graine 7 (exécution 965141388), séance 2, `GET /api/gl/games/:id` et `GET /api/gl/journal/games/:id` servis à un élève : le payload de l'événement `spell_cast` porte `contributions[]`, `casters[]` (avec `displayName`) et `results[].health / power` des membres d'une autre équipe ; il n'est pas marqué `private` comme `page_tenue` / `page_reparee`, donc `redactGameEventsForViewer` ne l'expurge pas. Reproductible sur chaque exécution (2 000 à 2 800 valeurs par chapitre). **Corrigé** : `spell_cast` est `private` en partie tenir (clés publiques : sort, équipe, coût, réserve) et `replay.timeline` de `GET /games/:id` passe par `redactGameEventsForViewer`. Le banc arrête toujours l'exécution sur une fuite ; `--fuites-bourses avertir` la compte.
2. `glSeuil.cloreTenirPartieTx` écrit `payload.honneurs = honneurs?.resume`, alors que `attribuerHonneursTx` renvoie `{ honneurs, events }` : le résumé des honneurs dans l'événement `seuil_clos` était toujours `null`. **Corrigé.**
3. Synchronisation des catalogues : `questions-lecture` plante la synchronisation (erreur de clé étrangère) dès qu'une zone est écartée par `chasse-zones` (ici cinq zones du plateau 4 sur l'ancien contenu) : l'import « tolérant » ne sautait pas la question d'une zone absente. **Corrigé** (question écartée avec avertissement).
4. Les cases Souffle « passe ton tour » (`passTurn`) ne sont portées que dans les payloads (`marker_effect`) : aucun tour n'était effectivement passé en mode tenir. **Corrigé** : le jet suivant répond `TOUR_PASSE` (409), l'équipe fouille et lit quand même, le prof peut la porter en `libre`.
5. Contenu : le corpus réel servi aux élèves porte des mots de la liste interdite (`findForbiddenString`) — « corbeau » dans 58 textes de feuillets, « attaque » / « faux » dans des retours de QCM, « Grise » dans un libellé de case du plateau 2 (« La Grise s'étend ») et dans `sortileges_markdown` du chapitre 2. Le banc les compte en avertissements (champs de corpus) et n'échoue que sur une chaîne du moteur ; aucune chaîne du moteur n'a été prise en faute.
6. Les filtres de pool des cases (catégories absentes) ne sont pas remplacés (cf. « Écarts observés ») ; 404 silencieux côté élève.

## Choix faits sans demander

- Les élèves virtuels jouent **en séquence** par défaut (ordre inverse du plateau), même en hybride / tablette ; seul `concurrence` utilise `Promise.all`.
- Mots interdits : échec seulement pour une chaîne du **moteur** ; les champs de corpus sont des avertissements (`--mots-interdits strict` pour tout faire échouer). Fuites de bourses : échec par défaut (`avertir` pour mesurer) ; `test:sim` échoue aussi (`GL_SIM_CI_FUITES=avertir` pour compter seulement).
- Les jetons sont signés comme à la connexion (`signAuthToken`, claims `classId` / `teamId`) ; le MJ est semé par la fixture anonyme `createGlAdmin` (aucune route ne crée un administrateur). Classe, élèves, partie, profil, équipes et démarrage passent par l'API prof.
- `db.js` ne vide que les tables de **jeu / personnes** et celles de l'instantané : les dictionnaires semés par les migrations (catégories de sorts, glossaires, mascottes…) sont conservés ; il adapte un instantané antérieur à la fusion 4-5 et aux niveaux `base` / `approfondissement`.
- `test:sim` accepte une base `_sim` en local (`TEST_DB_NAME=foretmap_sim`) en plus de `_test` ; `--scenario all` exclut `equilibrage` (56 chapitres par exécution).
- Le modèle rapide compare des **moyennes** (un ratio sur 4 équipes n'a que cinq valeurs) ; le rapport du banc compare ses médianes aux références.
- `eslint.config.cjs` : `tools/gl-sim/**` ajouté aux fichiers Node (console autorisée) ; `.prettierignore` : `reports/`.
- Le pot d'un sort est laissé au pré-remplissage du serveur (parts égales entre présents) ; les sorts du Travail et du Seuil (exécution prof, file) ne sont pas joués.

## Rapport

`reports/gl-sim/<AAAA-MM-JJ>-<scenario>/summary.json` et `index.html` (autonome, hors ligne). Par plateau et par variante : médiane, p10, p90 des indicateurs (séances, équipes sous le voile, pages pâlies / tenues, part des Gnomes, élèves à 0 / 0, indice Matthieu, Gini, appels), parts d'exécutions (4-6 séances, carnet complet, chapardeur), double plafond en fin d'année, mouvements du grand livre par cause, attendus, écart modèle / banc, badges, assertions du scénario, fuites de bourses et mots de corpus relevés, détail de chaque exécution (graine, appels, 5xx, durée, contexte d'échec). `reports/` est ignoré par git sauf `reports/gl-sim/README.md`.
