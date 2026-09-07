# Audit — validation des ressources par quiz (septembre 2026)

> Troisième passe sur le dispositif qui subordonne la validation d'une ressource — « Marquer
> comme lu », « Espèce observée », « J'ai appris ce terme », « Marquer comme étudié » — à la
> réussite de questions de QCM rattachées. Il couvre **tous les aspects** du système, pour les
> **deux produits** (ForetMap et Gnomes & Licornes) : la décision serveur, les liens et leur
> création automatique, la base de données, l'expérience lecteur et enseignant, la documentation
> et la couverture de tests.
>
> Rédigé le 2026-09-07 sur `main` @ `ce3e216` (v1.147.3). Il **succède** aux deux audits d'août
> ([`AUDIT_GATING_2026-08.md`](AUDIT_GATING_2026-08.md), ForetMap ;
> [`AUDIT_GATING_QCM_FEUILLETS_2026-08.md`](AUDIT_GATING_QCM_FEUILLETS_2026-08.md), GL), dont
> il vérifie les points restés ouverts (C6, J1, J3) et qu'il ne répète pas.
>
> **Méthode et limites.** Lecture ligne à ligne de `lib/learningGating*.js`,
> `lib/gatingPolicy*.js`, `lib/shared/resourceQuestionGatingCore.js`,
> `lib/shared/gatingPolicyLayersCore.js`, `lib/shared/gatingSettingsCore.js`, `lib/shared/learningAckCore.js`, `lib/learningLinksBulk.js`, `lib/quizQuestionStats.js`,
> `lib/qcmChoices.js`, `lib/qcmPresentationUse.js`, `lib/glQcmAttempts.js`,
> `lib/glGatingChapterGranularity.js`, `lib/glLearnableResources.js`, des routes
> `routes/{learning-gating,learning-links,quiz,tutorials,plants,glossary}.js`,
> `routes/gl/{learning,learning-links,qcm}.js`, des migrations 107 → 211, des composants
> `src/shared/components/Learning*`, `src/shared/utils/learningGating*`, des panneaux
> prof/MJ des deux produits, de `docs/API.md`, `docs/reference/**`, `docs/EVOLUTION.md`, et
> de tous les tests `tests/`, `tests-ui/`, `e2e/` du périmètre. **Aucune base MySQL n'était
> disponible** dans la session : les tests backend n'ont pas été rejoués ; les six suites pures
> du cœur (56 cas) passent. Les constats sont des lectures de code, chacune citée par
> `fichier:ligne`, pas des relevés de production.

---

## 0. Verdict en une page

Le cœur de la décision est **sain et bien mutualisé** : une seule cascade de politique
(site → type → fiche → chapitre GL), un seul évaluateur de déblocage, un seul sérialiseur de
réponse pour les deux produits, et la garde est bien **côté serveur** à chaque accusé. Le jeton
de présentation ne porte jamais la bonne réponse, n'est utilisable qu'une fois, et les bonnes
réponses sont enregistrées inconditionnellement (activation rétroactive). Les constats
corrigés en août tiennent toujours.

Les problèmes sont ailleurs, en cinq familles :

1. **Deux réglages promis ne font pas ce qu'ils disent.** La portée de verrou **« question
   seule »** n'est relue par aucun chemin lecteur : en portée `question`, il n'y a **aucun
   verrou** (A1). Et l'agrégat prof « en attente / réussi / bloqué » (`GET …/progress`)
   **répond 500 systématiquement** depuis sa livraison — deux colonnes inexistantes, aucun
   test (A2).
2. **Le verrou est déclaratif.** Il ne se pose que si le client envoie le contexte ressource
   avec la réponse. Répondre depuis le Quiz libre — ou sans ce contexte — permet des essais
   illimités dont les bonnes réponses comptent quand même (A4). C'est un choix assumé en août
   (« le verrou ne se pose que depuis le flux de validation ») dont la conséquence n'avait pas
   été tirée : le dispositif ne pénalise que l'élève qui joue le jeu.
3. **Du conditionnement se crée encore sans qu'un humain l'ait coché**, malgré la migration 194 :
   un script en génère directement en approuvé + bloquant (B1), et les suggestions sont insérées
   bloquantes puis approuvables en un clic (B2).
4. **La base fuit.** Supprimer un joueur GL laisse ses tentatives, verrous et accusés
   (réattribuables au prochain identifiant, C1) ; chaque réponse de quiz ForetMap fait
   recharger tout le catalogue à toute la classe (C2) ; trois tables croissent sans purge (C6).
5. **L'écran ne dit pas toujours vrai** : le compteur « il te reste N erreurs » ne décompte
   jamais (A6), le piège de focus du panneau de question est inopérant (D1), et les
   préréglages par type s'affichent avec des valeurs de repli que « Enregistrer » écrirait
   (D2).

Classement : **6 constats rouges**, **13 orange**, le reste jaune ou vert. **Aucun ne compromet
le comportement observable avec le conditionnement éteint** (défaut). Avant toute activation
en classe, A1, A2, A4, B1, B2, C1 et C2 doivent être traités ; la section 5 propose l'ordre.

---

## 1. La chaîne, telle qu'elle est câblée aujourd'hui

```
Prof / MJ : liens (POST …/learning-links), politique (PUT …/policy, …/type-policy),
            réglages site (app_settings learning.gating.* / gl_settings gating.*)
                              │
                              ▼
Lecteur : liste → GET …/gating/summary?resourceType=&resourceRefs=a,b,c   (pastille, annonce)
        → clic  → GET …/gating/challenge?resourceType=&resourceRef=        (règles, ask_count)
                    getChallengeState()            lib/learningGatingAcknowledge.js:262
                      ├─ réglages site             getFmGatingSite / getGlGatingSettings
                      ├─ politique effective       lib/shared/gatingPolicyLayersCore.js:80
                      ├─ liens approuvés bloquants loadApprovedGatingLinks          :74
                      ├─ bonnes réponses connues   user_quiz_attempts / gl_qcm_attempts
                      └─ verrou (portée ressource) getResourceCooldownState          :372
        → question → GET  /api/quiz/questions/:code/present   (jeton HMAC + nonce + jti)
        → réponse  → POST /api/quiz/questions/:code/answer  + { resourceType, resourceRef }
                      ├─ consommation du jti          lib/qcmPresentationUse.js
                      ├─ INSERT user_quiz_attempts    routes/quiz.js:344
                      └─ verrou si faux ET contexte   registerFmCooldownOnWrongIfGating
        → accusé   → POST /api/tutorials/:id/acknowledge-read | /api/plants/:id/acknowledge-discovery
                     | /api/glossary/terms/:code/acknowledge | /api/gl/learning/…
                      └─ assertGatingSatisfiedForAcknowledge()  ← re-vérification serveur :407
```

Côté GL, même chaîne avec `/api/gl/learning/gating/*`, `/api/gl/{lore/,}qcm/questions/:code/*`
selon le `question_dataset` du lien, et la clé lecteur `(reader_user_type, reader_user_id)`.

---

## 2. Constats

Gravité : 🔴 à traiter avant activation · 🟠 défaut réel, contournable · 🟡 dette ou
incohérence · 🟢 propreté.

### A. Décision serveur et règles métier

#### 🔴 A1 — En portée « question seule », il n'y a aucun verrou

Le réglage `cooldown_scope = 'question'` (catalogue, `lib/shared/gatingSettingsCore.js:83-89`)
est documenté comme « le verrou porte sur la seule question ratée, l'élève pouvant poursuivre
sur les autres ». L'**écriture** est correcte : la ligne de verrou porte le code de la question
(`lib/learningGatingCooldown.js:57-59`, migration 200). Mais **aucune lecture lecteur ne la
relit** :

- `getChallengeState` appelle `getResourceCooldownState` **sans `questionCode`**
  (`lib/learningGatingAcknowledge.js:372-380`) → seules les lignes `question_code = ''` sont
  consultées ;
- le chemin groupé `loadResourceCooldownRows` filtre explicitement `question_code = ''`
  (`lib/learningGatingCooldown.js:207,216`) ;
- `assertGatingSatisfiedForAcknowledge` ne regarde que `state.cooldown.locked` (`:420`) ;
- ni `GET …/present` ni `POST …/answer` ne consultent la table des verrous
  (`routes/quiz.js:291-372`, `routes/gl/qcm.js:222-300`).

Conséquence : après une mauvaise réponse en portée `question`, l'élève redemande la même
question (nouveau jeton), répond, et valide. Le verrou n'existe que dans l'écran « Élèves
bloqués » du professeur, qui voit un blocage que rien n'applique. Le seul test de cette portée
vérifie la clé écrite, pas l'effet (`tests/learning-gating-cooldown.test.js:428-440`).

**Correctif.** Deux options, à trancher : (a) sémantique « poursuivre sur les autres » — le
challenge charge aussi les lignes `question_code IN (codes bloquants)` et retire de `questions[]`
celles verrouillées (une question verrouillée compte comme non posable ; en mode `all` la
ressource est alors `locked` avec le `remaining_days` le plus long) ; (b) au minimum, refuser
`present`/`answer` d'une question verrouillée pour ce lecteur avec le contexte ressource. Dans
les deux cas, un test HTTP « portée question : la question ratée n'est pas reposable avant N
jours » manque.

#### 🔴 A2 — `GET /api/learning-links/progress` répond 500 depuis sa livraison

`lib/learningGatingProgress.js` cite deux colonnes qui n'existent pas :

- `:61` — `WHERE r.slug LIKE 'eleve%' AND u.deleted_at IS NULL` : la table `users` n'a pas de
  `deleted_at` (`sql/schema_foretmap.sql:483-506`, aucune migration ne l'ajoute ; les
  suppressions sont dures, `lib/studentDeletion.js`). C'est la **première** requête de la
  fonction → `ER_BAD_FIELD_ERROR` quel que soit le type de ressource.
