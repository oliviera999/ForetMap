# Audit du rôle professeur (n3boss) — ForetMap, septembre 2026

> **Instantané au 9 septembre 2026** (`v1.151.3`). Périmètre : le rôle **n3boss / `prof`**
> de ForetMap — sa définition RBAC, les gardes serveur, la surface d'interface, la
> traçabilité, la documentation et les tests. **Hors périmètre** : Gnomes & Licornes
> (rôles `gl_*`, voir `docs/AUDIT_CONVERGENCE_APPS_2026-09.md`) et le Plan Lyautey.
>
> Aucun changement de comportement n'accompagne cet audit : c'est un constat, pas un lot
> correctif. Les pistes de la section 7 sont des propositions à arbitrer.

## 1. Résumé exécutif

Le socle d'autorisation est **solide et bien pensé** : les droits effectifs sont relus en
base à chaque requête, le PIN d'élévation a disparu au profit d'un RBAC unique, la
révocation de session est immédiate, et les deux produits sont étanches. Sur le fond du
modèle, il n'y a **pas de faille d'escalade de privilèges** exploitable par un n3boss
ordinaire : la frontière `prof` → `admin` est gardée aux deux endroits qui comptent
(création de compte, modification d'un administrateur).

Ce qui craint tient en quatre points, et aucun n'est une faille d'accès :

1. **Les révocations de permissions sur les profils système ne tiennent pas** : décocher
   un droit du profil n3boss est annulé au redémarrage suivant (§4.1).
2. **L'interface lit les permissions dans le jeton** : une modification de droits n'atteint
   jamais un onglet déjà ouvert — le serveur, lui, applique la bonne règle (§4.2).
3. **Le périmètre de groupe est neutralisé pour le n3boss par défaut**, alors que toute la
   machinerie de portée existe et fonctionne (§4.4).
4. **La moitié des actions n3boss n'est pas journalisée** — zones, plantes, tutoriels,
   groupes, visite — alors que l'onglet Audit est ouvert au n3boss (§4.5).

| Gravité | Constat                                                            | §   |
| ------- | ------------------------------------------------------------------ | --- |
| 🔴 P1   | Révocation de permission annulée au redémarrage                    | 4.1 |
| 🔴 P1   | Permissions du front figées dans le JWT                            | 4.2 |
| 🟠 P2   | `teacher.access` utilisé comme droit d'action                      | 4.3 |
| 🟠 P2   | Portée de groupe inerte pour le n3boss par défaut                  | 4.4 |
| 🟠 P2   | Journal d'audit à trous sur les contenus                           | 4.5 |
| 🟡 P3   | Console RBAC sans garde anti-escalade                              | 4.6 |
| 🟡 P3   | `docs/API.md` désynchronisé (mentions « (PIN) », matrices)         | 4.7 |
| 🟡 P3   | Pas de test de non-régression de la matrice n3boss                 | 4.8 |
| ⚪ P4   | Divers (abstraction morte, export sans lecture, audit sans filtre) | 4.9 |

## 2. Ce qui est bien

**Le jeton ne fait pas autorité.** `hydrateAuthFromTokenClaims`
(`middleware/requireTeacher.js:50-105`) relit à chaque requête l'état du compte et
reconstruit les permissions depuis la base (`buildAuthzPayload`, `lib/rbac.js:848`). Un
jeton volé ou périmé ne porte aucun droit exploitable ; c'est ce qui fait que le constat
4.2 reste un défaut d'ergonomie et non une faille.

**La révocation est immédiate, pas à l'expiration.** Compte désactivé (`is_active`) et
changement de mot de passe (`token_epoch`, `lib/auth/tokenEpoch.js`) coupent la session à
la requête suivante, avec un `401 SESSION_REVOKED` distinct du 403 « aucun profil » — le
client sait déconnecter proprement.

**Une panne de base n'est pas confondue avec un refus.** `resolveAuthOrRespond` renvoie
`503` + `Retry-After` si l'hydratation échoue pour cause d'infrastructure
(`middleware/requireTeacher.js:151-165`), au lieu d'un 401 trompeur qui déclencherait des
boucles de reconnexion pendant un redémarrage MySQL. C'est un détail rare et précieux.

**Le PIN a bien disparu.** Plus de session « élevée », plus de secret partagé côté client :
les anciens points d'entrée répondent `410 Gone` (`routes/auth.js:1055-1065`), et les
paramètres `elevated` / `needsElevation` survivants sont explicitement documentés comme
ignorés. La suppression a été faite proprement, sans laisser de chemin parallèle.

**L'étanchéité produit est stricte.** Un jeton `product:'gl'` est refusé hors `/api/gl/*`,
avec une frontière écrite pour ne pas confondre `/api/gl/` et `/api/glossary`
(`server.js:474-486`).

**Les frontières prof → admin sont gardées là où il faut.** Un n3boss ne peut pas créer un
administrateur (`routes/rbac.js:96-110`) ni modifier un compte administrateur
(`routes/rbac.js:698-703`), et `admin.impersonate` n'est pas dans sa matrice. La prise de
contrôle revérifie à chaque requête que **l'acteur réel** détient toujours le droit
(`middleware/requireTeacher.js:55-63`) et journalise début et fin.

**Les groupes ne peuvent pas servir d'échelle vers le staff.** Un groupe ne peut conférer
comme profil par défaut ni `admin`, ni `prof`, ni un `gl_*`, ni un profil portant une
permission « non sûre » (`lib/groupRole.js:22-32, 34-52`) — la promotion automatique par
appartenance ne peut donc pas fabriquer un n3boss.

**Sécurité des comptes enseignants.** Minimum de **12 caractères** pour tout compte
`teacher`, quel que soit le réglage établissement (`lib/passwordReset.js:104-112`), et
anti-force-brute **par compte** avec verrou progressif en plus du limiteur d'IP
(`lib/loginThrottle.js`) — le bon choix pour un établissement où toute une classe sort par
la même adresse publique.

**Les caches d'autorisation sont invalidés par version d'écriture**, pas par péremption
temporelle (`lib/rbac.js:11-27`, `lib/groupScope.js:1-20`) : aucune fenêtre pendant
laquelle un droit retiré resterait servi.

**Le modèle accepte des n3boss sur mesure.** `computeNativePrivilegedRole`
(`lib/rbac.js:810-819`) traite un profil enseignant dupliqué (rang ≥ 400 +
`teacher.access`) exactement comme le slug `prof`, ce qui permet de créer des paliers
enseignants délégués sans toucher au code.

**Le filet de sécurité admin existe.** `checkCriticalAdminAccount` (`lib/rbac.js:900-928`)
vérifie qu'un compte administrateur reste réellement attribué.

## 3. Ce qui est présent — inventaire

| Élément                          | État                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Catalogue de permissions         | 44 clés (`lib/rbac.js:63`), dont 27 dans la matrice n3boss                                                        |
| Profils système                  | 9 (`admin`, `prof`, 3 paliers n3beur, `visiteur`, 4 `gl_*`) — `lib/rbac.js:28`                                    |
| Gardes de route                  | ≈ 140 montages `requirePermission` hors GL, plus les contrôles en corps de handler (groupes, stats, observations) |
| Middleware                       | `requireAuth`, `requirePermission`, `requireProduct`, `requireTeacher = requirePermission('teacher.access')`      |
| Interface n3boss                 | 17 onglets en 3 pôles (`src/components/app/TeacherTopTabs.jsx`), visibilité pilotée par permission                |
| Aperçu de rôle                   | `roleViewMode` native / student / teacher (`src/App.jsx:200-215`) — filtre d'affichage, sans effet serveur        |
| Journal d'audit                  | `lib/auditLog.js` (double écriture `audit_log` + `security_events`), 74 appels hors GL                            |
| Documentation fonctionnelle      | `docs/reference/foretmap/comptes-roles-et-groupes.md` (141 lignes)                                                |
| Tests backend touchant le n3boss | `rbac*.test.js`, `groups.test.js`, `media-library.test.js`, `settings.test.js`, `rbac-progression.test.js`        |
| e2e n3boss                       | `teacher-auth-map`, `tasks-full-cycle`, `groups-module`, `stats-foretmap`, `admin-impersonation`, `photos-*`      |

Répartition des gardes par permission (hors GL) :

```
visit.manage 35 · tasks.manage 15 · zones.manage 12 · plants.manage 12
admin.settings.read 12 · admin.settings.write 11 · tutorials.manage 7
teacher.access 6 · admin.roles.manage 6 · admin.users.assign_roles 4 · tours.manage 3
map.manage_markers 3 · users.create 2 · tasks.validate 2 · students.import 2
stats.read.all 2 · tasks.assign.group 1 · students.delete 1 · audit.read 1
integrations.moodle.manage 1 · admin.settings.secrets.write 1 · admin.impersonate 1
```

**Vérification faite** : aucune clé utilisée dans une garde n'est absente du catalogue, et
aucune clé du catalogue n'est orpheline (celles qui n'apparaissent pas ci-dessus sont
contrôlées en corps de handler : `groups.*`, `observations.*`, `stats.export`,
`forum.group.moderate`, `tasks.*_self`).

