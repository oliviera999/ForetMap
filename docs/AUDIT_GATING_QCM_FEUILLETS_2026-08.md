# Audit — Questions ↔ feuillets de lore : le conditionnement par QCM (GL)

> Portée : sous-produit **GL** du monorepo ForetMap. Cet audit suit la chaîne complète
> « une question posée au sujet d'un feuillet » — de l'écran MJ qui crée le lien jusqu'à la
> modale que voit l'élève dans le Carnet de Sélène — et vérifie la cohérence entre le **code**,
> les **écrans**, la **documentation technique** et la **documentation de référence**.
> Rédigé le 2026-08-20, sur `main` @ `424958b` (v1.100.1).
>
> Fichiers lus : `lib/learningGatingAcknowledge.js`, `lib/learningGatingRuntime.js`,
> `lib/learningGatingCooldown.js`, `lib/shared/resourceQuestionGatingCore.js`,
> `lib/glLearnableResources.js`, `lib/glQcmAttempts.js`, `lib/glSettings.js`,
> `lib/glQcmImport.js`, `lib/glQcmLoreImport.js`, `routes/gl/learning.js`,
> `routes/gl/learning-links.js`, `routes/gl/lore.js`, `routes/gl/qcm.js`,
> `routes/gl/games/qcm.js`, `migrations/145_gl_learning_resource_links.sql`,
> `migrations/165_learning_gating_cooldown.sql`, `src/gl/components/GLSeleneCarnetView.jsx`,
> `src/gl/components/GLLearnAndImport.jsx`, `src/gl/components/admin/GLLearningLinksPanel.jsx`,
> `src/gl/components/settings/GLGatingSettings.jsx`,
> `src/shared/components/LearningAcknowledgeButton.jsx`,
> `src/shared/components/LearningGatingQuestionPanel.jsx`,
> `src/shared/utils/learningGatingChallengeClient.js`, `scripts/suggest-learning-links.js`,
> `docs/API.md`, `docs/reference/gl/qcm-et-pedagogie.md`, `docs/reference/INCOHERENCES.md`,
> `tests/gl-learning-*.test.js`.
>
> **Mise à jour du 2026-08-20 (même lot)** : d'abord les constats sans arbitrage (F3, F6, J2,
> J4, J5, J6), puis — après arbitrage du porteur du projet — **F1 « brancher les réglages »** et
> **F2**, ce qui emporte F4 et F5. Détail des corrections au **§5**. Les constats ci-dessous
> restent rédigés **tels qu'observés à la rédaction** : ils décrivent le problème, le §5 dit ce
> qui a été fait. Seuls **J1 et J3** restent ouverts.

---

## 0. Verdict en une page

La **mécanique** est saine : le chemin joueur (Carnet de Sélène → « Marquer comme étudié » →
challenge → question → confirmation) est complet, cohérent de bout en bout, et la vérification
est refaite côté serveur — l'UI n'est jamais la seule barrière. Rien de cassé au sens strict :
avec le conditionnement éteint (défaut), le comportement observable est correct.

Les incohérences sont ailleurs, et elles sont de trois familles :

1. **Des réglages qui ne règlent rien.** Sur les six réglages de l'écran « Conditionnement par
   QCM », **quatre sont inertes** (mode, granularité, seuil, marquage automatique). Seuls
   l'interrupteur global et le délai de nouvelle tentative agissent. L'écran, la doc de
   référence et la fiche G3 de `INCOHERENCES.md` promettent tous les quatre. Seul `docs/API.md`
   dit la vérité.
2. **Un effet de bord dormant à l'allumage.** La migration 145 et chaque import de QCM créent
   des liens **approuvés et bloquants** sur les termes de glossaire. Comme le mode réel est
   figé à « toutes les questions », le jour où l'interrupteur global passera à ON, des termes
   de glossaire deviendront conditionnés par _toutes_ leurs questions d'un coup — avec un
   verrou de 3 jours à la première erreur. Les **feuillets**, eux, n'ont aucun lien
   automatique : sur eux, le conditionnement ne se déclenchera jamais tant qu'un MJ n'aura pas
   saisi les codes à la main.
3. **Des angles morts d'exploitation.** Les tentatives ne sont enregistrées que si le
   conditionnement est déjà actif (activation non rétroactive) ; en mode « QCM réservés au MJ »
   les bonnes réponses sont créditées au MJ et jamais aux élèves ; la saisie d'un lien est un
   champ libre sans contrôle d'existence.

