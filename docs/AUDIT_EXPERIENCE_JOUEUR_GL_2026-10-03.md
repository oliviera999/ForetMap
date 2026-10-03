# Audit — l'expérience joueur de Gnomes & Licornes (3 octobre 2026)

> **Statut** : instantané du 3 octobre 2026 (v1.198.1). **Cadrage** : verdict général et technique,
> cinq directions possibles (§ 6).
>
> **Réorientation du porteur (même jour)** : priorité à l'**UI/UX**, à des directions
> **indépendantes de l'action du professeur**, où **les joueurs interagissent et suivent leur
> propre chemin**. Les directions retenues pour arbitrage sont donc celles du **§ 9** (U0–U4).
> Les § 6–8 restent comme trace : B, C et le volet coopératif de E y sont repris sous une
> forme autonome ; D (séance) sort du périmètre.
>
> **Angle** : l'élève, pas le MJ. Deux questions guident l'audit. Que peut faire un joueur
> **à tout moment**, et qu'est-ce qui dépend du **rythme des cours** ? Et l'ensemble
> ressemble-t-il à un **jeu vidéo** qui donne envie de revenir et de progresser ?
>
> **Prédécesseurs** : [`AUDIT_APP_ET_JEU_2026-08.md`](AUDIT_APP_ET_JEU_2026-08.md) § 5 (côté joueur)
> et [`GL_EQUILIBRAGE_ANALYSE_RAPPORT.md`](GL_EQUILIBRAGE_ANALYSE_RAPPORT.md) (économie). Ils
> restent valables. Ce document vérifie ce qui en a été traité (§ 2.3) et ajoute la lecture
> « game design ».

---

## 1. En une page

**Verdict général.** GL est aujourd'hui **un beau livre illustré, avec un plateau que le MJ
télécommande**. Ce n'est pas encore un jeu du point de vue de l'élève. Le soin est réel :
musiques de zone, mascottes animées, dé 3D, Carnet de Sélène, OLU, visite guidée, mode
découverte. Il manque **la boucle** : faire quelque chose, voir un effet, gagner quelque chose,
avoir envie de recommencer.

Trois constats dominent :

1. **Hors séance, le joueur ne peut presque rien _gagner_.** Il peut lire, marquer « appris »,
   écrire dans son journal et échanger au marché. Mais :
   - aucune de ces actions ne fait monter une jauge qui lui appartienne ;
   - les feuillets, seul objet à collectionner, ne s'obtiennent que si une partie de son équipe
     est `live` ou `paused` ;
   - rien ne lui dit qu'un régime « hors séance » existe.
2. **En séance, le joueur est surtout spectateur**, et cela tient aux réglages par défaut
   (§ 3.2) :
   - le MJ déplace les mascottes ;
   - les tours, le score, la vitalité, les sorts, le dé virtuel et les actions joueur sont
     **désactivés** par défaut ;
   - quand l'élève propose une action, il ne reçoit **aucun retour**, ni « envoyée », ni
     « acceptée », ni « refusée ».
3. **Il n'existe aucune progression personnelle visible** : ni niveau, ni rang, ni succès, ni
   objectif. Les cœurs et gemmes persistent toute l'année, mais l'audit d'équilibrage a mesuré
   qu'**aucun élève n'en a jamais gagné en jouant** : seuls les gestes du MJ les font bouger.

**Verdict technique.** Les **fondations sont saines et réutilisables**, et la plupart des
directions proposées se construisent avec ce qui existe déjà :

- journal d'événements `gl_game_events` ;
- dé tiré côté serveur ;
- garde de tour atomique ;
- acquittements « appris » indexés sur le lecteur ;
- API de QCM libre sans score ;
- collection de feuillets par joueur ;
- statistiques personnelles `/stats/me` ;
- isolement produit testé.

La **couche de retour au joueur** est mince, en revanche :

- le client recharge tout l'état à chaque événement ;
- l'événement `action_resolved` n'est écouté nulle part ;
- les notifications ne vivent que dans le `localStorage` et ne portent que la narration ;
- le statut de la partie n'est jamais lu côté joueur.

**Recommandation en une ligne.** Faire d'abord le **socle A** (« dire le jeu » : quelques
jours, aucun risque), puis choisir **un moteur pour le hors-séance** (B, C ou E) et **un moteur
pour la séance** (D). La combinaison recommandée est **A → E + C allégé → D** (§ 7).

---

## 2. Ce que le joueur peut faire — la grille des deux régimes

### 2.1 Matrice

Légende : ✅ possible · ⏸ seulement pendant une partie (statut indiqué) · 🧑‍🏫 réservé au MJ ·
⚙️ dépend d'un réglage **désactivé par défaut**.