- `:44-46` — `FROM learning_acknowledgements WHERE resource_type = 'glossary' AND resource_ref = ?`
  : la table déclare `target_type` / `target_code` (migration 201:21-30).

L'écran prof avale l'erreur et masque la ligne « Suivi : N élève(s) en attente… »
(`src/components/pedago/admin/FMLearningLinksPanel.jsx:152,424`) — d'où le silence. Aucun test
backend n'exerce la route ; le test UI la mocke (`tests-ui/components/pedago/FMLearningLinksPanel.test.jsx:71`).

Une fois corrigé, deux défauts secondaires restent dans la même fonction : le N+1 (C4) et
`evaluateUnlock` appelé avec le seuil **non borné** (`:112`) alors que l'accusé le borne au
nombre de questions liées — un seuil de 5 sur 3 questions compterait tous les élèves « en
attente » alors que la validation les accepte.

#### 🟠 A3 — Le résumé GL compte les réponses de l'équipe quelle que soit la granularité

`buildGatingSummary` précharge, côté GL, les codes réussis **du lecteur et de son équipe**
sans condition (`lib/learningGatingSummary.js:135-138`), alors que `getChallengeState` n'ajoute
l'équipe qu'en granularité `team` (`lib/learningGatingAcknowledge.js:352-356`). En granularité
`player` (défaut), un joueur dont un coéquipier a réussi la question voit la pastille « acquis »
et le bouton sans annonce, puis le challenge lui pose la question — et l'accusé la refuse.
Le test « payload identique à l'algorithme unitaire » (`tests/learning-gating-summary-batch.test.js:199`)
ne couvre que ForetMap. **Correctif** : résoudre la politique (ou au moins la granularité
effective) avant le préchargement, ou ne précharger l'équipe que si le site est en `team`.

#### 🟠 A4 — Le verrou ne tient que par la bonne volonté du client

Le verrou n'est posé que si `POST …/answer` reçoit `resourceType`/`resourceRef` dans le corps
(`routes/quiz.js:119-130`, `routes/gl/qcm.js:286-292`) ; c'est le client qui les ajoute
(`src/shared/utils/learningGatingChallengeClient.js:28-34`). Or :

- les codes des questions bloquantes sont livrés au lecteur par le challenge (`questions[]`) ;
- `GET /api/quiz/questions/:code/present` est **public** et sans limite, et chaque présentation
  est un nouveau jeton (le `jti` protège une présentation, pas la question) ;
- les bonnes réponses données **sans** contexte comptent pour le conditionnement (choix F3,
  rétroactivité).

Donc : répondre depuis l'onglet Quiz (ou rejouer la requête sans le contexte) = essais
illimités, sans verrou, et la ressource se valide ensuite normalement. Le dispositif ne
pénalise que l'élève qui passe par le panneau. La documentation de référence promet pourtant
« une erreur bloquera la validation pendant N jours ».

Ce n'est pas une faille de sécurité — c'est un dispositif pédagogique — mais c'est un écart
entre la règle affichée et la règle appliquée, à trancher explicitement :

- **Option 1 — lier le contexte au jeton** : `present` accepte `resourceType`/`resourceRef` et
  les grave dans le jeton signé ; `answer` lit le contexte **du jeton**, jamais du corps. Le
  Quiz libre reste sans contexte ; mais une présentation demandée pour une fiche ne peut plus
  être répondue « en dehors ». Reste alors le contournement « répondre en Quiz libre d'abord »,
  qui est le choix de rétroactivité : le documenter comme tel.
- **Option 2 — assumer et le dire** : retirer de la doc de référence l'idée que l'erreur
  « coûte » quelque chose d'inévitable, et présenter le verrou comme un rythme conseillé.

#### 🟠 A5 — Une question désactivée reste bloquante

`loadApprovedGatingLinks` ne joint pas la table des questions (`lib/learningGatingAcknowledge.js:74-98`)
et `questionExists` accepte une question de tout statut à la création du lien
(`routes/learning-links.js:40-46`). Or `present`/`answer` exigent `statut = 'actif'`
(`routes/quiz.js:81-84`, `routes/gl/qcm.js:85`). Une question **archivée** (catalogue admin,
import) qui reste lien bloquant approuvé devient donc **impossible à réussir** : en mode `all`
ou `threshold` élevé, la ressource est définitivement insatisfiable, sans aucun signal — le
challenge la liste comme pending, le client demande sa présentation et reçoit 404. **Correctif** :
filtrer les liens par statut de question à la lecture (jointure ou `EXISTS`), et signaler dans
le panneau prof les liens bloquants dont la question est inactive.

#### 🟡 A6 — « Il te reste N erreurs » ne décompte jamais

Le client calcule les essais restants depuis `challenge.cooldown.wrong_attempts`
(`src/shared/utils/learningGatingChallengeClient.js:178-196`). Mais `resourceCooldownStateFromRow`
force `wrong_attempts` à 0 tant que le verrou ne court pas (`lib/learningGatingCooldown.js:176`),
et les lignes de comptage sous tolérance portent la sentinelle 1970, donc « non verrouillées ».
Résultat : après une première faute sur une tolérance de 2, un rechargement de page affiche à
nouveau « tu as droit à 2 erreurs ». Seule la réponse `answer` renvoie `attempts_left`, et le
panneau de question ne l'affiche pas. Le test UI « la tolérance déjà entamée est décomptée »
(`tests-ui/shared/learningGatingAnnounce.test.js:64`) valide une forme que le serveur ne produit
jamais. **Correctif** : renvoyer le compteur de la ligne de comptage (`wrong_attempts` même
non verrouillé, quand la ligne est une sentinelle), et l'afficher après chaque erreur.

#### 🟡 A7 — Le glossaire ForetMap est re-conditionné à chaque re-marquage

`POST /api/glossary/terms/:code/acknowledge` appelle la garde **sans `skipGating`**
(`routes/glossary.js:227-230`), contrairement aux tutoriels (`routes/tutorials.js:458`), aux
plantes (`routes/plants.js:243`) et à tous les accusés GL (`routes/gl/learning.js:100,256,315,344,385`).
Un terme déjà appris, puis verrouillé (ou dont on ajoute une question), ne peut plus être
re-marqué. Peu visible (le bouton est masqué quand `isDone`), mais incohérent.

#### 🟡 A8 — Le résumé ForetMap ne connaît pas les ressources déjà validées

`GET /api/learning/gating/summary` ne passe pas `isAlreadyDone` (`routes/learning-gating.js:52-71`),
contrairement à GL (`routes/gl/learning.js:127-134`). Le masquage est fait par le client
(`src/shared/utils/learningGatingState.js:57`), et `docs/API.md:2051` ne documente la garde que
côté GL. Les deux produits ne disent donc pas la même chose sur la même route.

#### 🟡 A9 — J1 (feuillet non découvert marquable par l'API) reste ouvert

`POST /api/gl/learning/mark/feuillet/:ref` ne vérifie que l'existence (`routes/gl/learning.js:375-377`,
`lib/glLearnableResources.js:87-95`). `loadPlayerFeuilletStates` (`lib/glLoreFeuillets.js:129`)
n'est toujours pas appelé depuis ce chemin. La doc de référence maintient la règle
(`docs/reference/gl/qcm-et-pedagogie.md:135`).

#### 🟢 A10 — Propreté

- `FALLBACK_MODE` est exporté et jamais utilisé (`lib/learningGatingAcknowledge.js:54,480`).
- `assertGatingSatisfiedForAcknowledge` recharge les liens déjà chargés par `getChallengeState`
  (`:447`) ; `getChallengeState` pourrait les renvoyer.
- Le challenge livre `effective_sources` et `granularity` (forcée `player`, source
  `fm_default`) à un élève ForetMap — sans gravité, mais non documenté et sans usage client.
- `SUMMARY_MAX_REFS = 200` tronque en silence (`lib/learningGatingSummary.js:118`) ; le
  plafond couvre les catalogues actuels, un `truncated` dans la réponse coûterait une ligne.

### B. Liens et conditionnement automatique

#### 🔴 B1 — `scripts/generate-linked-questions.js` crée des liens approuvés **et** bloquants

`scripts/generate-linked-questions.js:174-187` insère `is_gating = 1, status = 'approved',
origin = 'generated'` sans intervention humaine, pour les deux produits. C'est exactement ce que
la migration 194 a voulu proscrire (« un conditionnement ne s'applique que là où un humain a
coché bloquant », `migrations/194:10-11`), et son `UPDATE` de rattrapage ne le couvre pas : il
filtre `origin = 'import'` (`:23-24`). À l'allumage de l'interrupteur, ces liens bloquent
immédiatement — verrou de 3 jours à la première erreur. **Correctif** : `is_gating = 0` dans le
script, et étendre 194 (nouvelle migration idempotente) à `origin = 'generated'`.

#### 🟠 B2 — Les suggestions sont insérées bloquantes, puis approuvables en un clic

`POST /api/learning-links/suggest` (`routes/learning-links.js:669-673`) et
`scripts/suggest-learning-links.js:220-236` posent `is_gating = 1` sur des lignes `suggested`.
`reviewSuggestedLinks` (`lib/learningLinksBulk.js:104-108`) approuve ensuite **toute** une
ressource d'un coup, sans plafond, en ne touchant que `status`. Son commentaire affirme
« Approuver n'est pas conditionner » (`:73-74`) — ce n'est vrai que si `is_gating` valait 0 à
l'insertion. Un professeur qui approuve quarante propositions textuelles rend quarante questions
bloquantes. **Correctif** : `is_gating = 0` aux trois points d'insertion ; le caractère bloquant
redevient le geste ligne à ligne annoncé.

#### 🟠 B3 — `POST /api/learning-links` réécrit un lien existant en bloquant sans le dire