Classement : **2 points rouges**, **4 orange**, **5 jaunes**. Aucun ne demandait une correction
en urgence (le conditionnement est éteint par défaut) ; **F1 et F2 devaient être traités avant
toute activation en classe** — ils l'ont été (§5), avec le reste sauf J1 et J3.

---

## 1. La chaîne, telle qu'elle est réellement câblée

```
MJ : Contenus → Conditionnement QCM        Admin : Réglages plateforme → Conditionnement QCM
  POST /api/gl/learning-links                PUT /api/gl/learning-links/settings
  → gl_resource_question_links                 → gl_settings 'gating.*'
        │                                            │
        └────────────────┬───────────────────────────┘
                         ▼
Élève : Carnet de Sélène → « Marquer comme étudié »   (GLSeleneCarnetView.jsx:340)
   1. GET  /api/gl/learning/gating/challenge?resourceType=feuillet&resourceRef=<code>
          → getChallengeState()            (learningGatingAcknowledge.js:110)
   2. GET  /api/gl/{lore/,}qcm/questions/:code/present      selon question_dataset
   3. POST /api/gl/{lore/,}qcm/questions/:code/answer  + { resourceType, resourceRef }
          → gl_qcm_attempts  (+ verrou 3 j si faux)
   4. POST /api/gl/learning/mark/feuillet/:ref
          → assertGatingSatisfiedForAcknowledge()  ← re-vérification serveur
          → gl_learning_acknowledgements
```

**Ce qui est vérifié conforme** (contrôlé ligne à ligne, sans anomalie) :

- La garde est bien **côté serveur** : `routes/gl/learning.js:352` rejoue
  `assertGatingSatisfiedForAcknowledge` sur le `POST /mark`, indépendamment de ce que la modale
  a fait. Une modale contournée ne débloque rien.
- **Un seul point d'entrée** pour marquer un feuillet étudié dans toute l'application
  (`GLSeleneCarnetView.jsx:341`, `resourceType="feuillet"`), conforme à ce qu'annonce
  `docs/reference/gl/qcm-et-pedagogie.md`.
- **Posséder ≠ étudier** : aucune question n'est posée à l'arrivée d'un feuillet (zone
  traversée, cadeau d'ouverture, échange au Marché, `feuilletRevealed`), ni au « Marquer comme
  lu ». Conforme au § « Posséder un feuillet ≠ l'avoir étudié ».
- **Pas de boucle d'acquisition** : `lib/glFeuilletAcquisitionChannels.js` exclut
  explicitement `feuillet` des canaux d'acquisition ③ — marquer un feuillet étudié ne peut pas
  en faire tomber un autre.
- **Le verrou de re-tentative est bien ciblé** : `maybeRegisterCooldownOnWrong` ne se pose que
  si le code répondu est un lien **bloquant approuvé** de la ressource en cours de validation
  (`learningGatingCooldown.js:206`). Une erreur au QCM du plateau ne verrouille rien.
- **Pas de re-quiz** sur une ressource déjà acquittée (`skipGating`), conforme à `docs/API.md`.
- **Aiguillage des deux jeux de questions** correct de bout en bout : le `question_dataset` du
  lien pilote le préfixe d'API côté client (`learningGatingChallengeClient.js:35`), et le
  serveur ré-déduit le jeu par le préfixe `LQCM…` là où il n'a que le code
  (`glQcmResolve.js:15`, `glQcmAttempts.js:17`). Les deux conventions concordent — par
  convention de nommage, pas par contrainte de base (voir J4).
- **Suggestions inertes par construction** : `scripts/suggest-learning-links.js` insère en
  `status='suggested'`, et `loadApprovedGatingLinks` ne lit que `status='approved'`.
- **Écran d'administration réservé** : `GLGatingSettings` n'est rendu que pour `gl_admin`
  (`AppGL.jsx:142`), qui est le seul rôle porteur de `gl.settings.manage` (`lib/rbac.js:239`).
  Aucun MJ ne tombe sur un écran qu'il ne peut pas enregistrer.

---

## 2. Incohérences

### 🔴 F1 — Quatre des six réglages de l'écran « Conditionnement par QCM » ne font rien ✅ corrigé