| Action du joueur                                    | Hors séance                    | En séance (`live`)                                           | Récompense / trace                                          | Références                                                      |
| --------------------------------------------------- | ------------------------------ | ------------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------- |
| Lire monde, règles, lexique lore, tutoriels         | ✅                             | ✅                                                           | Tutoriels comptés dans « Mes statistiques »                 | `GLMondeView.jsx`, `lib/glPlayerStats.js:196-224`               |
| Lire espèces / écosystèmes / glossaire scientifique | ✅ **si** une partie l'y relie | ✅                                                           | Ratio « appris / catalogue »                                | `GLSpeciesCatalog.jsx:199-202` (vide sans chapitre)             |
| Marquer « appris » (éventuellement derrière un QCM) | ✅                             | ✅                                                           | Acquittement ; feuillet **seulement** si partie live/paused | `routes/gl/learning.js`, `lib/glFeuilletAcquisition.js:227-228` |
| Obtenir un feuillet (zone, étude, consultation)     | ⏸ `live`/`paused` + équipe     | ✅                                                           | Carnet de Sélène                                            | `routes/gl/games/feuillet-zones.js`, `learning.js:160, 275`     |
| Consulter le Carnet de Sélène                       | ✅                             | ✅                                                           | Compteur « X trouvés / Y »                                  | `GLSeleneCarnetView.jsx:152-185`                                |
| S'entraîner au QCM librement                        | ❌ pas d'écran (API seule)     | ❌                                                           | Aucune                                                      | `routes/gl/qcm.js:211-366`                                      |
| Écrire dans « Mon journal »                         | ✅                             | ✅                                                           | Aucune (lu par le MJ)                                       | `routes/gl/player-journal.js`                                   |
| Échanger au marché (gemmes, feuillets)              | ✅ ⚙️ module + vitalité        | ✅ ⚙️                                                        | Les objets échangés                                         | `routes/gl/market.js`, `middleware/requireGlMarket.js`          |
| Forum                                               | ✅                             | ✅                                                           | Aucune                                                      | `routes/gl/forum.js`                                            |
| Voir ses statistiques                               | ✅                             | ✅                                                           | Cœurs/gemmes et ratios d'apprentissage                      | `GLStatsView.jsx:290-316`                                       |
| Rejoindre une équipe                                | ⏸ `draft` (ou sans équipe)     | ⏸ seulement s'il n'en a pas                                  | —                                                           | `routes/gl/games.js:407-463`                                    |
| Lancer le dé                                        | Jet local **non enregistré**   | ✅ ⚙️ dé virtuel ; ⚙️ tours                                  | Résultat du dé                                              | `games.js:664-768`, `useGlGameRuntime.js:429-435`               |
| Déplacer sa mascotte                                | ❌                             | 🧑‍🏫 par défaut ; ⚙️ `players`, **jamais** sur chemin numéroté | Arrivée sur un repère                                       | `glSettings.js:64`, `useGlGameRuntime.js:521-528`               |
| Répondre au QCM d'un repère                         | ❌                             | ✅ (sur le repère)                                           | +1 score d'équipe ⚙️ `scoringEnabled`                       | `routes/gl/games/qcm.js:198-240`                                |
| Proposer une action (explorer, observer…)           | ❌                             | ✅ ⚙️ `playerActionsEnabled` → validation MJ                 | Delta de score fixé par le MJ ; **aucun retour affiché**    | `routes/gl/games/actions.js`                                    |
| Lancer un sort                                      | ❌                             | ✅ ⚙️ module + vitalité, souvent validé par le MJ            | Effet appliqué **à la main** par le MJ                      | `lib/glSpellCast.js:515`, `games/spell-casts.js`                |

### 2.2 Lecture

- **Le régime « à tout moment » est un régime de lecture.** On y consulte, on acquitte, on
  écrit. Rien n'y **progresse**, sauf deux ratios dans un onglet Statistiques rangé sous
  « Joueurs ».
- **Le régime de séance est un régime de spectacle.** L'agentivité y existe (dé, QCM,
  actions, sorts), mais elle passe derrière cinq interrupteurs éteints par défaut et derrière
  une validation du MJ.
- **Aucun pont entre les deux.** Ce qu'on apprend chez soi ne change rien à la séance
  suivante. Ce qui arrive en séance ne crée aucune envie d'y revenir entre deux cours. En jeu
  vidéo, c'est l'absence de **méta-boucle**.

### 2.3 Suite donnée à l'audit d'août (§ 5 de `AUDIT_APP_ET_JEU`)

| Constat d'août                                                | État au 3 octobre                                                                                                                                                                  |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verrou de 3 jours après une mauvaise réponse                  | ✅ **Traité** : défaut passé à 1 h, réglé en heures (migration 213, `lib/shared/gatingSettingsCore.js:91-100`)                                                                     |
| Aide contextuelle écrite pour l'admin                         | ✅ **Traité** : la consigne d'administration a disparu de `data/gl/help.default.json` ; OLU porte les visites guidées                                                              |
| Plateau vide affichant la carte de ForetMap                   | 🟡 **Partiel** : `GLGameBoard` passe un repli GL, mais le plateau reste **vide et muet** ; `/maps/map-foret.svg` survit dans `GLPctMapCanvas.jsx:148` et `glLegacyMediaUrl.js:157` |
| Atterrissage sur « Cartes » pour tout joueur                  | 🔴 Ouvert (`glAppShellHelpers.js:205-208`)                                                                                                                                         |
| Statut de la partie jamais montré au joueur                   | 🔴 Ouvert : seule la console MJ lit `game.status`                                                                                                                                  |
| « Hors séance » absent de l'app et de la doc                  | 🔴 Ouvert : zéro occurrence dans `src/gl`, `data/gl` et `docs/reference/gl`                                                                                                        |
| Feuillets impossibles sans équipe, en silence                 | 🔴 Ouvert ; aggravé : une partie `ended` bloque aussi l'acquisition (`glFeuilletAcquisition.js:228`)                                                                               |
| `gl-tab-loading` sans style (page blanche au chargement lazy) | 🔴 Ouvert : aucune feuille de style ne définit la classe                                                                                                                           |
| Bannière d'erreur sans `role="alert"` ni fermeture            | 🔴 Ouvert (`GLAppBanners.jsx:28`)                                                                                                                                                  |
| `gl:game:subscription-refused` non écouté                     | 🔴 Ouvert : aucune occurrence dans `src/`                                                                                                                                          |
| Cœurs des camarades exposés (`listClassmates`)                | 🔴 Ouvert (`lib/glMarket.js:406-421`, affiché `GLMarketView.jsx:128-129`)                                                                                                          |
| Économie inerte (QCM juste ≠ gain, 47 % des cases mentent)    | 🔴 Ouvert : options A–E de l'audit d'équilibrage non arbitrées                                                                                                                     |