`sanitizeLinkInput` met `is_gating` à **`true` par défaut** quand le champ est absent
(`lib/shared/resourceQuestionGatingCore.js:121`) et normalise tout `origin` inconnu en `manual`
(`:51-54`). L'upsert `ON DUPLICATE KEY UPDATE is_gating = VALUES(is_gating), origin = VALUES(origin)`
(`routes/learning-links.js:92-95`, idem GL `:105-108`) transforme donc un lien d'import non
bloquant en lien bloquant, et efface l'origine historique (`axe3`, `point4`, migration 149),
sur un simple POST idempotent sans `is_gating`. Le PATCH est sain (n'écrit que les champs
présents). **Correctif** : défaut `false` à la création, et ne pas réécrire `is_gating`/`origin`
en `ON DUPLICATE` quand ils ne sont pas fournis.

#### 🟡 B4 — J3 : le contrôle d'existence de la ressource manque encore, des deux côtés

- **ForetMap** : le sélecteur avec titres et compteurs existe (`GET …/resources`,
  `FMLearningLinksPanel.jsx:358-375`) et le bouton « Proposer des liens » aussi. Mais
  `POST /api/learning-links` ne vérifie **jamais** que `resource_ref` désigne une ressource
  réelle (`routes/learning-links.js:68-116`) — seul l'écran protège.
- **GL** : rien de J3 n'est fait. Référence en texte libre (`GLLearningLinksPanel.jsx:232-238,294-300`,
  placeholder qui ne mentionne toujours pas les feuillets), aucun contrôle d'existence alors que
  `resourceExists` est disponible (`lib/glLearnableResources.js`), aucun titre de ressource ni
  de question dans le tableau (`:396-401`), aucune route `/resources` ni `/suggest` GL.

#### 🟡 B5 — Listes plafonnées en silence

`LIMIT 1000` sans total ni pagination sur la liste des liens des deux produits
(`routes/learning-links.js:61`, `routes/gl/learning-links.js:57`), alors que `/locks` expose
`max_rows`. Côté écran, le `<select>` des questions est tronqué à 200 en dur
(`FMLearningLinksPanel.jsx:181`) : au-delà, une question devient introuvable même par la
recherche. `MAX_STUDENTS = 500` de `/progress` n'est pas non plus exposé.

#### 🟢 B6 — Listes dupliquées

`GATING_GRANULARITIES` existe dans `resourceQuestionGatingCore.js:13` **et**
`gatingSettingsCore.js:21` ; `FM_MARKABLE`/`GL_MARKABLE`, `FORETMAP_RESOURCE_TYPES`/`GL_RESOURCE_TYPES`
et `LEARNABLE_RESOURCE_TYPES` (`lib/glLearnableResources.js:9`) doivent rester identiques sans
test croisé. La convention `resource_ref = '*'` (politique de type) n'est pas contrainte en
base : un code de ressource littéral `*` entrerait en collision.

### C. Base de données

#### 🔴 C1 — Supprimer un joueur GL laisse ses tentatives, verrous et accusés

`routes/gl/admin.js:553-561` et `lib/studentDeletion.js:68-73` ne purgent que `gl_team_members`,
`password_reset_tokens` et `gl_players`. **Rien** pour `gl_qcm_attempts` (migration 145:53-68,
sans FK), `gl_resource_gating_cooldowns` (165:25-36, sans FK) ni `gl_learning_acknowledgements`
(107:3-11, sans FK) — le lecteur y est un couple polymorphe, donc aucune cascade possible. La
migration 211 aggrave : `fk_gl_players_user … ON DELETE CASCADE` (211:220) détruit un `gl_players`
par cascade **sans passer par la route**. `gl_players.id` étant un AUTO_INCREMENT, un identifiant
réattribué (restauration, `scripts/fix-auto-increment.js`) **hérite des bonnes réponses, des
accusés et des verrous** du joueur supprimé : le conditionnement serait déjà satisfait pour lui.
Ce sont aussi des traces d'activité de mineurs qui survivent à la suppression du compte, alors que
ForetMap les efface bien (FK `CASCADE` sur `user_quiz_attempts`, `resource_gating_cooldowns`,
`learning_acknowledgements`). **Correctif** : purge applicative dans les deux chemins, sur
`reader_user_type = 'gl_player' AND reader_user_id = ?`, et un test qui compte les lignes restantes.

#### 🟠 C2 — Chaque réponse de quiz ForetMap fait recharger tout le catalogue à toute la classe

Aucune table de gating ForetMap n'est dans `SYNC_DOMAIN_TABLES` ni dans `SYNC_IGNORED_TABLES_RE`
(`database.js:146-220`). `collectSyncDomainsForWriteSql` (`:233`) retombe donc sur `bumpAll` pour
chaque `INSERT user_quiz_attempts` (`routes/quiz.js:344`), chaque verrou, chaque accusé glossaire,
chaque lien créé par un prof : **tous** les domaines de polling sont invalidés — plantes, tâches,
tutoriels, marqueurs — pour tous les clients connectés. C'est le motif corrigé en 2026-09 pour
`user_plant_observation_events` (audit biodiversité, B6), qui n'a pas été étendu aux quatre tables
voisines. Les tables `gl_*` sont bien ignorées par la règle de préfixe. **Correctif** : ajouter
`user_quiz_attempts|resource_question_links|resource_gating_policy|resource_gating_cooldowns|learning_acknowledgements`
à l'expression ignorée, avec le test de non-régression du même lot.

#### 🟠 C3 — Les statistiques par question sont gonflées par la jointure sur les liens

`listFmQuestionStats` joint `resource_question_links` en `LEFT JOIN` 1:N
(`lib/quizQuestionStats.js:48-65`) : `attempts` et `correct` sont multipliés par le nombre de liens
de la question. Le taux reste juste (même facteur des deux côtés) mais `HAVING attempts >= ?` et
le seuil `MIN_ATTEMPTS_FOR_FLAG = 5` sont faussés : une question à trois liens est signalée
« suspecte » avec deux tentatives réelles. La variante GL n'a pas le défaut (1:1). La requête
scanne par ailleurs toute la table des tentatives à chaque affichage. **Correctif** : `EXISTS`
pour `is_gating`, et un test « une question à N liens compte N fois moins ».

#### 🟠 C4 — `/progress` fait jusqu'à 1 001 requêtes en série

Une fois A2 corrigé, `getFmResourceProgressSummary` boucle sur 500 élèves avec deux requêtes
chacun (`lib/learningGatingProgress.js:108-132`). Le préchargement groupé écrit pour `/summary`
(`loadResourcePolicies`, `loadResourceCooldownRows`, `loadApprovedGatingLinksForRefs`) n'a jamais
été appliqué ici : une requête `user_quiz_attempts … WHERE question_code IN (codes) GROUP BY user_id`
et une lecture groupée des verrous suffisent.

#### 🟡 C5 — Index non couvrants sur les chemins les plus chauds

- `SELECT DISTINCT question_code FROM user_quiz_attempts WHERE user_id = ? AND is_correct = 1`
  (`lib/learningGatingAcknowledge.js:185-188`) — l'index `(user_id, answered_at)` ne couvre ni
  `is_correct` ni `question_code`. Appelé à chaque challenge et chaque résumé. Index conseillé :
  `(user_id, is_correct, question_code)`.
- `gl_qcm_attempts` : même motif (`lib/glQcmAttempts.js:57-63`), aggravé par la boucle sur les
  deux datasets ; index `(reader_user_type, reader_user_id, is_correct, question_dataset, question_code)`.
- `listGlCorrectQuestionCodesForTeam` (`WHERE team_id = ?`) ne tient que par l'index **implicite**
  de la FK `fk_gl_qcm_attempts_team` — supprimer la FK ferait basculer en scan complet.
- Écran des verrous avec `includeExpired=1` et filtre par type : aucun prédicat indexable
  (`lib/learningGatingAdmin.js:52-55`) → scan + tri, borné par `LIMIT 200`.

#### 🟡 C6 — Trois croissances sans purge

- `gl_qcm_presentation_uses` : une ligne **par réponse, des deux produits, anonymes compris**
  (`routes/quiz.js:333`, `routes/gl/qcm.js:267`, `routes/gl/lore.js`, `routes/gl/games/qcm.js`),
  inutile passé le TTL de 15 min. La migration 193 annonce « la table est purgeable » et un
  index pour le ménage ; **aucun `DELETE` n'existe** (ni `scripts/purge-audit-logs.js`, ni cron).
  Note d'isolement : ForetMap écrit dans une table `gl_*` (`gameId: null`), ce qui contredit la
  règle « aucune table partagée » de 145/165 et rend trompeuse l'exclusion `gl_*` de C2.
- `resource_gating_cooldowns` / `gl_*` : chaque faute sous tolérance crée une ligne **permanente**
  (sentinelle 1970, `lib/learningGatingCooldown.js:29-30,301-341`), jamais verrouillante, jamais
  purgée ; cardinalité `élèves × ressources × questions` en portée `question`. L'index
  `locked_until` est prêt pour un `DELETE … WHERE locked_until < NOW() - INTERVAL n DAY`.
- Les tables de tentatives ne sont pas purgeables telles quelles (rétroactivité, F3) : une
  rétention devra préserver au moins une bonne réponse par `(lecteur, question)`.

#### 🟡 C7 — Orphelins polymorphes

`resource_ref` n'a pas de FK (assumé, 144:11-12) et le « nettoyage applicatif » promis par le
commentaire de 144 n'existe pas. `lib/tutorialDedup.js:38` repointe `resource_question_links` et
`resource_gating_policy` lors d'une fusion, mais **oublie `resource_gating_cooldowns`** : un élève
reste verrouillé sur un tutoriel disparu, invisible dans l'écran des verrous (`resource_label`
NULL). Supprimer une plante ou un terme laisse liens, politiques et verrous. Côté GL, aucune FK
sur `question_code` non plus (145:10).

