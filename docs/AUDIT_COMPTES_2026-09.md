# Audit — système de comptes ForetMap × Gnomes & Licornes

> Septembre 2026. Porte sur l'identité, l'authentification et le cycle de vie des comptes des
> deux produits du monorepo : `users` (ForetMap), `gl_players` / `gl_admins` (G&L), le pont
> `lib/glGroupBridge.js`, les routeurs `routes/auth.js` et `routes/gl/auth.js`, les
> middlewares `requireTeacher` / `requireGlAuth`, `lib/rbac.js`, `lib/passwordReset.js`,
> `lib/rateLimit.js`. Déclencheur : l'import imminent de plusieurs centaines de comptes.
>
> Les deux directions retenues (**A** consolider, puis **B** unifier) ont été appliquées dans
> le même lot ; la section 5 décrit ce qui a changé et comment l'exploiter.

## 1. Cartographie avant le lot

| Magasin     | Table                                       | Mot de passe               | Rôles                       | Cycle de vie                             |
| ----------- | ------------------------------------------- | -------------------------- | --------------------------- | ---------------------------------------- |
| ForetMap    | `users` (UUID, `email` et `pseudo` uniques) | `users.password_hash`      | RBAC complet (`user_roles`) | inscription, import, suppression cascade |
| G&L joueurs | `gl_players` (INT, `pseudo` unique)         | `gl_players.password_hash` | rôle recalculé par requête  | création / import admin G&L              |
| G&L staff   | `gl_admins`                                 | aucun — délègue à `users`  | ENUM `admin` / `mj`         | auto-synchronisé à la connexion          |
| Invités     | JWT invité G&L, cookie HMAC visite / plan   | —                          | —                           | éphémère                                 |

Un seul pont : `gl_players.linked_foretmap_user_id` + le groupe miroir
`gl_classes.foretmap_group_id`, **sans clé étrangère dans aucun sens**.

## 2. Ce qui tenait (et qui est conservé)

- **Hydratation systématique depuis la base** (`hydrateAuthFromTokenClaims`,
  `hydrateGlAuthFromClaims`) : le JWT ne porte aucun droit, la révocation d'un rôle ou d'un
  compte est immédiate, sockets compris.
- **RBAC paramétrable** avec cache versionné, **jetons de réinitialisation polymorphes**
  purgés applicativement, **journal de sécurité** détaillé sur le login ForetMap,
  **plancher 12 caractères** non contournable pour les comptes privilégiés.

## 3. Constats

### Sécurité

| #      | Constat                                                                                                                                                                                                                                                                  | Gravité |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| **S1** | `POST /api/gl/auth/staff/login` absent de `authRateLimitPaths` alors qu'il vérifie un mot de passe **prof / admin ForetMap** : 1 200 essais / min / IP contre 20 / 15 min sur `/api/auth/login`. Le durcissement du login principal était contournable par la porte G&L. | élevée  |
| **S2** | `POST /api/gl/auth/link-foretmap` : oracle de mot de passe sur tous les comptes élèves, accessible à tout joueur authentifié, sans limiteur ni trace d'audit.                                                                                                            | élevée  |
| **S3** | Anti-force-brute **par IP seulement** : une classe entière derrière la même adresse bloque au bout de vingt fautes de frappe (faux positif) et aucun compte n'est protégé individuellement.                                                                              | moyenne |
| **S4** | Aucune révocation de jeton au changement de mot de passe (pas de `token_version`) : un jeton volé restait valable jusqu'à 1 h 30 après un reset.                                                                                                                         | moyenne |
| **S5** | `buildGeneratedPassword()` = `Math.random()` + horodatage, partiellement prédictible.                                                                                                                                                                                    | faible  |

### Cohérence ForetMap ↔ G&L

| #      | Constat                                                                                                                                                                                                                    | Gravité |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **C1** | Le pont ne dédoublonnait pas (`findStudentUser` appelé avec e-mail et pseudo à `null`) : importer dans G&L un élève déjà inscrit à ForetMap créait un **compte en doublon**, pseudo suffixé `-fm`, e-mail écrasé à `NULL`. | élevée  |
| **C2** | Suppressions asymétriques : supprimer l'élève laissait un lien pendant ; supprimer le joueur laissait un **compte miroir orphelin, actif, membre du groupe, capable de se connecter**.                                     | élevée  |
| **C3** | Trois mots de passe divergents : hash copié à la création puis plus jamais propagé. Le repli G&L → ForetMap masquait la moitié du problème ; **un mot de passe changé dans le jeu ne marchait pas sur ForetMap**.          | élevée  |
| **C4** | `users.is_active` et `gl_players.is_active` indépendants : désactiver côté ForetMap ne coupait pas le jeu.                                                                                                                 | moyenne |
| **C5** | Acteur `gl_player` jamais canonisé dans l'audit (`resolveCanonicalActorId` cherchait un `users.id` égal à un `gl_players.id` entier).                                                                                      | moyenne |
| **C6** | `password_must_reset` n'existait que côté G&L.                                                                                                                                                                             | faible  |
| **C7** | Réconciliation du pont uniquement au démarrage, sans endpoint ni rapport.                                                                                                                                                  | moyenne |

### Exploitation

| #      | Constat                                                                                                                                                                                         | Gravité |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **E1** | Le mot de passe généré n'était **jamais restitué** (ni création, ni import, ni export) : un import sans colonne « Mot de passe » produisait des comptes inutilisables, à réinitialiser un à un. | élevée  |
| **E2** | Import séquentiel : bcrypt(10) + ~10 requêtes de pont par ligne dans une seule requête HTTP → timeout proxy probable au-delà d'une centaine de lignes.                                          | moyenne |
| **E3** | Aucune vue de la liaison côté staff, aucun rapport de cohérence.                                                                                                                                | moyenne |

