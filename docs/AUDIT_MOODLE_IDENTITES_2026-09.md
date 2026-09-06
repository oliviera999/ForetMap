# Cadrage — lien utilisateurs Moodle 5.2 ↔ ForetMap / Gnomes & Licornes

> Septembre 2026. Fait suite à `AUDIT_COMPTES_2026-09.md` (identités unifiées : un compte
> `users` par personne, porteur des secrets, référencé par `gl_players`). Ce document cadre la
> synchronisation des cohortes et groupes Moodle vers ForetMap et G&L, avec **tous les
> garde-fous** nécessaires pour qu'une rentrée de plusieurs centaines d'élèves se passe sans
> doublon, sans perte et sans surprise. Rien de ce qui est décrit ici n'est encore implémenté ;
> la section 9 donne les lots.

## 1. Situation de départ

| Population                | Moodle                                                                     | ForetMap                                  | G&L                            |
| ------------------------- | -------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------ |
| Sixièmes                  | cohorte `26#6xx`, cours par chapitre avec groupes classe et groupes équipe | inscrits, **visiteur** (pas de tâches)    | **joueurs**, équipes variables |
| n3beurs (tous niveaux)    | cohorte dédiée                                                             | groupe n3beur, **tâches** de tous niveaux | non                            |
| Autres élèves de l'année  | cohorte `26#Nxx`                                                           | connexion libre, visiteur, pas de tâches  | non                            |
| Élèves des années passées | cohortes `25#…`, encore inscrits aux anciens cours                         | aucun accès, sauf exception               | non                            |
| Enseignants               | inscrits aux cours, pas en cohorte                                         | comptes `teacher`, RBAC                   | MJ / admin via `gl_admins`     |

Conventions Moodle : les cohortes portent un `idnumber` `année#classe` (`26#614`) ou
`année#niveau` (`26#6`). **Google OAuth 2 est actif des deux côtés** (Moodle et ForetMap), sur
l'annuaire Workspace du lycée.

## 2. Principes

1. **Une personne = un compte `users`**, quel que soit le produit ou la source. Moodle n'est
   pas un troisième magasin d'identité : c'est une **source de vérité pour l'appartenance aux
   classes et aux groupes**, rien d'autre.
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
                      'course_group'), name, group_id → groups.id, gl_class_id (nullable),
                      policy_key, last_synced_at
external_group_members external_group_id, user_id, source ('sync' | 'manual'), synced_at
sync_runs             id, provider, started_at, finished_at, mode ('dry_run' | 'apply'),
                      actor, totals_json, report_json, status
sync_actions          run_id, kind, target_type, target_id, before_json, after_json
                      (journal réversible)
users.sync_exempt     TINYINT : compte marqué « hors synchronisation » par un administrateur
```

`origin` distingue un compte **créé** par la synchronisation d'un compte **existant rapproché** ;
`source` distingue une appartenance posée par la synchronisation d'un ajout manuel. Ces deux
drapeaux décident de tout ce que la synchronisation a le droit de défaire.

Le fournisseur `auth_provider` d'un compte créé vaut `moodle`. Un compte miroir G&L
(`gl_bridge`) rapproché **cesse d'être un miroir** : son fournisseur passe à `moodle`, sinon la
suppression du joueur l'emporterait (`DELETE /api/gl/admin/players/:id`).

## 4. Politique par motif de cohorte

Réglages administrateur (`integration.moodle.*`) : URL du site, année en cours (`26`), et une
table de politiques par motif d'`idnumber`. Le jeton Web Service reste dans `.env`
(`MOODLE_WS_TOKEN`), jamais en base ni en réglage.

| Motif              | Groupe ForetMap                        | Rôle par défaut | n3beur | Classe G&L | Comptes                              |
| ------------------ | -------------------------------------- | --------------- | ------ | ---------- | ------------------------------------ |
| `26#6`             | groupe parent « 6e » (`unit`)          | aucun           | non    | non        | portés par les classes               |
| `26#6xx`           | classe, enfant du niveau               | `visiteur`      | non    | **oui**    | créés ; joueurs G&L créés            |
| `26#N3B` (à fixer) | groupe n3beurs, `grants_n3beur_access` | `eleve_novice`  | oui    | non        | créés                                |
| `26#[2-5]xx`       | classe, enfant du niveau               | `visiteur`      | non    | non        | créés (ou à la 1ʳᵉ connexion Google) |
| autre année        | ignoré                                 |                 |        |            | créés par la sync → désactivés       |

