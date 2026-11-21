---
name: gl-tenir-moteur
description: Carte du tour de la mouture « Tenir à deux » de Gnomes & Licornes — phases, surfaces, droits rejoués par le serveur (glTenirPermissionsCore), transactions, grand livre des bourses, évènements et libellés du journal, temps réel, chronométrage, sabliers. À lire avant de brancher un nouveau geste, une route de partie, un réglage ou un évènement dans lib/glTour.js, lib/glChasse.js, lib/glSpellCast.js ou routes/gl/games/.
---

# « Tenir à deux » — carte du tour

Dossier technique complet : `docs/GL_TENIR_A_DEUX.md`. Règles : `docs/GL_TENIR_A_DEUX_REGLES.md`.

## Une partie « Tenir »

`isTenirGame(settings, game)` = réglage `gameplay.tenir_enabled` **et** `gl_games.tenir_profil`
(`complet` | `court` ; le profil `prologue` a disparu). Réglages résolus : défauts ←
`gl_settings` ← écarts du profil ← surcharges de la partie ← escalier du chapitre 1
(`resolveTenirSettings`, clés `OVERRIDABLE_KEYS` de `lib/glTenir.js`).
Un réglage nouveau se déclare à quatre endroits : `DEFAULT_GAMEPLAY`, `TENIR_SETTING_KEYS` et le
registre de `lib/glSettings.js`, puis `data/gl/tenir/reglages-defaut.json` (et son jumeau
`exemple/`), avec un `INSERT IGNORE` du défaut en migration.

## L'escalier du chapitre 1 (ensemble unifié, M8)

Au plateau 1, les règles s'ouvrent séance après séance : 1 avancer, chercher, défi de case,
défis de la Trame ; 2 tenir, l'erreur du jour ; 3 le voile, la page témoin, trois sorts, la jauge
de Lumière ; 4 le Marché, trois sorts de plus.

- Cœur pur `src/shared/glTenirEscalierCore.js` (miroir `lib/shared/`) : `escalierPourTour`,
  `etatEscalier`, `moduleOuvert(resolved, module)`, `sortOuvert(resolved, code)`.
- Le **pas** vit dans les surcharges de la partie (`escalier`, `escalier_pas`) : posé par
  `POST /api/gl/games` au plateau 1 (réglage `tenir_escalier`), + 1 à la clôture d'un tour, + 1
  sur `POST …/tenir/escalier/suite` (`lib/glEscalier.js › avancerTx`), jamais en arrière.
  `PUT /tenir/profil` ne choisit jamais le pas.
- `resolveTenirSettings` ferme déjà `voile`, `marche` et `olu_erreur_du_jour` : une règle qui lit
  ces réglages n'a rien à faire. Pour le reste, appeler `moduleOuvert` (`tenir`, `lumiere`,
  `page_temoin`) ou `sortOuvert` : refus 409 `ESCALIER_FERME` / `SPELL_ESCALIER`.
- Une nouveauté de chapitre 1 se range sur une marche du cœur ; l'écran **masque** ce qui n'est
  pas ouvert (jamais de bouton grisé). Le banc ne monte pas l'escalier par défaut
  (`escalier: false`) : scénario `escalier` pour l'éprouver.

## Phases et surfaces

- Phases d'un tour : `ouverture → jeu → souffle → clos` (`ouvrirTourTx`, `changerPhaseTx` de
  `lib/glTour.js`). La clôture du chapitre (`POST /end`, `lib/glSeuil.js`) ferme le tour : à
  l'écran, c'est **le camp** (le fichier garde son nom technique).
- Présences : chacun est présent par défaut (`lib/glPresences.js`) ; aucune confirmation, aucune
  demande. Le Retrait est levé pour tous au passage en `clos`.
- File du prof (`lib/glDemandes.js`) : `des_a_valider`, `jet_en_suspens`, `sort_a_appliquer`
  (« Sort à honorer »), `plume` (« Lettre à relire »), `mentorat`, `chimere`, `defi_case`,
  `nommer`. Sorties automatiques dans `solderAttentesDeSeanceTx` (`lib/glTour.js`).