#### 🟢 C8 — Contraintes

Toutes les colonnes d'énumération sont des `VARCHAR` nus, validés en application (assumé). La
liste `LINK_ORIGINS` (`resourceQuestionGatingCore.js:14`) ignore `axe3` encore présent en base
(149:5), d'où la réécriture silencieuse de B3.

### D. Expérience lecteur et écrans prof/MJ

#### 🟠 D1 — Le piège de focus du panneau de question est inopérant

`useDialogA11y` capture premier et dernier focusables **une seule fois** (dépendances `[]`,
`src/shared/platform/useDialogA11y.js:61`). `LearningAcknowledgeButton` monte le popover en
phase `loading` (seul focusable : « Fermer ») puis remplace le contenu sans le remonter.
Résultat : depuis les choix de réponse ou « Valider ma réponse », **Tab sort du dialogue**
(`aria-modal="true"` promet le contraire). Échap et la restitution du focus fonctionnent.

#### 🟠 D2 — Les préréglages par type s'affichent avec des valeurs de repli

`GatingPolicyEditor` initialise son état une seule fois (`useState(init.…)`,
`src/shared/components/GatingPolicyEditor.jsx:94-102`, aucun `useEffect`). Dans les deux écrans
de réglages, il est monté **avant** que la politique de type soit chargée et sans `key` qui le
remonte (`FMLearningGatingSettings.jsx:256`, `GLGatingSettings.jsx:228` — le `key` est sur le
`<div>` parent). L'éditeur montre donc les défauts, et « Enregistrer » écrirait ces défauts par-dessus
la politique réelle. Les panneaux de liens sont corrects (`key={type}-{ref}`). Le seul test de
l'éditeur est un smoke test (`tests-ui/shared/GatingPolicyEditor.test.jsx`).

#### 🟡 D3 — Échec du challenge → « confirmer », et les 403 ne sont jamais lus

- Si `fetchChallenge` échoue (réseau, 5xx), le bouton passe directement en phase `confirm`
  (`LearningAcknowledgeButton.jsx:161-163`) : l'élève coche, envoie, et reçoit un 403 brut.
  Le serveur refuse bien, mais l'écran a promis le contraire.
- `missing_question_codes` n'est lu **nulle part** dans `src/` alors que six routes le renvoient ;
  aucune distinction 403 / 409 (« Présentation déjà utilisée ») / réseau, bien que `err.status`
  et `err.body` soient disponibles (`src/services/api.js:307-308`).

#### 🟡 D4 — Le résumé n'est pas rafraîchi partout

Pas de refetch après accusé dans `TutorialPreviewModal`, `PlantCatalogPreview` et tout GL
(`GLLearningAcknowledgeButton.jsx:40-51`, un appel par bouton) ; jamais de refetch après une
**réponse** (une pastille reste « ? » tant que la modale est ouverte). Le hook GL n'écoute pas le
changement de session (`useGlGatingSummary.js`, pas de `sessionEventName`). Deux composants montés
ensemble émettent deux requêtes pour la même ressource (aucune mutualisation).

#### 🟡 D5 — Tactile et styles

