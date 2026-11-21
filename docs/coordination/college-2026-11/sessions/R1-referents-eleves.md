# Session R1 — Élèves référents automatiques des tâches récurrentes

> Section de session à coller dans une session Claude Code (modèle **Opus**), **précédée du
> tronc commun** (§ 1 du document d'orchestration du 21/11/2026), comme les sessions C et D.
> Intégrée à l'orchestration par S0 le 21/11/2026, après lecture du code (fiche de
> coordination, § 0 « E7 » et § 4 « R1 »).
>
> **Place dans l'ordre de lancement** : R1 ne dépend ni de S0 ni d'aucun flux collège. Elle se
> lance **tout de suite**, en parallèle des vagues A et B. Périmètre de fichiers disjoint de
> celui des douze flux collège (vérifié par S0) ; seul point de contact : le numéro de migration.

---

## A. Adaptations au mode orchestré (elles font foi sur le prompt d'origine, § B)

Le prompt d'origine (§ B) a été écrit pour une session isolée avec des points d'arrêt. Dans
l'orchestration, ces règles le remplacent là où ils divergent :

1. **Livrable indépendant du chantier collège.** Branche `feat/referents-eleves-auto` créée
   depuis **`origin/main`** (pas depuis `integration/college`), worktree `../ForetMap-r1`.
   PR **brouillon vers `main`**, passée en « Ready for review » quand le flux est fini. **Oliv
   relit et fusionne** ; aucune session ne fusionne. R1 ne passe pas par SI (la vérification de
   SI est propre au collège). En session cloud, si la poussée sur `feat/referents-eleves-auto`
   est refusée, pousser sur la branche attribuée par la plateforme et le noter en tête de PR.
2. **Migration.** Sur sa branche, R1 prend le **premier numéro libre de `main`** (au 21/11 :
   `378_task_referents_auto.sql`), sans trou (`tests/migrations-numbering.test.js`). La série
   collège occupe aussi `378` et suivants sur `integration/college` : **le premier arrivé sur
   `main` garde ses numéros, l'autre renumérote au-dessus.** Si la PR de SI fusionne avant R1,
   R1 rebase sur `main` et renomme son fichier ; si R1 fusionne avant, SI décale toute la série
   collège (prévu par la fiche). Pour que ce soit gratuit : le numéro n'apparaît **que** dans le
   nom du fichier ; tests et doc désignent la migration par son suffixe
   (`/_task_referents_auto\.sql$/`, « migration `task_referents_auto` »). À chaque mise à jour de
   la PR, vérifier les autres PR ouvertes qui ajoutent une migration (règle
   `.cursor/rules/foretmap-pr-merge-conflict.mdc`).
3. **Points d'arrêt (§ B.4) remplacés** par le tronc commun § 1.6 :
   - **autorisé sans demander** : commits, poussée de sa branche, PR brouillon vers `main`,
     passage en « Ready for review », migration sur sa base de test, lectures en production par le
     connecteur ;
   - **toujours interdit** : poussée ou fusion sur `main`, application de la migration en
     production, `--apply` du script de reprise en production, activation de
     `tasks.student_referent_enabled`, toute écriture en production, réécriture d'historique.
     Ces gestes restent à Oliv, après fusion et déploiement ; la PR les liste dans une rubrique
     « Mise en service (Oliv) ».
4. **Reconnaissance (§ B.2) sans attente.** Le rapport va dans le journal et en tête de la PR.
   Un écart qui change la conception ne bloque pas : R1 retient l'option **la plus prudente**,
   la met **derrière le réglage désactivé** (la fonction est inerte tant qu'Oliv ne l'active
   pas), et l'inscrit en tête de PR sous « Écart au prompt — décision attendue d'Oliv ».
   Exemple prévu par le prompt : si `assignmentIdentityJoin` ne se prête pas à une requête
   partagée par série, garder `countValidatedAssignmentsForStudent` intact et écrire la requête
   du moteur à côté, avec un test d'équivalence, plutôt que de modifier la règle de progression.