## 4. Ce qui craint

### 4.1 🔴 P1 — Retirer une permission d'un profil système ne tient pas au redémarrage

`ensureDefaultRolesAndPermissions` (`lib/rbac.js:631-660`) réinsère, **à chaque démarrage
de processus**, toutes les permissions de `ROLE_PERMISSION_MATRIX` pour tous les profils
système, en `INSERT IGNORE`. `ensureRbacBootstrap` (`lib/rbac.js:751`) n'est mémorisé que
dans le processus courant : la première requête authentifiée après un déploiement rejoue le
semis.

Or la console RBAC permet explicitement de décocher ces permissions :
`PUT /api/rbac/profiles/:id/permissions` (`routes/rbac.js:584-608`) supprime toutes les
lignes du profil puis réinsère la sélection, sans distinguer les profils `is_system`, et
l'interface ne pose aucun garde-fou (`src/components/profiles/ProfilesPermissionRows.jsx`
n'inspecte jamais `is_system`).

**Conséquence concrète** : un administrateur qui retire `students.delete` — ou `audit.read`,
ou `visit.manage` — du profil **n3boss** voit sa décision appliquée, journalisée… puis
silencieusement annulée au prochain déploiement. Aucun message, aucune trace de la
restauration. Le même mécanisme s'applique aux profils `admin` et aux paliers n3beur.