---

## 3. Lecture « jeu vidéo » — pilier par pilier

Grille classique d'un jeu engageant : **boucle courte** (quelques secondes), **boucle de
session** (une partie), **méta-boucle** (semaines). Chaque pilier reçoit une note de 0 à 3
selon ce que **perçoit l'élève**.

| Pilier                                     | Note | Constat                                                                                                                                                                                   |
| ------------------------------------------ | :--: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Premier contact** (onboarding)           |  2   | Intro, visite d'OLU et mode découverte sont de qualité. Mais le joueur connecté atterrit sur un plateau vide et muet, alors que le mode découverte montre le jeu en mouvement.            |
| **Agentivité** (« c'est moi qui joue »)    |  1   | Par défaut, le MJ bouge les mascottes ; sur chemin numéroté, le joueur ne bouge **jamais** ; les actions passent par une validation.                                                      |
| **Retour immédiat** (feedback)             |  1   | Mouvement animé, musique, toasts de tour. **Silence** après une action proposée, un clic hors séance ou un abonnement refusé. Aucun effet sonore, aucune célébration d'une bonne réponse. |
| **Récompense**                             |  0   | QCM juste = +1 au score d'équipe, si activé ; jamais de gemme. Effets de case mesurés à zéro. Le seul robinet est la main du MJ.                                                          |
| **Progression personnelle**                |  0   | Pas de niveau, pas de rang, pas de palier, pas de déblocage. Les ratios d'apprentissage existent mais restent cachés dans Statistiques.                                                   |
| **Collection**                             |  2   | Le Carnet de Sélène est un vrai « dex » (trouvés / verrouillés / compteur). C'est le meilleur levier existant, mais il est verrouillé derrière une partie.                                |
| **Objectifs** (« que faire maintenant ? ») |  0   | Aucune quête, aucune mission, aucune suggestion. L'élève doit deviner.                                                                                                                    |
| **Social / équipe**                        |  1   | Les équipes existent, mais seulement en séance. Le forum est global, non relié au jeu. Le marché est un échange sans but.                                                                 |
| **Rythme / retour** (envie de revenir)     |  0   | Rien ne change entre deux séances du point de vue de l'élève. Aucune raison de se connecter mardi soir.                                                                                   |
| **Récit**                                  |  2   | Lore riche (deux peuples, Souffle, Sélène, quatre plateaux de l'équateur au pôle). Il est **lu**, mais il ne réagit pas aux actes du joueur.                                              |

**Total : 9 / 30.** Les piliers forts (récit, collection, mise en scène) sont les plus coûteux
à produire, et ils sont faits. Les piliers faibles (récompense, progression, objectifs, rythme)
sont les **moins chers** à produire. La situation est donc favorable : le contenu est là, il
manque des règles.

### 3.1 Constats détaillés

**J1 🔴 — Le hors-séance n'a pas de verbe gagnant.** L'élève peut tout lire et tout
acquitter, mais l'acquittement ne rapporte rien qu'il voie. Le seul gain prévu (un feuillet à
la première consultation) passe par `maybeAwardFeuilletFromConsultation`, qui exige une partie
`live` ou `paused` (`lib/glFeuilletAcquisition.js:227-228`). En plus, ce gain est désactivé par
défaut (`docs/EVOLUTION.md`, acquisition par consultation).

**J2 🔴 — Le joueur ne sait jamais dans quel régime il est.** `game.status` n'est lu que par
la console MJ. Hors séance, un clic sur le plateau ne fait rien, sans message. Le premier
écran d'un élève sans équipe est un plateau vide (`GLGameBoard.jsx:104-128`), et le panneau
« Rejoindre une équipe » n'apparaît que si une partie existe (`AppGL.jsx:938-949`).

**J3 🔴 — Une action proposée tombe dans le vide.** `submitPlayerActionRequest` n'affiche que
les erreurs (`useGlGameRuntime.js:471-484`). L'événement `action_resolved` n'est traité nulle
part dans `src/gl`. L'élève ne sait pas si son professeur a vu, accepté ou refusé sa
proposition. Dans un jeu, c'est le pire signal possible : « tes actes ne comptent pas ».

**J4 🟠 — L'économie est inerte.** Constat de l'audit d'équilibrage, toujours vrai :

- aucune bonne réponse ne crédite de gemme ;
- 96 cases annoncent « Bonne réponse : +N gemmes » sans effet ;
- 7 cases annoncent « Passe ton tour » sans effet.

L'élève lit une promesse que le jeu ne tient pas : c'est une **rupture de confiance**, plus
grave qu'une absence de récompense.

**J5 🟠 — Le plateau est l'écran du groupe, pas celui de l'élève.** C'est un choix cohérent
pour une séance projetée au tableau (`AUDIT_APP_ET_JEU` § 5.2.2). Mais il n'existe pas de
variante « séance sur tablettes » où chaque équipe joue réellement son tour : sur chemin
numéroté, le dé de l'équipe n'avance pas sa mascotte (`canDiceAdvancePath` exige le MJ,
`useGlGameRuntime.js:75-79`), alors que la garde serveur le permettrait déjà
(`games.js:854-868`).

**J6 🟠 — Rien ne célèbre.** Pas d'effet sonore, pas d'animation de gain, pas de « +1 » qui
s'envole, pas de vibration. Les toasts de tour durent 4 s, et la bonne réponse au QCM n'a
pas de moment à elle. Ce sont des « micro-récompenses » à coût quasi nul, qui font l'essentiel
de la sensation de jeu.

**J7 🟠 — La collection est verrouillée derrière l'équipe.** Le Carnet de Sélène est l'objet
le plus « jeu vidéo » de GL. Mais l'élève sans équipe, ou dont la partie est close, ne peut
plus le remplir. La collection devrait appartenir au **joueur**, comme son journal.

**J8 🟡 — Le QCM libre existe côté serveur, pas côté élève.** `GET /api/gl/qcm/draw` et
`POST /qcm/questions/:code/answer` (« validation sans score partie ») sont prêts. Aucun écran
« Entraînement » ne les utilise. C'est la brique la moins chère pour une boucle courte hors
séance.

**J9 🟡 — Pas de « ce que tu as fait depuis la dernière fois ».** À la reconnexion, rien ne
résume les feuillets trouvés, ce que l'équipe a obtenu ou la narration manquée. Le centre de
notifications ne reçoit que la narration et vit dans le `localStorage` du navigateur
(`useGLNotificationCenter.js:4-5`), donc il est perdu en changeant de poste, ce qui est le cas
normal en salle informatique.

**J10 🟡 — Les cœurs sont publics entre camarades.** `listClassmates` renvoie les cœurs et les
gemmes de toute la classe (`lib/glMarket.js:406-421`). Si une direction rend la progression
plus visible, il faut d'abord trancher ce qui est **montré aux pairs**. Pour des 10-12 ans, la
comparaison publique de jauges est un risque pédagogique, et c'est aussi un sujet RGPD (voir
`AUDIT_RGPD_2026-09-28.md`).

**J11 🟡 — Chargements et erreurs invisibles.** La classe `gl-tab-loading` n'a pas de style,
la bannière d'erreur n'a pas de `role="alert"`, et `subscription-refused` n'est pas écouté.
Rien de spectaculaire, mais un jeu qui « fige » sans rien dire passe pour cassé.

---

## 4. Ce qui est conditionné par le rythme des cours — et doit le rester

Le rythme scolaire (en général **une séance par semaine** au cycle 3) n'est pas un défaut à
corriger : c'est la **cadence naturelle** du jeu. C'est le principe des jeux « à rendez-vous »
(jeux par correspondance, jeux de plateau en campagne, ou _Animal Crossing_ qui avance avec le
temps réel). Ce qui doit rester attaché à la séance :

- **le plateau et le déplacement des équipes** : c'est le moment collectif, sous l'œil du MJ ;
- **les sorts aux effets scolaires** (Esquive, Révélation, Mentorat, Annulation, Consécration) :
  ils sont validés par le MJ, à juste titre ;
- **le changement de chapitre** : c'est le seuil narratif, géré par le MJ.

Ce qui **ne devrait pas** en dépendre :

- **remplir sa collection** (feuillets) : elle doit appartenir au joueur ;
- **progresser personnellement** (apprentissage, entraînement QCM) ;
- **savoir quoi faire** : objectifs entre deux séances ;
- **voir l'effet de ses actes de la semaine sur la prochaine séance** : c'est le pont qui
  manque.

Le bon modèle n'est pas un jeu en continu, mais **une semaine en deux temps** :

```
        SÉANCE (MJ, collectif)                    ENTRE DEUX SÉANCES (élève, seul)
  ┌──────────────────────────────┐           ┌────────────────────────────────────┐
  │ plateau · dé · QCM d'arrivée │──récap──▶ │ objectifs de la semaine            │
  │ sorts · narration du MJ      │           │ entraînement QCM · « appris »      │
  │ bilan d'équipe en fin        │ ◀─bonus── │ feuillets · carnet · journal       │
  └──────────────────────────────┘           └────────────────────────────────────┘
          ce qu'on fait chez soi pèse sur la prochaine séance (et réciproquement)
```

---

## 5. Verdict technique

### 5.1 Points d'appui (à réutiliser, pas à refaire)

| Brique                                                                         | Ce qu'elle permet                                                            |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `gl_game_events` + `readGameState` (`lib/gl/gamesRuntime.js:225-330`)          | Historique complet rejouable : base d'un récap « depuis ta dernière visite » |
| Acquittements indexés sur le lecteur (`routes/gl/learning.js`, `/learning/me`) | Progression personnelle **indépendante de la partie**                        |
| API QCM libre (`routes/gl/qcm.js:211-366`) + tentatives enregistrées           | Écran d'entraînement sans nouveau backend                                    |
| `gl_player_feuillet_states` (migration 175)                                    | Collection par joueur : il suffit de détacher l'**attribution** de la partie |
| `/stats/me` (`lib/glPlayerStats.js`)                                           | Calcul d'un niveau ou d'un rang **dérivé**, sans nouvelle monnaie            |
| Dé serveur + garde de tour atomique (`games.js:716-748`)                       | Dé joueur qui avance sa propre équipe, sans risque de triche                 |
| Plafonds de vitalité réglables, contrôle de cohérence des plateaux             | Rebrancher l'économie de façon mesurée                                       |
| Visites guidées OLU (`glDiscoveryTour.js`)                                     | Véhicule tout prêt pour expliquer les deux régimes                           |
| 199 fichiers `tests/gl-*` + 21 specs e2e GL                                    | Filet pour refactorer, à compléter d'un scénario **hors séance**             |

### 5.2 Dettes qui freinent l'expérience

1. **Rechargement d'état complet à chaque événement** (`useGlGameRuntime.js:230-273`) avec un
   jitter de 0 à 600 ms, en polling par défaut. Pour une classe, c'est supportable, mais la
   latence perçue écrase l'effet des micro-récompenses. Toute célébration doit être
   **déclenchée localement** sur la réponse HTTP, et non attendre le cycle temps réel.
2. **Pas de notion de « notification joueur » côté serveur.** Les retours (action résolue,
   sort appliqué, feuillet obtenu) n'ont nulle part où s'accumuler pour un élève absent.
   Ce rejoint `AUDIT_COMMUNICATION_2026-09-18.md` (« aucune notification serveur »).
3. **Les réglages par défaut composent un jeu passif** : `turnsEnabled`, `scoringEnabled`,
   `vitalityEnabled`, `playerActionsEnabled`, les modules market / spellCast / virtualDice sont
   tous faux, et `mascotMoveActor = 'mj'`. Il faut un **préréglage « jeu »** cohérent, ou des
   profils de séance qui allument vraiment des modules (aujourd'hui ils ne le font pas,
   `docs/GL_GAMEPLAY_PRESETS.md`).
4. **Le texte des cases et le moteur divergent** (47 % des cases). Toute direction qui ajoute
   des récompenses doit commencer par **rendre vrai** ce qui est déjà écrit.
5. **Couverture e2e uniquement « séance live avec équipe »** (`e2e/fixtures/gl.fixture.js`).
   Le régime hors séance n'est pas testé de bout en bout.

---

## 6. Directions possibles

Cinq directions **indépendantes et combinables**. Effort : **S** < 1 semaine, **M** 1 à 3
semaines, **L** au-delà. Aucune n'introduit de nouvelle monnaie, sauf mention contraire.

### A — « Dire le jeu » (socle, recommandé dans tous les cas)

> _L'élève sait toujours où il en est et quoi faire._

- Bandeau d'état d'une ligne : « Séance en cours » / « Hors séance — continue l'aventure
  ici ».
- Atterrissage selon le régime : sans partie `live`, on arrive sur un **tableau de bord
  joueur** (ou La nature), pas sur le plateau.
- État vide du plateau avec renvois vers ce qui est jouable maintenant ; suppression des
  replis `map-foret.svg`.
- Retour sur les actions proposées : « envoyée → acceptée / refusée », en écoutant
  `action_resolved`.
- Corrections de finition :
  - style de `gl-tab-loading` ;
  - `role="alert"` et bouton de fermeture sur la bannière d'erreur ;
  - écoute de `subscription-refused`.
- Doc de référence : décrire les deux régimes dans `presentation.md` et
  `chapitres-et-progression.md`.

**Effort** S · **Risque** nul (aucune règle de jeu modifiée) · **Gain** : la fin du « c'est
cassé ».

### B — « La quête de la semaine » (moteur hors séance par les objectifs)

> _Entre deux séances, l'élève a trois choses précises à faire, et une raison de les faire._

- Écran **Entraînement** branché sur l'API QCM libre, avec des séries courtes de 5 questions
  par biome du chapitre et un retour immédiat.
- **Objectifs de la semaine** : 3 tâches tirées automatiquement de ce qui reste à apprendre
  dans le chapitre (« étudie 2 espèces », « réussis une série QCM », « trouve un feuillet »),
  ou posées par le MJ.
- Feuillets **attribuables hors partie**, rattachés au joueur (correctif J7).

**Effort** M · **Risque** faible · **Inspiration** : objectifs quotidiens de Duolingo, **sans
série punitive** (pas de « flamme » qui s'éteint : inadapté à une cadence hebdomadaire et au
public).

### C — « Monter en grade » (progression personnelle)

> _Je vois que je progresse, et ça débloque des choses._

- **Rang d'apprenti** (par ex. Graine → Pousse → Arbrisseau → Gardien du Souffle) **calculé**
  à partir de l'existant : acquittements, feuillets, séries QCM réussies. Il est dérivé de
  `/stats/me` : pas de nouvelle table de points, pas de monnaie à équilibrer.
- Paliers qui débloquent du **cosmétique et du récit**, jamais de l'avantage compétitif :
  - cadre d'avatar (les cadres d'image GL existent) ;
  - titre affiché sur le profil ;
  - une page de lore supplémentaire ;
  - éventuellement les sorts par chapitre (option E3 de l'audit d'équilibrage).