5. **Critères du lot 5 sur les données du 21/11.** Aucune session n'écrit en prod ; les
   critères se vérifient en deux temps :
   - **dans la session**, par une requête en **lecture seule** (`foretmap_sql_select`) qui
     reproduit le plan (comptes par élève et par série, seuil 2, groupe `moodle-26-n3`, séries
     ayant une occurrence active) et le compare aux liens existants : attendu 0 ajout, 0 retrait,
     12 liens adoptables. Résultat joint à la PR **anonymisé** (élève A : 9 séries, élève B : 2,
     élève C : 1), jamais un nom ni un identifiant de compte ;
   - **après déploiement, par Oliv** : `foretmap_ops script_dry_run` du script de reprise
     (simulation, puis `--adopt-existing` en simulation).
     Les tests du dépôt utilisent un **jeu fictif** de même forme (trois élèves, 9 / 2 / 1 séries,
     trois séries sans référent, une inscription ancienne sans identifiant de compte).
6. **Périmètre de fichiers** : fiche, § 4 « R1 ». Fichiers à ne pas toucher : ceux des flux
   collège (fiche, § 4) — aucun n'est nécessaire à R1. Les bornes (`MAX_TASK_REFERENTS` et
   nouvelles bornes, lot 9) vont dans un module serveur (`lib/tasks/`) et dans les métadonnées
   de réglages (`src/constants/settingsAdminMeta.js`) ; **pas de nouvelle paire**
   `scripts/sync-shared-cores.js` sauf nécessité démontrée (alors une ligne en fin de liste, à
   signaler : S0 y a déjà ajouté `pedagoVisibilityCore.js` sur `integration/college`).
   R1 livrant directement vers `main`, il écrit `CHANGELOG.md` sous `[Non publié]` (workflow
   normal de `CLAUDE.md`), pas `changelog.d/`.
7. **Journal et budget** (tronc commun § 1.7) : la branche partant de `main`, le journal est
   `docs/coordination/referents-2026-11/journal.md` ; commit et poussée après chaque lot. Le
   **dernier commit avant « Ready for review »** supprime ce dossier (son contenu passe dans la
   description de la PR) : rien de la coordination ne va sur `main`. Reprise : la même section +
   « REPRISE » ; le journal se lit sur `origin/feat/referents-eleves-auto`.
8. **Tests en parallèle** : session cloud = base `foretmap_test` propre au conteneur. Poste
   local : base `foretmap_test_r1`, port `3221` (fiche, § 3). Suites G&L **avant et après**
   (modules partagés : réglages, notifications, fusion de comptes, export RGPD, purge, RBAC) :
   `node --test --test-concurrency=1 --test-force-exit tests/gl-*.test.js tests/shared-cores-*.test.js`,
   plus `npm test` complet avant « Ready for review ».
9. **Ordre des lots conseillé** pour limiter les reprises : 1 (migration) → 9 en partie
   (extraction de la règle de progression, utilitaire de recopie des jonctions, avec leurs tests
   de caractérisation **avant** tout changement) → 2 → 3 → 4 → 5 → 7 → 8 → 6 → 10, puis le reste
   du lot 9. Un lot = un ou plusieurs commits, tests verts, journal à jour.
10. **Données** : aucun nom d'élève ni d'enseignant dans le code, les tests, la doc, la PR ou le
    journal (« les deux n3boss », « élève A »). Le groupe se désigne par son slug.

---

## B. Prompt d'origine (Oliv, 21/11/2026), à appliquer avec les adaptations du § A

_Rédigé le 21/11/2026 dans le projet Claude « foretmap », décisions d'Oliv intégrées le même
jour (§ B.5). État constaté : prod v1.251.x, schéma 377 ; dépôt `main` v1.259.8, dernière
migration `377_plants_entity_kind.sql`. (Note S0 : la prod est au schéma 377 sans migration en
attente ; l'écart de version de l'application est à confirmer en reconnaissance.)_

### B.0 Contexte

ForêtMap (foretmap.olution.info) organise les tâches des n3beurs (élèves, mineurs) sur l'espace
n³ du lycée. Il existe **20 séries récurrentes** (`tasks.recurrence` weekly / biweekly /
monthly), toutes sur la carte `n3`, dont 18 ont une occurrence active. Leurs référents sont
aujourd'hui les deux n3boss et un compte enseignant collectif ; trois séries n'ont aucun
référent.

