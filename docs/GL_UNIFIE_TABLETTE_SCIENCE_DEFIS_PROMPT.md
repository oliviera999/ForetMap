# PROMPT Claude Code — G&L « Tenir à deux » : vérité et mesure, tablette, défis, Trame

Dépôt : `oliviera999/ForetMap`. Branche de départ : **`claude/gl-prompt-unifie-donnees`** (issue de `main`
v1.241.0, commit `0a0b126`). Elle contient déjà ce prompt et les sept fichiers de données dans
`data/gl/tenir/` : rien à copier. Si `main` a avancé, rebase d'abord cette branche dessus.
Ce prompt **remplace** `PROMPT_Claude_Code_GL_tablette_lot1.md` et `PROMPT_Claude_Code_Science_Defis_GL.md`.
Lis-le en entier avant de commencer.

## 0. Contexte

Le jeu n'a encore jamais été joué en classe : en prod, aucune fouille, aucune page trouvée, aucun tour
clos. Tout ce qu'on sait vient du banc de simulation. Ce lot poursuit trois buts, dans cet ordre :

1. **Dire vrai et mesurer** : des retours de QCM qui expliquent sans punir, des questions qui intéressent
   des élèves de 6e, un chronométrage réel des séances.
2. **Jouer en parallèle sans friction** : la tablette d'équipe, une console du prof à file unique, un défi
   de case préparé d'une semaine sur l'autre.
3. **Mettre la science au cœur** : les défis de la Trame.

**Règle d'arbitrage d'Oliv, à appliquer chaque fois que tu hésites** : choisir ce qui simplifie le jeu pour
les élèves ou pour le prof, et ce qui libère du temps pendant la séance.

**Hors périmètre** : la Fresque du Climat (`src/shared/fresque/**`, `lib/fresque*`, `routes/fresques.js` :
ne rien toucher, ne rien importer) ; les coûts des sorts (sauf Cordée, § 6.6) ; Consécration, Héritage,
équipes à 1 ou 2 présents ; le découpage de `lib/glTour.js`, `lib/glSpellCast.js`, `lib/glChasse.js`.

### Fichiers joints (à copier tels quels dans `data/gl/tenir/`)

| Fichier                    | Contenu                                                                                                          | Statut              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------- |
| `chasse-zones.json`        | 36 indices réécrits en énigmes scientifiques (≤ 99 caractères) ; rien d'autre ne change                          | remplace l'existant |
| `qcm-feedbacks-zones.json` | 36 retours de mauvais choix pour 9 questions de zone, et le remplacement de `GQCM0766` (suricate)                | nouveau             |
| `questions-vives.json`     | 40 questions de case (5 par biome joué), une explication par question                                            | nouveau             |
| `defis-cases.json`         | 16 défis de case (4 par plateau) : consigne, préparation, critère, notion, durée                                 | nouveau             |
| `trame-reseaux.json`       | 8 réseaux trophiques, 12 cartes ordonnées par biome, liens acceptés, liens « à discuter », 3 scénarios par biome | nouveau             |
| `trame-fils.json`          | 4 jeux de cartes causes → effets, un par plateau                                                                 | nouveau             |
| `trame-reparer.json`       | 11 mesures, 6 espèces à classer par plateau (`a_classer`), espèces menacées et mesures acceptées                 | nouveau             |

Les codes `SP0xxx` sont ceux de `gl_species` en prod (les 94 existent, dans le bon biome). La carte `DEC`
(« Décomposeurs du sol ») est générique, sans espèce en base.

### À lire avant de coder

`CLAUDE.md`, `.cursor/rules/`, `docs/GL_TENIR_A_DEUX_REGLES.md` (fait foi), `docs/GL_TENIR_A_DEUX.md`,
`docs/GL_SIMULATION.md`, `docs/GL_TESTS.md`, `data/gl/tenir/README.md`, `docs/API.md` § G&L,
`docs/reference/gl/*`. Avant chaque étape, **vérifie le constat dans le code**. S'il est faux (déjà
corrigé), ne code rien pour ce point et note-le dans la description de PR.

## 1. Garde-fous (non négociables, priment sur tout)

1. Le Souffle n'est jamais personnifié (voile, pages qui pâlissent ; vocabulaire _tenir / résister_).
2. L'oiseau (`kraa` en code) n'est jamais nommé dans une chaîne visible d'un élève.
3. Aucun contenu du tiers `secret` du lore côté élève.
4. **L'erreur ne punit jamais.** Côté élève : « Pas encore… », « à discuter ». Jamais « Non », jamais
   « faux ». Un défi n'échoue pas. (Le mot « erreur » reste permis : « l'erreur du jour d'Olu » existe.)
5. **Aucune ressource (cœur ou gemme) pour un défi**, de case ou de la Trame.
6. Bourses privées, aucun classement d'élèves. La projection ne montre aucun solde.
7. Aucune donnée d'élève dans les logs, tests, fixtures ou rapports.
8. Isolement G&L / ForêtMap : `/api/gl/*`, `src/gl/`, `lib/gl*`, tables `gl_*`.
9. Tout ce qui touche au réel passe par le prof. Le serveur rejoue toujours les droits ; le client grise.
10. Toute écriture de bourse passe par `applyBourseDeltaTx` ; la réserve par `creditReserveTx` /
    `debitReserveTx`. Nouvelle cause de livre autorisée : `sort_rembourse`.
11. **Aucun état d'attente sans sortie automatique** : tout ce qui attend un geste (jet en suspens, défi,
    demande) se résout ou s'annule seul au changement de phase, à la clôture du tour ou au Seuil. Le banc
    le vérifie.
12. Au tableau (`surface = tableau`), comportement actuel inchangé sauf mention contraire.

Conventions du dépôt : migrations idempotentes numérotées à partir de **344** (vérifie le prochain numéro
libre sur `main` et dans les PR ouvertes) ; noyaux partagés dans `src/shared/*Core.js` puis
`npm run sync:shared-cores` ; tokens CSS (ni hex ni rem en dur) ; textes visibles en français, courts,
niveau 6e ; `docs/API.md` à jour ; commits de build selon la règle de déploiement.

## 2. Décisions d'Oliv (14 novembre 2026)

| #   | Sujet                   | Décision                                                                                                                                                                                                      |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Livraison               | Un prompt, **trois PR dans l'ordre** (§ 3)                                                                                                                                                                    |
| D2  | Défi de case            | Déclenché **à l'arrêt exact** sur la case, réglable (`arret` ou `passage`). Préparé pour la séance suivante ; le prof peut aussi le faire relever tout de suite                                               |
| D3  | Gain d'un défi relevé   | **Le voile recule** pour toute la caravane (2 cases, réglable). Aucune ressource                                                                                                                              |
| D4  | Questions de case       | Les questions de taxonomie (« À quelle famille appartient… », « nom scientifique ») **sortent du tirage**. À la place : des questions qui stimulent (fichier joint)                                           |
| D5  | Sabliers                | Désactivables et réglables **d'un clic sur le sablier**, par le prof                                                                                                                                          |
| D6  | Connexion des tablettes | **Un QR de classe, toujours le même**, imprimable. Un élève connecté avec son compte arrive sur **le même écran d'équipe**                                                                                    |
| D7  | Cordée                  | **Offerte par l'équipe lanceuse** : plus d'invitation ni d'attente (changement de règle accepté)                                                                                                              |
| D8  | Réparer la trame        | Version courte : classer 6 espèces, choisir une mesure. La phrase de justification est facultative                                                                                                            |
| D9  | Lot 2 de la tablette    | En entier : file unique, « Tout au tableau », pastilles, sorts par moment                                                                                                                                     |
| D10 | Arbitrages de l'audit   | Marché fermé au chapitre 1 ; tour en deux étages (profil « court ») ; rôles = conseils ; dés serveur sur tablette ; Boussole gratuite et affichée ; pas de Farce sur une équipe sous le voile ; fouille libre |