Le semis est un bon réflexe pour un profil **neuf** ; le défaut est de ne pas distinguer
« jamais configuré » de « configuré, avec des droits volontairement retirés ».

Aucun test ne couvre ce comportement, et il n'est décrit ni dans `docs/API.md` ni dans la
documentation de référence.

### 4.2 🔴 P1 — Le front lit les permissions dans le jeton ; une modification n'y descend jamais

Le jeton embarque la liste des permissions (`buildSessionPayload`, `routes/auth.js:191-201`)
et le front s'en sert comme source de vérité : `isTeacher` (`src/App.jsx:167-171`),
`hasPermission` (`src/App.jsx:222-235`) et la visibilité des onglets viennent tous de
`getAuthClaims()`, qui **décode le JWT stocké** (`src/services/api.js:223`).

Deux mécanismes auraient pu rafraîchir ça, aucun ne le fait :

- `GET /api/auth/me` ne réémet un jeton que si le **profil** a changé — la comparaison porte
  sur `roleId` / `roleSlug` seuls (`routes/auth.js:228-232`). Une modification des
  permissions **du profil** ne déclenche rien.
- `mergeAuthMeResponse` reçoit pourtant `d.auth` avec les permissions fraîches, mais les
  jette : il appelle `setAuthClaims(getAuthClaims())` (`src/hooks/useAuthSession.js:226`),
  c'est-à-dire qu'il redécode le jeton inchangé.

`token_epoch` n'aide pas : il n'est incrémenté que sur changement de mot de passe
(`lib/auth/tokenEpoch.js:29`), jamais sur changement de droits.