**Objectif :** un élève du groupe n³ de l'année qui a réalisé au moins **N** occurrences
validées d'une même série (N = 2 par défaut, **réglable**) en devient automatiquement
référent, en plus des n3boss. **Être référent est une distinction pour l'élève (décision
d'Oliv) : par défaut, aucun plafond.** Un élève est référent de toutes les séries où il
remplit la condition. Des plafonds restent disponibles en réglage, désactivés (0).

**Ce qui existe déjà (à réutiliser, ne pas dupliquer) :**

- `task_referents (task_id, user_id)` ; un élève actif peut déjà être référent
  (`validateReferentUserIds`, `lib/tasks/taskService.js`, `MAX_TASK_REFERENTS = 15`).
- Le clonage récurrent recopie les référents de l'occurrence source (`lib/recurringTasks.js`,
  ~l. 393 et 497).
- **Règle de comptage retenue : celle de la progression n3beur** (décision d'Oliv), c'est-à-dire
  `countValidatedAssignmentsForStudent` dans `lib/rbac.js` : `t.status = 'validated'` et
  inscription rattachée à l'élève par `assignmentIdentityJoin` (identifiant de compte, et pour
  les inscriptions anciennes sans identifiant, prénom et nom). Elle diffère de la règle des
  badges (`creditedTasksQuery`, `lib/rewards/creditedTasks.js`), écart déjà documenté dans ce
  fichier. **Ne pas** recompter avec `task_assignments.done_at` : il reste NULL en
  `single_done` (mode de toutes les récurrentes).
- Série = `COALESCE(recurrence_series_id, task_id)`.
- Les lecteurs sans compte ne voient déjà pas les référents (`redactTaskForAnonymous`,
  `lib/tasks/assignmentVisibility.js`).
- Réglages : registre `lib/settings/tasks.js` (métadonnées d'interface :
  `src/constants/settingsAdminMeta.js`) ; job quotidien : `lib/dailyJobs.js` ; crochets
  post-validation : modèle `queueRewardsForTask` (`lib/rewards/hooks.js`) ; liste blanche des
  scripts d'exploitation : `lib/mcp/domains/opsScripts.js`.

**État des données au 21/11/2026 :** le groupe de l'année est `26#n3` (slug `moodle-26-n3`,
23 élèves, nettoyé le 21/11). Douze liens référent élève ont été posés à la main le 21/11 selon
la règle visée (seuil 2, sans plafond, séries ayant une occurrence active) : 9 séries pour un
élève, 2 pour un deuxième, 1 pour une troisième. Les n3boss ont été ajoutés sur les trois
séries qui n'avaient aucun référent. Le moteur doit retrouver exactement cet état (critères du
lot 5, vérifiés selon § A.5).

### B.1 Impacts Gnomes & Licornes

Les tâches sont propres à ForêtMap. Sont partagés et donc à tester côté G&L : registre des
réglages (`lib/settings*`), notifications (`lib/notificationEvents.js`, `lib/notifications.js`),
fusion de comptes (`lib/accountMerge.js`), registre d'export RGPD
(`lib/accounts/exportRegistry.js`), purge (`lib/retention/`), RBAC. **Zéro régression** :
suites G&L complètes avant et après.

### B.2 Phase de reconnaissance (avant tout code) — rapport attendu

1. Branche `feat/referents-eleves-auto` depuis `main` à jour. Noter version et dernière
   migration ; vérifier les PR ouvertes et la fiche de coordination du chantier collège
   (`docs/coordination/college-2026-11/fiche.md` sur `origin/integration/college`) pour le
   numéro de migration (§ A.2).
2. Lire : `lib/tasks/taskService.js` (référents, `setTaskReferents`), `lib/tasks/taskQueries.js`
   (`replaceTaskJoinRows`, chargement des référents), `lib/recurringTasks.js` (clonage),
   `lib/taskRouteHelpers.js` (`referentPublicLabel`, `enrichTaskRow`),
   `lib/tasks/assignmentVisibility.js`, `lib/rewards/creditedTasks.js`, `lib/rewards/hooks.js`,
   `lib/dailyJobs.js`, `lib/settings/tasks.js`, `lib/accountMerge.js`,
   `lib/accounts/exportRegistry.js`, `lib/notificationEvents.js`, `routes/tasks.js`
   (`/api/tasks/referent-candidates`), `src/components/tasks/TaskFormModal.jsx`,
   `src/components/tasks/TaskTileCard.jsx`, `lib/mcp/tools/domains/tasks.js`,
   `lib/mcp/domains/opsScripts.js`.