Tout autre choix que tu fais sans demander va dans la description de PR, section « choix faits sans demander ».

## 3. Livraison

Trois PR **empilées** (la 2 part de la branche de la 1, la 3 de celle de la 2), ouvertes l'une après
l'autre. Ne fusionne rien toi-même. Un commit par étape numérotée, tests verts à chaque commit.

| PR  | Titre                           | Étapes     |
| --- | ------------------------------- | ---------- |
| 1   | Vérité et mesure                | § 4 et § 5 |
| 2   | Tablette, console, défi de case | § 6 et § 7 |
| 3   | Défis de la Trame               | § 8        |

La PR 1 doit rester courte et sans risque : Oliv veut jouer une vraie séance dès qu'elle est en ligne.

---

# PR 1 — Vérité et mesure

## 4. Outillage du dépôt (étape 1.0)

Les 9 skills de `.claude/skills/` ne disent presque rien de « Tenir à deux ». Crée, **à partir du code et
des docs réels**, courts (80 lignes au plus), avec une description qui dit quand les lire :

| Fichier                                       | Contenu                                                                                                                                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/skills/gl-tenir-garde-fous/SKILL.md` | Les garde-fous du § 1 ; où vit la liste des mots interdits ; le ton des retours ; les tests qui les contrôlent                                                                                                                     |
| `.claude/skills/gl-tenir-catalogue/SKILL.md`  | Ajouter ou modifier un catalogue de bout en bout : JSON, table, import tolérant, synchronisation par empreinte, carte d'admin, outil MCP `gl_tenir_catalogues`, test de contenu, README                                            |
| `.claude/skills/gl-tenir-moteur/SKILL.md`     | Carte du tour : phases, surfaces, droits (`glTenirPermissionsCore`), transactions, grand livre, évènements et libellés du journal, temps réel ; où brancher un nouveau geste                                                       |
| `.claude/skills/gl-banc/SKILL.md`             | Lancer le banc, scénarios, graines, base `_sim` (**jamais la prod**), lire le rapport, attendus d'équilibrage                                                                                                                      |
| `.claude/skills/gl-contenu-science/SKILL.md`  | Écrire pour des 6e ; sens des flèches (« est mangé par ») ; rôles trophiques (un charognard est un consommateur, pas un décomposeur) ; contrôle contre `gl_species` ; une question part d'une curiosité, jamais d'un nom à réciter |
| `.claude/agents/gl-relecteur-garde-fous.md`   | Sous-agent en lecture seule : relit un diff contre le § 1                                                                                                                                                                          |
| `.claude/agents/gl-relecteur-science.md`      | Sous-agent en lecture seule : relit tout contenu (exactitude, niveau 6e, cohérence avec les catalogues)                                                                                                                            |
| `.claude/commands/gl-verif.md`                | Lance d'un coup les vérifications du § 9                                                                                                                                                                                           |

Ajoute un renvoi dans `CLAUDE.md` et dans `.cursor/rules/foretmap-gl.mdc`. Fais relire chaque PR par les
deux sous-agents avant de l'ouvrir. En fin de PR, mets ces skills à jour si le lot les a rendus faux.

**Mots interdits, source unique** (étape 1.1). Déplace la liste de `lib/glTenirImport.js` dans un noyau
partagé `src/shared/glGardeFousCore.js` (`findForbiddenString`, liste, exceptions connues). L'import,
`tests-ui/gl/tenir-chaines-interdites.test.jsx`, le banc (`--mots-interdits`) et les tests de contenu
lisent tous ce noyau. La liste ne change pas.

## 5. Vérité des questions, mesure du temps

### 5.1 Retours de QCM (étape 1.2)

Constats vérifiés le 14 novembre :

- `lib/qcmChoices.js › resolveQcmAnswerFeedback` ne lit que `feedback_a…e`. Les 35 questions de
  `gl_tenir_questions_lecture` portent un `feedback_incorrect` qui n'est donc **jamais affiché**.
- Les 931 questions actives de `gl_qcm_questions` ont un retour par mauvais choix, mais **3 709 retours
  sur 3 742 commencent par « Non »** : l'app affiche « Pas encore. Non, c'est tout l'inverse… ».
- 34 retours contiennent un mot interdit (« Non, c'est faux : … »), relevés par le banc le 8 novembre.

À faire :

1. **Une seule fonction de retour** (par exemple `lib/glRetourQcm.js › resoudreRetour`), utilisée par la
   chasse, la lecture et la question de case (`lib/glChasse.js`, `routes/gl/games/qcm.js`). Ordre pour une
   mauvaise réponse : `feedback_<lettre>`, puis `feedback_incorrect`, puis le défaut.
2. **Nettoyage à l'affichage** : retirer une amorce « Non », « Non, », « Non. », « Non : » et, si elle suit,
   « c'est faux : » ; remettre la majuscule. Ne jamais produire « Pas encore. Pas encore ». Un texte qui
   commence déjà par « Pas encore » est gardé tel quel.
3. **Migration gardée** pour les retours qui contiennent encore un mot interdit après nettoyage : réécris-les
   à la main (ils sont peu nombreux), chaque `UPDATE` gardé par l'ancienne valeur exacte.
4. **Retours des 9 questions de zone** (`qcm-feedbacks-zones.json`) : écrire `feedback_b…e` seulement si la
   colonne est vide **ou commence par « Non »**. Jamais d'écrasement d'une retouche.
5. **Suricate** : remplace énoncé, choix, réponse et retours de `GQCM0766` par le bloc `remplacement`,
   migration gardée par l'ancien énoncé exact.
6. Hors mode « Tenir » (`routes/gl/qcm.js`, `routes/gl/lore.js`), applique le même nettoyage.

Tests : lecture « pas encore » → le texte de `feedback_incorrect`, une seule fois « Pas encore » ; question
de chasse avec et sans `feedback_<lettre>` ; aucune amorce « Non » renvoyée ;
`tests/content/gl-tenir-feedbacks.test.js` échoue si un retour d'une question active contient un mot
interdit, si une question de zone active n'a pas de `feedback_correct` ou de retour par mauvais choix, ou
si une question de lecture active n'a pas de `feedback_incorrect`.

### 5.2 Questions de case qui stimulent (étape 1.3)

Constat : 29 % des questions tirées sur les cases sont de la taxonomie générée (127 « À quelle famille
appartient… », 127 « nom scientifique », série `GQCM`). Oliv les juge sans intérêt pour des 6e.

1. Colonne `usage_tenir TINYINT(1) NOT NULL DEFAULT 1` sur `gl_qcm_questions`. Migration : `0` pour les
   questions dont l'énoncé commence par « À quelle famille appartient » ou contient « nom scientifique ».
   Rien n'est supprimé ni désactivé pour le reste de l'app.
2. En mode « Tenir », `lib/glMarkerQuestionPool.js` ne tire que `usage_tenir = 1`. Les questions fixes des
   zones de chasse ne passent pas par ce filtre.
3. Importe `questions-vives.json` dans `gl_qcm_questions` (chargeur idempotent, clé `question_code`
   `VQCM0001…`, `niveau = '6ème'`, `statut = 'actif'`, `usage_tenir = 1`). Le premier choix est le bon
   (`reponse_correcte = 'A'`) ; `feedback_correct` = l'explication ; chaque retour de mauvais choix =
   l'explication (l'affichage ajoute « Pas encore. »). Vérifie que la présentation mélange bien les choix.
4. Case à cocher « Posée en partie » dans l'écran d'administration des QCM, et filtre correspondant.
5. `docs/reference/gl/qcm-et-pedagogie.md` : la règle d'écriture des questions (voir le skill
   `gl-contenu-science`) ; les formats des 40 questions jointes servent d'étalon.

Tests : aucun énoncé de taxonomie tiré en mode « Tenir » ; au moins 40 questions restantes par biome joué ;
les 40 nouvelles passent le filtre des mots interdits.

### 5.3 Indices scientifiques (étape 1.4)

Copie `chasse-zones.json`. La synchronisation par empreinte l'importera. Vérifie que l'import tolérant ne
rapporte aucune erreur et que `cz-p2-08` garde l'état du catalogue (consigne d'origine : en attente ; depuis
la décision L5 de l'ensemble unifié, la zone est active avec le feuillet `ep-I-06`). Dans le carnet de la classe, l'indice
s'affiche en entier (tablette 1024 px et projection).

### 5.4 Contrôle de surface au lancement d'un sort (étape 1.5)

Constat vérifié : ni `lib/glSpellCast.js` ni `routes/gl/games/spell-casts.js` ne rejouent la permission de
surface. Pour un joueur, au tableau, refuser 403 `TENIR_PERMISSION` la création et le lancement d'un sort
dont la fenêtre exige la phase `jeu` (`avant_jet`, `apres_jet`, `jeu`, `jeu_avant_fouille`,
`avant_jets_pacte`). Les fenêtres de seuil, veillée, activité et fin de séance restent ouvertes.

Tests : au tableau, un élève ne lance pas Lanterne pendant `jeu` ; il lance Lettre en veillée.

### 5.5 Chronométrage des séances (étape 1.6)

Aujourd'hui le diagnostic donne la durée d'un tour, pas celle de ses phases.

1. Table `gl_game_round_phases` (`game_id`, `round_number`, `phase`, `started_at`, `ended_at`), écrite par
   `changerPhaseTx` et `ouvrirTourTx`.
2. `lib/glDiagnostic.js` et l'outil MCP `gl_game_diagnostic` : durée de chaque phase par tour ; par équipe,
   l'écart entre son premier et son dernier geste de la phase `jeu` ; nombre de gestes du prof par tour.
3. Dans la console, après la clôture du tour : une ligne « Ce tour : ouverture 1 min 10, jeu 6 min 40,
   souffle 0 min 50 ». Visible du prof seulement.

### 5.6 Sabliers réglables d'un clic (étape 1.7)

Constat : `GLTourSablier` est indicatif, côté client, réglé par le seul `tenir_sablier_secondes` (180),
et pensé pour l'équipe active au tableau.

1. Réglages nouveaux, tous surchargeables par partie (`OVERRIDABLE_KEYS`), valeurs par défaut = comportement
   actuel : `tenir_sablier_actif` (booléen, `true`), `tenir_sablier_phase_secondes` (nombre, `0` = sans),
   `tenir_sablier_phase_auto` (booléen, `false`). `tenir_sablier_secondes` devient surchargeable.
2. **Sablier de phase** : commun à toutes les équipes pendant la phase `jeu`, en hybride et sur tablette.
   Son départ et sa durée viennent du serveur, pour que console, tablettes et projection affichent la même
   chose. À zéro : rien n'est annulé, la console met en avant « Passer au souffle ». Si
   `tenir_sablier_phase_auto` est vrai et la console ouverte, elle passe au souffle toute seule.
3. **Un clic du prof sur n'importe quel sablier** ouvre un petit panneau : interrupteur « Sablier »,
   durée (1, 2, 3, 5, 8, 10 minutes ou saisie), « Passer au souffle à la fin » (sablier de phase
   seulement), pause, reprise, remise à zéro. Le choix est enregistré pour la partie. Élèves et projection
   voient le sablier, sans pouvoir le régler.
4. Le sablier des défis (§ 7 et § 8) utilise le même composant et suit `tenir_sablier_actif`.

Tests : sablier éteint → aucun affichage ; durée changée d'un clic → conservée après rechargement ; un
joueur ne peut pas la changer (403).

---

# PR 2 — Tablette, console, défi de case

## 6. Jouer en parallèle

### 6.1 Socle (étape 2.1)

- **Jetons invités** : généralise `lib/glProjection.js` en `lib/glGuestToken.js` (émission, hachage du
  `jti`, révocation). La projection et la session d'équipe s'en servent.
- **Acteur unique** : `requireGlAuth` pose `req.glAuth.actor = { kind: 'player' | 'team' | 'mj' |
'projection', gameId?, teamId?, playerId? }`. Un helper `resolveActingPlayer(req, { teamId })` gère
  « au nom de » (`onBehalfOfPlayerId` vérifié membre présent, non en retrait). Les routes de partie passent
  par lui au lieu de refaire leurs contrôles.
- **Remboursement d'un sort** : une seule fonction `rembourserCastTx` (contributions et réserve, cause
  `sort_rembourse`), utilisée par § 6.6 et § 6.7.
- **Demandes au prof** : table `gl_game_demandes` (`game_id`, `round_number`, `team_id`, `kind`, `ref_id`,
  `payload_json`, `statut`, `created_at`, `resolved_at`). Tout flux qui attend le prof y écrit une ligne
  (§ 6.8). C'est elle que le garde-fou 11 vide aux changements de phase.

### 6.2 QR de classe et écran d'équipe unique (étape 2.2)

Constat : il n'existe pas de compte d'équipe. Une tablette joue avec le compte d'un élève : porteur absent,
il faut le mot de passe d'un autre ; porteur en retrait, toute la tablette perd le Marché.

**Le lien de classe, permanent.**

1. Table `gl_class_links` (`class_id` unique, `token_hash`, `code` de 8 caractères sans caractères
   ambigus, `created_by`, `created_at`, `revoked_at`). Un lien par classe, valable jusqu'à régénération.
2. Routes prof : `GET /api/gl/classes/:classId/lien` (le crée au besoin) → `{ url, code }`, avec
   `url = gl.html?classe=<jeton>` ; `POST …/lien/regenerer`. Dans la console : bouton « QR de la classe »
   qui ouvre une page A4 imprimable (QR, code, nom de la classe). Oliv l'imprime une fois pour l'année.
3. `POST /api/gl/class-link/open { token | code }` (limité en débit) → nom de la classe, partie « Tenir »
   en cours, équipes (`teamId`, nom, mascotte, peuple), phase. Aucun nom d'élève.
4. `POST /api/gl/class-link/session { token | code, teamId }` → jeton `gl_guest` avec le claim
   `team_session: { gameId, teamId, jti }`, 3 heures, révocable. Révoqué à la régénération du lien, à la
   clôture de la partie et au rebrassage des équipes.
5. Page de connexion : « J'ai le code de la classe ». La tablette scanne ou saisit, puis **touche la
   mascotte de son équipe**. Elle ne garde rien après fermeture de l'onglet (`sessionStorage`).

**Ce qu'une session d'équipe peut faire.**

- Acteur `team` : droits d'un membre de l'équipe (`resolveTenirPermissions`, `isMember: true`), **sans**
  `enRetrait` (le retrait reste individuel). Uniquement sa partie et son équipe ; tout le reste → 403.
- **Gestes seulement quand un tour est ouvert.** Hors tour : lecture seule (plateau, carnet de la classe,
  défi à préparer), **aucune bourse affichée**.
- Gestes d'équipe : dés, réponse de case, fouille, lecture, tenir une page, pot de sort. Journal :
  `actor_type = 'team'`, `actor_id = teamId`.
- Gestes sur une bourse individuelle (Marché, « pas moi ») : l'écran demande « Qui agit ? » (avatars des
  présents non en retrait, sans mot de passe) ; la route reçoit `onBehalfOfPlayerId` ; c'est journalisé.
- Sorts à limite par élève (`limite.portee === 'eleve'`) : refusés, « Ce sort se lance depuis ton propre
  compte. »
- Badges : un geste d'équipe ne crédite aucune mesure « par l'élève ». Les mesures « en sa présence »
  comptent pour les présents.

**Un seul écran d'équipe, deux entrées.** `GLTenirEquipeView` est le même composant pour la tablette de
classe et pour un élève connecté avec son compte. Quand un tour est ouvert, l'élève connecté arrive
directement dessus (bandeau « Le tour est ouvert » ailleurs dans l'app). Seules différences : avec son
compte, il voit sa bourse, « Qui agit ? » est sauté (c'est lui), et les sorts par élève sont disponibles.
Plusieurs appareils peuvent servir la même équipe : le serveur rejoue chaque geste.

Console : par équipe, les sessions ouvertes aujourd'hui et un bouton « Déconnecter ».

Tests : 4 sessions d'équipe jouent un tour complet en parallèle ; un membre en retrait ne retire pas le
Marché à la session ; jeton révoqué refusé au geste suivant ; session d'une équipe refusée sur une autre ;
hors tour, aucune bourse renvoyée ; lien régénéré → ancien QR refusé.

### 6.3 Présences (étape 2.3)

Constat : sans coche du prof (`gl_game_round_absences`), tout le monde est présent (`listPresentMembers`).
Un oubli fait payer l'absent au pot et lui donne les badges de présence.

1. Table `gl_game_round_presences` (`game_id`, `round_number`, `team_id`, `confirmed_at`,
   `confirmed_by_type`, `confirmed_by_id`).
2. En phase `ouverture` ou `jeu`, tant que la présence n'est pas confirmée, l'écran d'équipe affiche
   **« Il manque quelqu'un ? »** : on touche les absents, puis « C'est bon ». Un seul appui si l'équipe est
   complète. Sur tablette, cet écran s'enchaîne au choix de la mascotte.
3. Retardataire : bouton « Quelqu'un vient d'arriver », sur l'écran d'équipe et dans la console.
4. Console : pastille « présences confirmées » ou « à confirmer » par équipe ; le prof corrige à tout moment.
5. En hybride et sur tablette, la création d'un pot est refusée tant que la présence de l'équipe n'est pas
   confirmée : 409 `PRESENCE_A_CONFIRMER`, « Dites d'abord s'il manque quelqu'un. » Au tableau, rien ne change.

Tests : présence non confirmée → pot refusé ; absent → exclu du pot et des mesures de présence ;
retardataire ajouté → inclus dans le pot suivant.

### 6.4 Pot de sort (étape 2.4)

Constat : `gameplay.spell_cast_contribution_mode = coordinator` en prod : n'importe qui modifie la part de
n'importe qui.

1. Colonne `exclus_json` sur `gl_spell_cast_drafts`.
2. `POST /api/gl/games/:id/spell-casts/drafts/:draftId/exclure { playerId, exclu }` : acteur = le joueur
   lui-même, une session d'équipe (« au nom de ») ou le prof. Recalcule avec `suggestContributions` sur
   les présents non exclus (réserve d'abord, inchangé).
3. Écran : le pot montre le partage automatique entre présents, un bouton « pas moi » par ligne, une ligne
   exclue grisée avec « remettre ». **En session d'équipe, plus aucune saisie de part.**
4. Avec un compte élève, la saisie manuelle reste possible en `coordinator`, mais limitée aux membres de
   l'équipe lanceuse (403 sinon).

Tests : exclusion → redistribution sans dépasser aucun solde ; si le reste ne couvre plus le coût, pot
incomplet et lancement refusé sans débit ; un absent n'apparaît jamais dans le pot.

### 6.5 Jets en suspens et fenêtres par équipe (étape 2.5)

Constat : `apres_jet` exige que le **dernier jet de la partie** soit celui de l'équipe (`dernier_jet_json`
unique par tour) ; un jet en suspens est confirmé d'office par le jet ou le sort d'une autre équipe
(`confirmerArriveesTx` sans filtre). En parallèle, l'équipe la plus rapide ferme Relance et Progression
aux autres.

En hybride et sur tablette seulement :

1. `dernier_jet_json` devient un objet par équipe `{ [teamId]: { eventId, mode, at, gesteSuivant } }`
   (lire l'ancien format). `gesteSuivant` passe à `true` dès que l'équipe fait un autre geste. La fenêtre
   `apres_jet` vaut « l'équipe a jeté ce tour et n'a rien fait depuis ».
2. `confirmerArriveesTx({ gameId, settings, teamIds })` : un geste ne confirme que les arrivées en suspens
   des équipes concernées : celle qui agit, et celle qu'un sort déplace (Bourrasque, Relais, Cordée). Le
   changement de phase, « Garder ce jet » et le prof confirment comme aujourd'hui.
3. **Défaut relevé par le banc le 8 novembre** : une question de case est perdue quand une Bourrasque ou un
   Relais déplace l'équipe avant sa réponse (409 « Votre équipe n'est pas sur ce repère »). Lie la question
   à l'arrivée du tour, pas à la position : l'équipe déplacée garde sa question.
4. **Second défaut du banc** : Nommer appliqué par le prof sur une page réparée entre-temps (refus
   `PAGE_PAS_PALIE` correct). La ligne de la file se retire seule quand la page n'est plus pâlie.

Tests : A en suspens, B jette → A peut encore lancer Relance ; Bourrasque sur A en suspens → le jet de A
est appliqué, puis +3 cases ; Progression de A fermée dès que A fouille ; A déplacée garde sa question.

### 6.6 Cordée offerte (étape 2.6)

Changement de règle accepté (D7). Aujourd'hui le pot est pré-rempli avec les ressources des deux équipes,
lançable par la seule lanceuse ; la fenêtre est vérifiée hors transaction ; rien n'est remboursé si l'une
des deux ne jette pas.

1. `sorts.json` : Cordée passe à `ressource: "peuple"`. **L'équipe lanceuse paie seule** (coût 4 inchangé,
   dans sa ressource). La partenaire, de l'autre peuple, ne paie rien et n'a rien à accepter. Mets à jour
   la description visible : « Vous offrez la Cordée à une équipe de l'autre peuple : le meilleur de vos
   deux jets vaut pour les deux. »
2. La partenaire reçoit un message sur son écran : « L'équipe {nom} vous encorde. »
3. Dans `finalizeCastTx` : verrou `FOR UPDATE` sur les deux lignes `gl_teams`, puis revérification de
   `last_dice_round_number` des deux ; 409 `SPELL_FENETRE` si l'une a déjà jeté.
4. Au passage en `souffle`, avant l'avance du voile : si l'une des deux n'a pas jeté, remboursement
   intégral, retrait de la protection contre le voile, évènement `spell_rembourse`.
5. `docs/GL_TENIR_A_DEUX_REGLES.md` et `docs/reference/gl/economie-marche-sorts.md` : règle à jour.

Tests : lancement → débit de la seule lanceuse ; partenaire qui jette pendant le lancement → refus propre ;
partenaire qui ne jette pas → remboursement au souffle, voile normal ; invariants du grand livre verts.

### 6.7 Sorts du prof : refuser rembourse (étape 2.7)

Constat : en mode « Tenir », un sort `execution = prof` est débité au lancement et entre en file ; aucun
remboursement.

`POST /api/gl/games/:id/spell-casts/drafts/:draftId/refuser { mot? }` (prof), pour un sort lancé dont
l'effet n'est pas appliqué : remboursement exact, statut `rembourse`, évènement `spell_refuse` (mot visible
de l'équipe). `assertLimite` ignore le statut `rembourse`. Bouton « Refuser et rembourser » dans la file.

Test : Pause refusée → bourses et réserve à l'identique, livre équilibré, Pause relançable dans la séance.

### 6.8 Console : file unique et « Tout au tableau » (étape 2.8)

1. **Panneau « Demandes »** dans « Jouer le tour », alimenté par `gl_game_demandes` : dés à valider, sorts
   à appliquer ou à refuser, Nommer, Plumes, chimères, présences à confirmer, jets en suspens, défis à
   juger (§ 7). Une ligne par demande, la plus ancienne en haut, un bouton principal par ligne. Un
   **compteur** reste visible depuis tout l'écran du tour.
2. **« Tout au tableau »** : bascule la surcharge `surface` de la partie vers `tableau`, et retour, en
   pleine séance. Évènement au journal ; jets en suspens appliqués ; sessions d'équipe conservées, soumises
   aux droits de la nouvelle surface.

### 6.9 Écran d'équipe : sorts par moment, carnet, voile (étape 2.9)

1. **Sorts rangés par moment**, dérivés de `fenetre` : « Avant de lancer » (`avant_jet`,
   `avant_jets_pacte`), « Après le jet » (`apres_jet`), « Pendant le tour » (`jeu`, `jeu_avant_fouille`),
   « Plus tard » (`activite`, `fin_seance`, `seuil`, `seuil_veillee`, `trimestre_3`). Un sort hors fenêtre
   reste visible, grisé, avec son message.
2. **Rôles en conseil** : une ligne par moment (« C'est le moment de l'Opérateur », Éclaireur pour la
   fouille, Secrétaire pour la lecture, Gestionnaire pour le pot et le Marché). Aucun contrôle serveur.
3. **Carnet de la classe** : pastille « attend un lecteur » (page trouvée, non tenue, visible des deux
   peuples) et « protégée » (page lue par l'équipe : vérifié, `lib/glVoile.js` l'exclut du pâlissement).
4. **Distance au voile**, en cases, sous chaque mascotte (donnée publique, calculée à l'affichage).
5. **Les six cases à venir**, affichées gratuitement avant le jet (voir Boussole, § 6.10).

### 6.10 Règles tranchées par l'audit (étape 2.10)

| Sujet                                  | À faire                                                                                                                                                                                                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marché au chapitre 1                   | À la création d'une partie « Tenir » du plateau 1, la surcharge `marche: false` est pré-cochée (modifiable). Les parties existantes ne changent pas                                                                                                                              |
| Tour en deux étages                    | Nouveau profil **`court`** à côté de `complet` et `prologue` : `marche_pendant_tour: false`, et un nouveau réglage `tenir_lecture_pendant_tour` (défaut `true`) à `false`. Pendant le tour, lire et tenir une page affichent « À lire en veillée » ; tout reste ouvert hors tour |
| Boussole                               | `actif: false` dans `sorts.json` ; son information (les six cases à venir) est affichée gratuitement                                                                                                                                                                             |
| Farce                                  | Refusée si l'équipe visée est sous le voile : 409, « Cette équipe résiste déjà au voile : choisissez-en une autre. »                                                                                                                                                             |
| Fouille sous le voile                  | Réglage `tenir_fouille_sous_voile` (`aucune` par défaut, ou `page_palie` : une fouille par tour, sur une page pâlie seulement). Éteint : comportement actuel                                                                                                                     |
| Dés sur tablette, fouille libre, rôles | Rien à coder (déjà le comportement)                                                                                                                                                                                                                                              |

### 6.11 Outils, banc, bout en bout (étape 2.11)

- Outil MCP `gl_seance` (lecture seule) : `avant` (catalogues à jour, partie « Tenir » en cours de la
  classe, phase, lien de classe créé, défis à juger) ; `apres` (durées par phase, demandes restées en
  attente, défis reçus, questions posées). `docs/MCP.md` à jour.
- Banc : scénario `tablette-parallele-absences` (4 sessions d'équipe, absences confirmées, un retrait, une
  Cordée, Relance concurrente, un sort du prof refusé, une équipe déplacée avec une question en attente).
  Attendus : 0 réponse 5xx, livre équilibré, **aucune demande en attente après la clôture du tour**.
- E2e Playwright : 4 contextes navigateur en sessions d'équipe par le QR de classe, sur une partie de
  démonstration ; un cinquième avec un compte élève, qui arrive sur le même écran.
- `docs/GL_TENIR_A_DEUX.md` (« Surfaces et verrous ») : en hybride, les équipes jouent en parallèle.

## 7. Défi de case (étape 2.12)

Les 8 cases « Défi d'équipe » (cases 21 et 41 des plateaux 1 à 4, repères 23, 40, 58, 75, 93, 110, 128, 232) n'ont ni contenu ni effet. Avec l'arrêt exact, compte environ un défi par chapitre pour la classe :
construis donc **léger et non bloquant**.

1. **Catalogue** : `defis-cases.json` → `gl_tenir_defis_cases` (`code`, `plateau`, `titre`, `consigne`,
   `preparation`, `critere`, `notion`, `duree_s`, `actif`). Suis le skill `gl-tenir-catalogue`.
2. **Marquage des cases** par leur configuration, pas par leur libellé : migration gardée qui pose
   `tenir.defi = true` dans `event_config_json` des 8 repères (conventions de
   `src/shared/glMarkerEventConfigCore.js`).
3. **Réglages**, surchargeables par partie : `tenir_defis_case` (`true`), `tenir_defi_declenchement`
   (`arret` par défaut, ou `passage` : le défi se déclenche quand le pion franchit la case, une fois par
   équipe et par case), `tenir_defi_recul` (2, de 0 à 10).
4. **Réception** : l'équipe concernée reçoit un défi du plateau, tiré sans répétition dans la partie (on
   recommence la liste épuisée). Table `gl_game_defis_case` (`game_id`, `team_id`, `marker_id`,
   `defi_code`, `round_number`, `statut` : `a_preparer`, `releve`, `pas_encore`, `annule`). Évènement
   `defi_case_recu`. **Le tour continue sans attendre.**
5. **Pendant la semaine** : titre, consigne et préparation sont affichés sur l'écran d'équipe, au Seuil
   des membres et, à la clôture du tour, sur la projection. Le **critère** n'est visible que du prof.
6. **Jugement** : une ligne dans « Demandes » dès la réception, mise en avant à l'ouverture du tour
   suivant. Le prof touche « Relevé » ou « Pas encore », à la séance suivante ou tout de suite.
   `POST /api/gl/games/:id/defis-case/:defiId/decider { releve }`, réservée au prof, une seule décision
   (409 ensuite). Un sablier de `duree_s` s'affiche à la demande (composant du § 5.6).
7. **Effet** : relevé → le voile recule de `tenir_defi_recul` cases (même fonction que le recul du carnet
   complet), évènement `defi_case_releve`. Pas encore → évènement `defi_case_pas_encore`, rien d'autre.
   Aucune ressource.
8. **Sortie automatique** : au Seuil, tout défi encore `a_preparer` passe à `annule`, sans effet.
9. **Olu** : ajoute les moments `defi_case_recu`, `defi_case_releve`, `defi_case_pas_encore` à la liste
   fermée de l'import et ces six lignes à `olu-lignes.json` (tous biomes) :
   - « Un défi pour la caravane ! Vous avez jusqu'à la prochaine séance pour le préparer. »
   - « Voilà de quoi vous occuper d'ici la prochaine séance. Les fiches vous aideront. »
   - « Défi relevé : le voile recule. Toute la caravane respire. »
   - « Bien préparé, bien joué. Regardez le voile : il a cédé du terrain. »
   - « Pas encore. Ce défi reste une belle question à creuser. »
   - « Pas encore, et rien n'est retiré. On y reviendra. »
10. **Textes des 8 cases** (migration gardée par l'ancienne valeur exacte) : « Défi d'équipe : l'app vous
    confie un défi à préparer pour la prochaine séance. Relevé, il fait reculer le voile. »
11. Journal (`lib/glJournalPresentTenir.js`) : libellés des trois évènements, avec le titre du défi.
12. Banc : une case Défi est relevée avec la probabilité de justesse de l'équipe ; ajoute-le à
    `hybride-reference` et relance `equilibrage` avec `arret` puis `passage`. Donne les deux résultats
    (équipes sous le voile par plateau) dans la description de PR.

Tests : tirage sans répétition puis remise à zéro ; mode `passage` : un défi par équipe et par case ;
double décision → 409 ; route refusée à un joueur ; recul appliqué une seule fois ; aucune ressource créée
(étends `tests/gl-tenir-economie-globale.test.js`) ; le critère n'est jamais renvoyé à un élève ni à la
projection.

---

# PR 3 — Défis de la Trame

## 8. Quatre défis sur un même plateau de cartes

Premier usage visé : **les équipes qui ont fini l'activité du jour**, et l'élève seul en veillée. Les
défis ne prennent pas de temps de jeu.

### 8.1 Choix par défaut

| #   | Sujet            | Choix                                                                                                                                                                                         | Réglage                                      |
| --- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| T1  | Défis par peuple | Gnomes : Retisser, Réparer. Licornes : La trame altérée, Les fils cachés. Le peuple est celui de l'équipe courante                                                                            | `gameplay.tenir_defis_par_peuple` (`true`)   |
| T2  | Récompense       | À la **première réussite** de chaque unité : une page « de veillée » du chapitre à son nom, choisie hors zones de chasse ; un point de regard ; un badge. Ensuite : badge et regard seulement | —                                            |
| T3  | Plafond          | 2 pages par semaine ISO et par élève par cette voie (compteur propre)                                                                                                                         | `gameplay.tenir_defis_pages_par_semaine` (2) |
| T4  | Mode équipe      | Le prof, ou une session d'équipe hors tour, lance un défi pour une équipe. Réussi, la page va à chaque membre présent dans la limite de son plafond                                           | `gameplay.tenir_defis_mode_equipe` (`true`)  |
| T5  | Indices          | Gratuits, illimités, en échelle. Ils ne réduisent aucune récompense                                                                                                                           | —                                            |
| T6  | Ouverture        | Dès le chapitre 1, sur les deux biomes du plateau de la partie                                                                                                                                | `gameplay.tenir_defis` (`true`)              |
| T7  | Pages épuisées   | Badge et regard seulement, et « Le carnet de ce chapitre n'a plus de page en attente. »                                                                                                       | —                                            |

### 8.2 Catalogues (étape 3.1)

| Fichier              | Tables                                                                       | Validation à l'import                                                                                                                                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trame-reseaux.json` | `gl_trame_reseaux`, `gl_trame_cartes`, `gl_trame_liens`                      | codes présents dans `gl_species` et du bon biome (hors `DEC`) ; 12 cartes distinctes ; liens entre cartes du réseau ; pour chaque niveau (5, 7, 9, 12 premières cartes) : au moins un producteur, au moins un décomposeur, chaque carte non décomposeur touchée par un lien accepté ; scénarios parmi les 9 premières cartes |
| `trame-fils.json`    | `gl_trame_fils_cartes`, `gl_trame_fils_liens`                                | liens entre cartes du même plateau ; aucune flèche d'une carte vers elle-même ; les cycles sont **permis** (la rétroaction du plateau 4 est voulue)                                                                                                                                                                          |
| `trame-reparer.json` | `gl_trame_mesures`, `gl_trame_reparer_especes`, `gl_trame_reparer_a_classer` | codes existants ; mesures connues ; au moins une mesure acceptée par espèce ; 6 espèces à classer par plateau                                                                                                                                                                                                                |