- **Visible par l'élève seul** (et par le MJ) ; pas de classement public (J10).

**Effort** S à M · **Risque** faible si le rang reste privé · **Inspiration** : méta-progression
de _Hades_ (on progresse même quand la partie « échoue »).

### D — « Le plateau qui répond » (moteur de séance)

> _En séance, ce que je fais a un effet immédiat et visible._

- Rendre l'économie vraie : condition « bonne / mauvaise réponse » sur les repères, gain
  réglable crédité à l'équipe, réécriture ou recâblage des 103 cases incohérentes (options A3 /
  B3 de l'audit d'équilibrage).
- **Dé joueur qui avance sa propre équipe** sur chemin numéroté (garde serveur déjà en place),
  activable par un profil « séance sur tablettes ».
- **Célébrations** locales : son court, animation « +1 » / gemme, mise en scène de la bonne
  réponse ; fin de séance avec un **bilan d'équipe** (cases parcourues, réponses justes,
  feuillets trouvés).
- Un **préréglage « jeu »** qui allume en cohérence tours + score + dé virtuel + actions
  joueur.

**Effort** M · **Risque** moyen : il touche l'équilibrage et demande une séance test ·
**Dépendance** : arbitrer A–E de l'audit d'équilibrage.

### E — « Restaurer le royaume ensemble » (pont séance ↔ hors séance par l'équipe)