3. Tests existants : `tests/task-referents.test.js`, `tests/tasks-put-characterization.test.js`,
   `tests/rewards-engine.test.js`, `tests/notifications-events.test.js`,
   `tests/task-service.test.js`.
4. Rapport court : points d'accroche retenus, écarts avec ce prompt, risques (§ A.4 : sans
   attente).

### B.3 Lots

#### Lot 1 — Migration (`<n>_task_referents_auto.sql`, § A.2)

- `task_referents` : colonne `source ENUM('manual','auto') NOT NULL DEFAULT 'manual'` (valeurs
  en fin de liste si l'ENUM évolue), `added_at DATETIME NULL`. Les liens existants restent
  `manual`.
- Table `task_series_referent_vetoes` : `series_id VARCHAR(64)`, `user_id VARCHAR(64)` (FK
  `users.id`), `created_by VARCHAR(64) NULL`, `created_at DATETIME NOT NULL`, PK
  `(series_id, user_id)`, index `user_id`. utf8mb4.
- Idempotente (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`,
  `ADD FOREIGN KEY IF NOT EXISTS`), pas de trigger, testée deux fois sur copie fraîche.
- **Critères :** deux passes sans erreur ; `SHOW CREATE TABLE` conforme ; aucun lien existant
  modifié.

#### Lot 2 — Réglages

Dans `lib/settings/tasks.js` (scope `teacher`) :

- `tasks.student_referent_enabled` (booléen, défaut `false` ; activé par Oliv après
  déploiement).
- `tasks.student_referent_group_id` (chaîne, défaut vide = fonction inactive) : le groupe de
  l'année ; changé chaque rentrée.
- `tasks.student_referent_min_validations` (nombre, min 1, max 20, **défaut 2**).
- `tasks.student_referent_max_series_per_student` (nombre, 0 = illimité, max 50, **défaut 0**).
- `tasks.student_referent_max_students_per_series` (nombre, 0 = illimité, max 13, **défaut 0** ;
  la borne haute laisse la place aux référents enseignants sous `MAX_TASK_REFERENTS = 15`).
- `tasks.student_referent_inactivity_days` (nombre, min 0, max 730, **défaut 0 = retrait pour
  inactivité désactivé**) : au-delà de N jours sans réalisation de la série par l'élève, son
  lien `auto` est retiré (sans veto : il peut revenir s'il refait la série).
- `tasks.student_referent_notify_managers` (booléen, défaut `true`) : prévenir aussi les n3boss
  quand un élève devient référent (lot 7).
- Exposés dans le panneau de réglages existant (même composant que les autres réglages de
  tâches).
- **Critères :** valeurs bornées côté serveur ; un groupe inexistant ou inactif ⇒ moteur
  inactif, avec avertissement journalisé, sans erreur 500.

#### Lot 3 — Moteur `lib/tasks/studentReferents.js` (nouveau module, source unique)

`computeStudentReferentPlan({ dbx })` renvoie
`{ toAdd: [{seriesId, userId, count, lastValidatedAt}], toRemove: [...], kept: [...], skipped: [{…, reason}] }`
sans rien écrire ; `applyStudentReferentPlan(plan, { dbx, actor })` écrit en transaction.

Règles :

1. **Éligibles :** comptes élèves **actifs**, membres du groupe `student_referent_group_id`.
2. **Comptage : règle de la progression n3beur.** Extraire de
   `countValidatedAssignmentsForStudent` (`lib/rbac.js`) une requête partagée, par exemple
   `progressionCreditedTasksQuery({ userId? })` dans `lib/tasks/`, qui renvoie les couples
   (élève, tâche) crédités selon cette règle (`status = 'validated'` + `assignmentIdentityJoin`).
   `countValidatedAssignmentsForStudent` devient un simple `COUNT` sur cette requête, avec un
   résultat identique (test de caractérisation avant/après). Le moteur l'agrège par élève et par
   série (`COALESCE(recurrence_series_id, task_id)`), **toutes années confondues**, seulement
   pour les tâches récurrentes. Seuil : `count >= min_validations`. Dernière réalisation :
   `MAX(validated_at)`, à défaut la date d'inscription.
3. **Exclusions :** couple présent dans `task_series_referent_vetoes` ; série sans occurrence
   active (ni validée ni archivée).
4. **Plafonds et priorité :** sans plafond (défaut), tous les couples qui remplissent la
   condition sont retenus, dans la seule limite technique de `MAX_TASK_REFERENTS` (un
   dépassement est consigné dans `skipped` avec sa raison, jamais une erreur). Quand un plafond
   est actif, les liens élève **manuels** existants comptent dedans et l'attribution est
   gloutonne et déterministe, couples triés par :
   1. **priorité de la série** (décision d'Oliv) : d'abord les séries **sans aucun référent**
      sur leur occurrence active, puis les séries sans référent élève, puis les autres. La
      priorité se recalcule au fil de l'attribution : une série qui vient de recevoir un
      référent passe au palier suivant ;
   2. `count` décroissant ;
   3. dernière réalisation décroissante ;
   4. `user_id`.
      Un couple est retenu si les deux plafonds le permettent.
5. **Écriture :** le lien `source='auto'` est posé sur **toutes les occurrences actives** de la
   série (validées et archivées exclues). Le clonage recopiera ensuite les référents (lot 4).
6. **Retrait :** un lien `auto` est retiré des occurrences actives quand l'élève n'est plus
   éligible (sorti du groupe, compte désactivé, seuil relevé, groupe de l'année changé, veto)
   ou, si `student_referent_inactivity_days > 0`, quand sa dernière réalisation de la série est
   plus ancienne que ce délai. **Un lien `manual` n'est jamais retiré par le moteur.** Le moteur
   ne fait pas tourner les référents : un lien `auto` existant et toujours valide est conservé,
   même si un autre élève aurait une meilleure priorité.
7. **Veto :** quand un n3boss retire, via `PUT /api/tasks/:id` ou `set_links`, un référent élève
   `auto`, enregistrer `(series_id, user_id)` dans les vetos. Le moteur ne le reposera plus. Un
   ajout manuel ultérieur du même élève lève le veto.

Déclencheurs :

- après validation d'une occurrence récurrente, en tâche de fond, sur le modèle de
  `queueRewardsForTask`, limité à la série concernée ;
- après chaque clonage récurrent ;
- dans le job quotidien (`dailyJobs.js`, nouveau job `student_referents_sync`, lançable par
  `foretmap_ops run_cron`) ;
- à la modification d'un des réglages du lot 2 ou des membres du groupe de l'année.

Tous ces déclencheurs ne font rien si `student_referent_enabled` est faux. Chaque application
est tracée au journal d'audit (`student_referent_auto_add` / `_remove`, acteur `system`).

**Critères :** tests unitaires du plan (seuil, plafonds, priorité aux séries sans référent puis
sans référent élève, vetos, manuel jamais retiré, élève hors groupe, compte inactif, série sans
occurrence active, inactivité désactivée à 0 et active à N, égalités départagées) ; test de
caractérisation de `countValidatedAssignmentsForStudent` avant/après extraction (résultats
identiques pour tous les élèves d'une base de test, y compris inscriptions sans identifiant de
compte) ; idempotence (deux exécutions = un seul changement) ; aucune écriture quand la fonction
est désactivée.

#### Lot 4 — Clonage récurrent et services

- `lib/recurringTasks.js` : recopier `source` (et `added_at`) avec les référents. Un référent
  `auto` qui ne serait plus éligible au moment du clone est laissé au moteur, appelé juste
  après.
- `setTaskReferents` / `replaceTaskJoinRows` : préserver la colonne `source` des liens conservés
  lors d'un `PUT` ; un nouvel ajout par l'interface est `manual`.
- Les réponses tâche ajoutent `source` dans `referents_linked` (`'manual' | 'auto'`).
- **Critères :** `tests/tasks-put-characterization.test.js` et `tests/task-referents.test.js`
  étendus ; un `PUT` qui ne touche pas aux référents ne change aucune `source`.

#### Lot 5 — Script de reprise et connecteur MCP

- Script `scripts/student-referents-sync.js` : **simulation par défaut** (affiche le plan) ;
  `--apply` pour écrire ; `--adopt-existing` convertit en `auto` les liens élève manuels qui
  satisfont la règle.
- Ajouté à la liste blanche des scripts d'exploitation (`script_dry_run` / `run_script`,
  `lib/mcp/domains/opsScripts.js`), avec test.
- `foretmap_tasks` : action en lecture `student_referents` (plan courant, par série et par
  élève) ; décrire la colonne `source` dans la sortie de `get`.
- **Critères (données du 21/11, vérification selon § A.5)**, avec groupe = `26#n3` et réglages
  par défaut :
  - simulation ⇒ **0 ajout, 0 retrait** (les 12 liens posés à la main correspondent déjà à la
    règle) ;
  - `--adopt-existing` en simulation ⇒ ces 12 liens deviennent `auto`, rien d'autre ;
  - sur une copie de test où les liens référent élève ont été supprimés, simulation ⇒
    exactement ces 12 liens proposés ;
  - plafond par élève à 3 sur cette même copie ⇒ le premier élève ne reçoit que 3 séries,
    choisies selon la priorité du lot 3 ;
  - `inactivity_days` à 30 en simulation ⇒ retraits listés seulement parmi les liens `auto`
    (aucun lien manuel touché).

#### Lot 6 — Interface

- `TaskFormModal` : dans le sélecteur de référents, distinguer « auto » (pastille ou mention) ;
  le retrait d'un référent auto affiche une confirmation (« Il ne sera plus proposé
  automatiquement pour cette série »).
- `TaskTileCard` / fiche : un élève référent est présenté comme tel aux autres élèves connectés.
  **L'affichage de l'identité d'un référent élève suit la même règle que les inscrits**
  (`tasks.assignees_visibility`, `assignmentVisibility.js`) ; les n3boss restent toujours
  visibles. Le masquage pour les lecteurs sans compte est conservé (test de contrat).
- Styles par tokens (pas de hex ni de rem), composants existants, feuille de domaine (jamais
  `src/index.css`).
- **Critères :** tests UI du sélecteur ; aucun nom de référent élève dans une réponse anonyme
  (`GET /api/tasks` sans session, Visite, plans `plan` / `staff` / `enov`).

#### Lot 7 — Notification

- Nouvel évènement `task_referent_granted` adressé à l'élève, une fois par série (pas à chaque
  clone) : « Tu es désormais référent·e de la tâche « … » ». Le texte n'invite pas à manipuler
  des êtres vivants.