Import tolérant, synchronisation par empreinte, carte d'admin, outil MCP, et
`tests/content/gl-trame-catalogues.test.js` (mêmes validations, en mode strict).

Verse aussi les liens acceptés dans `gl_species_interactions`, sans jamais rien supprimer : `herbivorie` si
la ressource est un producteur, `predation` si c'est un consommateur, `decomposition` vers un décomposeur
réel ; jamais pour `DEC`.

Points d'attention : les **charognards** (vautours, gypaète) ont le rôle `consommateur` et
`regime: "charognard"`. Aux niveaux 7 du Sahara et de la toundra, le réseau forme deux chaînes séparées :
c'est voulu.

### 8.3 Cœur pur (étape 3.2)

`src/gl/defis/trameCore.js` (ESM), miroir CJS par `sync:shared-cores`. Sans dépendance, entièrement testé.

- **Modèle** : `buildReseau(reseau, niveau)` → cartes du niveau, liens acceptés, liens « à discuter »,
  décomposeurs.
- **Classement d'une flèche** `classifyLink(model, de, vers)`, dans cet ordre :
  1. `boucle` (même carte) → refusée ;
  2. `doublon` → refusée ;
  3. `trouvee` : lien accepté, ou toute carte vers un **décomposeur** ;
  4. `inversee` : l'inverse d'un lien accepté, « Regarde le sens : la flèche va de celui qui est mangé vers
     celui qui mange » ;
  5. `a_discuter` : présent dans `a_discuter` (avec son « pourquoi ») ou non prévu, « À discuter avec ton
     équipe ou avec ton professeur ».