**Conséquence** : après un ajustement de la matrice n3boss, un professeur déjà connecté voit
soit des boutons qui répondent `403 Permission insuffisante`, soit l'absence d'un onglet
auquel il a désormais droit — jusqu'à sa reconnexion (ou l'expiration du jeton, 5 400 s par
défaut, `lib/settings.js:406-412`). Le serveur, lui, applique la bonne règle : **ce n'est pas
un problème de sécurité, c'est un problème de confiance dans l'outil**.

À noter : le commentaire de `lib/auth/tokenEpoch.js:6` affirme que « le JWT ne porte aucun
droit » — vrai côté serveur, faux côté client, et c'est exactement là que naît l'écart.

### 4.3 🟠 P2 — `teacher.access` sert de droit d'action, pas seulement de clé d'entrée

Le libellé du catalogue est sans ambiguïté : « Accès interface n3boss — Permet d'ouvrir
l'interface n3boss » (`lib/rbac.js:64`). Six routes l'utilisent pourtant comme **seule**
autorisation d'écriture :

- **Médiathèque** — lister, uploader et **supprimer** n'importe quel média partagé
  (`routes/media-library.js:39, 50, 62, 89`), sans permission fine ni contrôle de
  propriétaire.
- **Forum** — verrouiller n'importe quel sujet (`routes/forum.js:583-585`), sans passer par
  `forum.group.moderate` ni par le contrôle de périmètre pourtant disponible
  (`isForumGroupInScope`, `routes/forum.js:109-114`).

**Conséquence** : un profil enseignant délégué créé avec le strict minimum — `teacher.access`
pour « juste consulter » — hérite du droit de vider la médiathèque commune et de verrouiller
tout le forum. La granularité fine que le reste du modèle défend est court-circuitée au
point d'entrée.

### 4.4 🟠 P2 — La portée de groupe est inerte pour le n3boss par défaut

Le code de périmètre est complet et correct : `getScopedStudentIds`, `canAccessStudentId`,
détection du `unauthorizedGroup` (403 « Groupe hors périmètre »), descendance des
sous-groupes, application aux **écritures** du forum et pas seulement aux lectures.

Mais la matrice n3boss (`lib/rbac.js:208-236`) accorde `stats.read.all`,
`observations.read.all` et `observations.manage.all`. Et `canBypassGroupScope`
(`lib/groupScope.js:45-49`) rend `true` dès `stats.read.all`. En pratique, pour un n3boss
par défaut :

- stats : `scope.all`, tous les n3beurs de l'établissement ;
- observations : lecture et suppression globales ;
- forum : modération sans périmètre (`resolveForumVisibleGroupIds` rend `null`) ;
- tâches : `lib/taskAuthzHelpers.js:16-17`, même effet.

Les permissions `*.group` cohabitent dans la matrice avec leurs équivalents `*.all`, où elles
ne changent rien. Le périmètre n'est donc exercé que par des profils **sur mesure**.