**Constat.** `getChallengeState()` et `assertGatingSatisfiedForAcknowledge()` figent le mode à
la constante `ACKNOWLEDGE_MODE = 'all'` (`lib/learningGatingAcknowledge.js:24`) et calculent
les bonnes réponses par **lecteur** uniquement. Résultat, pour chaque réglage :

| Réglage (écran admin)                              | Clé `gl_settings`                 | Effet réel                                                                          |
| -------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------- |
| Activer le conditionnement                         | `gating.enabled`                  | ✅ agit                                                                             |
| Délai avant nouvelle tentative                     | `gating.retry_cooldown_days`      | ✅ agit                                                                             |
| **Mode par défaut** (any / all / threshold / off)  | `gating.default_mode`             | ❌ **ignoré** — toujours « toutes les questions »                                   |
| **Réussites requises** (threshold)                 | `gating.default_required_correct` | ❌ **ignoré**                                                                       |
| **Granularité du suivi** (joueur/équipe/ressource) | `gating.granularity`              | ❌ **ignorée** — toujours par lecteur                                               |
| **Marquer automatiquement après bonne réponse**    | `gating.auto_mark_on_correct`     | ❌ **ignoré** (auto-marquage retiré, cf. en-tête de `lib/learningGatingRuntime.js`) |

`resolveEffectivePolicy()` — la fonction qui saurait résoudre mode/seuil/granularité — n'est
appelée que par le `GET /api/gl/learning-links/policy`, en **lecture seule** : elle décrit une
politique que le runtime n'applique jamais. Idem pour les surcharges par chapitre
(`gl_chapters.gating_granularity`) et par scope lore (`gl_qcm_lore_scopes.gating_granularity`),
écrites par deux endpoints dédiés et jamais relues.

**Où la promesse est faite.**

- `src/gl/components/settings/GLGatingSettings.jsx:80-132` — les quatre contrôles sont
  présentés comme actifs.
- `src/gl/components/admin/GLLearningLinksPanel.jsx:152` — le bandeau annonce « mode par défaut
  « {gating.defaultMode} » », donc « any » sur une base neuve, alors que le comportement est
  « all ».
- `docs/reference/gl/qcm-et-pedagogie.md` — « le mode (une réussite suffit / toutes les
  questions / un nombre minimum), le marquage automatique après une bonne réponse ».
- `docs/reference/INCOHERENCES.md` fiche **G3**, marquée ✅ Livré — « interrupteur global,
  mode, granularité, seuil, délai de nouvelle tentative ».
- Seul `docs/API.md:1572-1574` est exact : « `auto_mark_on_correct` (**déprécié**, ignoré) »,
  « `default_mode` … non utilisé pour l'accusé, toujours **all** ». Le paragraphe GL
  (ligne 1605) reprend `gating.default_mode` **sans** ce garde-fou : la même vérité y est
  perdue.

**Conséquence pédagogique.** Un professeur qui règle « une réussite suffit » obtient en réalité
« toutes les questions liées », c'est-à-dire l'exigence maximale — exactement l'inverse de son
intention. Combiné à F2, l'écart est massif.

**Recommandation.** Deux options, à trancher par le porteur du projet :

- **A — brancher les réglages** (effort modéré, ~1 lot) : passer `mode` / `requiredCorrect` de
  `resolveEffectivePolicy()` à `evaluateUnlock()` dans `getChallengeState`, en lisant aussi
  `gl_resource_gating_policy`. La granularité « équipe » demande en plus une lecture par équipe
  dans `gl_qcm_attempts` (les colonnes `game_id`/`team_id` existent déjà).
- **B — dire la vérité** (effort faible, immédiat) : retirer les quatre contrôles de l'écran,
  ne garder que l'interrupteur et le délai, et corriger la doc de référence + la fiche G3.
  C'est le minimum tant que A n'est pas fait.

### 🔴 F2 — À l'allumage, des dizaines de liens bloquants hérités se réveillent d'un coup ✅ corrigé

**Constat.** Trois sources créent des liens `status='approved'`, `is_gating=1` **sans
intervention humaine** :

- `migrations/145_gl_learning_resource_links.sql:80-90` — reprise de **tout**
  `gl_qcm_question_glossary` et `gl_qcm_lore_question_glossary` en liens bloquants approuvés ;