> _Ce que je fais chez moi aide mon équipe à la prochaine séance._

- Une **jauge d'équipe** par chapitre (« le Souffle recule ») alimentée par l'apprentissage
  **individuel** hors séance : acquittements, séries QCM, feuillets.
- Au début de la séance suivante, la jauge donne un **bonus mesuré** : un dé supplémentaire,
  un indice, une case d'avance. Le MJ le voit dans la console et peut le narrer.
- Coopératif, non compétitif : on ne compare pas les élèves, on fait réussir l'équipe. Le
  récit (« apprendre = restaurer ») devient enfin une **règle**.

**Effort** M à L · **Risque** moyen : il faut doser le bonus et éviter qu'un élève absent pénalise
son équipe (le bonus ne fait qu'ajouter, il n'enlève jamais) · **Inspiration** : progression
collective de _Classcraft_, **sans** son volet « points de comportement » punitifs.

### Synthèse

| Direction                   | Régime touché     | Effort | Risque | Ce que l'élève ressent                   |
| --------------------------- | ----------------- | :----: | :----: | ---------------------------------------- |
| **A** Dire le jeu           | Les deux          |   S    |  Nul   | « Je comprends ce qui se passe »         |
| **B** Quête de la semaine   | Hors séance       |   M    | Faible | « Je sais quoi faire ce soir »           |
| **C** Monter en grade       | Hors séance (+)   |  S–M   | Faible | « Je progresse »                         |
| **D** Le plateau qui répond | Séance            |   M    | Moyen  | « Ce que je fais compte, tout de suite » |
| **E** Restaurer le royaume  | **Pont** des deux |  M–L   | Moyen  | « Mon travail aide mon équipe »          |