- **Fin d'un niveau de Retisser** (`isRetisserComplet`). L'ancien critère se validait en reliant tout aux
  décomposeurs. Le nouveau, à dire tel quel à l'élève : **chaque animal a trouvé quelque chose à manger,
  chaque plante a une suite, et une flèche au moins va vers les décomposeurs.** Précisément : tout
  consommateur qui a une ressource possible au niveau porte une flèche entrante `trouvee` issue d'un lien
  accepté ; tout producteur porte une flèche sortante `trouvee` ; au moins une flèche va vers un
  décomposeur ; aucune flèche `inversee` ne reste.
- **Cascade** de « La trame altérée » : `cascade(model, retiree)`, sur le réseau du niveau 9.
  - « Mobile » : toute carte qui n'est ni un producteur ni `DEC`.
  - **Disparaît** : une carte mobile dont toutes les ressources du niveau ont disparu (propagation).
  - **Diminue** : une carte mobile qui perd au moins une ressource, mais pas toutes.
  - **Augmente** : les ressources directes de la carte retirée, sauf si elles disparaissent. Ne s'applique
    pas si la carte retirée est un décomposeur.
  - **Si la carte retirée est un décomposeur** (`DEC`, lombric) : les producteurs diminuent ; le message
    dit que la matière morte s'accumule.
  - **Rien** : tout le reste.
  - Chaque effet porte une phrase d'explication générée à partir des noms.
  - Après la vérification, une phrase **« pour aller plus loin »**, non notée, ouvre sur l'étage suivant
    (« Avec plus de zèbres et de gnous, que deviendrait l'herbe ? »).
- **Fils cachés** : même classement, sur les cartes causes → effets. Fini quand chaque lien accepté est
  trouvé et qu'aucune flèche inversée ne reste.
- **Réparer** (version courte, D8) : l'élève range les 6 espèces de `a_classer` dans leur catégorie
  (essais illimités), lit la `lecon` du plateau, puis choisit au moins une mesure acceptée pour 2 espèces
  menacées. Une phrase « Dis pourquoi » (≤ 280 caractères) est **facultative**.
- **Indices** `nextHint(model, etat)`, déterministe : relire la consigne ; structure (« Commence par une
  plante ») ; piste sur une carte encore isolée ; révélation d'un lien accepté non trouvé (en pointillés,
  à valider par l'élève).

Test de référence : les 24 cascades ci-dessous, retrouvées exactement (↑ augmente, ↓ diminue,
✕ disparaît ; cartes non citées : rien). Je les ai recalculées avec ces règles : aucun écart.

| Biome                 | Carte retirée       | Effets                                                                              |
| --------------------- | ------------------- | ----------------------------------------------------------------------------------- |
| jungle_afc            | Léopard             | Bongo ↑, Okapi ↑                                                                    |
| jungle_afc            | Moabi               | Gorille ↓, Calao ✕, Éléphant de forêt ✕                                             |
| jungle_afc            | Décomposeurs du sol | Marantacée ↓, Moabi ↓                                                               |
| savane                | Lion                | Zèbre ↑, Gnou ↑, Girafe ↑, Vautour ↓                                                |
| savane                | Themeda             | Zèbre ✕, Gnou ✕, Lion ↓, Hyène ✕, Vautour ↓                                         |
| savane                | Zèbre               | Themeda ↑, Lion ↓, Hyène ↓, Vautour ↓                                               |
| sahara                | Gerboise            | Drinn ↑, Fennec ✕, Vipère à cornes ✕                                                |
| sahara                | Acacia gommier      | Gazelle dorcas ✕, Addax ↓, Dromadaire ↓                                             |
| sahara                | Décomposeurs du sol | Drinn ↓, Acacia gommier ↓                                                           |
| foret_mediterraneenne | Chêne vert          | Sanglier ✕, Cerf ✕, Vautour fauve ✕, Cigale ✕, Caméléon ✕, Magot ↓                  |
| foret_mediterraneenne | Sanglier            | Chêne vert ↑, Vautour fauve ↓                                                       |
| foret_mediterraneenne | Cigale              | Chêne vert ↑, Caméléon ✕                                                            |
| foret_caducifoliee    | Chêne pédonculé     | Chevreuil ✕, Lynx ✕, Lombric ✕, Merle ✕, Geai ✕, Écureuil ✕, Hérisson ✕, Escargot ✕ |
| foret_caducifoliee    | Lombric             | Chêne ↓, Merle ✕, Hérisson ↓                                                        |
| foret_caducifoliee    | Lynx                | Chevreuil ↑                                                                         |
| landes                | Lézard vivipare     | Damier ↑, Vipère péliade ✕                                                          |
| landes                | Callune             | Grouse ↓, Damier ✕, Fauvette ✕, Lézard ✕, Vipère ✕                                  |
| landes                | Grouse rouge        | Callune ↑, Bruyère cendrée ↑, Busard ✕                                              |
| taiga                 | Lièvre variable     | Bouleau ↑, Tremble ↑, Loup ↓, Lynx ✕                                                |
| taiga                 | Castor              | Bouleau ↑, Tremble ↑, Loup ↓                                                        |
| taiga                 | Bouleau             | Élan ↓, Lièvre ↓, Castor ↓                                                          |
| toundra               | Lemming             | Mousse polaire ↑, Harfang ✕, Renard polaire ✕                                       |
| toundra               | Lichen des rennes   | Renne ✕, Loup arctique ↓, Bœuf musqué ↓                                             |
| toundra               | Loup arctique       | Renne ↑, Bœuf musqué ↑                                                              |

### 8.4 Données de partie, API, récompenses (étape 3.3)

Table `gl_trame_defis` : `id`, `game_id`, `player_id` (null en mode équipe), `team_id`, `type`
(`retisser`, `reparer`, `alteree`, `fils`), `unite` (ex. `savane:7`, `savane:SP0095`, `p1`), `mode`
(`individuel`, `equipe`), `etat_json`, `statut` (`en_cours`, `reussi`), `revision`, horodatages.

**Sauvegarde stricte** à chaque geste, sans rien importer de la Fresque : `PUT` avec la révision attendue,
409 `edit_conflict` si elle est dépassée ; l'élève reprend où il en était, sur n'importe quel appareil ;
bornes côté serveur (≤ 60 flèches, textes ≤ 280, coordonnées 0-100). L'écran répond tout de suite et
envoie ses gestes avec un court délai : le Wi-Fi de la classe ne doit pas le figer.

Routes (`routes/gl/games/defis.js`, `requireGlAuth`, acteur unique du § 6.1) :

- `GET /api/gl/games/:id/defis` : défis disponibles selon le peuple (T1), le plateau, la progression, et
  le compteur hebdomadaire de pages.
- `POST /api/gl/games/:id/defis { type, unite, mode }` : crée ou reprend. Le mode équipe est ouvert au
  prof, et à une session d'équipe **hors tour ouvert** pour sa propre équipe.
- `GET /api/gl/games/:id/defis/:defiId` : l'état et le modèle **sans les solutions**. Liens acceptés et
  cascade attendue ne quittent jamais le serveur.
- `PUT /api/gl/games/:id/defis/:defiId { revision, etat }` : enregistre, renvoie le classement de chaque
  flèche et les messages, détecte la fin.
- `POST /api/gl/games/:id/defis/:defiId/indice` : l'indice suivant.
- `GET /api/gl/games/:id/defis/suivi` (prof) : par élève et par type, unités réussies et indices utilisés ;
  les phrases facultatives de Réparer sont **à parcourir**, sans compteur « à traiter ». Export CSV.
  Tri alphabétique seulement.

Récompense à la réussite, en une transaction :

1. Première réussite de l'unité et plafond T3 non atteint : tirer la prochaine page « de veillée » du
   chapitre (`lib/glFeuilletChapterPool.js › resolveChapterFeuilletPool`, **en excluant les feuillets des
   zones de chasse**), l'écrire par `commitFeuilletDiscovery` avec la source `defi` (valeur à ajouter aux
   énumérations, migration incluse).