- `lib/glQcmImport.js:478` — chaque import de QCM biomes régénère les liens
  `question ↔ glossary` par rapprochement de mots-clés, en approuvé/bloquant ;
- `lib/glQcmLoreImport.js:486` — idem pour `qcm_lore ↔ lore_glossary`.

Comme le mode réel est **all** (F1), un terme de glossaire relié à _n_ questions exigera les
_n_ bonnes réponses avant de pouvoir être marqué appris — avec, à la première erreur, un verrou
de 3 jours **sur le terme entier** (`learningGatingCooldown.js`). Le rapprochement étant
textuel, _n_ peut être élevé pour un terme courant.

Le contraste avec les feuillets est frappant : **aucun** lien n'est jamais créé
automatiquement pour `resource_type='feuillet'`. Le seul producteur de candidats feuillets est
`scripts/suggest-learning-links.js` (qui les gère bien, ligne 117-120), en `status='suggested'`
donc inerte, et **hors interface** — il faut un accès shell au serveur.

Autrement dit, à l'allumage : le glossaire devient très contraint sans que personne l'ait
demandé, et les feuillets — la ressource visée par cet audit — ne sont pas conditionnés du
tout.

**Recommandation.** Avant toute activation, faire l'inventaire (requêtes au §4), puis au choix :
basculer les liens hérités `origin IN ('import')` en `is_gating=0` (ils gardent leur valeur
documentaire), ou traiter F1-A pour que le mode « any » redevienne possible. Et exposer le
moteur de suggestion dans l'écran MJ pour que les feuillets aient enfin un chemin de saisie
réaliste (voir J3).

### 🟠 F3 — Activer le conditionnement n'est pas rétroactif ✅ corrigé

`recordGlQcmAttemptIfGatingEnabled()` (`lib/learningGatingRuntime.js:41`) **n'écrit rien** dans
`gl_qcm_attempts` tant que `gating.enabled` est faux. Toutes les bonnes réponses données avant
l'activation — parties jouées, entraînement libre — sont donc invisibles pour le
conditionnement. Le jour de l'activation, chaque élève repart de zéro et se voit reposer des
questions qu'il a déjà réussies sur le plateau.

L'écriture est pourtant peu coûteuse (une ligne par réponse) et sans effet visible tant que le
conditionnement dort. **Recommandation :** enregistrer les tentatives inconditionnellement, et
ne conditionner que la _lecture_. Le commentaire d'en-tête de `lib/glQcmAttempts.js` (« aucune
écriture par defaut : backbone structurel ») décrit un choix qui ne se justifie plus une fois
la fonction livrée.

### 🟠 F4 — Mode « QCM réservés au MJ » : les bonnes réponses sont créditées au MJ ✅ corrigé

`routes/gl/games/qcm.js:201` enregistre la tentative avec `glAuth: req.glAuth`, c'est-à-dire
**l'auteur de la requête**. Or le même endpoint autorise le staff à répondre pour une équipe
(`staffCanAnswerQcmForTeam`), ce qui est précisément le fonctionnement du réglage « QCM
réservés au MJ » (`gameplay.qcm_mj_only`). Dans ce mode, **aucun élève n'accumule jamais de
bonne réponse** : tout va sur la clé lecteur du MJ.

Même hors mode animation, le problème existe en plus petit : un QCM du plateau se joue **par
équipe**, mais n'est crédité qu'au seul élève qui a cliqué. Ses coéquipiers restent à zéro.

C'est exactement le trou que la granularité « par équipe » devait boucher — et elle est inerte
(F1). Les deux mécaniques doivent être traitées ensemble.

### 🟠 F5 — La politique par ressource est écrite mais jamais lue ✅ corrigé

`PUT /api/gl/learning-links/policy` renseigne `gl_resource_gating_policy`
(`mode`, `required_correct`, `enabled`), mais `getChallengeState()` ne consulte que
`gl_resource_question_links` et l'interrupteur global. Conséquences concrètes :

- impossible de **désactiver** le conditionnement d'une ressource particulière
  (`enabled = 0` est ignoré) ;
- impossible d'assouplir une ressource en `mode = 'any'`.

La table est exposée par l'API et documentée (`docs/API.md:1556-1557` : « Politique par
ressource … résolue avec les défauts du site »), ce qui laisse croire à un levier existant.
Même arbitrage que F1 : brancher, ou retirer de l'API et de la doc.

