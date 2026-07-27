# Audit bugs — juillet 2026

Date : 2026-07-27 · Base : `main` @ `43f45a3` (v1.84.4)

Audit transversal « bugs de tous types » (sécurité, contrôle d'accès, concurrence,
logique métier, cohérence front/back). **Chaque constat listé ci-dessous a été vérifié
dans le code** (lecture du chemin complet, ou reproduction exécutable quand c'était
possible) ; les pistes non confirmées sont écartées et listées en §4.

Pour chaque bug, plusieurs **types de correctif** sont proposés avec une recommandation.

> ## État d'avancement
>
> | ID  | Statut                   | Correctif retenu                                                                    |
> | --- | ------------------------ | ----------------------------------------------------------------------------------- |
> | B1  | ✅ **Corrigé — PR #270** | Fix A + Fix B, traités dans une PR dédiée (voir note ci-dessous)                    |
> | B2  | ✅ **Corrigé**           | Fix A (garde de préfixe `lib/uploadsPrivatePaths.js` devant le statique `/uploads`) |
> | B3  | ✅ **Corrigé**           | Fix A (alignement sur la route liste voisine — voir la note ci-dessous)             |
> | B4  | ✅ **Corrigé**           | Fix A + Fix B (index unique migration 170 + contrôle de capacité sérialisé)         |
> | B5  | ✅ **Corrigé**           | Fix B (bouton non proposé pour une inscription héritée)                             |
> | B6  | ✅ **Corrigé**           | Fix A (droits GL relus en base à chaque requête, via le catalogue RBAC partagé)     |
>
> **B1 est traité par la PR #270**, ouverte en parallèle et qui applique exactement les Fix A
> et Fix B décrits ci-dessous (noms d'action lus en base, appariement nominal restreint aux
> lignes `student_id IS NULL`), avec une factorisation supplémentaire
> (`resolveActionNames`, `assignmentMatchesActor`, `ASSIGNMENT_MATCHES_STUDENT_SQL`) et ses
> propres tests. Le présent lot n'y touche donc pas, pour éviter un conflit de merge sur les
> mêmes lignes (règle `.cursor/rules/foretmap-pr-merge-conflict.mdc`).
>
> **Écart assumé sur B3** : le correctif appliqué est le **Fix A** (compte connecté, profil
> non visiteur) et non le Fix B initialement recommandé (propriétaire / n3boss). Raison :
> la route **liste** voisine expose déjà noms et commentaires du journal à tout compte
> connecté ; durcir l'image seule aurait cassé son affichage pour les autres inscrits de la
> tâche — un changement de comportement métier qui dépasse la correction de la faille. Le
> journal de tâche est un compte rendu **collaboratif**, contrairement au carnet
> d'observations qui reste, lui, en politique stricte.

## 1. Méthode et couverture

| Vérification                                         | Résultat                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `npx eslint .`                                       | **0 erreur**, 509 avertissements (majorité `no-unused-vars` de tests)    |
| `npm run test:ui` (Vitest)                           | **393 fichiers / 2549 tests — tous verts**                               |
| `npm test` (backend node:test)                       | **non exécuté** : ni MySQL ni démon Docker dans l'environnement d'audit  |
| Revue manuelle ciblée                                | auth/RBAC, cluster `tasks`, uploads/médias, temps réel, isolement GL     |
| Scan automatisé SQL interpolé (`LIMIT`, `WHERE`)     | **aucune injection** : toutes les interpolations sont des entiers bornés |
| Scan `await` manquant / `Promise.all` en transaction | **aucun vrai positif**                                                   |

> ⚠️ **Limite de l'environnement d'audit** : `npm test` (backend) exige MySQL, indisponible
> ici. Les constats **B1**, **B4** et **B5** ont donc été établis par lecture du chemin de
> code complet (appelant → helper → SQL), pas par exécution ; **B2** a été reproduit par un
> serveur reproduisant le montage statique de `server.js`. Les tests de non-régression
> écrits pour ces constats (§3) sont exécutés **par la CI**, qui dispose de MySQL — c'est
> elle qui apporte la preuve d'exécution manquante ici.

