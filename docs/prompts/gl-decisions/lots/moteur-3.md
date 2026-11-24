# Lot moteur-3 — Escalier et règles de séance

> Chantier G&L « décisions » · vague 1 · couloir moteur · charge forte · banc : seuils
> Branche : `claude/gl-decisions-moteur-3` · Attend : moteur-2, contenu-2, ecrans-1 · Modèle : Opus, effort élevé
> Lis d'abord `docs/prompts/gl-decisions/REGLES_COMMUNES.md`.

## 1. Ce que fait ce lot

- Au plateau 1, les règles s'ouvrent en **cinq** séances au lieu de quatre, et jamais deux le même jour.
- Le sort Relance disparaît du grimoire (18 sorts) ; un jet s'applique tout de suite, sans attendre.
- La page témoin (la zone qui pâlit pour montrer la réparation) se pose juste derrière la dernière équipe, plus au
  début du chemin.
- Le journal dit en une ligne les pages reçues à l'ouverture ; le prof voit un bandeau quand un tour est resté
  ouvert depuis la veille.

## 2. Décisions d'Oliv que ce lot applique

| Décision | Date | Ce qu'elle dit | Mots d'Oliv |
| --- | --- | --- | --- |
| Décision 19 du prompt | 23/11 | Escalier en cinq marches, une marche par jour au plus. | — |
| Décision du 24/11 après-midi (escalier) | 24/11, vers 14 h 35 | Escalier : parties neuves seulement. Le nouvel escalier ne gère pas les parties déjà commencées ; aucun code de rattrapage. | (choix sur carte) « Parties neuves seulement » |
| Décision 24 du prompt | 23/11 soir | Le sort Relance est retiré (`SL005` inactif, hors de l'escalier ; `olu-41` inactive). Grimoire à 18 sorts. | — |
| Décision 20 du prompt | 23/11 | Page témoin : la zone endormie la plus avancée derrière la dernière équipe. | — |
| Décision 18 du prompt (suite) | 23/11 | Correctifs de la partie 16 : journal regroupé, tour resté ouvert. | — |

**Choix par défaut posés par Claude** (Oliv peut les retirer) :

- La répartition des modules et des sorts par marche (tableau de l'étape moteur-3.1) : la décision dit seulement
  « cinq marches, une par jour ».
- 12 h comme seuil de la « marche par jour » et du tour resté ouvert.
- La page témoin n'est pas mise en évidence sur la projection : rien n'y est ajouté.
- Le code de l'arrivée en suspens (`lib/glArriveeSuspendue.js`) reste, inerte sans Relance ; les copies `exemple/`
  gardent `SL005` actif pour les tests de ce mécanisme.
- Texte de `olu-pf-marche` (étape moteur-3.2).
- Le champ `seance_escalier` de cinq lignes « première fois » d'Olu suit le nouveau tableau (étape moteur-3.1,
  point 6) : l'ancien texte ne le disait pas.

## 3. Fichiers

**À toi**

- `src/shared/glTenirEscalierCore.js`
- `lib/glEscalier.js` (`avancerTx`, `poserPageTemoinTx`)
- `lib/glTour.js` (l'appel `avancerTx({ motif: 'tour_clos' })`, l. 679 ; le drapeau « tour resté ouvert » dans
  `loadRoundView`, l. 114)
- `lib/glTenir.js` (validateur `escalier_pas`, l. 100 : à vérifier seulement)
- `lib/glJournalPresentTenir.js`, `lib/glJournalPresent.js`, `routes/gl/journal.js` (regroupement du journal)
- Tests : `tests/gl-tenir-escalier-pure.test.js`, `tests/gl-ensemble-unifie-escalier.test.js`,
  `tests/gl-ensemble-unifie-olu-premiere-fois.test.js`, `tests/gl-ensemble-unifie-deux-ecrans.test.js`,
  `tests/gl-tenir-droits-serveur.test.js`, `tests/gl-market-place.test.js`, `tests-ui/gl/GLEscalier.test.jsx`,
  `tests/content/gl-tenir-donnees.test.js`, `e2e/gl-tenir-escalier.spec.js`

**Nouveaux**

- `tests/gl-escalier-marche-par-jour.test.js`, `tests/gl-page-temoin-rang.test.js`,
  `tests/gl-journal-regroupe.test.js`, `tests/content/gl-sans-relance.test.js`
- `migrations/<numéro pris à la fin>_gl_relance_liens.sql` (étiquette `mig-relance`), **seulement si nécessaire**
- `changelog.d/gl-decisions-moteur-3.md`, `docs/prompts/gl-decisions/rapports/moteur-3.md`

**D'un autre couloir, modification minimale permise**

| Fichier | Ce que tu y fais exactement |
| --- | --- |
| `data/gl/tenir/sorts.json` | `SL005` : `"actif": false` ; `SL005` retiré d'`ouverture_par_chapitre["1"]`. |
| `data/gl/tenir/olu-lignes.json` (et `exemple/olu-lignes.json` si un test y lit ces lignes) | `olu-41` : `"actif": false` ; `olu-pf-marche` : nouveau texte ; `seance_escalier` de cinq lignes (étape moteur-3.1, point 6). |
| `data/gl/tenir/reglages-defaut.json` et `exemple/reglages-defaut.json` | La note `escalier` (l. 143), qui récite les quatre marches : cinq marches. |
| `data/gl/tenir/README.md` | Les phrases qui disent « quatre marches » ou citent Relance comme sort ouvert. |
| `src/gl/components/mj/GLTenirProfilPanel.jsx` | Libellés des marches (l. 15-25), seulement. |
| `src/gl/components/mj/GLTourScreen.jsx` et `tests-ui/gl/GLTourScreen.test.jsx` | Le bandeau « tour resté ouvert » (étape moteur-3.4), seulement. Le lot ecrans-4 refait le reste de l'écran. |
| `tools/gl-sim/` (scénario `escalier` de `scenarios/base.js`, `README.md`) | Apprendre au banc la marche par jour (section 7) ; description du scénario. |
| `docs/GL_TENIR_A_DEUX_REGLES.md` (hors § 0), `docs/reference/gl/guide-du-mj.md`, `docs/reference/gl/chapitres-et-progression.md`, `docs/reference/gl/economie-marche-sorts.md` | Les phrases devenues fausses (section 9). |

**Ne touche pas**

| Fichier ou symbole | Lot qui le modifie |
| --- | --- |
| `lib/glTour.js › bonneReponseDeCaseTx`, `lib/glTenirInvariants.js` (relances de case) | moteur-4 |
| `lib/glArriveeSuspendue.js`, `lib/glSpellEffects.js` (effet `reroll`) | personne : code gardé, inerte |
| `data/gl/tenir/exemple/sorts.json` | personne : `SL005` y reste actif |
| `src/gl/components/settings/GLTenirSettings.jsx` | ecrans-1 (voir « Pour Oliv ») |
| `data/gl/tenir/peripeties.json` (`per-01`) | moteur-2 |
| `olu-14`, `olu-18` | moteur-4 |
| `lib/glTrameDefis.js` | moteur-5 |

## 4. Étapes (dans cet ordre)

**Banc d'abord** : passe « avant » (section 7).

Les étapes moteur-3.1 et moteur-3.2 se font **dans le même commit** : le test de contenu
(`tests/content/gl-tenir-donnees.test.js`, vers la l. 187) compare les sorts de l'escalier à
`ouverture_par_chapitre["1"]` ; ils changent ensemble.

### moteur-3.1 — Escalier en cinq marches, une par jour (ex-étape 20)

- **Constat vérifié** :

  | Où | Constat |
  | --- | --- |
  | `src/shared/glTenirEscalierCore.js › ESCALIER_MARCHES` (l. 21) | 4 marches. Séance 1 : `avancer`, `chercher`, `defi_case`, `trame` ; séance 2 : `tenir`, `erreur_du_jour` ; séance 3 : `voile`, `page_temoin`, `sorts`, `lumiere` et 5 sorts ; séance 4 : `marche` et `SL005`, `SL036`, `SL004`. |
  | Partie 16, 23/11 | 4 lignes « première fois » d'Olu dans la même ouverture. |
  | `lib/glTour.js`, l. 679 | Une marche est montée à **chaque** tour clos (`avancerTx({ motif: 'tour_clos' })`) : deux tours joués le même jour ont ouvert deux marches. |
  | `lib/glEscalier.js › avancerTx` (l. 79) | Écrit `escalier_pas` et l'évènement `escalier_pas` (`created_at = NOW()`, par `insertGameEvent`). |
  | `lib/glTenirOlu.js › premieresFoisPourEvenement` | Une ligne « première fois » ne se dit pas avant sa `seance_escalier` ; l'évènement `team_spirit` appelle la clé `lumiere`. |

- **Changement attendu** :
  1. Nouvelles marches (Relance, `SL005`, n'y figure plus : étape moteur-3.2) :

     | Séance | `modules` | `sorts` |
     | --- | --- | --- |
     | 1 | `avancer`, `chercher`, `trame` | — |
     | 2 | `tenir`, `erreur_du_jour`, `defi_case` | — |
     | 3 | `voile`, `page_temoin` | — |
     | 4 | `sorts`, `lumiere` | `SL002`, `SL037`, `SL039`, `SL042`, `SL044` |
     | 5 | `marche` | `SL036`, `SL004` |

     Le commentaire d'en-tête suit (marche 5 : « Farce, Question »). `ESCALIER_DERNIERE_SEANCE` passe à 5 de
     lui-même ; vérifie le validateur `escalier_pas` de `lib/glTenir.js` (l. 100) et `normaliserPas`.
  2. **Une marche par jour** : à la clôture d'un tour (`motif: 'tour_clos'`), ne monte la marche que si la dernière
     montée de la partie (dernier évènement `escalier_pas`, ou création de la partie pour la marche 1) date de
     **plus de 12 h**. La comparaison se fait en SQL, `NOW()` contre `created_at` (jamais un `new Date()` JS contre
     une colonne écrite par `NOW()`). « Ouvrir la suite » du prof (`motif: 'prof'`) n'est **pas** bridé. Range le
     calcul de la date de référence dans une seule petite fonction (voir « À relire », section 11).
  3. **Parties neuves seulement** (décision du 24/11 après-midi) : n'écris **aucun** code de rattrapage pour les
     parties déjà commencées, aucune migration des `escalier_pas` existants. La phrase de l'ancien texte « une partie
     au pas 4 garde son pas, on ne referme rien » est retirée : ne la mets ni dans le code ni dans les docs.
  4. Libellés du journal, `lib/glJournalPresentTenir.js › ESCALIER_LABELS` (l. 26) : « trois sorts » à la marche 4
     (trois par peuple), « deux sorts » à la marche 5. Le cas `escalier_pas` (l. 715) compte déjà « N sorts de
     plus » pour une marche sans module `sorts` : vérifie qu'il dit bien deux.
  5. `src/gl/components/mj/GLTenirProfilPanel.jsx` (l. 15-25) décrit les marches (clé `marche` : « le Marché, trois
     sorts de plus ») : aligne (« le Marché, deux sorts de plus »).
  6. `data/gl/tenir/olu-lignes.json`, champ `seance_escalier` des lignes « première fois » dont le module change de
     marche : `olu-pf-defi_case` 1 → 2 ; `olu-pf-sorts` 3 → 4 ; `olu-pf-lumiere` 3 → 4 ; `olu-pf-marche` 4 → 5 ;
     `olu-pf-comptes` 4 → 5. Sans cela, à la séance 3, une carte Team Spirit gardée ferait dire la ligne de la
     Lumière avant que la jauge se montre. Aucun texte ne change ici.
- **Textes** : aucun texte d'élève nouveau.
- **Tests** :
  - `tests/gl-tenir-escalier-pure.test.js` : marches, cumul, sorts. Les assertions sur `SL005` (l. 55, 74, 103, 109)
    changent, comme toutes celles qui récitent la table des séances ou tiennent 4 pour la dernière marche
    (l. 25-39, 45, 49-64, 67-78, 86-114).
  - Nouveau (`tests/gl-escalier-marche-par-jour.test.js`) : deux tours clos le même jour → une marche ; tour clos
    13 h plus tard → marche suivante ; « Ouvrir la suite » le même jour → monte. Le test vieillit lui-même la
    dernière montée (ou la création de la partie) par SQL dans sa base.
  - Tests où `escalier_pas: 4` voulait dire « tout est ouvert » : `tests/gl-ensemble-unifie-escalier.test.js`
    (l. 115, 228, 421-442), `tests/gl-ensemble-unifie-deux-ecrans.test.js` (l. 184, 220),
    `tests/gl-tenir-droits-serveur.test.js` (l. 139), `tests/gl-market-place.test.js` (l. 488),
    `tests/gl-ensemble-unifie-olu-premiere-fois.test.js` (l. 85-101), `tests-ui/gl/GLEscalier.test.jsx`,
    `e2e/gl-tenir-escalier.spec.js` (l. 279). Passe-les à 5, ou change l'attendu.
  - `tests/gl-ensemble-unifie-escalier.test.js`, « séance 2 : la clôture du tour monte une marche » (vers la
    l. 225) : la partie y est créée à l'instant ; vieillis sa création pour garder le sens du test.
- **Critère d'acceptation** : cinq marches ; deux clôtures le même jour n'en montent qu'une ; « Ouvrir la suite »
  monte toujours ; `npm run test:content` vert.

### moteur-3.2 — Retirer le sort Relance (ex-étape 26, même commit que moteur-3.1)

- **Constat vérifié** :

  | Où | Constat |
  | --- | --- |
  | `data/gl/tenir/sorts.json`, `SL005` (l. 73) | Relance : 2 gemmes, fenêtre `apres_jet`, 1 par tour et par équipe, effet `{ type: 'reroll', annule_precedent: true }`. Présent dans `ouverture_par_chapitre["1"]` (l. 659-669). |
  | `lib/glArriveeSuspendue.js › relanceDisponibleTx` (l. 105) | Seul sort qui fait **attendre** une case : l'arrivée n'est suspendue que si l'équipe peut encore lancer Relance. La requête joint `gl_spells` à `gl_chapter_spells` sur le chapitre de la partie et filtre `s.statut = 'officiel'`. |
  | Écran et console | Relance entraîne l'état « Garder ce jet » / « Relance… » de la carte du moment, le bloc de console « Jets en attente (Relance possible) » et la règle « Relance rendue au souffle, premier jet réappliqué ». |
  | `data/gl/tenir/sorts.json` | 25 sorts au fichier ; 6 déjà retirés portent `"actif": false` et sont absents d'`ouverture_par_chapitre` (`SL033`, `SL038`, `SL041`, `SL006`, `SL007`, `SL050`) ; 19 actifs, 18 après ce lot. |
  | `lib/glTenirImport.js` (l. 1883-1978) | À l'import, un sort `actif: false` passe en statut `propose` (non lançable) ; les liens `gl_chapter_spells` des chapitres des plateaux 1 à 4 sont effacés puis réécrits avec les seuls sorts actifs. |
  | Prod au 24/11 | `SL005` est `officiel` et lié à **six** chapitres (ids 1, 3, 4, 5, 6 et 7), pas au seul chapitre du plateau 1. Les chapitres 1 et 7 n'ont pas de plateau : l'import ne réécrit pas leurs liens. |
  | Le mot « relance » | Il ne sort **pas** entièrement du jeu, contrairement à ce que disait l'ancien texte : voir « Pour Oliv ». |

- **Changement attendu** :
  1. `data/gl/tenir/sorts.json` : `SL005` reçoit `"actif": false` et sort d'`ouverture_par_chapitre["1"]`. La ligne
     reste en base, non lançable, comme les autres sorts retirés.
  2. **Migration `mig-relance`, conditionnelle. Vérifie d'abord**, sur ta base locale, après l'import du nouveau
     `sorts.json` : (a) `gl_spells.statut` de `SL005` vaut `propose` ; (b) `relanceDisponibleTx` rend `null` pour une
     partie de chaque plateau ; (c) aucun autre lecteur de `gl_chapter_spells` ne sert `SL005` comme lançable ou ne
     l'affiche dans un grimoire d'élève (`git grep -n "gl_chapter_spells" -- lib routes`). Le statut `propose`
     suffit à `relanceDisponibleTx`. **N'écris la migration que si (b) ou (c) échoue**, et dis pourquoi dans ton
     rapport ; sinon écris « `mig-relance` : non nécessaire », avec la preuve. Forme de la migration : section 5.
  3. `src/shared/glTenirEscalierCore.js` : `SL005` hors de la marche 5 (étape moteur-3.1).
  4. `data/gl/tenir/olu-lignes.json` : `olu-41` (« Relance ! Le dé a droit à une seconde chance… ») passe
     `"actif": false`. `olu-pf-marche` (dite à la marche 5, pendant l'ouverture du tour, alors que le Marché est
     fermé pendant le tour) reçoit le texte ci-dessous. Le « tu » y reste : exception déjà déclarée par
     `tests/content/gl-adresse-ecran-equipe.test.js` (l. 67). Copie `exemple/` alignée si un test la lit.
  5. **Code de l'arrivée en suspens** : il reste, inerte (sans Relance ouvert, `relanceDisponibleTx` renvoie `null`
     et la case s'applique tout de suite). Ne le supprime pas : il partira avec le nettoyage d'après deux séances.
     Les tests qui exercent ce mécanisme (`tests/gl-grimoire-v2.test.js`, `tests/gl-tenir-jets-paralleles.test.js`,
     `tests/gl-tenir-droits-serveur.test.js`, `tests/gl-ensemble-unifie-escalier.test.js`,
     `tests-ui/gl/GLTenirEcranEquipe.test.jsx`) gardent leurs fixtures où `SL005` est actif
     (`data/gl/tenir/exemple/`) : ils testent un code encore présent. Dans une partie qui monte l'escalier, `SL005`
     n'est plus dans aucune marche : il ne s'y ouvre qu'escalier monté (pas 5).
- **Textes** (mot pour mot) : `olu-pf-marche` → « Le Marché ouvre, hors du tour, depuis ton compte. Ce que tu y
  achètes, tu le gardes toute l'année. »
- **Tests** :
  - Nouveau (`tests/content/gl-sans-relance.test.js`) : avec le catalogue réel, aucun sort actif n'a l'effet
    `reroll`. Et, côté code (`tests/gl-ensemble-unifie-escalier.test.js` ou un test voisin) : catalogue réel
    importé, un jet au plateau 1 s'applique sans suspension.
  - `tests/content/gl-tenir-donnees.test.js` (l. 146-195) : `SL005` rejoint la liste `retires` ; le commentaire
    « 19 sorts » devient 18.
- **Critère d'acceptation** : aucun écran ne propose Relance ; aucun jet n'attend ; `npm run test:content` vert ;
  `DB_NAME=<ta base de banc> npm run gl:import:tenir -- --fichier tous --strict --dry-run` sans erreur.

### moteur-3.3 — Page témoin derrière la dernière équipe (ex-étape 21)

- **Constat vérifié** : `lib/glEscalier.js › poserPageTemoinTx` (l. 119) pâlit la zone endormie au plus petit
  `rang_case` (l. 133 : `ORDER BY z.rang_case IS NULL, z.rang_case ASC, z.ordre ASC, z.id ASC`). Au plateau 1,
  c'est toujours `cz-p1-05`, rang 5, loin derrière les équipes.
- **Changement attendu** : choisis la zone endormie au **plus grand `rang_case` inférieur ou égal au rang de la
  dernière équipe** (hors camp) ; s'il n'y en a pas, garde la règle actuelle (plus petit rang). Le reste ne change
  pas. N'ajoute rien à la projection ; note dans ton rapport si elle montre déjà les zones pâlies.
- **Textes** : aucun.
- **Tests** (`tests/gl-page-temoin-rang.test.js`) : équipes aux rangs 12, 12, 13, 16, zones endormies aux rangs 5,
  6, 7, 21 → zone du rang 7 ; toutes les zones devant les équipes → zone du rang le plus petit.
- **Critère d'acceptation** : les deux cas verts ; une seule page témoin par partie, comme avant.

### moteur-3.4 — Journal et tour resté ouvert (ex-étape 25)

- **Constat vérifié** :

  | Où | Constat |
  | --- | --- |
  | `lib/glFeuilletBundleGrant.js` (l. 88-95) | Les pages données à l'ouverture d'une partie écrivent un évènement `feuillet_discovered` par page et par équipe, avec `source: 'ouverture'` : 20 lignes au journal. |
  | `lib/glJournalPresentTenir.js` (l. 591-597) | Chacune se présente « Carnet — {équipe} fait vivre son carnet… ». |
  | `lib/glJournalPresentTenir.js` (l. 321) | `page_lue` : une ligne par lecture, même répétée. |
  | `routes/gl/journal.js` (l. 88), `lib/glJournalPresent.js › presentJournalEvent` | Le journal est présenté évènement par évènement ; un regroupement se fait donc à l'assemblage de la liste. |
  | Prod | Le tour 3 de la partie 16 est en phase `souffle` depuis le 23/11 : le bandeau s'y affichera. |

- **Changement attendu** :
  1. **Journal** : les pages données à l'ouverture d'une partie se présentent en **une** ligne ; deux lectures de la
     même page par la même équipe à moins de 60 s ne font qu'une ligne. Fais-le à la présentation (ou à
     l'insertion, si c'est plus simple et que rien d'autre ne lit ces évènements un par un) ; dis ton choix.
  2. **Console** : à l'ouverture de l'écran du tour, si le tour courant est ouvert depuis plus de 12 h (calcul
     **serveur**, `NOW()` contre `started_at`, servi comme un drapeau de la vue du tour), un bandeau propose de le
     clore par le geste existant de passage en phase `clos`. Rien d'automatique.
- **Textes** (mot pour mot) :
  - journal : « Les équipes reçoivent les pages d'ouverture. »
  - bandeau du prof : « Le tour du {date} est resté ouvert. Le clore ? »
- **Tests** : rendu du journal regroupé (`tests/gl-journal-regroupe.test.js`) ; bandeau présent à 13 h, absent à
  2 h (`tests-ui/gl/GLTourScreen.test.jsx` pour l'écran, un test serveur pour le drapeau).
- **Critère d'acceptation** : une partie neuve à cinq équipes n'a plus qu'une ligne d'ouverture au journal ; le
  bandeau ne clôt rien sans appui.

### Compléments de relecture (24/11), à traiter avec l'étape moteur-3.1

- `lib/glEscalier.js › surchargesDuProf` (vers les lignes 59 à 66) remet le pas à « tours clos + 1 » quand le prof
  rallume l'escalier : c'est contraire à « une marche par jour ». Aligne-le sur la règle du jour, et dis-le dans ton
  rapport (« Choix faits sans demander »).
- Deux tests attendent l'ancienne montée et ne sont pas dans la liste de l'étape : `e2e/gl-tenir-escalier.spec.js`
  (vers les lignes 277 à 279 : attend la marche 4 après deux avances et une clôture) et
  `tests/gl-ensemble-unifie-escalier.test.js` (vers les lignes 389 à 394 et 440 à 442). Mets-les à jour dans le même
  commit, et liste-les en section 8.

## 5. Migration

- **Étiquette** : `mig-relance`, **conditionnelle** (étape moteur-3.2, point 2).
- **Table** : `gl_chapter_spells`.
- **Écriture, si elle est nécessaire** : `DELETE FROM gl_chapter_spells WHERE spell_code = 'SL005'`, sur **tous** les
  chapitres, pas seulement celui du plateau 1 (l'ancien texte se trompait).
- **Garde** : la suppression est idempotente par nature. Aucun texte attendu.
- **Prod au 24/11** : six liens (`chapter_id` 1, 3, 4, 5, 6, 7), sort `officiel`, `tenir_v2 = 1`, exécution `auto`.
  Au démarrage qui suit la fusion, la synchronisation des catalogues par empreinte (`lib/glTenirSync.js`) passe
  `SL005` en `propose` et réécrit les liens des chapitres 3 à 6.
- **Base neuve** : l'import écrit les liens sans `SL005` ; la migration ne trouve rien et ne fait rien.

Aucune migration pour l'escalier : pas de rattrapage des parties en cours (décision du 24/11 après-midi).

## 6. Données et sources

Aucun fichier de `docs/prompts/gl-decisions/sources/` à lire : tous les textes sont dans cette fiche.

## 7. Vérifications propres au lot

- **Banc, régime « seuils »**, avec les trois commandes des règles communes (dont `multi-appareils`). Une passe
  **avant** l'étape moteur-3.1, une passe **après** le commit des étapes moteur-3.1 et moteur-3.2. À noter :
  - l'**écart de cases** entre l'équipe la plus avancée et la dernière au camp ;
  - la **dépense de gemmes par élève et par chapitre** (Relance était un débouché des gemmes).

  Une baisse de la dépense s'explique par le retrait de Relance : dis-le.
- **Le banc et la marche par jour** : l'horloge du banc (`tools/gl-sim/horloge.js`, `lib/glClock.js`) est une
  horloge JS ; la règle des 12 h compare en SQL. Les deux scénarios ci-dessus ne montent pas l'escalier (ils
  ouvrent tout d'emblée). Le scénario `escalier` (`tools/gl-sim/scenarios/base.js`, l. 118) resterait à la marche 1.
  Apprends-lui la règle de la façon la plus simple (entre deux séances, vieillir de 13 h la dernière montée dans la
  base `_sim`, ou faire toucher « Ouvrir la suite » au prof du banc), dis-le, puis lance
  `npm run gl:sim -- --scenario escalier --runs 1 --seed 14` : il doit aller au bout et atteindre la marche 5.
- Import strict à blanc (étape moteur-3.2) et `npm run test:content`.
- e2e (sous le verrou) : `e2e/gl-tenir-escalier.spec.js`, `e2e/gl-tenir-tablettes.spec.js`.
- Captures (`docs/captures/gl-decisions/moteur-3/`) : le panneau « Profil » avec les cinq marches ; le bandeau « tour
  resté ouvert » ; le journal d'une partie neuve.

## 8. Contrats de test changés

| Contrat | Avant | Après |
| --- | --- | --- |
| `ESCALIER_MARCHES`, `ESCALIER_DERNIERE_SEANCE` | 4 marches, dernière = 4 | 5 marches, dernière = 5 (tableau de moteur-3.1) |
| `ESCALIER_SORTS` | contient `SL005` | sans `SL005` |
| Montée à la clôture d'un tour | toujours | seulement si la dernière montée date de plus de 12 h |
| `SL005` dans `sorts.json` | actif, ouvert au chapitre 1 | `actif: false`, ouvert nulle part ; 18 sorts actifs |
| `olu-41` | active | `actif: false` |
| `olu-pf-marche` | « Le Marché ouvre. Ce que tu achètes au comptoir, tu le gardes toute l'année. » | « Le Marché ouvre, hors du tour, depuis ton compte. Ce que tu y achètes, tu le gardes toute l'année. » |
| `seance_escalier` de `olu-pf-defi_case`, `-sorts`, `-lumiere`, `-marche`, `-comptes` | 1, 3, 3, 4, 4 | 2, 4, 4, 5, 5 |
| Page témoin | zone endormie au plus petit rang | la plus avancée derrière la dernière équipe |
| Journal, pages d'ouverture | une ligne par page et par équipe | une ligne |
| Vue du tour | — | un drapeau « tour ouvert depuis plus de 12 h » |

## 9. Docs à mettre à jour dans ce lot

- `docs/GL_TENIR_A_DEUX_REGLES.md` (hors § 0) :
  - § 15, tableau « L'escalier du chapitre 1 » (l. 300-308) et « Le pas » : cinq marches, une marche par jour (12 h),
    « à 5, l'escalier est monté » ;
  - § 10 : grimoire à **18 sorts** ; Relance dans « Sortis du grimoire » ; « Ouverture par chapitre », ch. 1 sans
    Relance ;
  - § 3 : la règle « Relance rendue au souffle » et le bloc des jets en attente : « sans objet depuis le retrait de
    Relance ».
- Écris dans les règles (escalier) et dans `docs/reference/gl/guide-du-mj.md` (séance par séance, l. 253, 346, 495,
  559-577) : **un chapitre 1 joué en quatre séances n'atteint pas la marche 5** (Marché, Farce, Question s'ouvrent
  alors au plateau 2, où tout est ouvert) ; pour les ouvrir quand même, « Ouvrir la suite » à la séance 4. Le lot
  fin-2 le reprendra dans les deux docs du prof.
- `docs/reference/gl/chapitres-et-progression.md` (l. 356-365) : les marches.
- `docs/reference/gl/economie-marche-sorts.md` : après le lot ecrans-1, un encart en tête y dit que le jeu
  classique n'est plus proposé ; ajoute à cet encart « le sort Relance est retiré ». Corrige les phrases des
  l. 426-435 (séances 3 et 4).
- `.claude/skills/gl-*` : « escalier en quatre marches », Relance, si une phrase le dit.
- Pour le § 0 des règles (dans ton rapport) : « 23/11 : escalier en cinq marches, une marche par jour au plus. » ;
  « 23/11 : la page témoin se pose derrière la dernière équipe. » ; « 23/11 : le sort Relance est retiré, grimoire à
  18 sorts. » ; « 24/11 : le nouvel escalier ne vaut que pour les parties neuves. »

## 10. Hors périmètre

| Ce que ce lot ne fait pas | Lot qui le fait |
| --- | --- |
| Question de case sans relance, une case ou trois sous le voile (`bonneReponseDeCaseTx`) | moteur-4 |
| Rattrapage des parties déjà commencées | personne (décision du 24/11) |
| Suppression du code inerte (`glArriveeSuspendue`, état « Garder ce jet », bloc « Jets en attente ») | après deux séances jouées, hors chantier |
| Mise en évidence de la page témoin sur la projection | hors chantier |
| Les deux docs du prof (essentiel, déroulé) | fin-2 |
| Libellés du réglage des relances dans `GLTenirSettings.jsx` | non attribué : voir « Pour Oliv » |

## 11. Pour Oliv

**À relire**

- **Parties neuves seulement.** Ce lot ne rattrape rien. Une partie déjà commencée relit le nouveau tableau : au
  pas 3 (la partie 16), les sorts et la Lumière se referment jusqu'à la marche 4 ; au pas 4, le Marché, Farce et
  Question se referment jusqu'à la marche 5. Les parties 16 et 17 sont des tests : crée une partie neuve pour la
  séance 1.
- **La marche par jour et le jour de création.** L'ancien texte compte la création de la partie comme la « montée »
  de la marche 1. Une partie créée **le matin même** de la séance 1 ne montera donc pas à la clôture du premier
  tour (moins de 12 h) : la séance 2 se jouerait encore à la marche 1. Deux sorties : créer la partie la veille, ou
  décider que seule une vraie montée compte (la création ne bride pas). La session code le texte tel quel et isole
  ce calcul dans une fonction ; dis ce que tu préfères.
- **Le mot « relance » reste à trois endroits** que ce lot ne touche pas :
  - `src/gl/components/settings/GLTenirSettings.jsx`, l. 13 : « Question de case : juste → +1 case et on relance »
    (faux après le lot moteur-4) ; l. 74 : « Relances de case par équipe et par tour (0 = sans limite) » (réglage
    gardé au registre, sans effet après moteur-4) ;
  - la péripétie `per-01` : « La ou le Gestionnaire relance de la main qui n'écrit pas. » (ici, c'est le dé de la
    classe qu'on relance : texte décidé, gardé) ;
  - le code : l'évènement `relance_bonus` et le réglage `tenir_relances_max_par_tour` gardent leur nom.
- `olu-pf-marche` (nouveau texte, section 4).
- « Les équipes reçoivent les pages d'ouverture. » et « Le tour du {date} est resté ouvert. Le clore ? »

**À faire après la vague**

- Les catalogues `sorts` et `olu-lignes` se rechargent seuls au démarrage ; vérifie dans Contenus → Chapitres que
  Relance n'est plus au grimoire (18 sorts).
- Clore le tour 3 de la partie 16 (le bandeau le proposera), ou ranger la partie.
- Un chapitre 1 joué en quatre séances : toucher « Ouvrir la suite » à la séance 4 pour ouvrir le Marché.