2. Point de regard : source `defi` dans le regard `proche` (`lib/glVoyageur.js`).
3. Badges : **Tisserand** (Retisser, 3 unités) et **Révélateur** (Altérée, 3 scénarios) ne sont plus
   réservés (`lib/glRewardsCatalog.js`, compteur `defis_trame` de `lib/glTenirBadges.js`) ; ajoute
   **Gardien des fils** (Fils cachés, 2 plateaux) et **Réparateur** (Réparer, 2 plateaux) à `badges.json`.
   En mode équipe, un défi réussi compte pour chaque membre présent.
4. Évènement `defi_trame_reussi` (libellé avec le type et le biome) et une ligne d'Olu.
5. **Lien entre les peuples** : quand une Licorne réussit un scénario d'Altérée dont la carte retirée
   figure dans `trame-reparer.json`, l'espèce apparaît dans « À réparer » du carnet de la classe
   (« signalée par une Licorne ») et le prochain Réparer d'un Gnome la propose en premier. Aucun gain.

### 8.5 Écrans (étape 3.4)

- **Accès** : entrée « Défis » dans `GLSeuilView` ; sur l'écran d'équipe hors tour ; onglet « Défis » de
  la console (lancer pour une équipe, suivi).
- **Un seul plateau de cartes** (`src/gl/components/defis/`) pour Retisser, Altérée et Fils cachés.
  Réutilise les styles de flèches existants (`src/shared/foodWebEdgeStyle.js`, `foodWebTypes.js`,
  `GLFoodWebPanel.jsx`). Flèche par **appui sur la carte de départ, puis sur la carte d'arrivée**
  (utilisable au doigt et au clavier) ; suppression par appui ; couleur et pictogramme par classement
  (teinte neutre et bulle pour « à discuter », jamais de rouge) ; compteur « liens trouvés » sans total.