Choix de réponse à ~36 px (`src/index.css:3798-3806`) et boutons `btn-sm` sous le seuil de 44 px
fixé par le projet ; seul « Fermer » est conforme. Les règles `.learning-gating-quiz__question`,
`__code`, `__feedback`, `__cooldown` vivent dans `src/index.css:3782-3812`, que GL ne charge pas
(seul `learning-gating.css` l'est, `src/gl/main.jsx:19`).

#### 🟡 D6 — Écrans de réglages

- `GLGatingSettings` n'expose **ni** `gating.announce_on_button` **ni** `gating.state_icons`
  (formulaire arrêté à `granularity`, `:202-215`), alors que la doc MJ les promet
  (`docs/reference/gl/qcm-et-pedagogie.md:67,89`) et que l'API les accepte.
- `GatingPolicyEditor.jsx:247` propose `[0..5]` erreurs tolérées sur les couches héritables contre
  0–10 côté serveur : un préréglage à 7 n'est pas représentable.
- Les `min`/`max` HTML des champs numériques ne sont pas revalidés en JS (`readNumber` envoie tel
  quel) : le serveur borne en silence, l'écran garde l'autre valeur jusqu'au rechargement.
- Le compteur de tolérance n'apparaît que dans l'intro, jamais dans le panneau de question (A6).

#### 🟢 D7 — Propreté

`nullableNumberField(allowedWrong, setAllowedWrong)` passe deux arguments à une fonction qui n'en
déclare qu'un (`GatingPolicyEditor.jsx:117,145`) ; `String(challenge.mode || 'any')`
(`learningGatingChallengeClient.js:151`) code en dur un défaut qui contredirait le site s'il
manquait ; branches de repli `pending_count` conservées pour des serveurs qui n'existent plus.

### E. Documentation

#### 🟠 E1 — `docs/API.md` se contredit sur plusieurs points

- `auto_mark_on_correct` est encore listé parmi les réglages du site, FM (`:1978`) et GL (`:2074`),
  alors que `:2002-2003` dit qu'il a été **supprimé** — et qu'il l'est : `/api/settings` et
  `PUT /api/gl/learning-links/settings` le refusent (clé inconnue du catalogue).
- Le challenge FM est décrit « Types : `tutorial`, `plant` » (`:2026`) ; `glossary` est accepté
  depuis la migration 201 (`FM_MARKABLE`).
- Les types GL sont donnés à cinq (`:2039`) ; il y en a sept (`content_page`, `ecosystem`), comme
  le dit `:2093`.
- La liste des réglages GL (`:2072-2078`) omet `gating.allowed_wrong_attempts`,
  `gating.max_questions_per_session` et `gating.cooldown_scope`, pourtant exposés par l'écran.
- Trois lignes de tableau GL (`PUT /settings`, `/chapter-granularity`, `/scope-granularity`,
  `:2068-2070`) sont insérées dans le tableau ForetMap « glossaire validable » (quatre colonnes
  contre trois) : rendu cassé et rubrique fausse.
- `GET /api/gl/learning-links/settings` est en `gl.content.manage` (`routes/gl/learning-links.js:399`),
  pas `gl.settings.manage` comme le laisse entendre `:2040`.

#### 🟡 E2 — Commentaires et documents en retard

- En-tête de `routes/gl/learning-links.js:6-9` : « la politique par ressource … et la granularité
  ne sont PAS relues par le runtime » — faux depuis F1/F5, et la fiche J6 prétend l'avoir corrigé.
- `docs/EVOLUTION.md:74-82` classe le dispositif en « partiellement réalisé » avec un état d'août
  (mode `all` figé, essais illimités, `team`/`feuillet` « restant ») : tout est livré.
- `docs/AUDIT_GATING_2026-08.md:127` garde la ligne « Marquage automatique … Sans effet » dans le
  tableau, alors que C5 du même document annonce la suppression ; le tableau omet aussi
  `cooldown_scope`, `state_icons`, `require_linked_tutorials_before_task_done`.
- `docs/AUDIT_GATING_QCM_FEUILLETS_2026-08.md:437-439` décrit le client calé sur `pending_count` ;
  il l'est sur `ask_count` depuis le lot 28.
- `docs/reference/INCOHERENCES.md:259-276` (fiche G3) présente le dossier **✅ Livré** sans mentionner
  J1 et J3 ouverts.

#### 🟡 E3 — La doc de référence raconte le cas « tolérance 0 » comme s'il était le seul

`docs/reference/foretmap/taches-tutoriels-et-validation.md:374-375` et
`docs/reference/gl/qcm-et-pedagogie.md:87-88` : « Mauvaise réponse : le message de verrou ».
Avec une tolérance > 0, la première faute ne verrouille pas ; les deux documents le disent plus
loin (`:351`, `:148-150`) mais le récit du parcours reste faux. Le défaut de tolérance (0) n'est
pas énoncé côté GL. `require_linked_tutorials_before_task_done` est cité sur
`POST /api/tasks/:id/done` alors que la garde vit dans `routes/tasks/assignments.js:267`.

Aucun marqueur `🔧 À implémenter` lié au conditionnement n'est en attente.

### F. Tests

La couverture est **bonne sur le cœur** (modes, cascade, jeton, review en lot, résumé FM,
verrous FM, appariement) et **absente exactement là où les bugs ci-dessus se trouvent** :

| Trou                                                                                                                                                                                                                | Constat associé |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Aucun test HTTP de `POST …/answer` **avec contexte ressource** : ni l'écriture dans `user_quiz_attempts` (branche `auth?.userId`, `routes/quiz.js:344-350`) ni la pose du verrou par la route (`:119-130`)          | A1, A4          |
| `GET …/progress` et `lib/learningGatingProgress.js` : zéro test                                                                                                                                                     | A2, C4          |
| Résumé GL (`/api/gl/learning/gating/summary`) et verrous GL (`GET/DELETE /api/gl/learning-links/locks`) : zéro test                                                                                                 | A3              |
| Portée `question` : seule la clé écrite est vérifiée (`tests/learning-gating-cooldown.test.js:428`), jamais l'effet sur challenge / present / accusé                                                                | A1              |
| `GET/PUT /type-policy` (FM et GL) : zéro test, alors que les deux écrans de réglages en dépendent                                                                                                                   | D2              |
| `skipGating` (ré-observation, relecture, ressource GL déjà acquittée) avec un gating actif : non testé serveur                                                                                                      | A7              |
| 403 d'accusé **avec** `cooldown.locked` : jamais asserté                                                                                                                                                            | —               |
| Expiration du jeton (TTL 15 min) et réutilisation entre comptes : non testées                                                                                                                                       | —               |
| Suppression de compte : nettoyage FM (cascades) et GL (absent) non testés                                                                                                                                           | C1              |
| Imports GL écrivant `gl_resource_question_links` (`lib/glQcmImport.js:468`, `lib/glQcmLoreImport.js:473`) : non testés                                                                                              | B1              |
| `tests/learning-gating-cooldown.test.js` et `tests/learning-links-bulk.test.js` sont **entièrement sur faux `db`** : ils valident la logique et l'arité SQL, pas MariaDB (`ON DUPLICATE KEY`, fuseaux, concurrence) | A6              |
| UI : `LearningGatingQuestionPanel` (jeton, verrou, trois pieds d'action) sans aucun test ; `FMLearningGatingSettings` sans test ; `GatingPolicyEditor` un seul smoke test ; hooks de résumé seulement mockés        | D1, D2, D3      |
| e2e : `pedago-quiz.spec.js` ne joue que le Quiz libre, `gl-marker-question.spec.js` un appel API ; **aucun scénario** ne déroule question bloquante → refus → réponse → validation → verrou                         | —               |

Aucun test `skip`/`todo` dans le périmètre.

---

## 3. Ce qui tient bien

À préserver, pour ne pas le défaire par mégarde :

- **Garde serveur systématique** : les sept routes d'accusé rejouent `assertGatingSatisfiedForAcknowledge`
  quoi qu'ait fait l'écran ; l'interrupteur global reste maître ; le seuil est borné au nombre
  de questions ; les trois modes sont appliqués et testés (GL) ; la cascade et ses sources sont
  testées en pur.
- **Jeton de présentation** : HMAC de la bonne réponse + nonce, jamais la réponse en clair ; `jti`
  consommé par clé primaire (deux réponses simultanées ne passent pas toutes les deux) ; ancien
  format refusé ; brute-force sur un jeton bloqué et testé (`tests/quiz-api.test.js:118,138`).
- **Activation rétroactive** : tentatives écrites inconditionnellement, des deux côtés.
- **Chargement groupé du résumé** : coût SQL constant, payload prouvé identique au chemin unitaire
  (FM), plafond aligné sur le catalogue.
- **Verrou ciblé** : ne se pose que sur un lien bloquant approuvé de la ressource en cours ; le
  compteur de tolérance repart après expiration ; la sentinelle 1970 évite la remise à zéro à
  chaque faute (bug corrigé et commenté).
- **Imports et CRUD** : les six points de génération de liens insèrent bien `is_gating = 0`
  (F2 tient), et l'import FM est transactionnel.
- **Vue enseignante des verrous** : liste, portée, levée, `max_rows` exposé, 11 tests.
- **Réglages** : un seul catalogue, bornes identiques dans les deux écrans et le serveur, valeur
  inexploitable → défaut sans jamais casser une lecture ; réglages de présentation résolus côté
  serveur pour ne pas exposer les réglages prof.
- **`require_linked_tutorials_before_task_done` est réellement appliqué** (contrairement au
  soupçon) : `routes/tasks/assignments.js:267`, testé.
- **C6 (niveau scolaire)** reste bloqué pour la même raison qu'en août : aucune donnée de niveau
  sur `users` ni sur les groupes. La doc de référence le dit honnêtement.

---

## 4. Récapitulatif

| #   | Gravité | Sujet                                                                             | Où                                                                   |
| --- | ------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| A1  | 🔴      | Portée « question » : verrou écrit, jamais relu → aucun verrou                    | `learningGatingAcknowledge.js:372`, `learningGatingCooldown.js:207`  |
| A2  | 🔴      | `GET /learning-links/progress` : 500 systématique (2 colonnes inexistantes)       | `learningGatingProgress.js:45,61`                                    |
| A3  | 🟠      | Résumé GL compte l'équipe hors granularité `team`                                 | `learningGatingSummary.js:135`                                       |
| A4  | 🟠      | Verrou déclaratif : contournable par le Quiz libre / sans contexte                | `routes/quiz.js:119`, `qcmChoices.js`                                |
| A5  | 🟠      | Question archivée = lien bloquant insatisfiable                                   | `learningGatingAcknowledge.js:74`, `routes/learning-links.js:40`     |
| A6  | 🟡      | Compteur « il te reste N erreurs » jamais décompté                                | `learningGatingCooldown.js:176`                                      |
| A7  | 🟡      | Glossaire FM re-conditionné (pas de `skipGating`)                                 | `routes/glossary.js:227`                                             |
| A8  | 🟡      | Résumé FM sans `isAlreadyDone` (asymétrie GL)                                     | `routes/learning-gating.js:52`                                       |
| A9  | 🟡      | J1 toujours ouvert (feuillet non découvert marquable)                             | `routes/gl/learning.js:375`                                          |
| A10 | 🟢      | Export mort, double chargement, champs exposés sans usage                         | `learningGatingAcknowledge.js:54,447`                                |
| B1  | 🔴      | Script générant des liens approuvés **et** bloquants (hors rattrapage 194)        | `scripts/generate-linked-questions.js:177,186`                       |
| B2  | 🟠      | Suggestions insérées bloquantes, approuvées en lot sans plafond                   | `routes/learning-links.js:672`, `scripts/suggest-learning-links.js`  |
| B3  | 🟠      | POST idempotent qui rend bloquant et efface l'origine                             | `resourceQuestionGatingCore.js:121`, `routes/learning-links.js:92`   |
| B4  | 🟡      | J3 : pas de contrôle d'existence (FM, GL) ; GL sans sélecteur/titres/suggest      | `routes/gl/learning-links.js:65`, `GLLearningLinksPanel.jsx:294`     |
| B5  | 🟡      | `LIMIT 1000` / 200 / 500 muets                                                    | `routes/learning-links.js:61`, `FMLearningLinksPanel.jsx:181`        |
| B6  | 🟢      | Listes dupliquées sans test croisé, `'*'` non contraint                           | `resourceQuestionGatingCore.js:13`, `gatingSettingsCore.js:21`       |
| C1  | 🔴      | Suppression joueur GL : tentatives, verrous, accusés orphelins (id réattribuable) | `routes/gl/admin.js:553`, `lib/studentDeletion.js:68`                |
| C2  | 🟠      | Tables gating FM hors `SYNC_IGNORED_TABLES_RE` → bump de tous les domaines        | `database.js:219`                                                    |
| C3  | 🟠      | Stats par question gonflées (jointure 1:N), scan complet                          | `quizQuestionStats.js:58`                                            |
| C4  | 🟠      | `/progress` N+1 (jusqu'à 1 001 requêtes)                                          | `learningGatingProgress.js:108`                                      |
| C5  | 🟡      | Index non couvrants (tentatives FM/GL), index implicite de FK, scan des verrous   | migrations 126, 145, 165                                             |
| C6  | 🟡      | Trois croissances sans purge (jetons, lignes de comptage, tentatives)             | `gl_qcm_presentation_uses`, `*_gating_cooldowns`                     |
| C7  | 🟡      | Orphelins polymorphes ; `tutorialDedup` oublie les verrous                        | `lib/tutorialDedup.js:38`                                            |
| C8  | 🟢      | `axe3` hors `LINK_ORIGINS`                                                        | `resourceQuestionGatingCore.js:14`                                   |
| D1  | 🟠      | Piège de focus figé : Tab sort du panneau de question                             | `useDialogA11y.js:61`                                                |
| D2  | 🟠      | Préréglages par type affichés en valeurs de repli, enregistrables                 | `FMLearningGatingSettings.jsx:256`, `GLGatingSettings.jsx:228`       |
| D3  | 🟡      | Échec du challenge → « confirmer » ; `missing_question_codes` jamais lu           | `LearningAcknowledgeButton.jsx:161`                                  |
| D4  | 🟡      | Résumé non rafraîchi (aperçus, GL, après réponse)                                 | `GLLearningAcknowledgeButton.jsx:40`                                 |
| D5  | 🟡      | Cibles < 44 px ; CSS du quiz absent côté GL                                       | `src/index.css:3782-3812`                                            |
| D6  | 🟡      | Réglages GL sans annonce/pastilles ; select 0–5 vs 0–10 ; bornes non revalidées   | `GLGatingSettings.jsx:202`, `GatingPolicyEditor.jsx:247`             |
| D7  | 🟢      | Code mort et défauts codés en dur                                                 | `GatingPolicyEditor.jsx:145`, `learningGatingChallengeClient.js:151` |
| E1  | 🟠      | `docs/API.md` : réglage supprimé encore listé, types incomplets, tableau cassé    | `docs/API.md:1978,2026,2039,2068-2078`                               |
| E2  | 🟡      | Commentaire et documents périmés (GL links, EVOLUTION, audits, G3)                | `routes/gl/learning-links.js:6`, `docs/EVOLUTION.md:74`              |
| E3  | 🟡      | Récit « mauvaise réponse = verrou » ignore la tolérance                           | `docs/reference/**`                                                  |
| F   | 🟠      | Trous de tests exactement sur A1, A2, A3, A4, C1, D1, D2                          | voir §2.F                                                            |

---

## 5. Plan de traitement détaillé

> Mis à jour le 2026-09-07 après arbitrage du porteur du projet. Décisions prises : **le verrou
> doit être contraignant, avec une sévérité réglable par type de ressource** (choix 1) ; **J1**
> (contrôle d'accès au feuillet avant marquage) et **A8/A7** (parité du résumé et du glossaire
> ForetMap) sont retenus (choix 4 et 5). Deux choix restent ouverts et sont détaillés avec leurs
> variantes : la portée « question seule » (choix 2, lot 3) et le caractère bloquant des liens
> suggérés ou générés (choix 3, lot 4).
>
> Taille des lots : **S** = une demi-journée, **M** = un à deux jours, **L** = au-delà. Chaque lot
> est une PR ; chaque PR embarque ses tests, sa doc API et sa doc de référence (règle du projet).

### 5.0 Vue d'ensemble

| Lot | Objet                                              | Constats                   | Taille | Dépend de   | Arbitrage  |
| --- | -------------------------------------------------- | -------------------------- | ------ | ----------- | ---------- |
| 1   | Sûreté minimale, sans changement de sémantique     | C2, A2, C1, B1, tests CI   | S      | —           | aucun      |
| 2   | Verrou contraignant, réglable par type             | A4, A3, A5, A6, A7, A8, J1 | M      | 1           | pris       |
| 3   | Portée « question seule » : brancher ou retirer    | A1                         | S ou M | 2           | **ouvert** |
| 4   | Suggestions et génération : qui décide du bloquant | B2, B3 (+ B1 déjà en 1)    | S      | 1           | **ouvert** |
| 5   | Écrans lecteur et prof/MJ                          | D1–D6                      | M      | 2 (pour D6) | aucun      |
| 6   | Base et charge                                     | C3–C7                      | M      | —           | aucun      |
| 7   | Documentation et dette                             | E2, E3, B4, B5, G3         | S      | 2, 3, 4     | aucun      |

Ordre recommandé : **1 → 2 → 3 → 4**, puis 5, 6 et 7 en parallèle. Le lot 1 se fait tout de
suite, sans attendre les choix ouverts ; le lot 2 est le cœur de la décision prise ; les lots 3
et 4 sont courts et se décident à la lecture de leurs variantes ci-dessous.

### 5.1 Lot 1 — Sûreté minimale (S, aucun arbitrage)

Corrige ce qui est faux ou nuisible **même conditionnement éteint**. À livrer avant tout le
reste, y compris si le conditionnement n'est jamais activé.

| Constat | Changement                                                                                                                                                                                                                 | Fichiers                                                                                            | Test                                                                                                                                                |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| C2      | Ajouter `user_quiz_attempts`, `resource_question_links`, `resource_gating_policy`, `resource_gating_cooldowns`, `learning_acknowledgements` à l'expression des tables ignorées par la synchro (`SYNC_IGNORED_TABLES_RE`)   | `database.js:219`                                                                                   | Étendre le test de non-régression du lot B6 (audit biodiversité) : une écriture dans chacune de ces tables ne bumpe aucun domaine                   |
| A2      | `target_type`/`target_code` dans la requête glossaire ; retirer `u.deleted_at IS NULL` ; borner `evaluateUnlock` au seuil clampé (`requiredCorrectCount`)                                                                  | `lib/learningGatingProgress.js:44-46,61,112`                                                        | Nouveau `tests/learning-gating-progress.test.js` : 200 pour les trois types, agrégats `pending/satisfied/locked` sur 3 élèves fixés                 |
| C1      | Purge de `gl_qcm_attempts`, `gl_resource_gating_cooldowns`, `gl_learning_acknowledgements` sur `reader_user_type = 'gl_player' AND reader_user_id = ?` dans la transaction de suppression, **dans les deux chemins**       | `routes/gl/admin.js:553`, `lib/studentDeletion.js:68`                                               | Compter les lignes restantes après suppression, dans `tests/gl-players-delete*.test.js` (ou nouveau) ; couvrir aussi la cascade de la migration 211 |
| B1      | `is_gating = 0` dans les deux insertions du script, `status` inchangé ; migration **212** idempotente : `UPDATE … SET is_gating = 0 WHERE origin = 'generated' AND is_gating = 1` sur les deux tables (même forme que 194) | `scripts/generate-linked-questions.js:177,186`, `migrations/212_gating_generated_non_bloquants.sql` | `tests/migrations-unique-numbers.test.js` passe ; requête de contrôle du §6 vide après migration                                                    |
| CI      | Rendre robustes les deux tests instables observés sur la PR #431 : signer le jeton enseignant avec l'époque de session courante (`token_epoch`) et cibler un utilisateur créé par le test plutôt que `LIMIT 1`             | `tests/gl-mascots.test.js:327-360`, `tests/rbac.test.js:86-110`                                     | Le job `test` passe deux fois de suite                                                                                                              |

Critère de fin : `npm test` vert, `GET /api/learning-links/progress` répond 200 sur les trois
types, et une réponse au Quiz libre ne déclenche plus aucun rechargement chez les autres clients
(vérifiable avec `load/artillery-biodiv.yml`).

### 5.2 Lot 2 — Verrou contraignant, réglable par type (M, arbitrage pris)

**Décision.** Le verrou de re-tentative cesse d'être déclaratif. Sa sévérité devient un réglage
de la cascade existante (site → type `resource_ref = '*'` → fiche), donc **réglable par type de
ressource** sans nouveau mécanisme : un professeur peut rendre les tutoriels stricts et laisser
le glossaire souple.

**Le nouveau réglage `lock_mode`**, trois valeurs, du plus souple au plus strict :

| Valeur     | Ce que ça change                                                                                                                                                                                                                                                                                                             | Pour qui                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `advisory` | Comportement actuel : le verrou n'est posé que si la réponse arrive avec le contexte ressource envoyé par le client. Rien n'empêche de réviser la même question dans le Quiz libre.                                                                                                                                          | Entraînement, ressources où le verrou n'est qu'un rythme conseillé                                   |
| `flow`     | Le contexte ressource est **gravé dans le jeton de présentation** (`GET …/present?resourceType=&resourceRef=`) ; `POST …/answer` ne lit plus le corps mais le jeton. Une question présentée « pour la fiche » ne peut plus être répondue hors contexte. Le Quiz libre reste libre, et ses bonnes réponses comptent toujours. | **Défaut proposé** : ferme la manipulation sans rien changer pour l'élève honnête                    |
| `strict`   | En plus de `flow` : une question bloquante d'une ressource de ce type **n'est présentable que dans le flux de validation**. `present` sans contexte → 403 « question réservée à la validation de _titre_ », et `GET /api/quiz/draw` l'exclut du tirage. Chaque mauvaise réponse coûte donc réellement.                       | Ressources qui doivent être validées « pour de vrai » (tutoriels de sécurité, feuillets de chapitre) |

Deux garde-fous conservés : les bonnes réponses **passées** comptent toujours (activation
rétroactive, F3), et l'interrupteur global reste maître.

**Implémentation.**

1. _Catalogue_ — `lockMode` dans `lib/shared/gatingSettingsCore.js` (enum, défaut `flow`,
   `fmKey: 'learning.gating.lock_mode'`, `glKey: 'gating.lock_mode'`). Les deux écrans de réglages
   l'héritent automatiquement (registre dérivé).
2. _Cascade_ — colonne `lock_mode VARCHAR(16) NULL` (NULL = hériter) sur `resource_gating_policy`
   et `gl_resource_gating_policy` (**migration 213**, même forme que 203) ; `POLICY_PATCH_FIELDS`,
   `resolveEffectiveGatingPolicy`, `POLICY_COLUMNS`, `effectiveSources.lockMode`
   (`lib/shared/gatingPolicyLayersCore.js`, `lib/gatingPolicyRouteHelpers.js`) ; sélecteur dans
   `GatingPolicyEditor` (couches type et fiche, avec « hériter »).
3. _Jeton_ — `presentQuestion(row, glossaryTerms, { jwtKind, resource })` ajoute la claim
   `resource: { type, ref }` ; `verifyPresentationAnswer` la renvoie ; les quatre routes `answer`
   (`routes/quiz.js`, `routes/gl/qcm.js`, `routes/gl/lore.js`, `routes/gl/games/qcm.js`) passent
   `result.resource` au verrou et **ignorent** `req.body.resourceType/Ref` dès que la politique
   effective n'est pas `advisory`. Les routes `present` acceptent le contexte en query, vérifient
   que la ressource existe et que la question en est un lien bloquant approuvé (sinon 400), et
   appliquent `strict` : sans contexte, 403 si la question est bloquante d'au moins une ressource
   dont la politique effective est `strict`.
4. _Tirage libre_ — helper `listStrictGatingQuestionCodes(db, product)` (cache mémoire 60 s,
   invalidé à l'écriture d'une politique ou d'un lien) ; `GET /api/quiz/draw` et son équivalent GL
   excluent ces codes.
5. _Client_ — `presentQuestion(code, dataset, resource)` dans
   `src/shared/utils/learningGatingChallengeClient.js` transmet le contexte en query ;
   `LearningGatingQuestionPanel` le passe à la présentation comme il le passe déjà à la réponse.
   Le Quiz libre ne change pas. Message dédié pour le 403 `strict`.
6. _Constats voisins livrés dans le même lot_ — **A3** (le préchargement GL du résumé ne prend
   l'équipe que si la granularité effective est `team` : résoudre la politique de type avant de
   précharger, ou précharger deux ensembles) ; **A5** (`loadApprovedGatingLinks*` joignent le
   statut de la question : `EXISTS (SELECT 1 FROM quiz_questions q WHERE q.question_code = l.question_code AND q.statut = 'actif')`,
   et le panneau prof signale les liens bloquants dont la question est archivée) ; **A6**
   (`resourceCooldownStateFromRow` renvoie `wrong_attempts` d'une ligne de comptage même non
   verrouillée ; `LearningGatingQuestionPanel` affiche « il te reste N essai(s) » après chaque
   erreur, depuis `answer.cooldown.attempts_left`) ; **A7** (`skipGating` sur le glossaire ForetMap
   quand le terme est déjà appris) ; **A8** (`isAlreadyDone` dans le résumé ForetMap, lu dans
   `user_tutorial_reads` / `user_plant_observation_events` / `learning_acknowledgements`) ;
   **J1** (le résolveur `feuillet` de `lib/glLearnableResources.js` exige un état de progression
   du lecteur via `loadPlayerFeuilletStates`).

**Tests.** `tests/learning-gating-lock-mode.test.js` (FM) et `tests/gl-learning-gating-lock-mode.test.js`
(GL) : pour chacune des trois valeurs, présentation avec et sans contexte, réponse avec jeton
contextualisé, réponse avec corps trafiqué (ignoré), verrou posé ou non, tirage libre avec et
sans exclusion, cascade type → fiche. Un test HTTP du chemin complet « réponse fausse avec
contexte → verrou → 403 à l'accusé avec `cooldown` → levée par le prof → accusé 200 » (trou
n° 1 et n° 7 du §2.F). UI : `tests-ui/shared/LearningGatingQuestionPanel.test.jsx` (compteur,
403 strict, contexte transmis à `present`). e2e : un scénario `e2e/learning-gating.spec.js`
question bloquante → refus → réponse → validation.

**Doc.** `docs/API.md` (réglage, colonne, query de `present`, 403 strict, exclusion du tirage) ;
`docs/reference/foretmap/taches-tutoriels-et-validation.md` et
`docs/reference/gl/qcm-et-pedagogie.md` : un paragraphe « Trois sévérités de verrou » et la
correction du récit « mauvaise réponse = verrou » (E3).

Critère de fin : en `strict`, un élève ne peut pas obtenir la bonne réponse d'une question
bloquante hors du flux de validation, et le résumé, le challenge et l'accusé disent la même
chose sur la même ressource pour les deux produits.

### 5.3 Lot 3 — Portée « question seule » : brancher ou retirer (arbitrage ouvert)

**Ce que le réglage promet.** `cooldown_scope` vaut `resource` (défaut) ou `question`. En
portée `resource`, une mauvaise réponse verrouille **toute la fiche** N jours : plus aucune
question n'est posée, la validation est refusée. En portée `question`, seule la **question
ratée** est verrouillée : l'élève peut continuer sur les autres questions bloquantes de la fiche,
et la fiche se valide si la politique peut être satisfaite sans la question verrouillée.

**Ce que ça donne selon le mode** (avec deux questions bloquantes Q1, Q2 et un verrou sur Q1) :

| Mode        | Portée `resource`     | Portée `question`                                                                                                           |
| ----------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `any`       | fiche bloquée N jours | Q2 est posée tout de suite ; réussie → validation immédiate. **Le verrou ne coûte presque rien.**                           |
| `all`       | fiche bloquée N jours | Q2 peut être réussie maintenant ; la fiche reste bloquée jusqu'à la levée de Q1 (« une question se débloque dans N jours ») |
| `threshold` | fiche bloquée N jours | comme `any` si le seuil est atteignable sans Q1, comme `all` sinon                                                          |

Avec la tolérance d'erreurs, le compteur devient **par question** (c'est ce que l'écriture
actuelle fait déjà) : une tolérance de 1 sur cinq questions permet cinq fautes sans verrou.

**Aujourd'hui** : l'écriture est faite, la lecture ne l'est nulle part (constat A1) — en portée
`question`, il n'y a **aucun** verrou effectif, et le réglage n'a d'utilité réelle qu'en mode
`all` ou `threshold`, puisqu'en `any` (défaut) une seule bonne réponse suffit de toute façon.

**Variante A — brancher (M).**

- `getChallengeState` charge les verrous `question_code IN ('', …codes bloquants)` ; chaque entrée
  de `questions[]` porte `locked_until` ; les questions verrouillées sortent de ce qui est posé
  (`ask_count`) ; si `pending_count > 0` et plus rien n'est posable, `cooldown.locked = true` avec
  `scope: 'question'` et `remaining_days` = **la plus proche** levée ; `assertGatingSatisfied…`
  n'oppose le verrou que si la politique ne peut pas être satisfaite sans les questions
  verrouillées (`evaluateUnlock` sur les codes non verrouillés).
- Chemin groupé : `loadResourceCooldownRows` charge toutes les lignes des refs demandées et
  regroupe par `(ref, question_code)`.
- `present` / `answer` refusent (403 `{ error, cooldown }`) une question verrouillée pour ce
  lecteur quand le contexte est connu (donc toujours en `flow`/`strict`, lot 2).
- L'écran « Élèves bloqués » distingue déjà la portée (rien à faire).
- Tests : `any` et `all` avec verrou partiel, tolérance par question, chemin groupé identique au
  chemin unitaire (même patron que `learning-gating-summary-batch`).

**Variante B — retirer (S).** Même geste que pour `auto_mark_on_correct` en août : un réglage qui
ne fait pas ce qu'il dit use la confiance dans les autres.

- Retirer `cooldownScope` du catalogue (la clé devient refusée), retirer le sélecteur des deux
  écrans de réglages et de `GatingPolicyEditor` ; garder la colonne `question_code` (clé primaire,
  inoffensive, toujours `''`).
- Migration **214** : `DELETE … WHERE question_code <> ''` sur les deux tables (ces lignes n'ont
  jamais bloqué personne) ; `docs/API.md` et les deux docs de référence retirent la portée.
- Réversible : réintroduire = variante A, plus tard, si un professeur demande le mode « toutes ».

**Recommandation** : **B maintenant**, A seulement si le mode `all`/`threshold` est prévu pour
un type de ressource — auquel cas A se livre avec le lot 2, qui touche les mêmes fonctions.

### 5.4 Lot 4 — Suggestions et génération : qui décide du bloquant (arbitrage ouvert)

**La chaîne aujourd'hui.** Trois producteurs de liens non humains :

1. `POST /api/learning-links/suggest` (bouton « Proposer des liens », ForetMap) et
   `scripts/suggest-learning-links.js` (FM et GL, ligne de commande) → `status = 'suggested'`,
   **`is_gating = 1`**. Inertes tant que non approuvés.
2. `scripts/generate-linked-questions.js` → crée une **nouvelle question** dont la réponse est
   dans la ressource, et le lien en `status = 'approved'`, **`is_gating = 1`** : actif dès
   l'allumage (B1, corrigé au lot 1).
3. L'approbation **en lot** (`POST …/review` sans `ids`, « toute la fiche ») passe les
   propositions en `approved` sans toucher `is_gating` : quarante propositions textuelles
   deviennent quarante questions bloquantes en un clic, alors que le commentaire du code dit
   « approuver n'est pas conditionner ».

S'y ajoute B3 : `POST /api/learning-links` sur un couple existant sans `is_gating` le met à
`true` (défaut de `sanitizeLinkInput`) et réécrit `origin`.

**Variante A — non bloquant à l'insertion, bloquant à la main (S).** Recommandée.

- `is_gating = 0` aux trois insertions de suggestion (`routes/learning-links.js:672`,
  `scripts/suggest-learning-links.js:222,236`). Approuver ne conditionne alors jamais.
- Pour que « rendre bloquant » reste un geste rapide : nouvelle action
  `POST /api/learning-links/gating` `{ resourceType, resourceRef, is_gating, ids? }` (bornée à
  `BULK_MAX`), et un bouton dans le panneau « Rendre bloquantes les N questions approuvées de
  cette fiche », qui affiche **la phrase de politique effective** (`describeEffectiveGatingPolicy`)
  avant confirmation : « l'élève devra répondre correctement à 1 question sur 12 bloquantes ».
- B3 : défaut `is_gating = false` à la création, et l'`ON DUPLICATE KEY UPDATE` ne réécrit
  `is_gating` et `origin` que si le corps les fournit.
- Migration : aucune de plus (212 couvre `generated` ; les `suggested` non approuvés restent
  inertes et prennent la nouvelle valeur à la prochaine suggestion ; un `UPDATE` optionnel
  `WHERE status = 'suggested' AND is_gating = 1` peut aligner l'existant).

**Variante B — bloquant à l'insertion, mais l'approbation en lot désarme (S).** Garder
`is_gating = 1` à la suggestion ; `reviewSuggestedLinks` en forme « toute la fiche » force
`is_gating = 0`, la forme par `ids` le laisse. Deux formes, deux effets : source de confusion,
et l'écran ne peut pas le montrer simplement. Déconseillée.

**Variante C — avertir et confirmer (XS).** Ne rien changer aux données ; l'approbation en lot
affiche « N questions deviendront bloquantes » et demande confirmation. Le plus rapide, mais
contraire à la règle posée par la migration 194 (« un conditionnement ne s'applique que là où
un humain a coché bloquant ») et sans protection côté API.

**Recommandation** : **A**. Elle rétablit une règle unique, lisible par un professeur : _une
proposition, un import ou une génération ne conditionne jamais ; seul un clic « bloquant » le
fait, et l'écran dit alors ce que l'élève devra faire._

### 5.5 Lot 5 — Écrans (M, aucun arbitrage)

| Constat | Changement                                                                                                                                                                                                          | Fichiers                                                               | Test                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| D2      | `key` sur `GatingPolicyEditor` incluant l'identité de la politique chargée (ou `useEffect` de resynchronisation)                                                                                                    | `FMLearningGatingSettings.jsx:256`, `GLGatingSettings.jsx:228`         | Test UI : la politique chargée après montage s'affiche et « Enregistrer » l'envoie |
| D1      | `useDialogA11y` recalcule les focusables à chaque `keydown` Tab (pas de capture au montage)                                                                                                                         | `src/shared/platform/useDialogA11y.js:20-61`                           | Test UI : Tab depuis le dernier choix revient sur « Fermer »                       |
| D3      | Lire `err.status`/`err.body` : 403 → afficher `missing_question_codes` et le `cooldown` ; 409 → « présentation expirée, question rechargée » ; échec du challenge → phase `error` avec « réessayer », pas `confirm` | `LearningAcknowledgeButton.jsx:161`, `LearningGatingQuestionPanel.jsx` | Test UI par code d'erreur                                                          |
| D6      | Commandes `announce_on_button` et `state_icons` dans `GLGatingSettings` ; select 0–10 ; revalidation JS des bornes ; sélecteur `lock_mode` (lot 2)                                                                  | `GLGatingSettings.jsx`, `GatingPolicyEditor.jsx:247`                   | Tests UI existants étendus                                                         |
| D4      | Refetch du résumé après accusé dans `TutorialPreviewModal`, `PlantCatalogPreview`, `GLLearningAcknowledgeButton` ; après une réponse dans le panneau ; `sessionEventName` côté GL                                   | hooks de résumé et boutons                                             | Test UI : la pastille passe de « ? » à « ✓ » sans fermer la fenêtre                |
| D5      | 44 px sur les choix et boutons d'action ; déplacer les règles `.learning-gating-quiz__*` de `src/index.css` vers `src/shared/styles/learning-gating.css`                                                            | CSS                                                                    | Visuel, e2e du lot 2                                                               |

### 5.6 Lot 6 — Base et charge (M, aucun arbitrage)

| Constat | Changement                                                                                                                                                                                                                                       | Fichiers / migration                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| C3      | `EXISTS` au lieu du `LEFT JOIN` 1:N sur les liens ; test « une question à trois liens compte trois fois moins »                                                                                                                                  | `lib/quizQuestionStats.js:48-65`                                                                |
| C4      | Préchargement groupé de `/progress` : une requête `user_quiz_attempts … WHERE question_code IN (…) GROUP BY user_id`, une lecture groupée des verrous ; `MAX_STUDENTS` exposé                                                                    | `lib/learningGatingProgress.js:108-132`                                                         |
| C5      | Index `(user_id, is_correct, question_code)` sur `user_quiz_attempts` ; `(reader_user_type, reader_user_id, is_correct, question_dataset, question_code)` sur `gl_qcm_attempts`                                                                  | migration **215**                                                                               |
| C6      | `gl_qcm_presentation_uses` (`used_at < NOW() - INTERVAL 1 DAY`) et lignes de comptage 1970 (`updated_at < NOW() - INTERVAL 90 DAY`) ajoutées aux `TARGETS` de la purge ; la purge FM écrit-elle dans une table `gl_*` : à documenter ou renommer | `scripts/purge-audit-logs.js:59`                                                                |
| C7      | `resource_gating_cooldowns` dans `POLYMORPHIC_TABLES` de la déduplication ; suppression d'une plante / d'un terme : nettoyage des liens, politiques et verrous du couple `(type, ref)`                                                           | `lib/tutorialDedup.js:38`, routes de suppression                                                |
| B5      | `max_rows` et `total` sur les listes de liens ; `<select>` des questions filtré côté serveur (`q=`) plutôt que tronqué à 200                                                                                                                     | `routes/learning-links.js:61`, `routes/gl/learning-links.js:57`, `FMLearningLinksPanel.jsx:181` |

### 5.7 Lot 7 — Documentation et dette (S)

- E2 : `docs/EVOLUTION.md` (état réel du dispositif), `docs/AUDIT_GATING_2026-08.md` (ligne
  « marquage automatique », réglages manquants), `docs/AUDIT_GATING_QCM_FEUILLETS_2026-08.md`
  (`ask_count`), fiche **G3** de `docs/reference/INCOHERENCES.md` rouverte avec J3 côté GL.
- E3 : les deux docs de référence, après les lots 2 et 3 (une seule réécriture du récit du
  parcours).
- B4 côté GL (J3) : route `GET /api/gl/learning-links/resources?type=` alimentée par
  `glLearnableResources` (titre + compteurs), sélecteur dans `GLLearningLinksPanel`, contrôle
  d'existence à la création (400 explicite) dans les deux produits, titres dans le tableau. **M**,
  peut être un lot à part.
- B6 : un test croisé qui vérifie l'égalité des listes de types et de granularités dupliquées.

### 5.8 Séquence et jalons

```
Semaine 1   Lot 1 (PR)                      → CI verte, prod protégée (C2, C1)
Semaine 1   Décisions lots 3 et 4            → variantes B et A recommandées
Semaine 2   Lot 2 (PR)  + lot 3 si variante A
Semaine 2   Lot 4 (PR)  + lot 3 si variante B
Semaine 3   Lots 5 et 6 (PR séparées)        → écrans, base
Semaine 3   Lot 7                            → docs, G3, J3 GL
Ensuite     Activation en classe : requêtes du §6, réglages par type, `lock_mode` choisi
```

Numéros de migration réservés dans ce plan : **212** (lot 1, `generated` non bloquants), **213**
(lot 2, `lock_mode` et délai en heures), **214** (lot 4, propositions non bloquantes — le lot 3 a
retenu la variante A, qui n'en avait pas besoin), **215** (lot 6, index). À renuméroter si une PR
parallèle en prend un (règle `foretmap-pr-merge-conflict`).

### 5.9 Suivi de mise en œuvre (2026-09-07)

Arbitrages retenus : sévérité du verrou **réglable par type** (défaut `flow`, exemple tutoriels
`strict` / glossaire `advisory`) ; lot 3 en **variante A** (portée « question » branchée et
paramétrable) ; lot 4 en **variante A** (proposition jamais bloquante, action explicite) ; délai de
blocage par défaut ramené à **6 heures** (réglage en heures) ; écrans de réglage réécrits pour être
compris sans notice, textes élève en clair.

| Lot | État      | Contenu livré                                                                                                                                                                                       |
| --- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ✅ livré  | C2, A2, C1, B1 (migration 212), deux tests CI instables stabilisés.                                                                                                                                 |
| 2   | ✅ livré  | A4 (jeton contextualisé, `lock_mode` advisory/flow/strict, exclusion du tirage libre), délai en heures (migration 213), écrans en quatre étapes, A3, A5, A6, A7, A8, J1.                            |
| 3   | ✅ livré  | A1 : portée « question seule » branchée (challenge, résumé, accusé, agrégat prof), question verrouillée refusée dans le flux, textes élève.                                                         |
| 4   | ✅ livré  | B2 (propositions non bloquantes, migration 214), B3, action `POST …/gating` + bouton « Rendre bloquantes » (FM et GL).                                                                              |
| 5   | ✅ livré  | D1, D2 (test), D3, D4 (événement `learning-gating:changed`, `gl_session_changed`), D5, D6.                                                                                                          |
| 6   | ✅ livré  | C3, C4 (`max_students`), C5 (migration 215), C6 (purges), C7 (dédup + suppression de plante), B5 (`total`/`max_rows`, recherche serveur).                                                           |
| 7   | ◐ partiel | E1 (`docs/API.md`), E2 (EVOLUTION, G3), E3 (docs de référence FM et GL), B6 (test croisé des listes). **Reste : J3** (B4 côté GL : route `resources`, sélecteur avec titres, contrôle d'existence). |

Non traités, volontairement : A10, C8, D7 (🟢, dette mineure) ; J3 (lot à part : le contrôle
d'existence à la création casse les fixtures de tests qui créent des liens vers des références
fictives, à reprendre avec elles).

---

## 6. Requêtes de contrôle avant activation

À passer en production **avant** de basculer `learning.gating.enabled` / `gating.enabled`.

```sql
-- B1/B2 : liens bloquants approuvés que personne n'a cochés (doivent être vides après le lot 1)
SELECT origin, resource_type, COUNT(*) AS liens
  FROM resource_question_links
 WHERE status = 'approved' AND is_gating = 1 AND origin <> 'manual'
 GROUP BY origin, resource_type;
SELECT origin, resource_type, COUNT(*) AS liens
  FROM gl_resource_question_links
 WHERE status = 'approved' AND is_gating = 1 AND origin <> 'manual'
 GROUP BY origin, resource_type;

-- A5 : liens bloquants dont la question est archivée (insatisfiables)
SELECT l.resource_type, l.resource_ref, l.question_code
  FROM resource_question_links l
  JOIN quiz_questions q ON q.question_code = l.question_code
 WHERE l.status = 'approved' AND l.is_gating = 1 AND q.statut <> 'actif';

-- A1 : verrous de portée question posés (ils n'ont jamais bloqué personne)
SELECT COUNT(*) FROM resource_gating_cooldowns WHERE question_code <> '';
SELECT COUNT(*) FROM gl_resource_gating_cooldowns WHERE question_code <> '';

-- C1 : tentatives, verrous et accusés de joueurs GL disparus
SELECT COUNT(*) FROM gl_qcm_attempts a
  LEFT JOIN gl_players p ON p.id = a.reader_user_id
 WHERE a.reader_user_type = 'gl_player' AND p.id IS NULL;
SELECT COUNT(*) FROM gl_learning_acknowledgements a
  LEFT JOIN gl_players p ON p.id = a.reader_user_id
 WHERE a.reader_user_type = 'gl_player' AND p.id IS NULL;

-- C6 : volumes purgeables
SELECT COUNT(*) FROM gl_qcm_presentation_uses WHERE used_at < NOW() - INTERVAL 1 HOUR;
SELECT COUNT(*) FROM resource_gating_cooldowns WHERE locked_until < '1980-01-01';

-- C7 : verrous et liens orphelins (tutoriels)
SELECT c.resource_ref, COUNT(*) FROM resource_gating_cooldowns c
  LEFT JOIN tutorials t ON t.id = CAST(c.resource_ref AS UNSIGNED)
 WHERE c.resource_type = 'tutorial' AND t.id IS NULL GROUP BY c.resource_ref;
```

## Pour aller plus loin

[Audit ForetMap — août 2026](AUDIT_GATING_2026-08.md) ·
[Audit GL feuillets — août 2026](AUDIT_GATING_QCM_FEUILLETS_2026-08.md) ·
[API — conditionnement du marquage](API.md#liens-ressources--questions--conditionnement-du-marquage) ·
[Doc de référence ForetMap](reference/foretmap/taches-tutoriels-et-validation.md) ·
[Doc de référence GL](reference/gl/qcm-et-pedagogie.md) ·
[Incohérences suivies (fiche G3)](reference/INCOHERENCES.md)