Deux droits sensibles ne sont d'ailleurs **pas scopables du tout**, faute de variante de
groupe : `students.delete` (`routes/students.js:599-602` — suppression en cascade de tout
n3beur de l'établissement) et `students.import`.

Ce n'est pas nécessairement un bug — « au lycée Lyautey, tout prof voit tous les élèves » est
un arbitrage défendable. Mais il n'est écrit nulle part, et il rend inobservable une
machinerie qui coûte cher à maintenir. À trancher explicitement.

### 4.5 🟠 P2 — Le journal d'audit s'arrête aux portes des contenus

`logAudit` est appelé 74 fois hors GL, sur les bons domaines : tâches, RBAC, réglages,
médiathèque, forum, Moodle, LTI, suppression de n3beur, prise de contrôle.

Il est **absent** de tout le reste de la surface n3boss :

| Domaine                | Routes en mutation | Appels `logAudit` |
| ---------------------- | ------------------ | ----------------- |
| Zones                  | 3                  | 0                 |
| Plantes / biodiversité | 7                  | 0                 |
| Tutoriels              | 7                  | 0                 |
| Repères de carte       | 3                  | 0                 |
| Quiz                   | 4                  | 0                 |
| Groupes                | 7                  | 0                 |
| Observations           | 2                  | 0                 |
| Réseau trophique       | 3                  | 0                 |
| Visite / mascottes     | 26                 | 0                 |

**Conséquence** : supprimer une zone, une espèce, un tutoriel ou **un groupe entier** ne
laisse aucune trace nominative. C'est d'autant plus visible que `audit.read` est dans la
matrice n3boss et que l'onglet Audit existe : le professeur qui l'ouvre après un incident y
trouve un journal muet sur précisément les contenus qu'il cherche.

La suppression de groupe est le cas le plus coûteux : elle resynchronise en cascade les
profils de tous ses membres élèves (`routes/groups.js:434-460`).

### 4.6 🟡 P3 — La console RBAC n'a pas de garde anti-escalade

`PUT /api/rbac/profiles/:id/permissions` (`routes/rbac.js:584`) ne vérifie que
`admin.roles.manage`. Il ne contrôle ni que l'acteur détient déjà les permissions qu'il
accorde, ni que la cible n'est pas le profil `admin`, ni que l'acteur est administrateur —
alors que `POST /api/rbac/users` le fait explicitement pour la création de compte
(`routes/rbac.js:96-110`) et `PATCH /users/:type/:id` pour la modification d'un
administrateur (`routes/rbac.js:698-703`).

**Conséquence** : `admin.roles.manage` n'est pas une permission parmi d'autres, c'est
**toutes les permissions**. Accordée un jour à un profil n3boss délégué, elle lui permet de
s'attribuer `admin.impersonate`, `admin.settings.secrets.write`, ou de dépouiller le profil
`admin`. Aujourd'hui elle n'est donnée qu'à `admin` par défaut, donc le risque est
théorique — mais rien dans le code ne l'empêche, et l'interface « Profils RBAC » invite
précisément à déléguer.

Ironie du constat 4.1 : le semis au redémarrage sert de filet contre un dépouillement du
profil `admin`.

### 4.7 🟡 P3 — Documentation désynchronisée

**`docs/API.md:844-845`** décrit encore les matrices `admin` et `prof` avec des mentions
**« (PIN) »** derrière une vingtaine de permissions — un mécanisme supprimé, dont les routes
répondent `410 Gone`. Un lecteur en déduit qu'une seconde authentification protège les
actions sensibles ; ce n'est plus vrai.

Les matrices y sont aussi incomplètes par rapport au code (`lib/rbac.js:170-236`) :

| Profil  | Absent de `docs/API.md`                                                                       |
| ------- | --------------------------------------------------------------------------------------------- |
| `prof`  | `observations.manage.all`, `observations.manage.group`                                        |
| `admin` | `admin.impersonate`, `integrations.moodle.manage`, `observations.manage.all`, `.manage.group` |

**`docs/API.md:872-873`** conditionne l'upload et la suppression de médias à
« `teacher.access` + droits étendus » — les « droits étendus » n'existent plus (cf. 4.3).

**`docs/reference/foretmap/comptes-roles-et-groupes.md:55`** attribue l'audit à
l'administrateur (« Gestion + réglages + rôles + **audit** ») alors que `audit.read` est dans
la matrice n3boss depuis. Le tableau y résume par ailleurs le n3boss en « Toute la gestion
pédagogique », ce qui n'annonce ni la suppression de comptes n3beurs, ni la création de
comptes professeurs, ni la lecture du journal d'audit — les trois pouvoirs qu'un chef
d'établissement voudrait connaître avant de distribuer le rôle.

### 4.8 🟡 P3 — Pas de test de non-régression de la matrice n3boss

`tests/gl-permissions-catalog-alignment.test.js` fige les matrices `gl_*` et transforme toute
dérive en échec visible. **Il n'existe pas d'équivalent pour `prof` et `admin`** : un ajout
ou un retrait dans `ROLE_PERMISSION_MATRIX` passe la CI sans signal.

Manquent également des tests de **refus** au niveau HTTP. Les tests d'intégration passent
presque tous par un jeton **admin** (`tests/helpers/adminAuth.js`) ; quelques-uns forgent un
jeton `prof` (groupes, médiathèque, réglages), mais aucun n'affirme qu'un n3boss non
administrateur est **refusé** sur `/api/rbac/profiles`, `/api/settings`,
`/api/auth/admin/impersonate` ou la création d'un compte `admin`. Les gardes de §2 existent ;
rien ne les protège d'une régression.

Côté e2e, la couverture n3boss est réelle mais toujours en « chemin heureux » : aucun
scénario ne vérifie qu'un professeur ne voit pas les pôles d'administration.

### 4.9 ⚪ P4 — Divers

- **Abstraction morte** : `hasPermission` et `hasPermissionInRole` (`src/App.jsx:222-235`)
  ont désormais des corps rigoureusement identiques — résidu de l'élévation par PIN. Deux
  noms pour une seule règle entretiennent l'idée qu'une distinction subsiste.
- **Export sans lecture** : `GET /api/stats/export` n'exige que `stats.export`
  (`routes/stats.js:361`), sans permission de lecture associée. Un profil « export
  seulement » sort des noms d'élèves et leurs statistiques sans jamais avoir eu le droit de
  les consulter à l'écran.
- **Écriture autorisée par un droit de lecture** : `POST /api/observations` autorise un
  enseignant à écrire _au nom d'un élève_ sur la foi de `observations.read.all`
  (`routes/observations.js:126-135`).
- **Journal d'audit sans filtre ni pagination** : `GET /api/audit` (`routes/audit.js:22-33`)
  ne prend qu'un `limit` borné à 200, sans curseur, sans filtre par acteur, action ou date.
  L'onglet Audit devient inutilisable au-delà de quelques milliers de lignes — au moment
  précis où il servirait.
- **Fixture de test périmée** : `tests/helpers/adminAuth.js:12,25` sème `tasks.read.logs` et
  `task-projects.manage`, deux clés absentes du catalogue. Sans effet aujourd'hui, mais elles
  suggèrent des permissions qui n'existent pas.

## 5. Ce qui manque

**Une granularité qui suit les usages réels.** Le modèle propose deux positions — n3boss
complet ou profil sur mesure entièrement à construire — alors que les besoins de terrain sont
intermédiaires : le collègue qui valide les tâches de sa classe sans toucher au catalogue
d'espèces, le stagiaire qui saisit de la biodiversité sans pouvoir supprimer d'élève. Ces
profils sont **constructibles** (le RBAC le permet), mais rien ne les propose : ni profil
préconfiguré, ni modèle de duplication, ni documentation d'un « n3boss restreint » type.

**Un `media.manage` et un vrai chemin pour `forum.group.moderate`.** Cf. 4.3 : deux droits
d'action manquent au catalogue et sont assurés par `teacher.access`.

**Des variantes de portée pour les droits sur les comptes.** `students.delete` et
`students.import` n'ont pas d'équivalent `.group` (cf. 4.4).

**Une trace d'audit sur les contenus** (cf. 4.5) et **un journal exploitable** (filtres,
pagination — cf. 4.9).