- **Retisser** : photos des espèces (`gl_species.photo_url` et crédit), pictogramme pour `DEC` ; niveaux
  5 → 7 → 9 → 12 qui s'ouvrent l'un après l'autre.
- **Altérée** : le réseau du niveau 9 déjà tissé, la carte retirée grisée, un sélecteur ↑ ↓ ✕ = par carte.
  « Vérifier » renvoie, par carte, la bonne prédiction ou « Pas encore » avec l'explication.
- **Fils cachés** : mêmes gestes, cartes de texte.
- **Réparer** : trois colonnes, puis le choix des mesures.
- **Formats** : téléphone 390 × 844 en mode liste (« relier à… ») ; tablette 1024 × 768 et projection
  1920 × 1080 en plateau libre.
- Accessibilité : `aria-live` pour les classements, contrastes AA, rien n'est porté par la couleur seule.

Tests : cœur à 100 % des branches ; routes (droits, peuple, solutions jamais renvoyées, 409 de révision) ;
récompense (première réussite seulement, plafond, pas de feuillet de chasse, aucune ressource) ; mode
équipe ; e2e : un Retisser niveau 5 de bout en bout sur tablette, une Altérée sur téléphone.

### 8.6 Docs (étape 3.5)

`docs/GL_DEFIS.md` (nouveau : les deux familles de défis, le cœur, le classement, la cascade, les
récompenses, l'ajout d'un réseau) ; `docs/GL_TENIR_A_DEUX_REGLES.md` (remplace « défis hors périmètre »
par les règles réelles, mets à jour la veillée) ; `data/gl/tenir/README.md`, `docs/API.md`, `docs/MCP.md`.