### 🟠 F6 — « Tu pourras réessayer en cas d'erreur » — c'est faux 3 jours durant ✅ corrigé

L'intro du quiz affirme : « Tu pourras réessayer en cas d'erreur et abandonner à tout moment »
(`learningGatingChallengeClient.js`, `buildGatingQuizIntroMessage`). Avec le délai par défaut
(3 jours), la **première** mauvaise réponse verrouille la ressource entière et la modale bascule
sur « Réessaie plus tard » ; le bouton « Réessayer » de `LearningGatingQuestionPanel` n'apparaît
que si `retry_cooldown_days = 0`.

Le message ne consulte pas le réglage. **Recommandation :** faire dépendre la phrase du
`cooldown.retry_days` renvoyé par le challenge — « une erreur bloquera la validation pendant
N jours » quand N > 0. C'est une question d'équité : l'élève doit connaître l'enjeu avant de
cocher.

### 🟡 J1 — Rien ne vérifie côté serveur que le feuillet a été découvert

`POST /api/gl/learning/mark/feuillet/:ref` contrôle que le feuillet **existe**, jamais qu'il
est accessible au joueur. La règle « n'est proposé que sur un feuillet déjà accessible en
partie » (doc de référence) n'est tenue **que par l'interface**
(`GLSeleneCarnetView.jsx:339`, `!activeLocked`). Un appel direct à l'API permet de marquer
« étudié » — puis d'importer dans le carnet personnel — un feuillet jamais rencontré.

L'impact est limité (l'import ne recopie pas le texte du feuillet, seulement un titre) et la
liste côté joueur est déjà masquée (`maskLockedFeuillet`), mais l'écart entre la règle affichée
et la règle appliquée reste réel. **Recommandation :** dans le résolveur `feuillet`, exiger un
état de progression trouvé pour le lecteur — le helper `loadPlayerFeuilletStates` existe déjà.

### 🟡 J2 — `resourceExists` ne filtre pas le statut pour deux types sur sept ✅ corrigé

`lib/glLearnableResources.js` : `species` et `glossary` filtraient `statut = 'actif'` ;
`feuillet` et `lore_glossary` ne filtraient rien. Un feuillet **désactivé** — donc absent de
toutes les listes de jeu, y compris pour le MJ — restait marquable comme étudié et importable.
Incohérence interne au même fichier, corrigée d'une ligne par résolveur.

