# Audit des bugs de Gnomes & Licornes — 19 novembre 2026

Instantané daté, sur `main` en v1.249.2 (`85f3691`). Périmètre : tout le sous-produit G&L —
`routes/gl/**`, `lib/gl*.js`, `lib/gl/**`, `middleware/requireGl*.js`, `src/gl/**` (environ
130 000 lignes). Objet : les **défauts de correction** (logique, droits, courses, écarts front ↔
API, plantages). Hors objet : style, performances, équilibrage, justesse scientifique des textes.

Ce document ne corrige rien : il liste, classe et dit comment chaque constat a été établi. Les
points déjà relevés dans [`AUDIT_GL_ENSEMBLE_UNIFIE_2026-11-18.md`](AUDIT_GL_ENSEMBLE_UNIFIE_2026-11-18.md)
(§ 2 à 4) ne sont pas repris.

> **Suite donnée le jour même.** 42 des 81 constats sont traités, chacun avec son test, par huit
> PR fusionnées le 19 novembre (#677 à #685). Ils portent la mention « traité » et le numéro de la
> PR ; le constat d'origine est laissé tel quel. Bilan, vérifications après fusion et restes : § 13.

## 1. Méthode et niveau de preuve

Sept relectures indépendantes, une par domaine (accès, moteur du tour, sorts et marché, parties
et plateau, contenus et imports, front de jeu, front d'administration), puis vérification des
constats un par un. Chaque constat porte l'un de ces trois niveaux :

- **Rejoué** — le défaut a été provoqué : requêtes HTTP contre l'application sur une base à part
  (schéma et migrations de `main`), ou navigateur Chromium sur le build de production. Les
  scripts sont jetables et ne sont pas versionnés ; le scénario est décrit assez précisément
  pour être réécrit en test.
- **Lu** — le chemin complet (route, garde, bibliothèque, SQL, ou composant et appelants) a été
  relu une seconde fois après la relecture qui l'a signalé.
- **Signalé** — relevé par une relecture sur lecture du code, non revérifié. À confirmer avant
  de corriger.

État de la suite sur `main` au moment de l'audit :

| Vérification                          | Résultat                                |
| ------------------------------------- | --------------------------------------- |
| `npm test` (backend)                  | 6 302 passés, 0 échec, 2 ignorés        |
| ESLint sur le code G&L                | 0 erreur, 140 avertissements (recensés) |
| `npm run build`                       | passe, aucun miroir modifié             |
| Tests UI, tests de contenu, e2e, banc | non relancés (voir l'audit du 18/11)    |

Aucun des défauts ci-dessous ne fait échouer un test existant : ils passent entre les mailles
(tests qui montent un composant déjà chargé, e2e qui posent l'état par l'API, routes testées
avec un corps complet).

## 2. Synthèse

81 constats, dont 18 rejoués. Les six premiers gênent directement une séance ou
l'administration ; ils sont tous rejoués.

| N°  | Constat                                                                                     | Preuve                 |
| --- | ------------------------------------------------------------------------------------------- | ---------------------- |
| J1  | La projection ne se met jamais à jour (tour, pions, voile, carnet) sans F5                  | Rejoué · traité (#683) |
| J2  | L'écran « Jouer le tour » du prof ne se relit pas quand une équipe joue                     | Rejoué · traité (#683) |
| J3  | Ouvrir le lien de projection dans le navigateur du prof remplace sa session                 | Rejoué · traité (#683) |
| E1  | Réglages « Tenir à deux » : les nombres affichent leur minimum, un clic-sortie l'enregistre | Rejoué · traité (#684) |
| E2  | Studio de carte de chapitre : boucle de rendu, le formulaire de repère n'enregistre jamais  | Rejoué · traité (#684) |
| M1  | Escalier, séances 1 à 3 : chaque jet est mis en suspens pour une Relance encore fermée      | Rejoué · traité (#685) |

Viennent ensuite 29 constats importants (droits de jeu non rejoués par le serveur, contenu servi
avant d'être acquis, pertes de données à l'import ou à l'édition) et 46 mineurs.

Ce qui tient : aucune route d'écriture sans garde MJ ou admin, aucun accès direct aux données
d'un autre joueur (carnet, forum, commentaires), isolement produit `/api/gl/*` correct, bourses
et grand livre justes sur le chemin nominal (débit, effet et remboursement dans la même
transaction), aucun état du tour sans sortie. Le détail de ce qui a été relu sans constat est en
§ 10.

## 3. Front de jeu

### J1 — La projection ne se met jamais à jour — Rejoué — Traité (#683)

- **Où** : `src/gl/AppGL.jsx:929` (`refreshKey={gameState?.events?.length || 0}`),
  `src/gl/hooks/useGlGameRuntime.js:209` et `:232`,
  `src/gl/components/tenir/GLProjectionView.jsx:40-62`.
- **Défaut** : `GLProjectionView` ne recharge que si `refreshKey` change. Une projection est une
  session invitée : `reloadGame` et l'abonnement temps réel du runtime sortent d'emblée
  (`isGuest`), `gameState` reste `null`, la clé reste à 0. La vue n'a ni abonnement propre ni
  bouton « Actualiser », contrairement à ce qu'annonce son commentaire d'en-tête.
- **Rejoué** : projection ouverte sur une partie sans tour (« En attente du tour ») ; le prof
  ouvre le tour, passe en jeu, une équipe lance. Douze secondes plus tard l'écran affiche
  toujours « En attente du tour », alors que les évènements `gl:game:*` arrivent bien à la page
  (le journal, qui a son propre abonnement, les reçoit). Après F5 : « Tour 1 — jeu ».
- **Correction** : abonner la vue à `gl:game:event` et `gl:game:equipe` (patron de
  `GLTeamSessionView.jsx:62-89`) et recharger.

### J2 — « Jouer le tour » ne se relit pas quand une équipe joue — Rejoué — Traité (#683)

- **Où** : `src/gl/components/mj/GLTourScreen.jsx:138-151`, `src/gl/hooks/useGlTenirTour.js:27-29`,
  `src/gl/components/mj/GLDemandesPanel.jsx:42-48`.
- **Défaut** : `view = tourApi.tour` est lu au montage et après un geste du prof. Aucun effet ne
  dépend des évènements de la partie. La file « Demandes » recharge sur un compteur local et sur
  un total tiré de cette même vue périmée.
- **Rejoué** : console du prof ouverte sur « Jouer le tour », carte d'équipe « case 1 ». Un élève
  de l'équipe lance les dés depuis un autre appareil (201). Douze secondes plus tard la carte dit
  toujours « case 1 », sans « dés lancés ». Un clic sur « Actualiser » affiche « case 7 · dés
  lancés ».
- **Conséquence lue, non rejouée** : sur tablette ou en hybride, les jets à valider, les sorts à
  honorer et les défis à juger n'apparaissent dans « Demandes » qu'après un clic du prof.
- **Correction** : dans `GLTourScreen`, relire le tour et incrémenter `refreshKey` quand
  `events.length` ou `tenir.round.number` / `phase` changent.

### J3 — Le lien de projection remplace la session du prof — Rejoué — Traité (#683)

- **Où** : `src/gl/AppGL.jsx:162-174`, `src/gl/services/apiGL.js:53-68`.
- **Défaut** : seule une session d'équipe va en `sessionStorage`. La session de projection est
  écrite dans `localStorage.gl_session`, partagé entre onglets, sans la garde « jamais par-dessus
  un compte connecté » qu'a le mode démonstration (`AppGL.jsx:234`).
- **Rejoué** : prof connecté, lien de projection ouvert dans un second onglet du même
  navigateur : la session stockée passe de « MJ » à « Projection ». La console garde son écran,
  mais `apiGL` envoie désormais le jeton de projection : les gestes du prof sont refusés
  (`middleware/requireGlAuth.js:149-153`, lu). C'est le cas du poste unique relié au
  vidéoprojecteur.
- **Correction** : ranger la session de projection dans `sessionStorage`, comme la session
  d'équipe.

### Autres constats du front de jeu

- **J4 — L'écran d'équipe préfère un instantané du tour périmé** — _traité (#683)_ (important, signalé).
  `GLTenirEquipeView.jsx:181` : `tourApi.tour?.round || tenir?.round`. L'instantané n'est relu
  qu'après un geste de l'équipe ; un geste du prof (phase, sablier) n'avance pas la version
  d'équipe. En-tête « Tour N — ouverture » alors que la phase est « jeu », sablier masqué. Même
  racine que J1 et J2.
- **J5 — Le réglage « traversée des zones feuillets » est perdu en route** — _traité (#680)_ (important, lu).
  `AppGL.jsx:1224` passe `feuilletZoneTraversalEnabled` à `GLMapView`, qui ne la relaie pas ;
  `GLGameBoard.jsx:108` garde son défaut `true`. La migration 330 coupe ce réglage en
  « Tenir » : il est sans effet, l'ancien popover de feuillet peut s'ouvrir.
- **J6 — Session expirée : le stockage est vidé, l'écran reste dans l'application** — _traité (#683)_ (important,
  lu). Sur un 401, `apiGL` vide la session et émet `gl_session_changed`, que `useGLSession.js`
  n'écoute pas. L'élève voit une application vide au lieu de l'écran de connexion, jusqu'au
  rechargement.
- **J7 — « Jet saisi : en attente du clic du prof » ne s'efface jamais** — _traité (#683)_ (mineur à important,
  signalé). `GLTenirEquipeView.jsx:475-488` : état local, non dérivé de `round.desEnAttente` ;
  reste affiché après validation ou refus.
- **J8 — Dés virtuels : tirage perdu si le lanceur se ferme pendant l'animation** (mineur,
  signalé, jeu classique). `useGLVirtualDice.js:54-62` : `reset()` invalide un jet déjà
  enregistré par le serveur.
- **J9 — Erreur d'un geste signalée au geste suivant** (mineur, signalé).
  `GLTourScreen.jsx:181-189` lit `tourApi.error` dans une fermeture périmée.
- **J10 — Bilan Team Spirit : le formulaire ne relit pas ce qui est enregistré** (mineur,
  signalé). `GLTeamSpiritPanel.jsx:12-15` repart de « 6/6 » ; réenregistrer écrase les retraits.
- **J11 — Défi de la Trame : dernier geste perdu si l'on quitte dans les 350 ms** (mineur,
  signalé). `useGlTrameDefi.js:65-68`.
- **J12 — « Appliquer les effets » d'un repère : échec avalé** (mineur, signalé).
  `GLMarkerEffectPopover.jsx:66-78` ferme le popover sur erreur comme sur succès.

## 4. Moteur du tour « Tenir à deux »

### M1 — Escalier : jets en suspens pour une Relance fermée — Rejoué — Traité (#685)

- **Où** : `lib/glArriveeSuspendue.js:104-166` (`relanceDisponibleTx`), appelé par
  `lib/glTour.js:1680-1689`.
- **Défaut** : la fonction contrôle module, chapitre, peuple, limite et bourses, mais jamais
  `sortOuvert(resolved, code)`. Le lancement, lui, le contrôle (`lib/glSpellCast.js:1072`).
  Relance (`SL005`) ne s'ouvre qu'à la séance 4 de l'escalier.
- **Rejoué** : partie du plateau 1, escalier au pas 1. Jet d'une équipe : `arrival.enSuspens =
true` ; la liste des sorts servie à l'équipe ne contient pas Relance ; ouvrir le pot de Relance
  répond 409 `SPELL_ESCALIER`. L'écran propose donc « Gardez ce jet, ou lancez Relance » pour un
  sort qui sera refusé, à chaque jet des trois premières séances.
- **Correction** : dans `relanceDisponibleTx`, ignorer un candidat quand `sortOuvert` est faux.

### M2 — « Répondre » n'est pas rejoué par le serveur — Rejoué — Traité (#685)

- **Où** : `routes/gl/games/markers.js:189-290` (`present-question`),
  `routes/gl/games/qcm.js:286-318`, `lib/glTour.js:1872` (`bonneReponseDeCaseTx`).
- **Défaut** : ni la phase ni l'unicité de la question due ne sont contrôlées. Tout jeton de
  présentation valide donne + 1 case.
- **Rejoué (a)** : équipe posée sur une case question ; le prof et un élève de l'équipe
  présentent chacun la question. Deux bonnes réponses : case 1 → 2 → 3.
- **Rejoué (b)** : question présentée en phase « jeu », le prof passe au souffle, l'élève
  répond : 200, + 1 case, dé réarmé pour rien.
- **Correction** : `assertActionOuverte({ geste: 'repondre' })` dans les deux routes, et
  `questionDeCaseDue` relu sous verrou d'équipe avant `bonneReponseDeCaseTx`.

### M5 — En hybride, le droit « fouiller » n'est jamais servi à l'élève — Rejoué — Traité (#685)

- **Où** : `lib/glTenirView.js:193` : `fouilleFenetreOuverte: round?.fouilleFenetreOuverte ===
true`. La vue du tour n'a pas cette propriété, elle sert `fenetresFouille`
  (`lib/glTour.js:152`).
- **Rejoué** : surface hybride, le prof ouvre la fenêtre (`fenetresFouille = { tous: true }`) ;
  l'état servi à l'élève porte `permissions.fouiller = false`. Le bouton est `disabled` sur ce
  droit (`GLTenirEquipeView.jsx:388-391`), alors que la route calcule juste
  (`tenir-tour.js:104`).
- **Correction** : passer `isFouilleFenetreOuverte(round.effets, teamOfViewer)`.

### Autres constats du moteur

- **M3 — Progression « sans appliquer la case » défaite par `present-arrival`** — _traité (#685)_ (important,
  signalé). Le moteur ne joue pas la case d'arrivée (`lib/glSpellEffectsApply.js:180-216`) mais
  n'émet aucun déplacement marqué `skipDestinationEffects` ; l'écran détecte le changement de
  position et appelle `present-arrival` (`routes/gl/games/markers.js:434-436`), qui applique
  l'effet. Même mécanique après le vent.
- **M4 — Relance payée et jamais rejouée si la phase « jeu » se ferme** — _traité (#685)_ (important, signalé).
  Rien ne solde l'effet `relance` au souffle ni à la clôture, alors que la Cordée incomplète est
  rendue : jet annulé, deux gemmes payées, équipe immobile pour la séance.
- **M6 — Le vent peut poser une équipe au camp sans « arrivée au camp »** (mineur, signalé).
  `lib/glTour.js:326-357` : `applyTeamMoveTx` seul ; `premiere_arrivee_team_id` reste nul.
- **M7 — Relectures d'instantané après verrou** (mineur, signalé). `lib/glChasse.js:985-998` :
  deux équipes qui tiennent les deux dernières pages en même temps peuvent manquer le « carnet
  complet » ; `:394-438` : quota de fouilles dépassable de 1 entre le prof et l'équipe.
- **M8 — « Tout au tableau » réécrit les surcharges depuis une lecture hors transaction**
  (mineur, signalé). `routes/gl/games/tenir-tour.js:568-617` : même défaut que celui corrigé le
  18/11 pour `PUT /tenir/profil`.
- **M9 — L'aperçu des honneurs ignore la première arrivée** (mineur, signalé).
  `routes/gl/games/tenir-honneurs.js:95` appelle `computeHonneurs` sans
  `premiereArriveeTeamId`.
- **M10 — Hors phase « jeu », une page tenue en classe compte comme veillée** (mineur, signalé, à
  trancher). `routes/gl/games/chasse.js:124`.
- **M11 — Équipe sans membre sur une Trame : `TEAM_EMPTY` brut** (mineur, signalé).
  `lib/glVitality.js:170`.

## 5. Sorts, marché, voyageur

### S1 — Un pot repris ne vérifie ni l'équipe, ni la partenaire, ni l'élève — Rejoué — Traité (#678)

- **Où** : `lib/glSpellCast.js:1006-1024` (`findCollectingDraft` : en portée `game`, aucun filtre
  d'équipe ; en portée `team`, aucun filtre d'élève), `:1224-1234` (seuls les paramètres d'effet
  sont rafraîchis à la reprise). Fermer l'assistant ne supprime pas le pot
  (`GLSpellCastWizard.jsx:121-135`), et un pot en collecte n'expire pas.
- **Rejoué** : le prof ouvre Lanterne pour Licornes A, puis demande Lanterne pour Licornes B :
  le serveur rend le pot de A (même identifiant, équipe A). Idem Bourrasque et Sentier. Les
  contrôles de création ont porté sur B ; au lancement, ce sont les membres de A qui paient.
- **Lu, non rejoué** : même reprise entre deux élèves d'une équipe pour les sorts personnels
  (Lettre, Mentorat, Esquive), et entre deux partenaires pour la Cordée.
- **Correction** : ne reprendre un pot que si équipe, partenaire et élève correspondent ; sinon
  l'annuler et en ouvrir un neuf.

### Autres constats

- **S2 — Deux « pas moi » simultanés : l'un est perdu** — _traité (#678)_ (important, lu).
  `lib/glSpellCast.js:1428-1465` calcule `exclus_json` et les parts avant le verrou, puis les
  écrit tels quels. L'élève dont l'exclusion est écrasée est débité au lancement.
- **S3 — Relais peut faire reculer une équipe** (important, lu, à trancher).
  `lib/glSpellEffectsApply.js:460-471` et `lib/glTour.js:228-234` : « l'équipe la plus en
  retard » est cherchée hors lanceur, sans vérifier qu'elle est derrière lui. Lanceur en case 2,
  les autres en 5, 7 et 9 : l'équipe en 5 revient en 2. Le test
  `tests/gl-tenir-relais-course.test.js:92-96` fige ce recul (6 → 4).
- **S4 — Un sort « à honorer par le prof » lancé en veillée est rendu dès l'ouverture du tour
  suivant** (important, signalé, à trancher). `lib/glTour.js:311-313`, `:438-442` : Esquive,
  Choix, Consécration, Question, Pause. Mentorat a reçu un traitement à part.
- **S5 — Limites « 1 par tour / par partie » vérifiées hors transaction** (mineur, signalé).
  `lib/glSpellCast.js:2158-2163`.
- **S6 — Partie en pause : les garde-fous « Tenir » du Marché sautent** (mineur, signalé).
  `lib/glMarketPlace.js:100-109` ne cherche qu'une partie `live`.
- **S7 — Flair se lance hors veillée** (mineur, signalé). `lib/glVoyageur.js:883-938` ; aucun
  bouton n'y mène aujourd'hui.
- **S8 — Une annonce satisfaite peut rester ouverte** (mineur, signalé).
  `lib/glMarketPlace.js:307-320`.
- **S9 — Réglage `self_only` : pot à plusieurs impossible en « Tenir »** (mineur, latent,
  signalé). `lib/glSpellCast.js:1346-1354`.
- **S10 — Jeu classique : lancer ou vider le pot d'une autre équipe** (mineur, signalé).
  `lib/glSpellCast.js:936-937`.
- **S11 — Geste du prof sur une bourse : l'évènement émis est « le dernier de la partie »**
  (mineur, signalé). `routes/gl/games/vitality.js:110-119`.
- **S12 — Pot du même tour jamais recalculé quand un solde change** — _traité (#678)_ (mineur, signalé).
  `lib/glSpellCast.js:965-978`.

## 6. Parties, plateau, équipes

- **P1 — Une partie « Tenir » annonce un gain de cœurs à la traversée d'une zone feuillet** — _traité (#680)_
  (important, lu). `routes/gl/games/feuillet-zones.js:79` : le `SELECT` de la partie ne lit pas
  `tenir_profil` ; `isTenirGame` vaut donc toujours faux dans
  `lib/glFeuilletZonePresent.js:186` et `gainCoeur` n'est jamais remis à 0. Avec J5, l'ancien
  popover peut afficher « Gain : N cœur » (garde-fou M1 : aucun cœur montré en « Tenir »).
- **P2 — `PUT /games/:id/teams/:teamId` efface la mascotte sur une mise à jour partielle**
  (mineur, rejoué). `routes/gl/games/teams.js:236` : `mascot_id = ?` sans `COALESCE`.
  `PUT { name }` : la mascotte passe à `NULL`. La console envoie toujours les quatre champs ; un
  appel partiel (connecteur, script) est touché.
- **P3 — `present-arrival` et `present-question` ne contrôlent pas le statut de la partie** — _traité (#685)_
  (mineur, lu). `routes/gl/games/markers.js:205` et `:395` : le statut est lu, jamais testé.
- **P4 — Changer le chapitre d'une partie en pause laisse les équipes sur l'ancien plateau**
  (mineur, signalé). `routes/gl/games.js:472-484`.
- **P5 — Score QCM du jeu classique : trois écarts à « un point par arrivée »** (mineur,
  signalé ; score éteint par défaut). `lib/glGameQcmScoring.js:96-102`.
- **P6 — `POST /games/:id/turn/start` : pas de contrôle de statut, compteur lu hors
  transaction** (mineur, lu ; tours éteints par défaut). `routes/gl/games.js:702-757`. Rejoué le 19/11 au soir, tours activés : sur une partie
  terminée, la route répond 200 et passe du tour 0 au tour 1.
- **P7 — `POST /games/:id/events` : ni la partie ni l'appartenance de l'équipe ne sont
  vérifiées** (mineur, rejoué). Partie inexistante : 500 au lieu de 404. `routes/gl/games.js:608-694`.
- **P8 — Défis de la Trame : deux réussites simultanées reçoivent la même page de veillée**
  (mineur, signalé). `lib/glTrameDefis.js:1026-1049`. Voisin du point « deux pistes » de l'audit
  du 18/11.
- **P9 — Longueurs non validées : 500 au lieu de 400** (mineur, signalé). Nom de partie, nom et
  couleur d'équipe, `actionType`.
- **P10 — Repères numérotés : un déplacement automatique annule le jet en attente** (mineur,
  signalé). `lib/gl/gamesRuntime.js:186-198`.
- **P11 — Démarrage de partie non atomique** (mineur, signalé).
  `routes/gl/games/status.js:121-159`.
- **P12 — Export CSV du suivi des défis sans neutralisation des formules** (mineur, signalé).
  `lib/glTrameDefis.js:1287-1290` a son `csvCell` au lieu de `lib/shared/csvCell.js`.

## 7. Contenus, carnet, récompenses, imports

### C1 — Le texte de feuillets non trouvés est servi aux joueurs — Rejoué — Traité (#680)

- **Où** : `routes/gl/lore.js:663-709` : `GET /api/gl/lore/games/:id/zones/:zoneId/feuillets`
  renvoie `formatFeuilletRow` sans `maskLockedFeuillet`.
- **Rejoué** : un joueur reçoit les 433 caractères du texte d'un feuillet que son équipe n'a pas
  trouvé, et qui n'apparaît pas dans son carnet. Sans feuillet lié à la zone, le repli
  (`lib/glLoreFeuillets.js:167`) sert tous les feuillets actifs des biomes du chapitre.
- **Correction** : masquer les candidats non trouvés, ou ne renvoyer que code et titre.

### C2 — « Faire apparaître » un feuillet : ni l'état de la partie ni le lieu — Rejoué — Traité (#680)

- **Où** : `routes/gl/lore.js:387-547`. Le statut est sélectionné, jamais testé ; la seule garde
  joueur est l'appartenance du feuillet au chapitre. La route jumelle des zones feuillets exige
  `live` ou `paused` et la mascotte dans le polygone.
- **Rejoué** : sur une partie **terminée**, un joueur fait apparaître quatre feuillets du
  chapitre en quatre requêtes (200), avec leurs effets sur les bourses.
- **Correction** : refuser hors `live` / `paused` ; exiger une zone ou un canal vérifiable.

### C4 — Tutoriels : « publié » n'est appliqué nulle part — Rejoué — Traité (#680)

- **Où** : `routes/gl/tutorials.js:38-85` (liste et détail sans filtre),
  `src/gl/components/GLTutorialsView.jsx:119` (`is_published !== false` est toujours vrai : la
  base renvoie 0 ou 1).
- **Rejoué** : tutoriel créé non publié ; le joueur le voit dans la liste et lit son contenu.
  À la réouverture en édition, la case revient cochée et l'enregistrement automatique le
  republie.
- **Correction** : filtrer `is_published = 1` hors `gl.content.manage` ; lire
  `Number(data.is_published) === 1` à l'écran.

### C8 — « Lu » et « tenu » n'atteignent jamais le carnet du joueur — Rejoué — Traité (#679)

- **Où** : `lib/glLoreFeuillets.js:336-353` et `:391` : le statut du carnet personnel n'est
  remplacé que si le pourcentage d'effacement **baisse**.
- **Rejoué** : `POST …/read` répond 200, l'état d'équipe passe à `read`, celui du joueur reste
  `discovered`. Les mesures `pages_lues` (`lib/glRewardsMetrics.js:95`) et `feuillets_lus`
  (`lib/glTenirBadges.js:24`) ne comptent donc jamais ces lectures : le badge « Lecteur »
  n'avance que par les ouvertures de la chasse.
- **Correction** : promouvoir le statut selon l'ordre découvert < lu < tenu, indépendamment du
  pourcentage.

### Autres constats

- **C3 — Glossaire du lore : niveau « secret » et plafond de divulgâchage contournés** — _traité (#680)_
  (important, signalé). `routes/gl/lore.js:751-798`, `:1361-1378`, `:1482-1489` : l'index des
  liens liste les termes secrets ; la fiche par code ignore `loreSpoilerMaxLevel` ; les termes
  liés ne sont pas filtrés.
- **C5 — Exporter puis importer le glossaire du lore efface les « termes liés »** — _traité (#677)_ (important,
  signalé). `lib/glLoreGlossaryImport.js:318` exporte la colonne vide, `:141-142` supprime puis
  réinsère depuis elle.
- **C6 — Import de QCM : les liens glossaire des questions absentes du fichier sont supprimés** — _traité (#677)_
  (important, signalé). `lib/glQcmImport.js:467-476`, `lib/glQcmLoreImport.js:473-478` ; l'import
  lore n'est pas en transaction.
- **C7 — « Première consultation » décidée par une lecture préalable** — _traité (#679)_ (important, signalé).
  `routes/gl/learning.js:309/334` : des requêtes parallèles se croient toutes premières et
  gagnent chacune un feuillet ; `lib/glLoreFeuilletSpeciesReveal.js:160-185` sans verrou
  d'équipe.
- **C9 — Espèces archivées encore servies** (mineur, signalé). `routes/gl/species.js:124-142`,
  `routes/gl/food-web.js:88-105`.
- **C10 — Mises à jour qui ne peuvent pas vider un champ** (mineur, signalé). Description de
  zone, chapitre d'un tutoriel ou d'une mascotte (`COALESCE`).
- **C11 — Imports du lore : lignes rejetées passées sous silence, écritures hors transaction** — _traité (#677)_
  (mineur, signalé). `lib/glLoreFeuilletsImport.js:344-359`.
- **C12 — Catalogues de la Trame remplacés sans transaction** — _traité (#677)_ (mineur, signalé).
  `lib/glTrameImport.js:215-216` et suivants.

## 8. Comptes et accès

- **A1 — Import de joueurs : une ligne sans pseudo fait tomber l'import en 500** — _traité (#682)_ (important,
  rejoué). `lib/glPlayersImport.js:99-126` ne réclame pas le pseudo ; `gl_players.pseudo` est
  `NOT NULL`. Fichier de trois lignes dont la deuxième sans pseudo : l'analyse à blanc annonce
  trois lignes valides ; l'import réel crée le premier joueur puis répond 500. Le rapport des
  identifiants n'est jamais renvoyé : le mot de passe généré du premier est perdu, et un
  réimport le rejette en « pseudo déjà utilisé ».
- **A2 — Supprimer une classe emporte ses joueurs inactifs sans purge** — _traité (#682)_ (important, lu).
  `routes/gl/admin.js:345-374` : seuls les joueurs actifs bloquent ; les autres partent par la
  cascade SQL, sans `purgeGlPlayerAccount`. Les comptes miroirs `users` restent actifs.
- **A3 — Changer un joueur de classe laisse ses appartenances aux parties de l'ancienne** — _traité (#682)_
  (important, signalé). `routes/gl/admin.js:604-701` ne touche pas `gl_team_members`.
- **A4 — Plancher de mot de passe enseignant (12) contournable par les routes G&L (8)** — _traité (#682)_
  (important, lu). `routes/gl/auth.js:617` et `:1294` : `Math.max(8, …)` au lieu de
  `getPasswordMinLengthFor('teacher')` (`lib/passwordReset.js:110-118`).
- **A5 — Activer ou désactiver une classe efface son établissement** — _traité (#682)_ (mineur, rejoué).
  `routes/gl/admin.js:332` : `school = ?` sans `COALESCE` ; `GLClassesPanel.jsx:121` envoie
  `{ isActive }` seul. « Ecole Test » devient `NULL`.
- **A6 — Un pseudo de jeu peut masquer l'identifiant de connexion d'un autre joueur** (mineur,
  signalé). `lib/glPlayerIdentity.js:46-56`.
- **A7 — `PATCH /api/gl/auth/me/profile` avec pseudo vide : 500** — _traité (#682)_ (mineur, rejoué, avec le mot
  de passe actuel fourni : « Column 'pseudo' cannot be null »). `routes/gl/auth.js:1110`.
- **A8 — `DELETE /api/gl/auth/link-foretmap` n'est pas atomique** (mineur, signalé).
- **A9 — Connexion staff : une ligne `gl_admins` liée peut être reprise par un autre enseignant
  de même adresse** (mineur, signalé). `lib/glStaffAuth.js:138-151`.
- **A10 — `logRouteError` appelé avec les arguments inversés** — _traité (#682)_ (mineur, lu).
  `routes/gl/auth.js:426` et `routes/gl/admin-demo.js:38` : l'erreur réelle n'est pas
  journalisée.
- **A11 — Couper le « mode découverte » ne vaut que pour les nouveaux jetons** (mineur, signalé,
  à trancher).

## 9. Administration et éditeurs

### E1 — Réglages « Tenir à deux » : les nombres affichent leur minimum — Rejoué — Traité (#684)

- **Où** : `src/gl/components/settings/GLTenirSettings.jsx:132-153` (`NumberRow`) et `:155-185`
  (`JsonMapRow`) ; parent `src/gl/components/GLSettingsView.jsx:40`.
- **Défaut** : l'état local est initialisé une fois (`useState(String(current))`), alors que le
  bloc est monté avec `settings = {}` avant la réponse du chargement. Rien ne le resynchronise.
- **Rejoué** : en base, « Dés du geste Lancer » vaut 2. L'écran affiche 1, et 0 pour les onze
  autres nombres ; les champs par plateau (zones de chasse, bonus du dé gris, seuils) sont
  vides. Un clic dans le champ puis Tab, sans rien taper, envoie
  `PUT gameplay.tenir_des_count { value: 1 }` : la base passe à 1.
- **Pourquoi non vu** : `tests-ui/gl/GLTenirSettings.test.jsx` monte le composant avec des
  réglages déjà chargés.
- **Correction** : ne rendre le bloc qu'après le chargement, ou remonter chaque ligne quand la
  valeur chargée change.

### E2 — Studio de carte de chapitre : boucle de rendu — Rejoué — Traité (#684)

- **Où** : `src/gl/components/GLMarkerEventEditor.jsx:49-54` (effet dépendant de `onChange`) et
  `src/gl/components/GLChapterMapStudio.jsx:251` (`handleEventDraftChange`, recréée à chaque
  rendu, qui pose un nouvel objet d'état).
- **Défaut** : l'effet appelle `onChange`, le parent se rend, `onChange` change d'identité,
  l'effet repart. Le brouillon du repère change en continu : le minuteur de 800 ms de
  l'enregistrement automatique est réarmé sans fin.
- **Rejoué** : Contenus → Chapitres → un chapitre. Au repos, sans aucun geste, le fil principal
  travaille 2,8 s sur 3 (0,1 s avant l'ouverture du studio). Un repère sélectionné, son label
  modifié : cinq secondes plus tard, aucune requête d'écriture, rien en base. Le déplacement, la
  duplication et la suppression passent par l'API directement et fonctionnent.
- **Pourquoi non vu** : `tests-ui/gl/GLChapterMapStudio.test.jsx` remplace l'éditeur par un
  bouchon ; l'e2e n'agit que par l'API.
- **Correction** : `useCallback` sur `handleEventDraftChange`, ou ne pas réémettre un brouillon
  identique.
- **Trois défauts qui apparaîtront une fois la boucle corrigée** (signalés) : `tenir.defi` n'est
  pas reporté par `buildEventConfigFromForm` (`glMarkerEventEditorForm.js:75-99`) ; le drapeau
  « un seul dé » d'une case Souffle n'est pas relu (`GLMarkerEffectsEditor.jsx:4`) ; `resetForm`
  ne vide pas les effets (`GLChapterMapStudio.jsx:241`).

### Autres constats

- **E3 — Politique de conditionnement par ressource : « Enregistrer » efface la politique** — _traité (#684)_
  (important, reproduit sous Vitest par la relecture). `GLLearningLinksPanel.jsx:296` : l'éditeur
  se remonte à chaque caractère de la référence, avant la réponse du chargement, et affiche
  « Hériter ». Défaut D2 de `AUDIT_VALIDATION_QUIZ_2026-09.md`, corrigé pour les préréglages par
  type mais pas ici.
- **E4 — Éditeur riche : une référence d'image non résolue disparaît à la première frappe** — _traité (#684)_
  (important, reproduit sur les fonctions par la relecture). `GLRichTextEditor.jsx:139-162` :
  `![…](scene:3)` ou une clé `gl-*` non résolue au premier rendu est retirée par l'assainisseur,
  puis l'enregistrement automatique écrit le texte sans l'image.
- **E5 — Frappes saisies pendant l'enregistrement automatique écrasées par la réponse** — _traité (#684)_
  (important, signalé). Chapitres, pages de contenu, espèces, glossaire, sorts, réglages : le
  correctif `mergeAutoSaveForm` des éditeurs de QCM n'y a pas été reporté.
- **E6 — Tutoriels : chaque enregistrement automatique vide le brouillon et ferme l'éditeur** — _traité (#680)_
  (important, lu). `GLTutorialsView.jsx:76-97`. Le tutoriel est créé après quelques mots,
  publié par défaut — et, avec C4, visible des joueurs quel que soit ce réglage.
- **E7 — Carnet de Sélène : après un feuillet « étudié », les suivants s'affichent « ✓ Étudié »** — _traité (#679)_
  (important, lu). `GLLearnAndImport.jsx:47-73` ne remet jamais l'état à faux ;
  `GLSeleneCarnetView.jsx:340` le monte sans `key`.
- **E8 — voir A5** (classe : établissement effacé) — _traité (#682)_.
- **E9 — Dialogue d'édition d'un feuillet : trois écrasements** (mineur, signalé). `legacy_id`
  remis à `NULL` à chaque enregistrement ; ordre de liasse annulé ; saisie perdue à
  « Archiver ». `GLFeuilletEditorDialog.jsx`.
- **E10 — Administration de l'intro : médiathèque toujours vide, suppression en 400** (mineur,
  signalé). `GLIntroAdminPanel.jsx:102-105` rend `{ items }` là où un tableau est attendu, et
  envoie `relativePath` là où la route lit `relative_path`.
- **E11 — Éditeurs de sorts et d'espèces : catégorie du formulaire ignorée, fiche non rechargée
  après une édition en masse** (mineur, signalé). `GLSpellsEditorPanel.jsx:60`.
- **E12 — Deux champs numériques de réglages** — _traité (#684)_ (mineur, signalé). Délai libre du
  conditionnement (`GLGatingSettings.jsx:288`, non contrôlé) ; PV / PP initiaux : champ vidé =
  0 enregistré (`GLSettingsView.jsx:120-126`).

## 10. Relu sans constat, et non relu

**Relu sans constat** : isolement produit et hydratation des sessions ; prise de contrôle ;
lien de classe et sessions d'équipe ; toutes les gardes des routes d'écriture ; jetons de QCM
(empreinte, usage unique, réponse jamais servie) ; carnet du joueur, forum et commentaires
(propriété et modération) ; téléversements ; ouverture et changement de phase du tour ; jets et
dé unique ; bourses, réserve et plafond ; voile, Lumière, Seuil ; lancement et remboursement des
sorts ; Lettre et Mentorat ; échanges, dons et parures du Marché ; composition d'équipes ;
tirages ; défis de case et de la Trame ; client temps réel (abonnements et nettoyages).

**Non relu, ou survolé** — à couvrir par une seconde passe si l'on veut un audit exhaustif :

- côté serveur : `lib/glTenirImport.js`, `lib/glTenirInvariants.js`, `lib/glDiagnostic.js`,
  `lib/glJournalPresent*.js`, `lib/glRewardsCatalog.js`, `lib/glChapardeur.js`,
  `lib/glVoile.js`, la fin de `routes/gl/learning-links.js`, de `routes/gl/mascots.js` et de
  `routes/gl/chapters.js`, la médiathèque et l'intro dans `routes/gl/admin.js`, la voie LTI du
  staff, `lib/realtime.js` au-delà des salles ;
- côté écran : studio de mascottes, éditeurs de QCM, médiathèque, éditeurs de zones du royaume
  et de la chasse, glossaires, catalogue des espèces, réseau trophique, forum, journal du
  joueur, Seuil, Marché, la plupart de `src/gl/utils/` et des hooks de plateau.

**Pistes non instruites** : listes filtrées sans annulation d'une réponse ancienne
(`useAdminCrud.loadList`, `GLUsersAdminView.reload`) ; `reloadGame` sans garde « dernière réponse
gagne » ; un premier `GET /tenir/olu` en échec rend Olu muet jusqu'au rechargement ; limite
« 1 par trimestre » d'Esquive hors des trimestres configurés (21 décembre – 4 janvier) ;
`lib/glPlayerStats.js` ne compte pas les gains des QCM, feuillets et cases.

## 11. Lots proposés

Chaque lot porte ses tests ; ceux des constats rejoués s'écrivent à partir du scénario donné.

| Lot | Contenu                                                                     | Constats                    |
| --- | --------------------------------------------------------------------------- | --------------------------- |
| 1   | Écrans qui ne se relisent pas : projection, console du prof, écran d'équipe | J1, J2, J3, J4, J7          |
| 2   | Droits rejoués par le serveur : Relance et escalier, répondre, fouiller     | M1, M2, M5, M3, P3          |
| 3   | Éditeurs qui écrasent : réglages, studio de carte, politique, éditeur riche | E1, E2, E3, E4, E5, E6      |
| 4   | Contenu servi avant d'être acquis                                           | C1, C2, C3, C4, J5, P1      |
| 5   | Sorts : pot repris, « pas moi », Relance non soldée                         | S1, S2, M4, S12             |
| 6   | Comptes et classes                                                          | A1, A2, A3, A4, A5, A7, A10 |
| 7   | Carnet et récompenses                                                       | C8, C7, E7                  |
| 8   | Imports                                                                     | C5, C6, C11, C12            |
| 9   | Mineurs restants, au fil de l'eau                                           | le reste                    |

## 12. À trancher avant de corriger

- [ ] **S3 — Relais** : refuser le sort quand aucune équipe n'est derrière le lanceur, ou garder
      « la plus en retard des autres » même si elle recule.
- [ ] **S4 — Sorts à honorer lancés en veillée** : les rendre à l'ouverture du tour suivant
      (comportement actuel), ou les garder jusqu'à la fin de ce tour.
- [ ] **M10 — Page tenue hors phase « jeu »** : la compter comme un geste du tour ou comme une
      veillée.
- [ ] **C2 — Apparition d'un feuillet par code** : garder ce chemin (découverte « par le
      récit ») en le bornant à la partie en cours, ou le réserver au MJ.
- [ ] **A11 — Mode découverte coupé** : invalider aussi les jetons invités déjà émis.
- [ ] **J5 et P1 — Zones feuillets en « Tenir »** : confirmer que la traversée doit rester coupée
      (migration 330), auquel cas la route doit aussi refuser.

## 13. Suite donnée (19 novembre 2026)

Huit sessions ont corrigé les lots en parallèle, une par lot, sans migration. Les lots du § 11
ont été redécoupés pour qu'aucun fichier ne soit touché par deux sessions (le moteur du tour
dans le lot 2, les tutoriels dans le lot 4). Chaque constat a d'abord reçu un test qui échouait
sur `main` ; les quatorze constats seulement « signalés » ont tous été reproduits avant d'être
corrigés.

| Lot | PR   | Constats traités            |
| --- | ---- | --------------------------- |
| 1   | #683 | J1, J2, J3, J4, J6, J7      |
| 2   | #685 | M1, M2, M3, M4, M5, P3      |
| 3   | #684 | E1, E2, E3, E4, E5, E12     |
| 4   | #680 | C1, C2, C3, C4, E6, J5, P1  |
| 5   | #678 | S1, S2, S12                 |
| 6   | #682 | A1, A2, A3, A4, A5, A7, A10 |
| 7   | #679 | C7, C8, E7                  |
| 8   | #677 | C5, C6, C11, C12            |

### Vérifications après fusion

Les huit PR ont été fusionnées à quelques minutes d'intervalle, avant que la CI ait tourné sur
l'état combiné. Tout a donc été rejoué sur `main` en v1.250.4 (`cbed186`) :

| Vérification           | Résultat                         |
| ---------------------- | -------------------------------- |
| `npm run lint`         | 0 erreur                         |
| `npm run format:check` | passe                            |
| `npm run build`        | passe, aucun miroir modifié      |
| `npm run test:ui`      | 6 153 passés (799 fichiers)      |
| `npm test`             | 6 401 passés, 0 échec, 2 ignorés |
| `npm run test:content` | 147 passés                       |

Les scénarios de l'audit ont été rejoués sur ce `main`, indépendamment des tests des lots :

- dans un navigateur, sur le build de production : la projection affiche « Tour 1 — jeu » sans
  rechargement (J1) ; la carte d'équipe du prof passe à « case 8 · dés lancés » sans clic (J2) ;
  la session du prof reste la sienne après l'ouverture de la projection dans un autre onglet
  (J3) ; le studio de carte est au repos (0,08 s de travail sur 3) et le label modifié est
  enregistré (E2) ; les réglages affichent les valeurs de la base, et un clic-sortie n'envoie
  rien (E1) ;
- par requêtes : le jet n'est plus mis en suspens sous l'escalier (M1) ; la seconde bonne
  réponse ne donne pas de case et la réponse en souffle est refusée (M2) ; le droit « fouiller »
  est servi en hybride (M5) ; le pot demandé pour une autre équipe est un pot neuf (S1) ; le
  texte d'un feuillet non trouvé n'est plus servi (C1) ; l'apparition sur une partie terminée
  répond 409 (C2) ; le tutoriel non publié répond 404 (C4) ; l'import avec une ligne sans pseudo
  répond 200 avec son rapport (A1) ; l'établissement est conservé (A5) ; le pseudo vide répond
  400 (A7).

Les e2e complets et le banc n'ont pas été relancés sur l'état combiné.

### Choix faits par les lots, à relire

- **M4 (lot 2)** — la Relance non rejouée est remboursée au passage au souffle ; le jet annulé
  n'est pas réappliqué et aucun jet n'est tiré d'office : l'équipe reste sur sa case pour ce
  tour.
- **M2 (lot 2)** — un élève ne présente ni ne joue la question de case au tableau ni en hybride
  (le serveur suit `glTenirPermissionsCore`). Le guide du MJ disait l'inverse pour l'hybride ;
  un paragraphe daté y a été ajouté.
- **E2 (lot 3)** — au-delà des trois défauts annoncés : un repère sans configuration devenait
  une case à question à l'enregistrement, l'emoji choisi était remplacé à la sélection, et
  `tenir.defi`, « un seul dé » et « passe le tour » traversent désormais le formulaire sans y
  être modifiables.
- **S1 (lot 5)** — limité aux parties « Tenir ». Pour un sort personnel, le pot du premier élève
  est annulé quand un coéquipier ouvre le même sort.
- **A10 (lot 6)** — l'échec de préparation de la démonstration ne dit plus sa cause au MJ.
- **A4 (lot 6)** — un mot de passe enseignant de 8 à 11 caractères consomme le lien de
  réinitialisation avant d'être refusé (c'était déjà le cas sous 8).
- **C8 (lot 7)** — un feuillet effacé à 100 % que l'équipe « lit » reste « effacé » dans le
  carnet personnel.
- **C6 (lot 8)** — un lien glossaire encore valable n'est plus recréé à l'import : son statut,
  son poids et sa note sont conservés, pas seulement son caractère bloquant.

### Restes

- **A10** — un troisième appel inversé, `routes/gl/games/spell-casts.js:142`, n'est pas dans
  `main` : PR #687 (brouillon).
- **Reprise de données (C8)** — les lectures passées ne sont pas promues dans les carnets. La
  requête de reprise est dans la description de #679 (4 lignes, 2 joueurs en production au
  19/11) ; aucune migration n'a été ajoutée.
- **Écrans, après le lot 2** — fermer la question et recharger sur un refus `TENIR_PHASE`
  (`useGlQuestionDeCase.js`) ; dire pourquoi une case ne se joue pas (`sansEffet`,
  `GLMarkerEffectPopover.jsx`) ; libellé du remboursement de Relance dans le journal
  (`lib/glJournalPresentTenir.js`).
- **Imports en ligne de commande (lot 8)** — `gl:import:lore-glossary` et consorts appellent les
  mêmes bibliothèques sans transaction.
- **Session de projection déjà stockée (J3)** — une session écrite dans `localStorage` par
  l'ancienne version y reste jusqu'à la prochaine connexion du prof.
- **39 constats non traités** — les mineurs du § 11 (lot 9) et les constats importants hors
  lots : S3 et S4 (à trancher), M6 à M11, S5 à S11, P2, P4 à P12, C9, C10, A6, A8, A9, A11,
  E9 à E11, J8 à J12.
- **Décisions du § 12** — S3, S4, M10 et A11 restent entières. Pour C2, J5 et P1, seule la
  partie non discutable est faite : refus hors partie en cours, réglage relayé à l'écran,
  `tenir_profil` lu par la route ; ni restriction au MJ, ni refus de la route côté serveur.