- **Décision d'Oliv : les n3boss sont aussi prévenus** (si `student_referent_notify_managers`),
  par un évènement `task_referent_granted_manager` (« [Élève] devient référent·e de « … » »)
  adressé aux comptes qui détiennent `tasks.manage`, sur le modèle des destinataires de
  `task_done`. Un retrait automatique prévient les n3boss, pas l'élève.
- Respecte les préférences de notification existantes (les deux évènements sont désactivables
  dans les préférences).
- **Critères :** `tests/notifications-events.test.js` étendu ; aucun envoi en double après
  clonage ; aucun envoi aux n3boss quand le réglage est faux.

#### Lot 8 — Données personnelles

- `task_series_referent_vetoes` : ajout au registre d'export RGPD, à la fusion de comptes
  (`lib/accountMerge.js` : réaffectation, doublon de PK géré) et aux nettoyages de comptes et à
  la purge de conservation (même durée que `task_referents`).
- Ne rien retirer de l'existant (notice, purge).
- **Critères :** test de fusion (deux comptes ayant chacun un veto sur la même série ⇒ une seule
  ligne) ; test d'export.

#### Lot 9 — Refactorisation du périmètre (obligatoire)

- `lib/recurringTasks.js` : la recopie des jonctions (zones, repères, tutoriels, référents,
  espèces) est faite à la main, table par table ; la remplacer par un utilitaire unique fondé
  sur `replaceTaskJoinRows` (`lib/tasks/taskQueries.js`).