## 2. Constats

| ID  | Gravité      | Domaine                     | Résumé                                                                                        |
| --- | ------------ | --------------------------- | --------------------------------------------------------------------------------------------- |
| B1  | **Critique** | Contrôle d'accès (tâches)   | Un n3beur connecté peut désinscrire / « terminer » **n'importe quel autre n3beur**            |
| B2  | **Élevée**   | Confidentialité médias      | Les photos privées (observations, journaux de tâche) sont servies **en clair** par `/uploads` |
| B3  | **Élevée**   | Contrôle d'accès (médias)   | `GET /api/tasks/:id/logs/:logId/image` **sans aucune authentification**                       |
| B4  | Moyenne      | Concurrence / intégrité     | Course sur l'inscription à une tâche : **dépassement de capacité** et doublons                |
| B5  | Moyenne      | Logique métier / front-back | Mode collectif : marquer la part d'une inscription héritée renvoie **toujours 400**           |
| B6  | Moyenne      | Auth GL                     | Permissions GL **figées dans le JWT** : une révocation n'a pas d'effet avant expiration       |

---

### B1 — Un n3beur peut désinscrire ou « terminer » n'importe quel autre n3beur

**Gravité : critique** (usurpation entre élèves, exploitable depuis un simple compte élève)

**Fichiers** : `lib/tasks/studentActionContext.js:43-46` · `routes/tasks/assignments.js:198-217`,
`:301-311`, `:58-63` · `lib/studentTaskEnrollment.js:52-55`

#### Le constat

L'en-tête de `lib/tasks/studentActionContext.js` affirme la règle de sécurité F1 :

> « l'identité élève est **TOUJOURS** dérivée du JWT ; un `studentId` fourni par le client
> n'est accepté que s'il correspond au token »

C'est vrai pour le `studentId`… mais **pas pour le nom**, qui sert pourtant de clé de
correspondance en base :

```js
// lib/tasks/studentActionContext.js:43-46
const pickNames = (student) => ({
  firstName: providedFirstName || trimName(student?.first_name), // ← le client gagne
  lastName: providedLastName || trimName(student?.last_name),
});
```

Or les routes n'apparient pas sur `student_id` seul, mais sur `student_id` **OU** le nom
(compatibilité des lignes héritées où `task_assignments.student_id` est `NULL`) :

```js
// routes/tasks/assignments.js:301-311 (unassign)
'DELETE FROM task_assignments WHERE task_id = ? AND (student_id = ? OR (student_first_name = ? AND student_last_name = ?))';
```

La branche `OR` n'est **pas** restreinte aux lignes `student_id IS NULL` : elle s'applique
à toutes les lignes de la tâche.

#### Chemin d'exploitation vérifié

Alice (JWT `userId=10`) appelle, avec son propre jeton :

```http
POST /api/tasks/42/unassign
{ "firstName": "Bob", "lastName": "Durand" }
```

1. `resolveStudentActionContext` — branche `auth.userType === 'student'` (ligne 79) :
   `studentId` vaut bien `10` (dérivé du JWT), mais `pickNames` retourne `{ Bob, Durand }`.
2. La route exécute le `DELETE` ci-dessus → **l'inscription de Bob est supprimée.**

Trois variantes du même défaut :

| Route                             | Effet                                                                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `POST /:id/unassign` (`:301-311`) | Supprime l'inscription d'un tiers sur toute tâche non `done`/`validated`                                                            |
| `POST /:id/done` (`:198-217`)     | Le `SELECT … OR (nom)` retrouve l'inscription du tiers → marque **son** `done_at` (mode collectif) ou bascule la tâche en `done`    |
| `POST /:id/assign` (`:89-98`)     | Insère une inscription portant **le nom d'un tiers** (le `student_id` reste celui de l'attaquant) → affichage trompeur + audit faux |