**Une propagation des droits vers l'interface** (cf. 4.2) : au minimum consommer `d.auth` du
`/api/auth/me`, au mieux réémettre le jeton quand la version d'écriture RBAC a changé — la
donnée existe déjà (`getRbacWriteVersion`, `database.js`).

**Une durabilité des décisions RBAC sur les profils système** (cf. 4.1).

**Un garde-fou d'escalade dans la console RBAC** (cf. 4.6).

**Des tests de refus et un gel de matrice** (cf. 4.8).

**Une page de référence honnête sur le rôle.** La documentation fonctionnelle décrit bien les
groupes et les paliers, mais pas ce qu'un n3boss peut faire de destructeur. Le tableau des
rôles mériterait une colonne « ce qu'il peut détruire ».

## 6. Ce qui n'est pas un problème (vérifié)

Quelques pistes explorées se sont révélées saines, il est utile de le consigner pour ne pas
les réexplorer :

- **Escalade `prof` → `admin`** : fermée. Création de compte (`routes/rbac.js:108`),
  modification d'administrateur (`routes/rbac.js:698`), profil par défaut de groupe
  (`lib/groupRole.js:29`) — les trois chemins sont gardés.
- **Permission orpheline** : aucune. Toute clé de garde figure au catalogue, et
  réciproquement.
