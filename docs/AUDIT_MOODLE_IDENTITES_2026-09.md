# Cadrage — lien utilisateurs Moodle 5.2 ↔ ForetMap / Gnomes & Licornes

> Septembre 2026. Fait suite à `AUDIT_COMPTES_2026-09.md` (identités unifiées : un compte
> `users` par personne, porteur des secrets, référencé par `gl_players`). Ce document cadre la
> synchronisation des cohortes et groupes Moodle vers ForetMap et G&L, avec **tous les
> garde-fous** nécessaires pour qu'une rentrée de plusieurs centaines d'élèves se passe sans
> doublon, sans perte et sans surprise. Rien de ce qui est décrit ici n'est encore implémenté ;
> la section 9 donne les lots.

## 1. Situation de départ

| Population                | Moodle                                                                                      | ForetMap                                  | G&L                            |
| ------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------ |
| Sixièmes                  | cohortes `26#601-602`, `26#603`… ; cours par chapitre avec groupes classe et groupes équipe | inscrits, **visiteur** (pas de tâches)    | **joueurs**, équipes variables |
| n3beurs (tous niveaux)    | cohorte `26#n3`                                                                             | groupe n3beur, **tâches** de tous niveaux | non                            |
| Autres élèves de l'année  | cohorte `26#Nxx`                                                                            | connexion libre, visiteur, pas de tâches  | non                            |
| Élèves des années passées | cohortes `25#…`, encore inscrits aux anciens cours                                          | aucun accès, sauf exception               | non                            |
| Enseignants               | inscrits aux cours, pas en cohorte                                                          | comptes `teacher`, RBAC                   | MJ / admin via `gl_admins`     |