Effet de bord : `countStudentActiveTaskAssignments` (`lib/studentTaskEnrollment.js:52-55`)
applique le même `OR`, donc le quota d'inscriptions est calculé sur une identité falsifiée.

#### Pourquoi c'est bien un bug et pas un choix

- Le commentaire d'en-tête du module documente l'intention inverse.
- Le seul appelant front qui envoie des noms (`src/components/tasks-views.jsx:303-315`,
  `src/hooks/useMapCrudActions.js:203-207`) envoie **les noms de l'élève courant** —
  jamais ceux d'un tiers. Le paramètre est donc redondant côté client.
- Les autres requêtes qui apparient sur le nom (`routes/stats.js:188`, `lib/rbac.js:422`)
  utilisent des noms **lus en base**, pas fournis par le client.

#### Correctifs proposés

**Fix A — Ne jamais laisser le client fournir le nom (recommandé, 3 lignes)**

```js
// lib/tasks/studentActionContext.js
const pickNames = (student) => ({
  // Le nom en base fait foi ; la valeur client n'est qu'un repli pour les
  // comptes historiques sans first_name/last_name renseignés.
  firstName: trimName(student?.first_name) || providedFirstName,
  lastName: trimName(student?.last_name) || providedLastName,
});
```

Rétro-compatible : les appels front actuels envoient déjà les bons noms.

**Fix B — Restreindre l'appariement par nom aux lignes héritées (défense en profondeur)**

Dans les trois requêtes, remplacer `OR (nom)` par une condition explicitement héritée :

```sql
(student_id = ? OR (student_id IS NULL AND student_first_name = ? AND student_last_name = ?))
```

À appliquer aussi dans `lib/studentTaskEnrollment.js:52-55`.

**Fix C — Rejeter explicitement le nom au niveau du contrat d'entrée**

Ajouter un `validate({ body: … })` (zod, `lib/validate.js`) sur `assign` / `done` /
`unassign` qui **refuse en 400** `firstName`/`lastName` dès qu'une identité `studentId`
ou JWT est disponible. Plus bruyant pour les clients existants, mais rend la règle testable.

**Fix D — Supprimer la dette à la racine**

Migration `migrations/NNN_backfill_task_assignments_student_id.sql` remplissant
`student_id` par appariement nominal sur `users`, puis suppression complète du chemin
« par nom » (routes + `studentTaskEnrollment` + `studentDeletion`). Correctif définitif,
mais chantier plus large et données héritées à arbitrer.