- Surfaces : `tableau` (le prof porte les gestes de l'équipe active), `hybride`, `tablette`
  (`resolveSurface`). Au tableau, rien ne change sans décision.
- Chaque phase est chronométrée (`gl_game_round_phases`, `lib/glRoundPhases.js`).
- Sabliers : `lib/glSablier.js` + `src/shared/glSablierCore.js`, composant `GLSablier`.

## Droits : le serveur rejoue, l'écran masque

Noyau pur `src/shared/glTenirPermissionsCore.js` (miroir `lib/shared/`) :

- `resolveTenirPermissions({ surface, phase, actorKind, … })` → `jeter` (un sort), `lancer`
  (les dés), `repondre`, `fouiller`, `lire`, `tenir` (faire tenir une page lue : fermé à la
  séance 1 de l'escalier, prof compris), `marche`… ;
- `isSortPermisSurSurface` : au tableau, un élève ne lance pas un sort de la phase `jeu`.

Côté serveur : `assertActionOuverte` (`lib/glTour.js`) pour lancer / répondre / fouiller,
`resolveLectureContext` pour lire et tenir, `assertTenirSurfacePermission`
(`lib/glSpellCast.js`) pour les sorts. Refus : 403 `TENIR_PERMISSION`, 409 `TENIR_PHASE`.
Les routes prof portent `requireGlPermission('gl.game.manage')`.

L'écran lit les droits servis (`tenir.permissions`) et **cache** un geste fermé : il ne l'ouvre
jamais, et ne le montre plus grisé (sauf l'ancien écran, gardé en surface `tableau`).

## Plusieurs appareils par équipe (ensemble unifié, M13)

Une équipe joue sur plusieurs écrans (tablettes de classe, comptes de ses élèves). L'état vit
dans `gl_team_etat` (une ligne par équipe, née à son premier geste) — **jamais dans `gl_teams`**,
dont les transactions du moteur verrouillent la ligne (un compteur posé dessus s'y interbloquait).

- Cœur pur `src/shared/glMainCore.js` (miroir `lib/shared/`) ; serveur `lib/glEquipeEtat.js`.
- **`gardeDEquipe({ prend?, rend?, sansMain? })`** se pose sur une route d'équipe, après le
  middleware d'authentification. Elle fait trois choses pendant un tour ouvert d'une partie
  « Tenir » (et laisse passer sinon) :
  1. **version d'état** : l'écran envoie la version vue (`X-GL-Etat-Version`) ; un `UPDATE`
     conditionnel l'avance — périmée, 409 `ETAT_PERIME`, sans perte. Un geste que le moteur
     refuse rend sa version ; un geste abouti rend `etatVersion` dans sa réponse ;
  2. **la main** : `prend: 'repondre' | 'fouiller' | 'tenir' | 'sort'` la prend pour 60 s au
     plus ; `rend: true` la rend à la fin du geste (la route peut poser
     `req.glGarde.rend = false` pour la garder : une fouille qui ouvre une question). Un autre
     appareil reçoit 409 `MAIN_AILLEURS`. Elle se rend aussi à l'échéance, sur
     `POST …/tenir/main/rendre`, à la déconnexion de la socket, au changement de phase ;
  3. **absent spectateur** : compte d'élève absent du tour ou en retrait → 403 `SPECTATEUR`.
- Le prof n'est jamais retenu ; son geste pour une équipe avance la version. Un geste
  **personnel** (sa part d'un pot, « pas moi ») ne passe pas par la garde.
- **Bourses au propriétaire** : une tablette d'équipe ne touche la bourse de personne
  (`resolveActingPlayer` → 403 `BOURSE_AU_PROPRIETAIRE` ; Marché fermé aux sessions d'équipe).
  « Qui agit ? » a disparu.
- **Sessions protégées** (`lib/glGuestToken.js`) : `issueTeamSession` rend une **demande**
  (`accepted_at` nul, deux minutes) ; `acceptTeamSessions` la fait valoir 3 heures. En test :
  `ouvrirTablette` (`tests/helpers/glTenirFixtures.js`) rend une tablette déjà acceptée.
- Écran : bloc `tenir.equipe` (`version`, `main`, `appareils`), `tenir.spectateur`, signal socket
  `gl:game:equipe` (sans donnée : on recharge), `GLEquipeAppareils`.
- Un geste d'équipe nouveau : poser `gardeDEquipe()` sur sa route, et rien d'autre.

## Les écrans de séance (20 novembre 2026)

Trois écrans, aucune règle : ils rangent ce que le serveur sert. Rien n'y ouvre un geste.

- **Écran d'équipe** — `GLTenirEcranEquipe` (`src/gl/components/tenir/`), le même aux deux
  points de montage : `GLTeamSessionView` (tablette, tour ouvert ou non) et l'onglet du plateau
  d'`AppGL` (compte d'un élève). Il reçoit le plateau par sa prop `board`
  (`<GLMapView presentation="tenir" />`) et assemble `GLTenirBandeau` (phase, sablier, bourses,
  bouton du tiroir, icône « Relire l'écran »), `GLTenirMoment` (la carte du moment) et
  `GLTenirTiroir` (cases à venir, réserve, défi, carnet, présences).
- **La carte du moment** est une fonction pure : `momentDeLEquipe(entrée)` de
  `src/gl/utils/glTenirMoment.js` rend **un seul** état, le premier vrai de `ETATS_DU_MOMENT`
  (`peripetie`, `main_ailleurs`, `appareil`, `question`, `jet_suspens`, `saisie_des`,
  `jet_attente`, `retour`, `geste`, `joue`, `souffle`, `camp`, `clos`, `attente`). Le gros bouton
  suit `ORDRE_DES_GESTES` (répondre, lancer, fouiller, lire, sorts), puis `PUCES_MAX` puces. Les
  gestes ouverts viennent de `maintenantVousPouvez` (`src/shared/glSortMomentsCore.js`). **Un
  état nouveau a toujours une sortie** (geste, temps réel ou « Continuer »).
- **Toute la logique de l'écran** (instantané du tour, question de case, Olu, péripétie, état
  périmé, main, version d'état, présences, jet en suspens) vit dans le hook `useGlTenirEquipe`
  (`src/gl/hooks/`), lu par le nouvel écran **et** par l'ancien : une correction vaut pour les
  deux. `useGlTempsReelCoupe` dit quand le socket est coupé depuis plus de 4 s.
- **Surface `tableau`** : `GLTenirEquipeView` (l'ancien écran, cinq boutons grisés) est gardé
  tel quel aux deux points de montage (`auTableau`, `ecranEquipeEnTrois`). Ne pas le supprimer
  sans décision.
- **Un geste nouveau à l'écran** : son droit dans `maintenantVousPouvez`, sa place dans
  `ORDRE_DES_GESTES`, son libellé dans `glTenirMoment.js` (au « vous » : le test de contenu
  `tests/content/gl-adresse-ecran-equipe.test.js` relit ces fichiers), `data-geste="<geste>"`
  sur le bouton. Tests : `tests-ui/gl/glTenirMoment.test.js`, `GLTenirEcranEquipe.test.jsx`.
- **Phases en mots d'élève** : `src/gl/constants/tenirPhases.js` (`PHASE_ELEVE`,
  `PHASE_CONSOLE`, `titreDuTour`), seule source pour l'écran d'équipe, la projection et la
  console.
- **Projection** — `GLProjectionView` (mode tableau, `presentation="projection"` : un plateau
  sans aucun bouton) ; les faits marquants viennent de `GLTourJournal` (prop `marquants`,
  liste `FAITS_MARQUANTS`). Jamais une bourse ni la réserve.
- **Console** — `GLTourScreen` déclare le **mode séance** (`useDeclarerModeSeance`,
  `src/gl/utils/glModeSeance.js`), que `GLTopBar` lit pour se réduire. Les morceaux paresseux de
  la console passent par `lazyAvecReprise` ; une panne réseau rend une phrase française selon
  la session (`glNetworkFailureMessage`, `messagePourEquipe` pour un écran d'équipe).
- Mises en page : blocs « Écran d'équipe en trois choses », « Mise en page de l'écran
  d'équipe » et « Projection, mode tableau » à la fin de `src/gl/styles/gl-tenir.css`. Points
  de bascule de `src/shared/breakpoints.js` seulement ; pas de `style={{ … }}` nouveau.

## Écrire dans une partie

- Une route = `withTransaction(async (tx) => …)` puis `emitAll(gameId, events)` **après** le
  commit. Les fonctions du moteur finissent par `Tx` et prennent `tx` en premier argument.
- **Bourses** : uniquement `applyBourseDeltaTx` (`lib/glBourses.js`) ; réserve de la caravane :
  `creditReserveTx` / `debitReserveTx`. Chaque mouvement écrit une ligne du grand livre
  (`gl_resource_ledger`, cause dans `CAUSES`). Une cause nouvelle s'ajoute à `CAUSES`.
- **Une seule monnaie, les gemmes** (ensemble unifié, M1) : en « Tenir », on ne passe jamais de
  `dh` / `healthDelta` — un coût se calcule par `resolveRequired` (`lib/glSpellCast.js`, toujours
  `{ gems: cout, hearts: 0 }`), un gain par `gemmesDelta(n)` (`lib/glTenir.js`). `resourceOfPeople`
  ne sert plus qu'à comparer deux peuples. Hors partie (Marché en veillée), `classeJoueTenir` dit
  si la classe joue « Tenir » ; côté écran, `gemmesSeules` (`src/gl/utils/glMonnaie.js`) retire les
  cœurs. L'état servi d'une partie « Tenir » passe par `sansCoeurs` (`lib/glTenirView.js`).
- **Invariants** : `lib/glTenirInvariants.js` (bourses, livre, pions, voile, pages, quotas). Le
  banc les rejoue après chaque geste ; `LIVRE_TOTAL` attrape toute ressource créée de rien,
  `COEURS_HORS_JEU` tout mouvement de cœurs écrit après la conversion (migration 373).
- **Aléa et horloge** : `lib/glRandom.js` (`forGame(gameId)`), `lib/glClock.js` (`now()`).
  Jamais `Math.random()` ni `new Date()` dans une règle du jeu.

## Évènements, journal, temps réel

- `insertGameEvent(tx, { gameId, teamId, actorType, actorId, eventType, payload })`
  (`lib/glGameEvents.js`). `actorType` : `mj`, `team` (un élève ou son équipe), `system`.
- Un payload privé porte `private: true` et `publicKeys` : `emitGlGameEvent`
  (`lib/realtime.js`) le réduit pour la salle ; le prof relit le détail par HTTP.
- **Olu « première fois »** : `insertGameEvent` appelle `avecPremieresFois`
  (`lib/glTenirOlu.js`) ; pour les types de `PREMIERE_FOIS_EVENT_TYPES`, la première occurrence
  d'un geste porte `payload.olu: [{ id, teamId? }]` (mémoire `gl_game_olu_premieres`, dans la
  transaction du geste). Un geste nouveau qui mérite sa ligne : une clé dans `PREMIERE_FOIS_CLES`,
  un cas dans `clesPremiereFois`, une ligne `premiere_fois` dans `olu-lignes.json`.
  Exception : `olu-pf-comptes` n'a aucun évènement — c'est la tablette qui la dit elle-même,
  une fois par onglet (`useGlTenirOlu`, option `ligneDeLEcran`).
- **Tout type émis a un libellé** dans `lib/glJournalPresentTenir.js` et figure dans
  `TENIR_EVENT_TYPES` (`tests/gl-journal-tenir-exhaustif.test.js` le vérifie). Le libellé
  respecte les garde-fous (skill `gl-tenir-garde-fous`).
- Ce que lit un écran : bloc `tenir` de `GET /api/gl/games/:id` (`lib/glTenirView.js`, bourses
  filtrées par spectateur) et `GET …/tenir/tour` (`routes/gl/games/tenir-tour.js`).

## Brancher un nouveau geste : la liste

1. Le droit dans `glTenirPermissionsCore` (puis `npm run sync:shared-cores`) et son contrôle serveur.
2. La fonction `…Tx` dans le module du domaine, la route dans `routes/gl/games/`, avec
   `gardeDEquipe()` si une équipe le joue pendant le tour (version d'état, main, spectateur).
3. L'évènement, son libellé de journal, son éventuelle ligne d'Olu (`lib/glTenirOlu.js`).
4. Sa **sortie automatique** s'il attend quelqu'un (changement de phase, clôture, séance
   suivante, camp).
5. Tests `tests/gl-tenir-*.test.js` (fixtures `tests/helpers/glTenirFixtures.js`, suites
   séquentielles `--test-concurrency=1 --test-force-exit`), puis le banc (skill `gl-banc`).
6. Sa place à l'écran : la carte du moment (section « Les écrans de séance »).
7. `docs/API.md`, `docs/GL_TENIR_A_DEUX.md`, doc de référence `docs/reference/gl/`.