- Un seul chargeur des référents d'une tâche (doublon `taskQueries.js` ~l. 329 /
  `recurringTasks.js` ~l. 393).
- `MAX_TASK_REFERENTS` et les nouvelles bornes dans un module partagé (§ A.6 : module serveur
  `lib/tasks/` + métadonnées de réglages), plus aucune valeur en dur.
- Code mort repéré dans la zone touchée : retiré.
- Extraction de la règle de progression en requête partagée (lot 3, point 2) : `lib/rbac.js` et
  le moteur la consomment ; plus aucune recopie du critère `status = 'validated'` +
  `assignmentIdentityJoin` ailleurs dans le périmètre touché.
- **Dette à signaler, sans la corriger ici :** deux règles de crédit coexistent, celle de la
  progression (désormais partagée, suivie par les référents) et celle des badges
  (`creditedTasksQuery` : exige `validated_at`, la part faite en mode collectif, exclut la tâche
  « test », ignore les inscriptions anciennes sans identifiant). Mettre à jour le commentaire
  d'écart de `lib/rewards/creditedTasks.js` pour mentionner les référents. Unification à mener
  dans un chantier dédié.
- **Critères :** suites ForêtMap et G&L vertes avant et après ; aucun changement de comportement
  hors fonctionnalité.

#### Lot 10 — Documentation