Conventions Moodle (site `https://olution.info`, Moodle 5.2 ; services web et protocole REST
déjà actifs, vérifié : le point d'entrée `webservice/rest/server.php` répond `invalidtoken`) :

- **Cohortes** : nom et `idnumber` `année#classe` (`26#614`), `année#niveau` (`26#6`), et une
  cohorte peut réunir **deux classes enseignées ensemble** (`26#601-602`). La cohorte des
  n3beurs est **`26#n3`**. La synchronisation lit l'`idnumber` ; le nom sert d'affichage.
- **Cours chapitre** : un cours Moodle par chapitre G&L, désigné par son **identifiant
  numérique** (celui de l'adresse `course/view.php?id=…`). Confirmé : **chapitre 1 → cours
  `564`** (`https://olution.info/course/view.php?id=564`). Les numéros `601`, `602`… relevés
  auparavant appartiennent aux **classes et cohortes**, pas aux cours : les deux séries sont
  indépendantes et ne doivent pas être confondues. La correspondance chapitre ↔ cours est une
  **table de réglage explicite**, pas un motif d'`idnumber` : elle se remplit une fois par an
  et ne dépend d'aucune convention de nommage.
- **Groupes classe des cours chapitre** : créés par la méthode d'inscription « synchronisation
  de cohorte » de Moodle, ils portent le nom de la cohorte préfixé (« Cohorte 26#601-602 »).
  Le groupe classe d'un cours se retrouve donc par ce nom, ou mieux par son `idnumber` si la
  méthode d'inscription le renseigne.
- **Groupes équipe** : nom non fixé à ce jour ; convention proposée en section 8.

**Google OAuth 2 est actif des deux côtés** (Moodle et ForetMap), sur l'annuaire Workspace du
lycée.

## 2. Principes

1. **Une personne = un compte `users`**, quel que soit le produit ou la source. Moodle n'est
   pas un troisième magasin d'identité : c'est un **partenaire d'appartenances**. La
   synchronisation est **bidirectionnelle**, mais chaque objet a **un seul maître** : Moodle
   pour les cohortes (classes, niveaux, n3beurs), ForetMap / G&L pour les équipes de jeu et
   les sous-groupes qu'ils composent (section 8). Le maître écrit, l'autre côté reflète ;
   une modification faite du mauvais côté est **détectée**, jamais écrasée en silence.
2. **L'e-mail institutionnel est le pivot.** Il est garanti par Google Workspace des deux côtés
   : Moodle le connaît pour chaque compte OAuth 2, ForetMap rapproche déjà une connexion Google
   au compte élève ou enseignant qui porte cet e-mail (`routes/auth.js`, callback Google). La
   synchronisation n'a donc **jamais** à gérer de mot de passe : elle pose l'e-mail, et la
   première connexion Google atterrit sur le bon compte.
3. **Rapprocher avant de créer, ne jamais toucher à ce qu'on n'a pas créé.** Un compte
   préexistant est lié, pas remplacé ; un compte hors Moodle est laissé intact.
4. **Jamais de suppression automatique.** Le pire que la synchronisation puisse faire est
   désactiver un compte qu'elle a créé, et le dire.
5. **Simulation d'abord, seuils de sécurité, journal, retour arrière.** Toute exécution réelle
   est précédée d'une simulation, bornée par des seuils, journalisée action par action, et
   réversible.

## 3. Modèle de données (côté ForetMap)

```
external_identities   provider ('moodle' | 'lti'), issuer (URL du site), external_id,
                      external_idnumber, user_id → users.id, origin ('created' | 'linked'),
                      linked_at, last_seen_at
external_groups       provider, issuer, external_id, external_idnumber, kind ('cohort' |
                      'course_group'), master ('moodle' | 'foretmap'), name,
                      group_id → groups.id, gl_class_id (nullable), gl_team_id (nullable),
                      policy_key, last_synced_at, last_synced_hash (empreinte de la liste
                      des membres telle que vue des deux côtés à la dernière synchronisation)
external_group_members external_group_id, user_id, source ('sync' | 'manual'), synced_at
sync_conflicts        external_group_id, user_id, moodle_state, foretmap_state, detected_at,
                      resolved_at, resolution ('keep_master' | 'apply_other' | 'ignore')
sync_runs             id, provider, started_at, finished_at, mode ('dry_run' | 'apply'),
                      actor, totals_json, report_json, status
sync_actions          run_id, kind, target_type, target_id, before_json, after_json
                      (journal réversible)
users.sync_exempt     TINYINT : compte marqué « hors synchronisation » par un administrateur
```

`origin` distingue un compte **créé** par la synchronisation d'un compte **existant rapproché** ;
`source` distingue une appartenance posée par la synchronisation d'un ajout manuel. Ces deux
drapeaux décident de tout ce que la synchronisation a le droit de défaire. `master` dit dans
quel sens un groupe se synchronise ; `last_synced_hash` permet la comparaison **à trois** (état
Moodle, état ForetMap, dernier état commun) qui distingue « changé côté maître » (à propager)
de « changé côté reflet » (conflit à présenter, jamais écrasé automatiquement).

Le fournisseur `auth_provider` d'un compte créé vaut `moodle`. Un compte miroir G&L
(`gl_bridge`) rapproché **cesse d'être un miroir** : son fournisseur passe à `moodle`, sinon la
suppression du joueur l'emporterait (`DELETE /api/gl/admin/players/:id`).

## 4. Politique par motif de cohorte

Réglages administrateur (`integration.moodle.*`) : URL du site, année en cours (`26`), et une
table de politiques par motif d'`idnumber`. Le jeton Web Service reste dans `.env`
(`MOODLE_WS_TOKEN`), jamais en base ni en réglage.

| Motif                  | Groupe ForetMap                                 | Rôle par défaut | n3beur | Classe G&L | Comptes                              |
| ---------------------- | ----------------------------------------------- | --------------- | ------ | ---------- | ------------------------------------ |
| `26#6`                 | groupe parent « 6e » (`unit`)                   | aucun           | non    | non        | portés par les classes               |
| `26#6xx`, `26#6xx-6yy` | classe (ou binôme de classes), enfant du niveau | `visiteur`      | non    | **oui**    | créés ; joueurs G&L créés            |
| `26#n3`                | groupe n3beurs, `grants_n3beur_access`          | `eleve_novice`  | oui    | non        | créés                                |
| `26#[2-5]xx`           | classe, enfant du niveau                        | `visiteur`      | non    | non        | créés (ou à la 1ʳᵉ connexion Google) |
| autre année            | ignoré                                          |                 |        |            | créés par la sync → désactivés       |

Un n3beur est dans sa classe (visiteur) **et** dans le groupe n3beurs : la résolution de rôle
retient le plus élevé, il est donc n3beur. Le groupe classe ne doit jamais forcer `visiteur`.
Une cohorte binôme (`26#601-602`) donne **un** groupe ForetMap et **une** classe G&L : c'est
l'unité qui joue ensemble. Si les deux classes doivent aussi exister séparément (appel,
statistiques), deux sous-groupes `class_code` `601` et `602` sont créés sous le binôme dès que
Moodle expose des cohortes ou des groupes correspondants ; sinon ils restent manuels.

Sens des écritures **vers Moodle** pour ces motifs : aucun, sauf option explicite par motif
(`push_membership`) qui autorise l'ajout ou le retrait d'un membre de cohorte depuis ForetMap
(`core_cohort_add_cohort_members` / `core_cohort_delete_cohort_members`). Utile pour `26#n3`
(recrutement des n3beurs en cours d'année depuis ForetMap), déconseillé pour les classes,
que la vie scolaire tient dans Moodle.

## 5. Algorithme d'une exécution

1. **Verrou** : une seule exécution à la fois (même mécanisme que le cron de déploiement).
2. **Lecture Moodle** : `core_cohort_get_cohorts` filtré par l'année ; pour chaque cohorte
   retenue, `core_cohort_get_cohort_members` puis `core_user_get_users_by_field` par lots de
   cent. Champs lus : id, `idnumber`, `username`, prénom, nom, e-mail, `auth`, `suspended`.
3. **Contrôles amont** (bloquants) : e-mail absent ou hors domaine autorisé sur un membre non
   suspendu, cohorte sans `idnumber` conforme, deux membres Moodle avec le même e-mail.
4. **Rapprochement**, dans l'ordre, arrêt à la première correspondance :
   identité externe connue → e-mail (`users`, tous types) → prénom + nom normalisés (casse,
   accents, espaces) **si unique des deux côtés** → création.
5. **Écritures**, par cohorte et en transaction : groupe (et classe G&L, joueur, groupe miroir
   via `lib/glGroupBridge.js`), identités externes, appartenances `source = 'sync'`, retrait des
   appartenances `sync` disparues, désactivation des comptes `origin = 'created'` absents de
   toute cohorte de l'année, suspendus Moodle → désactivés si créés, signalés sinon.
6. **Noms** : Moodle ne remplit que les champs vides d'un compte rapproché ; pour un compte
   créé, Moodle fait foi. Tout écart est listé.
7. **Comparaison à trois** pour chaque groupe synchronisé : liste Moodle, liste ForetMap,
   `last_synced_hash`. Changé côté maître seulement → propagé vers le reflet. Changé côté
   reflet seulement → **conflit** (`sync_conflicts`), présenté dans l'écran administrateur
   avec deux boutons : « garder le maître » (le reflet est réaligné) ou « appliquer » (le
   changement est poussé vers le maître, donc vers Moodle pour une cohorte `push_membership`,
   vers G&L pour une équipe). Changé des deux côtés → conflit aussi. Rien n'est jamais écrasé
   sans décision, sauf pour les groupes dont le maître est ForetMap et dont Moodle n'est qu'un
   miroir déclaré « sans édition » (équipes, section 8) : là, le miroir est simplement refait.
8. **Écritures sortantes** (Moodle) : groupes équipe et leurs membres dans les cours chapitre,
   membres de cohorte pour les motifs `push_membership`. Elles passent par les mêmes
   simulation, seuils et journal ; elles ne touchent **que** des objets portant le préfixe
   d'`idnumber` de ForetMap (`FM#…`, section 8) ou une cohorte explicitement autorisée.
9. **Rapport** et journal (`sync_runs`, `sync_actions`, `audit_log`).

Les groupes de cours désignés (option) suivent le même chemin avec `kind = 'course_group'`,
sous le groupe classe, sans rôle par défaut. Les équipes G&L par chapitre font l'objet d'un lot
séparé (section 8).

## 6. Garde-fous

### 6.1 Avant la première exécution

- **Côté Moodle** : services web et REST (déjà actifs sur `olution.info`), service externe
  restreint aux fonctions listées en section 12 (lecture des cohortes, des utilisateurs, des
  cours et des groupes ; écriture des groupes de cours et, en option, des membres de cohorte),
  compte technique dédié, jeton restreint par IP, **`idnumber` renseigné** sur les cohortes
  visées et, idéalement, sur les comptes. Procédure pas à pas en section 12.
- **Côté ForetMap, étape zéro** : export des élèves sans e-mail, complété par les professeurs,
  puis réimporté ; rapport `GET /api/gl/admin/players/reconcile` à zéro (aucun joueur sans
  compte, aucun miroir orphelin, aucun reliquat de mot de passe) ; snapshot BDD
  (`scripts/db-backup.sh --label pre-moodle-sync`).
- **Test de connexion Google** sur un compte de chaque population avant toute synchronisation :
  vérifie que le domaine autorisé et le réglage `ui.auth.allow_google_student` laissent passer
  les élèves.
- **Simulation obligatoire** (`dryRun`) et lecture du rapport : rapprochements par nom, doublons
  probables, conflits d'e-mail, comptes à désactiver.

### 6.2 Pendant l'exécution

- **Seuils de sécurité** : l'application refuse sans confirmation explicite (`force`) si les
  créations dépassent 30 % des comptes élèves existants, si les désactivations dépassent 10 %
  ou 50 comptes, si un rapprochement par nom concerne plus de 20 % des membres, ou si Moodle
  renvoie une cohorte vide qui ne l'était pas. Ces seuils sont des réglages.
- **Première exécution réelle sur une seule cohorte**, la plus petite, avant généralisation.
- **Transaction par cohorte**, idempotence (rejouer ne change rien), reprise possible après une
  coupure réseau vers Moodle (l'exécution s'arrête proprement, le rapport dit où).
- **Aucune suppression**, aucune modification de mot de passe, aucun changement de rôle sur un
  compte rapproché en dehors des groupes synchronisés.
- **Écritures vers Moodle bornées** : uniquement des groupes portant le préfixe `FM#` ou une
  cohorte autorisée par sa politique ; jamais de création, modification ou suspension de compte
  Moodle ; jamais d'inscription ou de désinscription à un cours ; jamais de suppression d'un
  groupe que ForetMap n'a pas créé. Plafond par exécution sur les retraits de membres (réglage,
  10 % ou 50 par défaut, même logique que les désactivations).
- **Journal réversible** : chaque action enregistre l'état avant et après ; un `POST …/undo`
  d'une exécution rend les appartenances, réactive les comptes désactivés par elle et retire
  les identités externes posées par elle. Les comptes créés sont désactivés, pas supprimés.

### 6.3 Après l'exécution

- **Contrôle croisé** : effectifs par cohorte côté Moodle et par groupe côté ForetMap, écart
  affiché ; rapport de réconciliation G&L rejoué automatiquement en fin d'exécution.
- **Alerte** (`scripts/ops-alert.js`) sur échec, seuil atteint ou écart d'effectif ;
  compteurs dans `GET /api/admin/diagnostics`.
- **Écran administrateur** : historique des exécutions, rapport de chacune, liste des
  rapprochements en attente (membre Moodle non rapproché face aux comptes candidats : lier ou
  créer), bouton « hors synchronisation » sur un compte, annulation d'une exécution.

### 6.4 Sécurité et données

- Jeton en `.env`, appels en HTTPS, aucune donnée Moodle en clair dans les journaux
  (identifiants numériques seulement), limiteur sur l'endpoint de synchronisation, permission
  administrateur dédiée (`integrations.moodle.manage`).
- Données lues : identifiant, `idnumber`, prénom, nom, e-mail, état, appartenance. Rien
  d'autre. Données écrites vers Moodle : noms et `idnumber` de groupes, identifiants Moodle des
  membres. Aucune donnée ForetMap (pseudo, mot de passe, avatar, statistiques) ne sort.
- Mineurs : registre de traitement à compléter (finalité : accès aux outils pédagogiques ;
  base : mission d'enseignement ; conservation : comptes désactivés à la sortie, suppression
  manuelle après la durée fixée par l'établissement).

## 7. Cas de figure sur les comptes existants

| Situation                                                        | Comportement                                                                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Compte FM existant, même e-mail                                  | Rapproché ; mot de passe, pseudo, avatar, historique conservés ; rejoint le groupe                                       |
| Compte FM sans e-mail (inscription libre)                        | Rapproché par nom si unique, sinon signalé ; l'e-mail Moodle est posé sur le compte rapproché                            |
| Joueur G&L avec compte miroir                                    | Rapproché comme ci-dessus ; le miroir devient un compte `moodle`                                                         |
| Deux comptes FM pour la même personne                            | Un seul est lié (e-mail d'abord) ; l'autre est listé « doublon probable » ; fusion par l'administrateur (outil à livrer) |
| E-mail Moodle déjà porté par un autre compte (enseignant, autre) | Conflit : aucune action, ligne de rapport                                                                                |
| Compte FM ou G&L absent de Moodle                                | Jamais touché ; listé « hors Moodle » pour information                                                                   |
| Compte créé par la sync, disparu des cohortes de l'année         | Désactivé, réactivable à la main, marquage « hors synchronisation » respecté ensuite                                     |
| Compte rapproché, disparu des cohortes                           | Retiré des groupes synchronisés seulement (désactivation en option)                                                      |
| Membre suspendu dans Moodle                                      | Créé : désactivé ; rapproché : signalé                                                                                   |
| Élève changeant de classe en cours d'année                       | Déplacé de groupe (et de classe G&L si la classe joue) à l'exécution suivante ; une partie en cours n'est pas touchée    |
| Homonymes                                                        | Jamais rapprochés automatiquement ; décision dans l'écran des rapprochements en attente                                  |

L'**outil de fusion de comptes** (B dans A : groupes, inscriptions et journaux de tâches,
observations, forum, joueur G&L, identités externes, puis suppression de B, avec simulation)
fait partie du lot : il règle aussi les doublons hérités que la réconciliation G&L révèle déjà.

## 8. Équipes G&L par chapitre et sous-groupes (bidirectionnel)

### 8.1 Où composer les équipes : recommandation G&L

Deux options étaient ouvertes : composer les équipes dans Moodle (groupes du cours chapitre)
ou dans G&L, avec un **moteur de composition** à créer. Recommandation : **G&L maître des
équipes, Moodle miroir**.

- Les équipes sont une donnée de jeu : type gnome ou licorne, équilibre, historique des
  coéquipiers, contraintes pédagogiques (séparer, réunir, éviter les répétitions d'un chapitre
  à l'autre). Moodle n'a aucun moteur pour cela ; l'interface de composition manuelle des
  groupes y est lente pour des équipes qui changent à chaque chapitre.
- G&L possède déjà les objets (`gl_games`, `gl_teams`, `gl_team_members`) et la console MJ.
  Le moteur à créer est modeste : tirage contraint (taille, mixité, gnomes / licornes, « pas
  deux fois les mêmes »), puis ajustement manuel par glisser-déposer, puis validation.
- Moodle reçoit ensuite les groupes pour ce que Moodle sait faire : restreindre une activité,
  un forum ou un devoir à une équipe.

Le sens inverse reste possible pour les rares cas où un enseignant retouche un groupe dans
Moodle : la comparaison à trois (section 5) le détecte et propose « appliquer à G&L » ou
« refaire le miroir ». Une partie **en cours ou terminée** n'est jamais recomposée : l'écart est
signalé, le MJ décide.

### 8.2 Convention de nommage proposée pour les groupes équipe

`idnumber` : **`FM#<cohorte>#C<chapitre>#E<numéro>`**, par exemple `FM#26#601-602#C03#E05`.
Nom affiché : **« Équipe 5 · Licornes »** (ou « Gnomes »). Le préfixe `FM#` est la garantie
que la synchronisation ne touche que ses propres groupes ; le reste rend le groupe lisible et
unique dans le cours. Le groupe classe du cours (« Cohorte 26#601-602 », créé par Moodle) n'est
jamais modifié.

### 8.3 Déroulé

1. Réglage annuel : chapitre → identifiant de cours Moodle (table explicite).
2. Dans G&L, le MJ compose et **valide** les équipes d'une partie (classe = cohorte, chapitre).
3. À la validation ou à l'exécution suivante : pour le cours du chapitre, les groupes `FM#…`
   de cette cohorte sont créés ou mis à jour (`core_group_create_groups`,
   `core_group_update_groups`, `core_group_add_group_members`,
   `core_group_delete_group_members`) ; un groupe `FM#…` sans équipe correspondante est
   supprimé (`core_group_delete_groups`), les autres groupes du cours ne sont pas lus.
4. Les membres sont ajoutés par leur identifiant Moodle, résolu via `external_identities` ; un
   joueur sans identité Moodle est listé dans le rapport (l'équipe existe côté G&L, il manque
   côté Moodle) et n'empêche rien.
5. Un élève non inscrit au cours chapitre ne peut pas être mis dans un groupe (Moodle refuse) :
   le rapport le dit, l'inscription reste du ressort de Moodle.

### 8.4 Appartenances multiples

- **ForetMap** l'autorise déjà : `group_members` a pour clé `(group_id, user_id)`, un élève
  peut être dans sa classe, dans le groupe n3beurs, dans un groupe de cours et dans plusieurs
  sous-groupes (`groups.parent_group_id`). La synchronisation pose une appartenance par groupe
  synchronisé et ne retire que les siennes (`source = 'sync'`).
- **G&L** : un joueur a **une** classe (`gl_players.class_id`) et une équipe par partie
  (`gl_team_members`). Plusieurs équipes dans le temps (une par chapitre) sont naturelles ;
  **deux classes G&L simultanées** pour le même joueur ne le sont pas dans le modèle actuel.
  Le cas ne se présente pas si la classe G&L est la cohorte (binôme compris). S'il devait se
  présenter (élève à cheval sur deux cohortes joueuses), il faudrait une table
  `gl_class_members` : à décider, hors lot.
- **Sous-groupes composés dans ForetMap** (hors jeu : ateliers, tâches par équipe) : même
  mécanisme que les équipes, maître ForetMap, miroir Moodle dans le cours choisi, préfixe
  `FM#<cohorte>#G#<slug>`.

## 9. Lots, efforts, prérequis

| Lot | Contenu                                                                                                                                                                        | Effort |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| M1  | Modèle de données, client Web Services, politique par motif, rapprochement, simulation, seuils, journal réversible, endpoint admin, script cron, tests sur faux serveur Moodle | 3,5 j  |
| M2  | Écran administrateur : exécutions, rapports, rapprochements en attente, annulation, marquage hors synchronisation ; outil de fusion de comptes                                 | 2 j    |
| M3  | Groupes de cours désignés, comparaison à trois et écran des conflits                                                                                                           | 1,5 j  |
| M4  | Moteur de composition des équipes G&L, miroir Moodle des équipes et des sous-groupes                                                                                           | 3 j    |
| M5  | Documentation de référence (« Rentrée avec Moodle »), `API.md`, `CRONTAB.md`, `EXPLOITATION.md`                                                                                | 0,5 j  |

Prérequis fournis : URL (`https://olution.info`), cohorte n3beurs (`26#n3`), forme des
cohortes classe (`26#601-602`, `26#603`), nom des groupes classe dans les cours chapitre
(« Cohorte 26#601-602 »), sens retenu (bidirectionnel, un maître par objet), appartenances
multiples requises.

Restent à fournir ou à confirmer avant M1 :

1. Le **jeton Web Service** (procédure en section 12), à placer dans le `.env` du serveur sous
   `MOODLE_WS_TOKEN`, avec `MOODLE_BASE_URL=https://olution.info` ; plus l'adresse IP publique
   du serveur ForetMap pour restreindre le jeton côté Moodle.
2. Les **identifiants des cours des chapitres 2 et suivants**, relevés comme celui du chapitre
   1 (`id=564`), pour remplir la table de réglage.
3. La **convention de nommage des équipes** : proposition en 8.2, à valider ou amender.

## 10. Procédure de rentrée (une fois livré)

1. Changer l'année dans les réglages (`26` → `27`), vérifier les motifs.
2. Snapshot BDD.
3. Simulation ; lecture du rapport : désactivations prévues (anciens élèves), créations,
   rapprochements par nom, conflits.
4. Exécution réelle sur une cohorte, contrôle des effectifs, test de connexion Google d'un élève.
5. Exécution complète ; contrôle croisé ; réconciliation G&L.
6. Traitement des rapprochements en attente dans l'écran administrateur.
7. Activation du cron hebdomadaire (les mouvements d'élèves en cours d'année).

## 11. Ce qui reste hors périmètre

Le lancement depuis un cours Moodle (LTI 1.3 : identité au clic, liste du cours, notes en
retour) est cadré à part ; il réutilisera `external_identities` (`provider = 'lti'`) et le
rapprochement par e-mail décrits ici. La synchronisation par Web Services reste la seule source
pour les cohortes et les groupes de cours, que LTI n'expose pas.

## 12. Créer le jeton Web Services sur `olution.info`

Les services web et le protocole REST sont déjà actifs (vérifié depuis l'extérieur). Il reste
à créer un compte technique, un rôle, un service et le jeton. Tout se fait dans
**Administration du site** avec un compte administrateur Moodle.

1. **Compte technique** — Utilisateurs → Comptes → Ajouter un utilisateur : nom d'utilisateur
   `foretmap-sync`, méthode d'authentification **Comptes manuels** (pas Google), mot de passe
   long, e-mail technique, aucune inscription à aucun cours. Il ne servira qu'aux appels.
2. **Rôle système « ForetMap Web Services »** — Utilisateurs → Permissions → Définition des
   rôles → Ajouter un nouveau rôle (rôle vide, contexte **Système**), avec les capacités
   suivantes en « Autoriser » :
   - lecture : `webservice/rest:use`, `moodle/cohort:view`, `moodle/user:viewdetails`,
     `moodle/user:viewhiddendetails`, `moodle/user:viewalldetails`,
     `moodle/site:viewuseridentity` (sinon l'e-mail est masqué dans les réponses),
     `moodle/course:view`, `moodle/course:viewhiddencourses`, `moodle/site:accessallgroups` ;
   - écriture (équipes et sous-groupes) : `moodle/course:managegroups` ;
   - écriture optionnelle (motifs `push_membership`) : `moodle/cohort:assign`.

   Puis Utilisateurs → Permissions → **Attribution des rôles système** : attribuer ce rôle à
   `foretmap-sync`. Vérifier aussi que le réglage « Afficher l'identité de l'utilisateur »
   (Utilisateurs → Permissions → Règles utilisateur, `showuseridentity`) inclut l'adresse de
   courriel, sans quoi `core_user_get_users_by_field` ne renvoie pas d'e-mail.

3. **Service externe** — Serveur → Services web → Services externes → Ajouter : nom
   « ForetMap », **Activé**, « Utilisateurs autorisés seulement » coché, « Fichiers » décochés.
   Dans **Fonctions**, ajouter :
   - lecture : `core_webservice_get_site_info`, `core_cohort_get_cohorts`,
     `core_cohort_get_cohort_members`, `core_user_get_users_by_field`,
     `core_course_get_courses_by_field`, `core_group_get_course_groups`,
     `core_group_get_group_members`, `core_enrol_get_enrolled_users` ;
   - écriture : `core_group_create_groups`, `core_group_update_groups`,
     `core_group_delete_groups`, `core_group_add_group_members`,
     `core_group_delete_group_members` ;
   - optionnel : `core_cohort_add_cohort_members`, `core_cohort_delete_cohort_members`.

   Dans **Utilisateurs autorisés**, ajouter `foretmap-sync`.

4. **Jeton** — Serveur → Services web → Gérer les jetons → Créer un jeton : utilisateur
   `foretmap-sync`, service « ForetMap », **restriction IP** = adresse publique du serveur
   ForetMap, date de validité (un an, à renouveler à la rentrée). Le jeton ne s'affiche qu'une
   fois : le copier directement dans le `.env` du serveur (`MOODLE_BASE_URL=https://olution.info`,
   `MOODLE_WS_TOKEN=…`), jamais dans un réglage, un dépôt ou un message.
5. **Vérification** depuis le serveur ForetMap :

   ```bash
   curl -s "https://olution.info/webservice/rest/server.php" \
     --data-urlencode "wstoken=$MOODLE_WS_TOKEN" \
     --data-urlencode "wsfunction=core_webservice_get_site_info" \
     --data-urlencode "moodlewsrestformat=json" | head -c 400
   ```

   La réponse doit contenir `sitename`, `username: "foretmap-sync"` et la liste des
   fonctions autorisées. Puis un second appel `core_cohort_get_cohorts` doit renvoyer les
   cohortes avec leur `idnumber`. Le lot M1 livrera `npm run moodle:check`, qui rejoue ces
   appels et vérifie chaque fonction et chaque capacité nécessaires.

Pour les essais, un **jeton de test** sur un compte technique séparé, sans les fonctions
d'écriture, suffit et évite tout risque pendant le développement.

## 13. Réponses aux questions ouvertes du 6 septembre

| Question                                    | Réponse retenue dans ce cadrage                                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cohorte n3beurs                             | `26#n3`, motif dédié (section 4)                                                                                                                     |
| Cohortes binômes (`26#601-602`)             | Un groupe ForetMap et une classe G&L par cohorte ; sous-groupes par classe en option                                                                 |
| Cours chapitre                              | Table de réglage chapitre → identifiant numérique de cours ; chapitre 1 = cours `564` (les numéros `6xx` sont des classes, pas des cours)            |
| Groupes classe des cours (« Cohorte 26#… ») | Lus, jamais écrits                                                                                                                                   |
| Équipes : Moodle ou G&L ?                   | **G&L maître** avec moteur de composition, Moodle miroir ; retouches Moodle détectées, jamais écrasées sans décision (section 8)                     |
| Jeton                                       | Procédure en section 12 ; `MOODLE_WS_TOKEN` et `MOODLE_BASE_URL` dans le `.env` du serveur, jamais en base ni en réglage                             |
| Synchronisation dans les deux sens          | Oui, un maître par objet, comparaison à trois, conflits présentés à l'administrateur, écritures vers Moodle bornées au préfixe `FM#` (sections 5, 6) |
| Élève dans plusieurs groupes / sous-groupes | Déjà possible côté ForetMap ; une seule classe G&L par joueur, plusieurs équipes dans le temps (section 8.4)                                         |