---

## 9. Vérifications (toutes vertes avant chaque PR)

```
npm run lint && npm run format:check
npm run test:ui
npm test
npm run test:content
npm run build && npm run check:runtime
npx playwright test e2e/gl-*.spec.js
npm run gl:sim -- --scenario hybride-reference --runs 5 --seed 14
npm run gl:sim -- --scenario tablette-parallele-absences --runs 5 --seed 14   # à partir de la PR 2
npm run gl:import:tenir -- --fichier tous --strict --dry-run
```

Le banc ne tourne **jamais** sur la base de prod.

## 10. Dans chaque PR

À jour : `CHANGELOG.md` (`[Non publié]`), `docs/API.md`, `docs/GL_TENIR_A_DEUX.md`,
`docs/reference/gl/guide-du-mj.md`, `roles-et-connexion.md`, `economie-marche-sorts.md`,
`qcm-et-pedagogie.md` selon ce que la PR touche.

Description de PR :

- étapes livrées, et constats trouvés faux (rien codé) ;
- « choix faits sans demander » (noms de routes, statuts, textes) ;
- réglages nouveaux, avec leur valeur par défaut ;
- captures : PR 1, un retour « Pas encore », le panneau du sablier, la ligne de durées ; PR 2, la page A4
  du QR de classe, « Il manque quelqu'un ? », le pot avec « pas moi », le panneau « Demandes », un défi
  de case côté équipe et côté prof ; PR 3, Retisser sur tablette, Altérée sur téléphone, le suivi ;
- PR 2 : les deux résultats du banc (`arret`, `passage`) ;
- PR 3 : le tableau des 8 réseaux (biome, cartes, nombre de liens) et les 24 cascades calculées ;
- une vérification manuelle en classe, en dix lignes.

## 11. Après le déploiement (rappel pour Oliv, en fin de chaque PR)

**PR 1.** Dans Contenus → Catalogues « Tenir à deux » : vérifier les 36 nouveaux indices. Poser trois
questions de case et lire leurs retours. Jouer une séance au tableau ou en hybride, puis lire les durées
par phase.

**PR 2.** Imprimer le QR de la classe. Réglages à poser en deux clics, si tu le souhaites : validation
automatique des dés physiques (`tenir_des_physiques_validation = auto`), surface `hybride` ou `tablette`,
profil `court`. Faire une séance test sur tablettes avec `gl_seance` avant et après.

**PR 3.** Vérifier 8 réseaux, 4 jeux de fils, 11 mesures. Relire les 24 cascades. Tester un Retisser
niveau 5 sur une tablette.