---

## 7. Recommandation d'enchaînement

1. **A d'abord**, sans discussion : c'est la condition pour que tout le reste soit perçu, et
   cela solde le § 5 de l'audit d'août.
2. **Puis E, avec un C allégé.** E crée le pont qui manque et donne du sens au rythme
   hebdomadaire. Un rang personnel privé (C) donne la sensation de progression individuelle
   sans compétition. Ensemble, ils réutilisent les mêmes compteurs (acquittements, QCM,
   feuillets). L'écran Entraînement de B en est le carburant naturel, à intégrer en même temps.
3. **Enfin D**, une fois l'équilibrage arbitré, validé par **une séance test** mesurée (le
   compteur d'économie de l'audit d'équilibrage).

**Préalables quelle que soit la direction :**

- trancher J10 (ce qui est visible entre pairs) ;
- détacher l'attribution des feuillets de la partie (J7) ;
- ajouter un scénario e2e « joueur hors séance, sans équipe ».

## 8. Questions à trancher avant de lancer le chantier

1. Quelle(s) direction(s) parmi A–E, et dans quel ordre ?
2. **Visibilité** : la progression est-elle privée (élève + MJ), visible de l'équipe, ou de la
   classe ?
3. **Équipe hors séance** : un élève sans équipe peut-il progresser (collection, rang), ou
   faut-il d'abord une affectation par défaut ?
4. **Modèle de séance cible** : projetée (plateau au tableau) ou sur tablettes (chaque équipe
   joue) — ou les deux, avec deux profils ?
5. **Économie** : les gains en séance vont-ils aux joueurs (cœurs/gemmes) ou à l'équipe
   (score) ?

---

## 9. Réorientation — directions UI/UX autonomes (le joueur suit son chemin)

### 9.1 Le cadre posé par le porteur

- **Priorité UI/UX** : ce que l'élève voit, touche et ressent avant toute refonte de règles.
- **Aucune dépendance à une action du professeur** dans la boucle de jeu. Le professeur
  n'a pas à lancer une partie, affecter une équipe, valider une action ou ouvrir un tour pour
  que l'élève joue. La configuration ponctuelle (comptes, classes, modules) reste à l'admin.
- **Les joueurs interagissent** entre eux, sans modération en direct.
- **Chacun suit son chemin** : une progression personnelle, à son rythme.