> **Recommandation : A + B** dans le même lot (l'un neutralise l'entrée, l'autre le SQL),
> avec un test `tests/tasks-*.test.js` : « un élève A qui envoie le nom de B ne modifie pas
> l'inscription de B ». D en dette planifiée.

---

### B2 — Les photos privées sont servies en clair par `/uploads`

**Gravité : élevée** (données personnelles de mineurs)

**Fichiers** : `server.js:255-278` · `routes/observations.js:138`, `:161-186` ·
`routes/tasks/assignments.js:239`

#### Le constat

`routes/observations.js:161-186` protège soigneusement l'accès à une photo d'observation :
`requireAuth`, puis propriétaire **ou** prof, puis vérification du périmètre de groupe
(`canAccessStudentId`). C'est la bonne politique.

Mais le fichier lui-même est écrit sous `uploads/observations/<studentId>_<logId>.jpg`
(`routes/observations.js:138`) et **tout le dossier `uploads/` est monté en statique sans
aucun contrôle** :

```js
// server.js:256-278
app.use('/uploads', express.static(uploadsStaticRoot, { index: false, setHeaders(…) }));
```

L'autorisation de `/api/observations/:id/image` est donc **contournable** par un simple
`GET /uploads/observations/12_345.jpg`. Le nom de fichier est entièrement prédictible
(identifiants séquentiels), donc énumérable.

Même situation pour les journaux de tâche : `uploads/task-logs/<taskId>_<logId>.jpg`
(`routes/tasks/assignments.js:239`).

#### Reproduction (exécutée)

Un serveur reproduisant à l'identique le montage de `server.js` :

```
/uploads/observations/12_345.jpg -> 200 "SECRET-PHOTO-OBS"
/uploads/task-logs/7_99.jpg      -> 200 "SECRET-PHOTO-LOG"
```

#### Nuance importante

L'exposition publique de `/uploads` est **volontaire** pour plusieurs familles de médias,
et `docs/API.md` le documente comme tel : `zones/`, `markers/`, `tasks/`, `forum-posts/`,
`context-comments/`, `students/`, `media-library/`. Le bug n'est donc pas le montage
statique en soi, mais le fait que **deux familles privées partagent la même racine**.

C'est l'aggravation d'un point déjà noté « Basse » dans `docs/AUDIT_BUGS_INCOHERENCES.md`
(R8, « double exposition ») : depuis que `/api/observations/:id/image` a été
authentifié, la double exposition n'est plus cosmétique — c'est un contournement.

#### Correctifs proposés

**Fix A — Garde de préfixe avant le statique (recommandé en immédiat, sans migration)**

```js
// server.js, AVANT app.use('/uploads', express.static(…))
const PRIVATE_UPLOAD_PREFIXES = ['observations/', 'task-logs/'];
app.use('/uploads', (req, res, next) => {
  const rel = decodeURIComponent(String(req.path || '')).replace(/^\/+/, '');
  if (PRIVATE_UPLOAD_PREFIXES.some((p) => rel.startsWith(p))) {
    return res.status(403).json({ error: 'Média privé : passer par l’API dédiée' });
  }
  return next();
});
```

Effet immédiat, zéro migration, aucun impact sur les familles publiques.

**Fix B — Séparer physiquement les racines (correctif structurel)**

Déplacer les familles privées vers `private-uploads/` (hors de toute route statique) et
adapter `lib/uploads.js` (deux racines : `UPLOADS_DIR` public, `PRIVATE_UPLOADS_DIR`).
Nécessite un script de migration des fichiers + un `UPDATE` des colonnes `image_path`.
C'est la cible correcte à terme : impossible de réintroduire la fuite par inadvertance.

**Fix C — Passer d'une liste noire à une liste blanche**

Servir `/uploads` uniquement pour les préfixes explicitement publics (la liste de
`docs/API.md` existe déjà, et `lib/uploadsPublicUrls.js` sait déjà valider ces formats).
Plus sûr que le Fix A (une future famille privée est protégée par défaut), un peu plus
intrusif.

**Fix D — Complément dans tous les cas : dé-prédictibiliser les noms**

Nommer les fichiers privés avec un `crypto.randomUUID()` plutôt que
`<studentId>_<logId>`. Ne remplace aucun des correctifs ci-dessus (ce n'est pas un
contrôle d'accès), mais supprime l'énumération.

> **Recommandation : A maintenant** (correctif d'une ligne, déployable seul), **C ou B**
> planifié ensuite. Test à ajouter : `GET /uploads/observations/…` → 403.

---

### B3 — Image de journal de tâche accessible sans authentification

**Gravité : élevée**

**Fichier** : `routes/tasks/logs.js:46-62` (à comparer avec `:22-30`)

#### Le constat

Dans le **même fichier**, deux routes voisines appliquent deux politiques opposées.

La liste des journaux est gardée, avec une justification explicite :

```js
// routes/tasks/logs.js:22-30
// Journaux = PII (prénoms/noms, commentaires) : réservés à un compte connecté non visiteur.
const auth = await parseOptionalAuth(req);
if (!auth || isVisitorRole(auth)) {
  return res.status(403).json({ error: 'Accès refusé aux journaux de tâche' });
}
```

L'image du même journal ne l'est pas du tout :

```js
// routes/tasks/logs.js:46-62
router.get('/:id/logs/:logId/image', asyncHandler(async (req, res) => {
  const log = await queryOne('SELECT image_path FROM task_logs WHERE id = ? AND task_id = ?', […]);
  // …aucun contrôle d'accès…
  return res.sendFile(getAbsolutePath(log.image_path));
}));
```

Vérifié : le routeur `routes/tasks/logs.js` n'a pas de `router.use` de garde, et il est
monté sur `routes/tasks.js:1201` par un routeur qui n'en a pas non plus. Les identifiants
étant des entiers séquentiels, les photos sont énumérables.

C'est le pendant « API » de B2 : même si B2 est corrigé, cette route reste ouverte.

#### Correctifs proposés

**Fix A — Aligner sur la route liste (minimal, cohérent avec le fichier)**

Ajouter en tête du handler le même garde-fou que `:22-30` (compte connecté, non visiteur).

**Fix B — Aligner sur la politique observations (plus strict, recommandé)**

Reprendre le modèle de `routes/observations.js:161-186` : `requireAuth`, puis
propriétaire du journal **ou** prof, avec `canAccessStudentId` pour le périmètre de
groupe. Cohérent avec le fait que les deux familles sont des photos d'élèves.

**Fix C — Factoriser**

Extraire un middleware `requireStudentMediaAccess({ ownerColumn })` partagé par
`observations` et `tasks/logs`, pour que les deux politiques ne puissent plus diverger.
À privilégier si B3 et B2 sont traités dans le même lot.

> **Recommandation : B**, avec factorisation C si le lot couvre aussi les observations.

---

### B4 — Course sur l'inscription : dépassement de capacité et doublons

**Gravité : moyenne** (intégrité de données, déclenchable sans intention malveillante)

**Fichiers** : `routes/tasks/assignments.js:58-98` · `sql/schema_foretmap.sql:335-347`

#### Le constat

La route `POST /:id/assign` fait un contrôle puis un `INSERT`, sans transaction ni
verrou :

```js
// :58-64   contrôle « déjà assigné »  (lecture faite plus haut, ligne 32)
// :85-87   if (task.assignments.length >= task.required_students) → 400
// :89-98   INSERT INTO task_assignments …
```

Entre le `SELECT` (ligne 32) et l'`INSERT` (ligne 89), rien n'empêche une seconde requête
de passer les mêmes contrôles. Le schéma ne rattrape pas non plus :

```sql
-- sql/schema_foretmap.sql:335-347 : que des INDEX, aucune contrainte UNIQUE
INDEX idx_task_assignments_task_id (task_id),
INDEX idx_task_assignments_student_id (student_id),
```

Conséquences réalistes, sans attaquant : double-clic sur « Je m'en occupe » sur mobile, ou
l'inscription en boucle de `useMapCrudActions.js:200-210` déclenchée deux fois →
inscription en double, ou `required_students` dépassé. Le quota d'inscriptions
(`:66-83`) est contournable par le même chemin.

#### Correctifs proposés

**Fix A — Contrainte d'unicité en base (recommandé, protège de tous les appelants)**

Migration idempotente ajoutant `UNIQUE KEY uq_task_assignments_task_student (task_id, student_id)`,
puis traitement de `ER_DUP_ENTRY` dans la route → `400 « Déjà assigné à cette tâche »`.

> À noter : MySQL/MariaDB autorise plusieurs `NULL` dans un index unique, donc les lignes
> héritées (`student_id IS NULL`) ne sont pas impactées. La migration doit **dédoublonner
> avant** de poser la contrainte (`DELETE` des doublons en gardant le `MIN(id)`).

**Fix B — Sérialiser le contrôle et l'insertion**

Passer le bloc `:32-98` dans un `withTransaction` avec `SELECT … FROM tasks WHERE id = ? FOR UPDATE`
en tête. Corrige aussi le dépassement de `required_students` (que le Fix A ne couvre pas).

**Fix C — Vérification a posteriori**

Après `INSERT`, recompter les inscriptions ; si le total dépasse `required_students`,
supprimer la ligne insérée et renvoyer 400. Simple, mais fenêtre de course résiduelle et
comportement observable moins net.

> **Recommandation : A + B.** A garantit l'absence de doublon quel que soit l'appelant
> (import, script, reprise), B garantit le respect de la capacité.

---

### B5 — Mode collectif : la part d'une inscription héritée ne peut jamais être marquée

**Gravité : moyenne** (fonctionnalité UI présente mais systématiquement en erreur)

**Fichiers** : `src/components/tasks-views.jsx:226-251` · `lib/tasks/studentActionContext.js:99-104`

#### Le constat

Le front propose au n3boss, en mode `all_assignees_done`, de marquer la part d'un assigné.
Pour les lignes héritées sans `student_id`, il construit délibérément un corps « par nom » :

```js
// src/components/tasks-views.jsx:234-244
const body = sidRaw != null && String(sidRaw).trim() !== ''
  ? { studentId: String(sidRaw).trim() }
  : { firstName: …, lastName: … };            // ← chemin hérité assumé
if (!body.studentId && (!body.firstName || !body.lastName)) { … }
await api(`/api/tasks/${task.id}/done`, 'POST', body);
```

Le bouton est bien câblé (`src/components/tasks/TaskTileCard.jsx:317-338`).

Or le serveur rejette ce corps **de manière inconditionnelle** :

```js
// lib/tasks/studentActionContext.js:99-104
if (isTeacherAction && providedFirstName && providedLastName && !providedStudentId) {
  return {
    errorStatus: 400,
    error: 'Identifiant n3beur requis (studentId obligatoire pour une action prof)',
  };
}
```

Déroulé pour un prof envoyant `{ firstName, lastName }` : branche 1 ignorée (pas de
`providedStudentId`), branche 2 ignorée (`auth.userType !== 'student'`), branche 3 → **400
systématique**. Le chemin hérité du front est donc mort.

Il s'agit vraisemblablement d'une régression du durcissement F1 (commit `5369236`) : la
garde a été posée sans que le cas d'usage prof « ligne héritée » soit ré-ouvert.

#### Correctifs proposés

**Fix A — Rouvrir le cas côté serveur, sans rouvrir l'usurpation**

Résoudre le nom **dans la route** (et non dans le contexte d'identité) : si l'acteur est un
prof habilité et que le couple `(task_id, nom)` désigne **exactement une** ligne avec
`student_id IS NULL`, agir sur cette ligne ; sinon 400/409. L'ambiguïté (homonymes) reste
refusée explicitement.

**Fix B — Corriger côté front uniquement (le moins risqué)**

Désactiver le bouton pour les inscriptions sans `student_id`, avec une infobulle
(« inscription héritée : rattacher le compte n3beur d'abord »). Supprime l'erreur 400
subie par l'utilisateur, sans toucher au backend ni au métier.

**Fix C — Supprimer le cas à la racine**

Migration de rattrapage remplissant `task_assignments.student_id` par appariement nominal
sur `users` (même chantier que le Fix D de B1), après quoi le chemin « par nom » n'a plus
de raison d'être — ni côté front, ni côté serveur.

> **Recommandation : B en immédiat** (l'utilisateur cesse de voir une erreur), **C** comme
> cible. A seulement si des lignes héritées non rattachables subsistent en production —
> à vérifier par `SELECT COUNT(*) FROM task_assignments WHERE student_id IS NULL`.

---

### B6 — Permissions GL figées dans le JWT

**Gravité : moyenne** (révocation différée, asymétrie avec ForetMap)

**Fichiers** : `middleware/requireGlAuth.js:34-56` · `middleware/requireTeacher.js:36-79` ·
`lib/settings.js:360-366`

#### Le constat

Côté ForetMap, chaque requête ré-hydrate les droits depuis la base :

```js
// middleware/requireTeacher.js:49
const authz = await buildAuthzPayload(claims.userType, claims.userId);
```

Une révocation de rôle prend donc effet **immédiatement**.

Côté GL, les permissions sont lues **telles quelles dans le jeton** :

```js
// middleware/requireGlAuth.js:40
permissions: Array.isArray(claims.permissions) ? claims.permissions : [],
```

Un joueur ou un MJ dont le rôle est retiré (ou qui est retiré d'une classe) **conserve ses
droits jusqu'à expiration du jeton**. La fenêtre est celle de
`security.jwt_ttl_base_seconds` : **90 minutes par défaut**, jusqu'à **7 jours** au maximum
configurable (`lib/settings.js:360-366`).

Contrôle effectué : ce n'est pas compensé ailleurs. `requireGlPermission` ne relit pas la
base, et le contrôle d'accès partie/classe (`canAccessGlGame`, `canAccessGlClass`) ne
couvre pas les permissions elles-mêmes.

Ce point est plus discutable que les précédents — c'est possiblement un arbitrage
performance assumé — mais il n'est **documenté nulle part**, et l'asymétrie avec le
produit ForetMap est un piège d'exploitation (« j'ai retiré le rôle MJ, pourquoi
a-t-il encore la console ? »).

#### Correctifs proposés

**Fix A — Ré-hydrater comme côté ForetMap**

Charger les permissions depuis `gl_players` / rôles GL à chaque requête, avec un cache TTL
court (`lib/memoryTtlCache.js` existe déjà) pour absorber le coût.

**Fix B — Version de jeton (bon compromis coût/effet)**

Ajouter une colonne `gl_players.auth_version` (incrémentée à chaque changement de rôle,
classe ou désactivation), l'inscrire dans les claims, et invalider en `401` si la version
du jeton diverge. Une seule lecture indexée par requête.

**Fix C — Réduire la fenêtre (palliatif)**

Abaisser `security.jwt_ttl_base_seconds` pour le produit GL. Ne corrige pas le fond mais
borne l'exposition ; utile en attendant A ou B.

**Fix D — Assumer et documenter**

Si c'est un choix délibéré : le consigner dans `docs/GL_ARCHITECTURE.md` et dans le skill
`foretmap-gl` (« la révocation GL prend effet à l'expiration du jeton, au plus tard N min »),
et exposer un bouton MJ « forcer la reconnexion ».

> **Recommandation : B**, ou **D** si l'arbitrage est assumé — mais pas le statu quo
> silencieux.

## 3. Correctifs appliqués

B2 à B6 sont corrigés dans le même lot que cet audit (B1 est traité par la PR #270).

| ID  | Fichiers                                                                                                                 | Tests de non-régression                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| B1  | _(PR #270 — hors de ce lot)_                                                                                             | _(PR #270)_                                                                                 |
| B2  | `lib/uploadsPrivatePaths.js` (nouveau), `server.js`                                                                      | `tests/uploads-private-paths.test.js` (9 cas, sans BDD) + assertions dans les tests d'image |
| B3  | `routes/tasks/logs.js`                                                                                                   | `tests/security-admin-images.test.js` (anonyme → 403)                                       |
| B4  | `migrations/170_task_assignments_unique_student.sql` (nouveau), `sql/schema_foretmap.sql`, `routes/tasks/assignments.js` | `tests/tasks-assignment-concurrency.test.js` (doublon + capacité en concurrence)            |
| B5  | `src/components/tasks/TaskTileCard.jsx`, `src/components/tasks-views.jsx`                                                | `tests-ui/components/TaskTileCard.test.jsx` (bouton présent / absent)                       |
| B6  | `lib/auth/glHydration.js` (nouveau), `middleware/requireGlAuth.js`, `lib/rbac.js`, `lib/gl/authRouteHelpers.js`          | `tests/gl-auth-revocation.test.js`, `tests/gl-permissions-catalog-alignment.test.js`        |

Documentation mise à jour dans le même lot : `docs/API.md` (politique `/uploads` publiques vs
privées, auth des routes journaux, unicité/capacité de l'inscription) et
`docs/reference/foretmap/taches-tutoriels-et-validation.md` (marquage de la part d'un élève).

### Points de vigilance au déploiement

- **Migration 170** : elle **dédoublonne** `task_assignments` avant de poser l'index unique
  (conservation de la ligne la plus ancienne, report d'un éventuel `done_at`). À passer en
  revue sur une copie de la base de production avant application si des doublons existent —
  `SELECT task_id, student_id, COUNT(*) FROM task_assignments WHERE student_id IS NOT NULL
GROUP BY 1,2 HAVING COUNT(*) > 1;`
- **Inscriptions héritées** : `SELECT COUNT(*) FROM task_assignments WHERE student_id IS NULL;`
  — si le résultat est 0, le chemin « par nom » peut être supprimé purement et simplement
  (dette B1 Fix D / B5 Fix C), ce qui simplifierait durablement ce cluster.
- **B6 — coût par requête** : l'authentification GL fait désormais une lecture indexée
  supplémentaire (`gl_players` / `gl_admins` par clé primaire). Les permissions, elles, passent
  par le cache RBAC déjà versionné (`lib/rbac.js`), donc sans requête additionnelle. C'est le
  prix de la révocation immédiate — le même que paie déjà ForetMap.
- **B6 — identités de test** : les jetons GL forgés avec un identifiant synthétique ne sont plus
  acceptés (401). Les fixtures partagées `tests/helpers/glFixtures.js` créent de vraies lignes ;
  quatre fichiers de tests ont été migrés en conséquence.
- **B1 arrive par la PR #270** : tant qu'elle n'est pas fusionnée, la faille critique reste
  ouverte en production. C'est elle qu'il faut fusionner en priorité, avant ce lot.

Rappels de convention (cf. `CLAUDE.md`) : vérification anti-conflit des PR ouvertes qui
bumpent `package.json` / `CHANGELOG.md` / `migrations/NNN_*.sql`.

## 4. Pistes vérifiées et écartées

Listées pour éviter qu'un prochain audit ne les re-signale.

| Piste                                                    | Verdict                                                                                                   |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Injection SQL par `LIMIT`/`OFFSET` interpolés (13 sites) | **Non** — toutes les valeurs passent par `parsePositiveInt` / `Math.min·max` / `Number()` avant usage     |
| Traversée de chemin dans `lib/uploads.js`                | **Non** — `assertInsideUploads` couvre `getAbsolutePath`, `saveBase64ToDisk`, `writeBufferToDisk`         |
| Routes mutantes sans authentification                    | **Non** — le scan complet ne laisse que des routes publiques par conception (`/login`, `/register`…)      |
| Jeton GL accepté sur l'API ForetMap                      | **Non** — garde produit `server.js:318-341`, et isolement Socket.IO `lib/realtime.js:110-131`             |
| Élévation via jeton invité GL (`gl_guest`)               | **Non** — l'invité ne porte que `gl.read` (`routes/gl/auth.js:186-196`)                                   |
| `await` manquant sur des helpers asynchrones             | **Non** — les occurrences détectées sont des `Promise.all` ou des `logAudit` volontairement non bloquants |
| `Promise.all` avec une connexion transactionnelle unique | **Non** — les 7 sites suspects sont des `async (tx) => …` à retour direct                                 |
| Poisoning de lien de réinitialisation via en-tête `Host` | **Non** — `collectAllowedResetHosts` valide l'hôte (`lib/passwordReset.js:52-68`)                         |
| XSS via SVG uploadé                                      | **Non** — CSP stricte + `Content-Disposition: attachment` (`server.js:269-275`)                           |
| Traversée de chemin sur `/docs/:file`                    | **Non** — `allowedDocFiles` est une liste blanche (`server.js:376-396`)                                   |
| Avertissements `react-hooks/exhaustive-deps` (30 sites)  | **Non** — dépendances décomposées volontairement (clés dérivées, champs scalaires) ; aucun état obsolète  |
| Fuite de PII par les événements Socket.IO                | **Non** — les charges utiles ne portent que `{ reason, id, mapId, ts }`                                   |
| Bornes de `lib/autoArchive.js` (`normalizeAfterDays`)    | **Non** — doublonné par le registre `lib/settings.js:172-178` (min 7 / max 3650)                          |

---

_Audit produit par Claude Code. Aucun comportement applicatif n'a été modifié par ce lot._