- `docs/API.md` : section Référents (colonne `source`, vetos, réglages, évènement de
  notification) ; référence des réglages ; section du connecteur MCP (`docs/MCP.md`, ligne
  `foretmap_tasks`) ; `docs/CRONTAB.md` pour le nouveau job.
- Doc de référence fonctionnelle : `docs/reference/foretmap/taches-tutoriels-et-validation.md`
  (comportement visible : référents élèves, pastille « auto », notification) et la référence des
  réglages concernée.
- Note de structure (nouvelle table, nouvelle colonne) pour les sessions Claude suivantes.

### B.4 Points d'arrêt

Remplacés par § A.3 dans l'orchestration.

### B.5 Décisions d'Oliv (21/11/2026) et points restant à remonter

Décisions, intégrées aux lots :

1. **Les n3boss sont prévenus** quand un élève devient référent (lot 7, réglable).
2. **Pas de retrait pour inactivité au départ**, mais réglable
   (`student_referent_inactivity_days`, défaut 0, lot 2).
3. **Priorité aux séries sans référent** quand un plafond est actif (lot 3, point 4).
4. **Le comptage suit la progression n3beur**, pas les badges (lot 3, point 2).
5. **Être référent est une distinction : pas de plafond par défaut.** Un élève est référent de
   toutes les séries où il remplit la condition. Les plafonds restent réglables (lot 2, défaut
   0). La décision 3 ne s'applique que si un plafond est activé.

À remonter plutôt que trancher (§ A.4) : tout écart constaté en reconnaissance entre ces
décisions et le code (par exemple si `assignmentIdentityJoin` ne se prête pas à une requête
partagée par série).

### B.6 Rappels

- Migrations idempotentes, utf8mb4, vues `SQL SECURITY INVOKER`, pas de trigger.
- Écritures de tâches par les services (pas de SQL brut contournant la logique) ; le moteur
  passe par les helpers de `taskQueries`.
- Aucun livrable décrivant une faille, aucun nom d'élève dans le code, les tests ou la
  documentation (données de test fictives).

### B.7 Fin de flux

Tous les lots faits, tests verts (ForêtMap, G&L, UI, contenu, build), journal supprimé de la
branche (§ A.7), PR « Ready for review » vers `main` avec : rapport de reconnaissance, fichiers
modifiés, migration (suffixe), tests ajoutés, résultat anonymisé de la vérification en lecture
seule (§ A.5), écarts au prompt, rubrique « Mise en service (Oliv) » : application de la
migration, `script_dry_run` puis `--adopt-existing`, réglage du groupe `moodle-26-n3`,
activation de `tasks.student_referent_enabled`.