Conséquence : la séance animée par le MJ (plateau d'équipe, tours, sorts validés) **reste
telle quelle** et n'est pas le chantier. Le chantier crée la **seconde moitié du jeu**, celle
que l'élève joue seul ou avec ses camarades, à tout moment.

### 9.2 Ce qui rend la chose faisable sans tout réécrire

Trois briques existent déjà **au niveau du chapitre ou du joueur**, et non de la partie :

| Brique                                                                                                           | Portée actuelle               | Ce que le chemin solo en fait                                             |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------- |
| Repères du plateau `gl_chapter_markers` (position, sous-biome, pool QCM, effets — migrations 081, 097, 102, 116) | **Chapitre**                  | Les cases du chemin personnel : même plateau, mêmes repères               |
| Tirage d'une question depuis un repère `drawQuestionFromMarker` (`lib/glMarkerQuestionPool.js`)                  | Fonction pure de bibliothèque | La question posée à l'arrivée sur une case                                |
| Ordre du chemin `resolveBoardMovementConfig` (`lib/shared/glBoardPathCore.js`)                                   | Fonction partagée front/back  | L'avancée case par case                                                   |
| Possession des feuillets `gl_player_feuillet_states` (migration 175)                                             | **Joueur**                    | La collection se remplit hors partie (seule l'attribution est à détacher) |
| Acquittements « appris » `gl_learning_acknowledgements` (migration 107)                                          | **Lecteur**                   | Le carburant du chemin (étudier = gagner des pas)                         |
| API QCM libre `GET /api/gl/qcm/draw`, `POST /qcm/questions/:code/answer`                                         | Biome, sans partie            | Entraînement et duels entre joueurs                                       |
| Rendu `GLGameBoard`, `GLMascotRenderer`, `GLDiceCube`, musiques de plateau                                       | Composants                    | La scène du chemin solo, sans nouvel art                                  |

Le seul vrai manque côté données est une **position personnelle** sur le chemin
(une petite table `gl_player_paths`), et une règle pour **le chapitre d'un joueur sans
partie** (§ 9.5, question 2).

### 9.3 Les directions

Toutes sont indépendantes du professeur. Effort : **S** < 1 semaine, **M** 1 à 3 semaines,
**L** au-delà.

#### U0 — « Mon chemin » : l'accueil du joueur (socle, UI pure)

> _En ouvrant GL, je vois où j'en suis et ce que je peux faire maintenant._

- Un écran d'accueil joueur remplace l'atterrissage sur « Cartes » : ma mascotte, mon rang,
  ma collection (X / Y feuillets, espèces étudiées), **le prochain pas suggéré** (« étudie
  le Fennec », « 2 questions pour atteindre la case suivante »).
- Le plateau d'équipe garde sa place, avec une ligne d'état honnête : « Séance en cours » ou
  « Le plateau d'équipe s'anime en classe — ton chemin, lui, t'attend ici ».
- États vides et finitions : plus de plateau muet, style de `gl-tab-loading`,
  `role="alert"` et fermeture de la bannière d'erreur, écoute de `subscription-refused`,
  retrait des replis `map-foret.svg`.

**Effort** S · **Back** : aucun (agrège `/learning/me`, `/stats/me`, `/lore/feuillets`) ·
**Risque** nul.

#### U1 — Le chemin solo sur le plateau (le cœur)

> _J'avance ma propre mascotte sur le plateau du chapitre, à mon rythme._

- Chaque joueur a **sa position** sur le chemin numéroté du plateau de son chapitre, avec sa
  mascotte (ou son avatar).
- **Avancer = apprendre.** Un lancer de dé (tiré côté serveur) se **gagne** en étudiant une
  fiche, en marquant « appris » ou en réussissant une courte série de QCM. On ne peut donc pas
  « farmer » le dé, et le jeu pousse vers le contenu au lieu de l'en détourner. Aucun minuteur,
  aucune énergie qui se recharge.
- **Arriver sur une case** déclenche ce que la case porte déjà : question tirée du pool du
  repère, fiche d'espèce du sous-biome, feuillet à trouver, musique de zone. Les textes de case
  qui promettent des gains doivent dire vrai : sur le chemin solo, la règle est
  **« bonne réponse = feuillet ou pas bonus »**, jamais une perte.
- Bout du chemin : bilan du chapitre, carnet du chapitre complété, chapitre suivant ouvert
  selon la règle retenue (§ 9.5).
- Le chemin solo est **distinct** du plateau d'équipe : il n'interfère ni avec la position de
  l'équipe, ni avec le score, ni avec la vitalité.

**Effort** M à L · **Back** : migration `gl_player_paths` (joueur, chapitre, index de case,
pas disponibles), routes `/api/gl/me/path` (état, lancer, arrivée, réponse) qui réutilisent
`drawQuestionFromMarker` et `resolveBoardMovementConfig`, variante « joueur » de
`pickFeuilletForConsultation`, module `soloPathEnabled` (flag + validation, comme tout onglet) ·
**Front** : vue `GLSoloPathView` qui réutilise `GLGameBoard` avec une seule « équipe » ·
**Risque** moyen : c'est un nouveau mode de jeu, à couvrir par un scénario e2e complet.

#### U2 — Le jeu qui répond : retours et célébrations (UI pure)

> _Chaque geste a un effet que je vois et que j'entends._

- Petits sons (bonne réponse, case atteinte, feuillet trouvé, dé), coupables avec le bouton
  de son existant.
- Animations courtes : « +1 pas » qui s'envole, feuillet qui se retourne comme une carte,
  jauge qui se remplit, mascotte qui réagit (la machine à états `useGLMascotStateMachine`
  existe).
- Déclenchées **localement sur la réponse HTTP**, sans attendre le cycle temps réel (§ 5.2).
- Respect de `prefers-reduced-motion`, sons désactivés par défaut en classe si souhaité.

**Effort** S à M · **Back** : aucun · **Assets** : 6 à 8 sons courts, sous licence compatible
avec une distribution propriétaire (citer la source).

#### U3 — Collection et progression visibles

> _Je vois ce que j'ai trouvé, ce qu'il me reste, et que je grandis._

- **Album** : le Carnet de Sélène et le bestiaire des espèces en cartes, les non-découvertes
  en silhouette (« ? »), par chapitre.
- **Rang d'apprenti** calculé à partir des acquittements, feuillets et cases parcourues
  (Graine → Pousse → Arbrisseau → Gardien du Souffle). Pas de nouvelle monnaie.
- **Succès** dérivés de l'existant (« 10 espèces du désert », « carnet du chapitre complet »,
  « 5 bonnes réponses d'affilée ») qui débloquent du **cosmétique** : cadres d'avatar (les
  cadres d'image GL existent), titres.
- Feuillets **attribuables hors partie** (la possession est déjà par joueur).

**Effort** S à M · **Back** : calcul de rang et de succès (lecture seule) + détachement de
l'attribution des feuillets · **Risque** faible.

#### U4 — Jouer avec les autres, sans arbitre

> _Je croise mes camarades sur le chemin, on s'aide et on se défie._

Trois mécanismes, choisis parce qu'ils **n'exigent aucune modération en direct** :

- **Traces sur le chemin** : les mascottes des camarades de la classe apparaissent en
  « fantômes » sur mon plateau, à leur position. On voit qu'on n'est pas seul, sans comparer
  de chiffres.
- **Messages de case à phrases prédéfinies** : on laisse un indice sur une case pour ceux qui
  passent après (« Regarde bien les pattes », « Courage, la suite est belle ! »), choisi dans
  une liste fermée. Pas de texte libre, donc rien à modérer.
- **Duels de savoir asynchrones** : je réponds à 5 questions d'un biome, j'envoie le défi à
  un camarade, il répond aux mêmes ; chacun voit le résultat. Gagner ne rapporte qu'un
  cosmétique ou un pas, perdre ne coûte rien.
- En option, une **jauge coopérative de classe** (« le Souffle recule ») alimentée par toutes
  les cases parcourues, visible de tous, qui débloque un feuillet commun.

Le marché (échange de feuillets) existe déjà mais exige le module vitalité : à rendre
utilisable pour les feuillets seuls dans ce cadre.

**Effort** M · **Back** : tables `gl_path_hints` (phrase choisie, case) et `gl_duels`
(questions, réponses), positions de classe en lecture · **Risque** faible à moyen : arbitrer
la visibilité (§ 9.5, question 4).

### 9.4 Synthèse et enchaînement recommandé

| Direction                      | Ce que l'élève ressent                 | Effort | Back                | Dépend du prof |
| ------------------------------ | -------------------------------------- | :----: | ------------------- | :------------: |
| **U0** Mon chemin (accueil)    | « Je sais où j'en suis et quoi faire » |   S    | Aucun               |      Non       |
| **U1** Chemin solo             | « C'est moi qui avance »               |  M–L   | Migration + routes  |      Non       |
| **U2** Retours et célébrations | « Le jeu me répond »                   |  S–M   | Aucun               |      Non       |
| **U3** Collection et rang      | « Je grandis, je collectionne »        |  S–M   | Lecture + feuillets |      Non       |
| **U4** Jouer avec les autres   | « Je ne joue pas seul »                |   M    | 2 tables            |      Non       |

**Enchaînement recommandé** :

1. **Lot 1 — U0 + U3 + U2 (2 à 3 semaines)** : tout est UI ou lecture seule, sans risque, et
   change déjà la perception du jeu. L'élève a un accueil, une collection, un rang et des
   retours.
2. **Lot 2 — U1** : le chemin solo, qui donne enfin un verbe à l'élève, avec les
   célébrations de U2 intégrées dès le départ.
3. **Lot 3 — U4** : les interactions, qui ont besoin du chemin solo pour exister (traces,
   messages de case).

**Garde-fous de conception, valables pour tous les lots** (public de 10-12 ans) :

- jamais de série punitive (« flamme » qui s'éteint), de minuteur d'énergie ni de classement
  public : ce sont des leviers d'addiction, pas d'apprentissage ;
- on ne perd jamais ce qu'on a gagné sur son chemin ;
- les comparaisons entre élèves passent par la coopération (traces, jauge de classe), pas
  par des chiffres ;
- la vitalité (cœurs, gemmes) reste l'affaire de la séance et n'est pas touchée.

### 9.5 Questions à trancher pour le lot 1 et le lot 2

1. **Ordre** : le lot 1 (U0 + U3 + U2) d'abord, ou directement le chemin solo (U1) ?
2. **Chapitre d'un joueur sans partie** : le chapitre de la dernière partie de sa classe, à
   défaut le premier ? Peut-il revisiter les chapitres déjà vécus ?
3. **Ouverture du chapitre suivant** : en finissant son chemin (l'élève peut aller plus vite
   que la classe), ou seulement quand la classe y est arrivée (risque de dévoiler le contenu
   de la prochaine séance) ?
4. **Visibilité entre élèves** : mascottes fantômes et duels limités à la classe, à l'équipe,
   ou désactivables par l'élève ?
5. **Lien avec la séance** : le chemin solo reste-t-il totalement séparé, ou peut-il, plus
   tard, apporter un petit bonus à l'équipe (direction E) ?