(`content_page` et `ecosystem` ne sont pas concernés : `gl_content_pages` n'a pas de colonne
`statut`, et `ecosystem` valide déjà l'existence du biome dans `gl_biomes`.)

### 🟡 J3 — Créer un lien vers un feuillet relève du pari

Dans « Contenus → Conditionnement QCM » :

- la **référence de la ressource** est un champ texte libre, avec le placeholder
  « code espèce / terme / id tutoriel… » qui ne mentionne même pas les feuillets ;
- `POST /api/gl/learning-links` valide que la **question** existe (404 sinon) mais **jamais**
  que la ressource existe → une faute de frappe crée un lien fantôme, silencieusement inerte,
  qui ressemble en tout point à un lien valide dans le tableau ;
- le tableau n'affiche que le code (`ep-VI-06`), **jamais le titre** du feuillet : impossible
  de relire ses liens sans une seconde fenêtre ;
- la liste est plafonnée à `LIMIT 1000` sans pagination ni avertissement — plafond atteignable
  avec les liens de glossaire générés à l'import (F2) ;
- le moteur de suggestion, qui sait proposer des liens feuillets à partir du titre et de
  l'idée-clé, n'est accessible qu'en ligne de commande.

Concrètement : conditionner les feuillets suppose aujourd'hui de connaître les
`feuillet_code` par cœur. **Recommandation :** sélecteur de ressource alimenté par un endpoint
de recherche (le registre `glLearnableResources` fournit déjà `resolveResourceTitle`), contrôle
d'existence à la création (400 explicite), et bouton « Proposer des liens » branché sur le
matcher existant.

### 🟡 J4 — Deux sources de vérité pour le jeu de questions ✅ documenté

Le jeu d'une question est tantôt **stocké** (`gl_resource_question_links.question_dataset`),
tantôt **déduit du préfixe** `LQCM…` (`glQcmResolve.js`, `glQcmAttempts.js`). Aujourd'hui les
deux concordent, et la création de lien est protégée (la question doit exister dans la table du
dataset déclaré). Mais le challenge fusionne les bonnes réponses **des deux jeux** sans filtrer
par dataset (`learningGatingAcknowledge.js:170-176`) : si un jour un code existait dans les deux
tables, une bonne réponse à l'un satisferait un lien portant sur l'autre. Sécurité par
convention de nommage, pas par contrainte. À documenter, ou à verrouiller par un index/`CHECK`
sur le préfixe.

### 🟡 J5 — Le type `feuillet` n'est couvert par aucun test de bout en bout ✅ corrigé

`tests/gl-learning-gating-newtypes.test.js` verrouille le parcours complet pour `content_page`
et `ecosystem` ; `tests/gl-learning-gating-acknowledge.test.js` le fait pour `species`. **Ni le
type `feuillet`, ni le dataset `qcm_lore` ne sont couverts dans le flux de gating** — or c'est
la seule combinaison qui fait basculer le client vers `/api/gl/lore/qcm/...`
(`createGlGatingHandlers`), et cet aiguillage n'a pas non plus de test UI
(`tests-ui/shared/learningGatingChallengeClient.test.js` ne teste que les helpers purs).

Le fichier de test existant est un modèle directement réutilisable : le lot serait court.

### 🟡 J6 — Commentaires et documentation en retard sur le code ✅ corrigé

- `routes/gl/learning-links.js:5` : « Inerte tant que `gating.enabled` = false (**pas de
  branchement runtime**) » — le branchement runtime existe depuis `routes/gl/learning.js`.
- `routes/gl/learning.js:123` et `docs/API.md:153` parlent d'acquisition ③ « après une
  **consultation gatée réussie** ». En réalité `maybeAwardFeuilletFromConsultation` ne vérifie
  jamais qu'un QCM a été posé : le feuillet tombe au **premier marquage**, conditionnement
  éteint compris. La doc de référence reprend la même imprécision (« parce qu'un joueur a
  validé le QCM d'une autre ressource »). Le comportement est correct ; c'est la description
  qui promet une condition inexistante.
- `lib/glQcmAttempts.js:4-6` : « aucune écriture par défaut : backbone structurel, comportement
  inchangé » — vrai, mais c'est devenu le défaut F3.
- Trois listes de types marquables sont maintenues en parallèle et doivent rester identiques :
  `GL_RESOURCE_TYPES` (`resourceQuestionGatingCore.js:21`), `GL_MARKABLE`
  (`learningGatingRuntime.js:20`), `LEARNABLE_RESOURCE_TYPES` (`glLearnableResources.js:9`).
  Elles le sont aujourd'hui ; rien ne le garantit demain (aucun test croisé).

---

## 3. Récapitulatif

| #      | Gravité | Sujet                                                             | État                            |
| ------ | ------- | ----------------------------------------------------------------- | ------------------------------- |
| **F1** | 🔴      | 4 réglages sur 6 sans effet (mode, seuil, granularité, auto-mark) | ✅ branchés (§5)                |
| **F2** | 🔴      | Liens bloquants hérités/générés qui se réveillent à l'allumage    | ✅ neutralisés (§5)             |
| **F3** | 🟠      | Activation non rétroactive des bonnes réponses                    | ✅ corrigé (§5)                 |
| **F4** | 🟠      | Mode « QCM réservés au MJ » : réponses créditées au MJ            | ✅ corrigé via granularité (§5) |
| **F5** | 🟠      | Politique par ressource écrite, jamais lue                        | ✅ appliquée (§5)               |
| **F6** | 🟠      | « Tu pourras réessayer » contredit par le verrou de 3 jours       | ✅ corrigé (§5)                 |
| **J1** | 🟡      | Marquage possible d'un feuillet non découvert (API directe)       | ⏳ ouvert                       |
| **J2** | 🟡      | `statut='actif'` non filtré pour feuillet / lore_glossary         | ✅ corrigé (§5)                 |
| **J3** | 🟡      | Saisie des liens : champ libre, sans titre, sans suggestion       | ⏳ ouvert                       |
| **J4** | 🟡      | Dataset stocké vs déduit du préfixe                               | ✅ documenté (§5)               |
| **J5** | 🟡      | Aucun test e2e sur `feuillet` ni sur le dataset `qcm_lore`        | ✅ corrigé (§5)                 |
| **J6** | 🟡      | Commentaires et doc en retard                                     | ✅ corrigé (§5)                 |

**Reste ouvert :** J1 (contrôle serveur de l'accès au feuillet avant marquage) et J3 (ergonomie
de la saisie des liens : sélecteur de ressource, contrôle d'existence, suggestions dans l'écran).

---

## 4. Requêtes de contrôle avant activation

À passer en production **avant** de basculer `gating.enabled` à `true`. Depuis la correction de
F2 (§5), la première devrait ne renvoyer que des liens `manual` : tout ce qui reste bloquant a
été voulu par quelqu'un. Les deux dernières restent utiles pour traquer les liens fantômes (J3).

```sql
-- Combien de liens bloquants approuvés, par type de ressource et par origine ?
SELECT resource_type, origin, COUNT(*) AS liens
  FROM gl_resource_question_links
 WHERE status = 'approved' AND is_gating = 1
 GROUP BY resource_type, origin
 ORDER BY liens DESC;

-- Les ressources les plus contraintes (mode réel = toutes les questions) :
SELECT resource_type, resource_ref, COUNT(*) AS questions_a_reussir
  FROM gl_resource_question_links
 WHERE status = 'approved' AND is_gating = 1
 GROUP BY resource_type, resource_ref
HAVING questions_a_reussir > 3
 ORDER BY questions_a_reussir DESC
 LIMIT 50;

-- Liens fantômes : feuillets référencés qui n'existent pas (cf. J3)
SELECT l.resource_ref, COUNT(*) AS liens
  FROM gl_resource_question_links l
  LEFT JOIN gl_lore_feuillets f ON f.feuillet_code = l.resource_ref
 WHERE l.resource_type = 'feuillet' AND f.feuillet_code IS NULL
 GROUP BY l.resource_ref;

-- Liens sur des feuillets désactivés (cf. J2)
SELECT l.resource_ref, f.statut
  FROM gl_resource_question_links l
  JOIN gl_lore_feuillets f ON f.feuillet_code = l.resource_ref
 WHERE l.resource_type = 'feuillet' AND f.statut <> 'actif';
```

## 5. Ce qui a été corrigé dans le même lot

Les constats qui ne demandaient **aucun arbitrage** ont été traités immédiatement ; les autres
attendent une décision (F1, F2, F4, F5, J1, J3).

| #      | Correction                                                                                                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **F3** | `recordGlQcmAttemptIfGatingEnabled` → `recordGlQcmAttemptForReader` : l'écriture des tentatives ne dépend plus de `gating.enabled`. Seule la lecture reste conditionnée → **l'activation devient rétroactive**.                      |
| **F6** | `buildGatingQuizIntroMessage(pendingCount, itemTitle, retryDays)` : le message annonce « une erreur bloquera la validation pendant N jours » quand un délai est configuré, et ne promet le réessai immédiat que si le délai est nul. |
| **J2** | `resourceExists` exige `statut = 'actif'` pour `feuillet` et `lore_glossary`, comme pour `species` et `glossary`.                                                                                                                    |
| **J5** | `tests/gl-lore-feuillet-gating.test.js` : parcours complet feuillet × dataset `qcm_lore` (challenge → présentation → bonne réponse → marquage), plus les gardes J2 et F3.                                                            |
| **J4** | Convention de préfixe (`LQCM…` = lore) documentée dans `docs/API.md` comme la seule garantie d'unicité entre les deux jeux de questions.                                                                                             |
| **J6** | Commentaires remis à jour (`routes/gl/learning-links.js`, `routes/gl/learning.js`, `lib/glQcmAttempts.js`), `docs/API.md` complété (réglages non appliqués, tentatives inconditionnelles, filtre de statut, acquisition ③).          |

### Puis, après arbitrage : F1 branché, F2 tranché

**F1 + F5 — les réglages pilotent réellement l'accusé.** `getChallengeState()` résout à chaque
appel la **politique effective** (`resolveEffectivePolicy` : réglages du site + surcharge
`resource_gating_policy` / `gl_resource_gating_policy`) et la fait appliquer par `evaluateUnlock` :

- `any` → une bonne réponse suffit, `all` → toutes, `threshold` → N (borné au nombre de questions
  liées : un seuil de 25 sur 3 questions ne rend plus la ressource insatisfiable) ;
- la surcharge par ressource s'applique : `enabled = 0` **dispense** une ressource, `mode = 'any'`
  l'assouplit sur une plateforme réglée en `all` ;
- deux garde-fous délibérés : **l'interrupteur global reste maître** (site éteint → aucun quiz,
  même sur une ressource `enabled = 1` : la surcharge ne peut qu'assouplir), et le challenge
  renvoie désormais `mode`, `required_correct`, `granularity`, `satisfied` en plus de
  `pending_count` — lequel vaut maintenant « combien de bonnes réponses il reste à donner »,
  et non plus « combien de questions ne sont pas réussies ». Le client ne pose que ce nombre de
  questions (`pendingChallengeQuestions`) : en mode `any`, une seule, même si cinq sont liées.

**F4 — la granularité « équipe » rattrape le mode animation.** En granularité `team`, les bonnes
réponses portant le `team_id` du lecteur comptent **en plus** des siennes. C'est ce qui répare le
mode « QCM réservés au MJ », où toutes les réponses étaient créditées au MJ : elles portent le
`team_id` de l'équipe, donc elles profitent à ses élèves. L'équipe du lecteur vient du JWT GL
(`teamId`), avec repli sur `gl_players.team_id`.

**Le réglage « marquage automatique » a été retiré de l'écran plutôt que branché.** Il était déjà
documenté « déprécié, ignoré » dans `docs/API.md`, et l'auto-marquage _push_ avait été retiré
volontairement par un lot antérieur (en-tête de `lib/learningGatingRuntime.js`) : seul le bouton
« Marquer comme… » valide une ressource. Le rebrancher aurait été un changement de comportement
métier que personne n'a demandé ; le laisser affiché aurait continué de mentir. Même raisonnement
pour la granularité `per_resource`, qui n'a pas de sens distinct maintenant que la politique par
ressource s'applique toujours : elle n'est plus proposée (et reste affichée, étiquetée « ancien
réglage », si une base la porte encore).

**Restent hors runtime, faute de contexte** : les surcharges de granularité **par chapitre**
(`gl_chapters.gating_granularity`) et **par scope lore** (`gl_qcm_lore_scopes.gating_granularity`).
L'accusé ne sait pas dans quel chapitre l'élève se trouve — une ressource n'appartient pas à un
chapitre. Elles restent lisibles via `GET /policy`, qui reçoit `chapterGranularity` de l'appelant.
`docs/API.md` le dit explicitement. À retirer si elles ne trouvent pas d'usage.

**F2 — un conditionnement ne s'applique que là où un humain l'a demandé.** Les liens créés
**automatiquement** (migration 144/145 et rapprochement de mots-clés à chaque import ou
enregistrement de question) passent en `is_gating = 0` : ils gardent leur valeur documentaire —
ils disent quelle question parle de quelle ressource — mais ne barrent plus la route. Deux volets :
la migration **194** rattrape l'existant (`origin = 'import'` uniquement, jamais `manual`), et les
six points de code qui les génèrent insèrent désormais `is_gating = 0` (`glQcmImport`,
`glQcmLoreImport`, `fmQuizImport`, `glQcmCrud`, `glQcmLoreCrud`, `fmQuizCrud`). Allumer
l'interrupteur global ne peut donc plus conditionner quoi que ce soit que personne n'a coché.

**Tests** : `tests/gl-learning-gating-modes.test.js` verrouille les trois modes, le bornage du
seuil, la dispense par ressource, l'assouplissement par ressource, la primauté de l'interrupteur
global et les deux granularités. Côté UI, `pendingChallengeQuestions` est testée sur le respect de
`pending_count` (et son repli sans le champ).

**Non corrigé** : J1 (contrôle serveur que le feuillet est accessible avant de le marquer étudié)
et J3 (ergonomie de la saisie des liens : sélecteur de ressource, contrôle d'existence, titres,
suggestions dans l'écran). Les deux sont des lots à part entière.

## Pour aller plus loin

[Audit — accès aux feuillets](AUDIT_FEUILLETS_ACCES.md) ·
[API — conditionnement du marquage](API.md#liens-ressources--questions--conditionnement-du-marquage) ·
[Doc de référence — QCM et pédagogie](reference/gl/qcm-et-pedagogie.md) ·
[Incohérences suivies (fiche G3)](reference/INCOHERENCES.md)