- **Routes en mutation sans garde** : aucune parmi les ≈ 90 examinées. Celles qui n'ont pas
  de middleware appliquent un contrôle en tête de handler (`canManageGroups`,
  `canManageTasks`, `perms.includes(...)`).
- **Fuite de session GL vers ForetMap** : fermée (`server.js:474-486`).
- **Aperçu « vue élève »** : filtre d'affichage seulement, sans prétention de sécurité — le
  serveur continue d'appliquer les droits réels, ce qui est le comportement correct pour un
  aperçu.
- **CSRF** : sans objet, le jeton voyage en en-tête `Authorization`, jamais en cookie.

## 7. Pistes, par lot

Ordre proposé : coût croissant, valeur décroissante.

**Lot A — la vérité (P1, faible coût)**

1. `mergeAuthMeResponse` consomme `d.auth` au lieu de redécoder le jeton
   (`src/hooks/useAuthSession.js:226`) ; `/api/auth/me` réémet un jeton quand la liste de
   permissions diffère, et pas seulement le profil (`routes/auth.js:228`).
2. Le semis distingue « profil neuf » de « profil configuré » : ne réinsérer la matrice que si
   le profil système n'a **aucune** ligne dans `role_permissions`, ou tracer les révocations
   explicites. Test de non-régression : retirer un droit, rejouer `ensureRbacBootstrap`,
   vérifier qu'il reste retiré.

**Lot B — les traces (P2)**

3. `logAudit` sur les suppressions et créations de zones, plantes, tutoriels, repères,
   groupes et contenus de visite — au minimum les suppressions.
4. Filtres (`action`, `actor`, `from`/`to`) et pagination par curseur sur `GET /api/audit`.

**Lot C — la granularité (P2/P3)**

5. `media.manage` au catalogue, substitué à `teacher.access` sur les écritures médiathèque ;
   `forum.group.moderate` (+ contrôle de périmètre) sur le verrouillage de sujet.
6. Arbitrage explicite sur la portée n3boss (§4.4) : soit assumer le périmètre global et
   retirer les `*.group` redondants de la matrice, soit basculer le n3boss par défaut sur
   `*.group` — dans les deux cas, l'écrire dans la documentation de référence.

**Lot D — les garde-fous (P3)**

7. `PUT /profiles/:id/permissions` : refuser d'accorder une permission que l'acteur ne détient
   pas, et de modifier le profil `admin` sans être administrateur.
8. `tests/foretmap-permissions-catalog-alignment.test.js` sur le modèle du test GL + un test
   d'intégration « n3boss non-admin refusé » sur quatre routes d'administration.

**Lot E — la documentation (P3)**

9. `docs/API.md:844-845, 872-873` : purge des mentions « (PIN) » et « droits étendus »,
   matrices réalignées sur `lib/rbac.js`.
10. `docs/reference/foretmap/comptes-roles-et-groupes.md` : le n3boss détaillé — audit,
    création de comptes professeurs, suppression de n3beurs.

## 8. Pour aller plus loin

- Contrat HTTP et matrices : [`docs/API.md`](API.md) (§ Profils & permissions)
- Référence fonctionnelle :
  [`docs/reference/foretmap/comptes-roles-et-groupes.md`](reference/foretmap/comptes-roles-et-groupes.md)
- Identités unifiées : [`docs/AUDIT_COMPTES_2026-09.md`](AUDIT_COMPTES_2026-09.md)
- Convergence multi-produits : [`docs/AUDIT_CONVERGENCE_APPS_2026-09.md`](AUDIT_CONVERGENCE_APPS_2026-09.md)
- Index des audits : [`docs/audits/README.md`](audits/README.md)