Un n3beur est dans sa classe (visiteur) **et** dans le groupe n3beurs : la résolution de rôle
retient le plus élevé, il est donc n3beur. Le groupe classe ne doit jamais forcer `visiteur`.

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
7. **Rapport** et journal (`sync_runs`, `sync_actions`, `audit_log`).

Les groupes de cours désignés (option) suivent le même chemin avec `kind = 'course_group'`,
sous le groupe classe, sans rôle par défaut. Les équipes G&L par chapitre font l'objet d'un lot
séparé (section 8).

## 6. Garde-fous

### 6.1 Avant la première exécution

- **Côté Moodle** : services web activés (REST), service externe restreint à
  `core_webservice_get_site_info`, `core_cohort_get_cohorts`, `core_cohort_get_cohort_members`,
  `core_user_get_users_by_field` (+ `core_group_get_course_groups`,
  `core_group_get_group_members` pour l'option), compte technique dédié avec lecture des
  cohortes et des détails utilisateur y compris l'e-mail masqué, jeton restreint par IP si
  possible, **`idnumber` renseigné** sur les cohortes visées et, idéalement, sur les comptes.
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
  d'autre, et rien n'est renvoyé vers Moodle dans ce lot.
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

## 8. Équipes G&L par chapitre (lot séparé)

Les cours Moodle « chapitre » portent un groupe classe et des groupes équipe. Une partie G&L
(`gl_games`) est liée à une classe et un chapitre : la correspondance est directe. Sens
proposé, Moodle source de vérité :

1. cours désignés par un motif d'`idnumber` (par exemple `26#GL#03`) ;
2. classe G&L retrouvée par le groupe classe du cours ;
3. partie créée **en brouillon** si absente pour ce couple classe et chapitre ;
4. équipes créées ou mises à jour depuis les groupes équipe, type gnome ou licorne lu dans le
   nom ou l'`idnumber` du groupe selon une convention à fixer ;
5. **jamais** de recomposition d'une partie en cours ou terminée : écart signalé, MJ décide.

Le sens inverse (équipes composées dans la console G&L, groupes Moodle recréés depuis elles)
est possible par Web Services d'écriture ; à décider selon l'endroit où le MJ compose réellement.

## 9. Lots, efforts, prérequis

| Lot | Contenu                                                                                                                                                                        | Effort |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| M1  | Modèle de données, client Web Services, politique par motif, rapprochement, simulation, seuils, journal réversible, endpoint admin, script cron, tests sur faux serveur Moodle | 3 j    |
| M2  | Écran administrateur : exécutions, rapports, rapprochements en attente, annulation, marquage hors synchronisation ; outil de fusion de comptes                                 | 2 j    |
| M3  | Groupes de cours désignés                                                                                                                                                      | 1 j    |
| M4  | Équipes G&L par chapitre                                                                                                                                                       | 2 j    |
| M5  | Documentation de référence (« Rentrée avec Moodle »), `API.md`, `CRONTAB.md`, `EXPLOITATION.md`                                                                                | 0,5 j  |

Prérequis à fournir avant M1 : URL du Moodle, jeton Web Service de test, `idnumber` de la
cohorte n3beurs, un exemple d'`idnumber` de cours chapitre et de noms de groupes équipe, et le
sens retenu pour les équipes.

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