### Dette

`routes/auth.js` et `routes/gl/auth.js` réimplémentaient la même chaîne ; S1 en était
l'illustration exacte. Les tests ForetMap n'avaient que des fixtures d'authentification.

## 4. Directions

**A — consolider** le modèle à deux magasins (dédoublonnage, propagation, symétrie).
**B — faire de `users` la source unique des secrets**, `gl_players` ne gardant que le gameplay.
**C — statu quo**, écarté : C1, C2 et E1 étaient déclenchés par l'import imminent.

Décision : **A puis B dans le même lot** — chaque correctif de A est devenu du code retiré par B.

## 5. Ce qui a été fait

### 5.1 Unification des identités (B) — migration `211_gl_identity_unification.sql`

- `users` gagne `password_must_reset`, `google_sub` (unique) et `token_epoch`.
- `gl_players` perd `password_hash`, `email`, `google_sub`, `password_must_reset` :
  - `password_hash` → `legacy_password_hash` (nullable). Pour un compte miroir
    (`auth_provider = 'gl_bridge'`), le hash G&L — le plus récent — devient **le** mot de
    passe du compte et le reliquat est vidé. Pour un vrai compte élève lié, le hash ForetMap
    est conservé et le hash G&L survit en reliquat : à la **première connexion réussie avec
    lui**, il est **adopté comme mot de passe unique** puis vidé (`verifyGlPlayerPassword`).
    Aucun élève n'est bloqué par la migration.
  - `email` → `legacy_email` : repris dans `users.email` quand le compte n'en avait pas et
    que l'adresse était libre ; sinon conservé en reliquat, visible dans la réconciliation.
- Liens pendants remis à `NULL`, un compte lié à deux joueurs ramené à un ; index unique
  `uq_gl_players_linked_user` ; **clé étrangère** `fk_gl_players_user` (`ON DELETE CASCADE`).
- Toute lecture ou écriture d'un secret joueur passe par **`lib/glPlayerIdentity.js`**
  (`findGlPlayerByIdentifier`, `verifyGlPlayerPassword`, `setGlPlayerPassword`…).
- L'identifiant de connexion G&L accepte le pseudo de jeu, l'e-mail ou le pseudo du compte
  lié ; l'identifiant ForetMap accepte aussi le pseudo de jeu (`lib/identity.js`).
- `POST /api/gl/auth/link-foretmap` devient une **fusion** : le joueur bascule sur le compte
  élève, le miroir est supprimé ; `DELETE` recrée un miroir avec le mot de passe courant.

### 5.2 Import et création (lot 1)

- **Dédoublonnage** (`findStudentUser`) : même e-mail, ou même pseudo **et** mêmes prénom/nom
  → le compte ForetMap existant est rattaché, son mot de passe conservé
  (`reusedExisting`, `totals.reused_existing`).
- **Identifiants restitués une seule fois** : `credentials[]` dans le rapport d'import,
  `generatedPassword` dans la réponse de `POST /players` ; table, copie et CSV côté staff
  (`GLPlayerCredentialsTable`). Génération `crypto.randomBytes`, alphabet sans ambiguïté.
- Hachages bcrypt en **parallèle borné** (4) avant les insertions.

### 5.3 Cycle de vie (lot 2)

- Supprimer l'élève supprime son joueur (409 si une partie le retient) ; supprimer le joueur
  supprime le **miroir**, mais conserve un vrai compte élève (retiré du groupe de classe).
- Désactiver le compte ForetMap coupe le jeu ; désactiver le joueur ne touche pas le compte.
- `GET` / `POST /api/gl/admin/players/reconcile` : rapport (joueurs sans compte, miroirs
  orphelins, reliquats de mot de passe / e-mail, doublons probables) et rattrapage.

### 5.4 Durcissement (lot 3)

- **`lib/loginThrottle.js`** : verrou progressif par identifiant dès le 5ᵉ échec (30 s, doublé,
  plafonné à 15 min), sur les connexions ForetMap et G&L et sur `link-foretmap` ; le plafond
  IP passe à 60 / 15 min (`FORETMAP_AUTH_RATE_LIMIT_PER_15MIN`).
- `staff/login` et `link-foretmap` sous le limiteur strict ; **test de couverture**
  (`tests/auth-rate-limit-coverage.test.js`) qui échoue si une route publique vérifiant un
  mot de passe n'y figure pas.
- **`users.token_epoch`** : incrémenté à chaque écriture de mot de passe (reset, changement,
  admin), claim `tokenEpoch` dans tous les jetons, refus à l'hydratation
  (`401 SESSION_REVOKED` côté ForetMap, `401` côté G&L) ; la session courante reçoit un jeton
  neuf après un changement.
- Acteur `gl_player` canonisé sur son compte `users` dans `audit_log` / `security_events`.

## 6. Points restants

- La chaîne OAuth Google reste dupliquée entre les deux routeurs (lot 10 du plan de
  convergence) ; `gl_players.google_sub` a migré vers `users.google_sub`, mais les callbacks
  sont toujours deux.
- Un compte staff G&L sans `foretmap_user_id` (Google seul, jamais lié) n'a pas d'époque de
  jeton : sa session n'est révoquée que par désactivation.
- Le verrou par compte est en mémoire (un processus) ; un redémarrage le remet à zéro.
