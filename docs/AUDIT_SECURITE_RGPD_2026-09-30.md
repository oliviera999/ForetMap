# Audit sécurité, confidentialité et RGPD — failles, comptes, accès au code source (30 septembre 2026)

> **Instantané daté** (convention : [`docs/audits/README.md`](audits/README.md)). Ne pas réécrire
> les constats ; marquer « Traité » sous chacun, en conservant le texte d'origine.
>
> **Portée** : le monorepo entier — ForetMap, Plan, Gnomes & Licornes (GL) — sous quatre angles :
> authentification / sessions / droits ; failles applicatives des routes et du front ;
> confidentialité et RGPD ; accès au code source et secrets (dépôt, historique, CI, production).
>
> **Point de départ** : les audits
> [`AUDIT_SECURITE_2026-09-22.md`](AUDIT_SECURITE_2026-09-22.md),
> [`AUDIT_RGPD_2026-09-28.md`](AUDIT_RGPD_2026-09-28.md),
> [`AUDIT_SECURITE_2026-09-29.md`](AUDIT_SECURITE_2026-09-29.md) et
> [`AUDIT_COMPTES_DROITS_GROUPES_2026-09-18.md`](AUDIT_COMPTES_DROITS_GROUPES_2026-09-18.md).
> Leurs constats « Traités » ne sont pas repris. Leurs constats ouverts sont revérifiés dans le
> code (§ 7). Tout le reste est **nouveau**.
>
> **Méthode et limites** :
>
> - Relecture du code à `dcab25c` (v1.197.12). Chaque constat important a été relu à la ligne
>   citée.
> - `npm audit --omit=dev` a été exécuté.
> - Recherche de secrets dans l'arbre et l'historique **local**. Ce clone est superficiel
>   (100 commits), d'où un complément par l'API GitHub.
> - **Rien n'a été sondé sur la production.**
> - Aucune valeur de secret, aucun e-mail réel et aucun hachage n'est recopié ici.

> **Statut (30/09, même jour)** : **39 constats traités sur 40**, avec tests. Seul **CS1**
> reste ouvert : il ne se corrige pas dans le code (purge des `refs/pull/*` par le support
> GitHub, actions du propriétaire au § 10). Détail constat par constat : § 11.

## Verdict

Aucune faille critique nouvelle dans le code. **Le seul critique reste hors code** : le dump de
production, toujours joignable dans les `refs/pull/*` de GitHub (C2 du 29/09, R1 du 28/09).

Le risque dominant est la **prise de compte par l'e-mail**. Trois voies indépendantes y mènent :

- l'entrée LTI vers G&L (AC1) ;
- le pont GL → ForetMap (GL1) ;
- le changement d'e-mail d'un tiers par un profil délégué, ou de son propre e-mail sans mot de
  passe (AC2, AC3).

Toutes les trois tiennent à ce que l'e-mail est traité comme une donnée de profil, alors qu'il
est un **facteur d'authentification** : c'est lui qui reçoit le lien « mot de passe oublié », et
les rapprochements de comptes se font sur lui. Un correctif commun, « e-mail = opération
sensible », les ferme ensemble (lot 1).

Côté RGPD, le socle technique s'est nettement amélioré depuis le 28/09 : export, CSP, polices
locales, sauvegardes chiffrées, purge locale à la déconnexion. Mais les obligations structurantes
restent ouvertes :

- l'**information des personnes**, pour un public mineur (RG1) ;
- la **conservation outillée** (RG2) ;
- l'**effacement complet** (RG3) ;
- des **photos et productions d'élèves servies sans authentification** sous `/uploads` (RG4).

### Tableau de synthèse

Gravité : 🔴 critique · 🟠 important · 🟡 mineur · ⚪ info. Tous les constats sont **ouverts** à
la date de l'audit.

| ID   | Gravité | Domaine       | Constat                                                                                       |
| ---- | ------- | ------------- | --------------------------------------------------------------------------------------------- |
| CS1  | 🔴      | Code source   | Dump de production encore joignable via les `refs/pull/*` GitHub (= C2 / R1, rappel)          |
| AC1  | 🟠      | Comptes       | Entrée LTI → session **admin G&L** par simple rapprochement d'e-mail                          |
| GL1  | 🟠      | Comptes / GL  | Un MJ G&L peut prendre le **compte ForetMap** d'un élève (pont GL, résidu de CDG-04)          |
| AC2  | 🟠      | Comptes       | `admin.users.assign_roles` change l'e-mail d'un pair ou d'un supérieur (résidu de CDG-07)     |
| AP1  | 🟠      | Dépendances   | `engine.io@6.6.9` : déni de service sans authentification (GHSA-2gc4-cqfq-p2gv)               |
| GL2  | 🟠      | GL — triche   | Points QCM de partie illimités : jeton de présentation sans contexte de partie                |
| GL3  | 🟠      | GL / ForetMap | Modération croisée des commentaires (= I4 du 29/09, toujours présent)                         |
| RG1  | 🟠      | RGPD          | Aucune notice d'information ni page « Vos données » (= R2)                                    |
| RG2  | 🟠      | RGPD          | Conservation non outillée : tables jamais purgées, IP complètes 365 j (= R3)                  |
| RG3  | 🟠      | RGPD          | Effacement incomplet : élève, joueur G&L, enseignant (IP, audit, fichiers, tables GL)         |
| RG4  | 🟠      | RGPD          | `/uploads` public pour avatars d'élèves, forum, commentaires, carnet G&L (= S-6)              |
| AC3  | 🟡      | Comptes       | Changement de son e-mail sans ressaisie du mot de passe, même en prise de contrôle            |
| AC4  | 🟡      | Comptes       | Profil délégué : rétrogradation d'un compte ou d'un profil de rang supérieur                  |
| AC5  | 🟡      | Comptes       | Énumération de comptes par le temps de réponse (connexion, mot de passe oublié)               |
| AC6  | 🟡      | Comptes       | Ticket d'arrivée LTI rejouable pendant 2 minutes                                              |
| AC7  | 🟡      | Comptes       | Élève LTI rapproché par l'e-mail déclaré par Moodle                                           |
| AC8  | 🟡      | Comptes       | Secret de test de charge comparé en temps non constant, contourne tous les limiteurs          |
| GL4  | 🟡      | GL — triche   | Dés et déplacement déclarés par le client                                                     |
| GL5  | 🟡      | GL — triche   | Changement d'équipe libre en cours de partie                                                  |
| GL6  | 🟡      | GL            | Commentaires de partie lisibles et écrivables par un joueur d'une autre classe                |
| GL7  | 🟡      | GL            | Deux vérifications de mot de passe hors limiteur strict                                       |
| GL8  | 🟡      | GL            | Invité : réponses QCM enregistrées, tables jamais purgées (= M5)                              |
| AP2  | 🟡      | Applicatif    | `err.message` brut renvoyé au client, élève compris (= M4, plus large que décrit)             |
| AP3  | 🟡      | Applicatif    | Injection de formules dans les exports CSV (vecteur anonyme : `User-Agent`)                   |
| AP4  | 🟡      | Applicatif    | Relais média public : remplissage disque par variation de query string                        |
| AP5  | 🟡      | Applicatif    | Commentaires de contexte sans contrôle de visibilité du lieu (surface `staff`)                |
| AP6  | 🟡      | Applicatif    | Suivi des individus lisible sans compte, toutes cartes (`observer_user_id`, notes)            |
| AP7  | 🟡      | Applicatif    | Suppression d'un message de forum hors périmètre de groupe (selon configuration)              |
| AP8  | 🟡      | Applicatif    | Attribut `style` autorisé dans le Markdown des carnets : recouvrement d'écran, fuite d'images |
| AP9  | 🟡      | Applicatif    | Bombe ZIP : décompression complète avant contrôle de taille (packs mascotte, XLSX)            |
| AP10 | 🟡      | Applicatif    | Corps JSON de 25 Mo analysés avant toute authentification                                     |
| RG5  | 🟡      | RGPD          | Export des données incomplet (une dizaine de tables)                                          |
| RG6  | 🟡      | RGPD          | Données personnelles dans les journaux (`redact` incomplet, e-mail admin au démarrage)        |
| RG7  | 🟡      | RGPD          | Retrait EXIF en échec ouvert ; vidéos et packs mascotte G&L non nettoyés                      |
| RG8  | 🟡      | RGPD          | Mot de passe élève : 4 caractères minimum par défaut (= S-9)                                  |
| CS2  | 🟡      | Code source   | E-mail réel d'un tiers dans une migration versionnée                                          |
| CS3  | 🟡      | Code source   | `Datas Sources/` : métadonnées d'auteur, prénom et e-mails dans des documents suivis          |
| CS4  | 🟡      | Code source   | Nom réel du compte d'hébergement et sous-domaines dans la doc (= M6)                          |
| CS5  | 🟡      | CI            | `frontend-dist.yml` construit le code d'une PR avec un jeton `contents: write`                |
| CS6  | 🟡      | Configuration | `JWT_SECRET` d'exemple non refusé en production                                               |

S'y ajoutent des constats ⚪ info, regroupés au § 6.

---

## 1. Accès au code source et secrets

### CS1 — 🔴 Le dump de production reste joignable sur GitHub (rappel C2 / R1)

- **Situation** : l'API GitHub résout encore le commit qui contenait
  `sql/foretmap_bdd_complete.sql` : 36 e-mails et 41 hachages bcrypt, d'après l'audit du 28/09.
  Le dépôt compte **567 `refs/pull/*`**, que GitHub ne laisse pas réécrire.
- **Portée** : le dépôt est privé ; toute personne qui y a ou y aura accès (collaborateur,
  application GitHub installée, jeton) peut lire le dump.
- **Actions** : aucune ne relève du code. Ce sont les actions propriétaire 1 à 3 de l'audit du
  29/09, rappelées au § 9.

### CS2 — 🟡 E-mail réel d'un tiers dans une migration

- **Constat** : `migrations/252_plants_photo_credits.sql` recopie, dans un crédit photo,
  l'adresse personnelle du photographe.
- **Correctif** : ne garder que le nom et la licence ; une nouvelle migration corrige la base,
  car une migration appliquée ne se réécrit pas.
- **Autres adresses** : celles de `docs/templates/users-import-template.csv`, des tests et de
  `lib/studentRouteHelpers.js` sont fictives mais portent des domaines de messagerie réels. Les
  passer en `exemple.invalid`.

### CS3 — 🟡 `Datas Sources/` (28 fichiers suivis)

- **Contenu** : documents pédagogiques et KML de terrain. Aucune liste de classe ni photo
  d'élève, mais :
  - cinq docx/pptx portent les métadonnées « auteur » et « modifié par » ;
  - un nom de fichier porte le prénom d'un adulte ;
  - un livret PDF contient trois adresses e-mail.
- **Correctif** : nettoyer les métadonnées (`exiftool -all=`, ou « Inspecter le document » dans
  la suite bureautique), ou sortir le dossier du dépôt et de l'archive remise aux tiers
  (`git archive` : ajouter `export-ignore` dans `.gitattributes`).

### CS4 — 🟡 Infrastructure décrite dans la documentation (= M6, toujours ouvert)

- **Constat** :
  - `docs/EXPLOITATION.md` (§ 11, chemins `/home4/…`) contient le **nom réel du compte
    d'hébergement** ;
  - une dizaine de sous-domaines de production sont cités dans `docs/` et `CHANGELOG.md` ;
  - `.cursor/mcp.json` contient des URL de production (sans secret).
- **Correctif** : remplacer par `/home/USER`, comme le fait déjà `docs/CRONTAB.md`.
- **Atténuation** : I7 (la doc n'est plus servie publiquement) et le dépôt privé. Le risque
  réapparaît dès qu'une archive est remise à un tiers.

### CS5 — 🟡 CI : construction du code d'une PR avec un jeton en écriture

- **Constat** : `.github/workflows/frontend-dist.yml` se déclenche sur `pull_request` avec
  `permissions: contents: write`. Il lance `npm ci` puis `npm run build` sur la branche de la
  PR, et garde les identifiants du `checkout` (`persist-credentials` par défaut).
- **Risque** : un script `postinstall` ou un plugin Vite introduit par une PR interne, ou par une
  dépendance compromise, dispose d'un jeton capable de pousser. Pour une PR venue d'un fork,
  GitHub rétrograde le jeton : le risque se limite aux branches du dépôt.
- **Correctif** :
  - `persist-credentials: false` ;
  - build sans permission d'écriture, puis push dans un job séparé qui ne fait que télécharger
    l'artefact ;
  - réduire la portée du PAT facultatif `AUTO_MERGE_PAT` (`auto-resolve-conflicts.yml`) à un
    jeton fin, limité à ce dépôt.
- **Rappel** : l'étape `npm audit` de `ci.yml` n'est qu'informative ; AP1 montre qu'elle aurait
  dû bloquer.

### CS6 — 🟡 Secrets d'exemple acceptés en production

- **Constat** : `lib/env.js` exige 16 caractères pour `JWT_SECRET`, mais ne refuse pas les
  valeurs connues de `.env.example` ni de `scripts/bootstrap-web-session.sh`. Un serveur
  configuré par copie de l'exemple démarre, et ses jetons deviennent forgeables par quiconque a
  lu le dépôt.
- **Correctif** : liste de refus au démarrage, sur le même modèle que la longueur minimale.
- **À noter aussi** : `docker-compose.yml` publie MariaDB sur toutes les interfaces avec un mot
  de passe root de développement. Préférer `127.0.0.1:3306:3306`.

---

## 2. Authentification, sessions, comptes

### AC1 — 🟠 LTI → session admin G&L par rapprochement d'e-mail

- **Où** : `lib/lti/session.js:113-126` (`buildGlStaffSession`).
- **Ce que fait le code** :

  ```sql
  SELECT * FROM gl_admins WHERE foretmap_user_id = ? OR LOWER(email) = LOWER(?) LIMIT 1
  ```

  - aucune vérification que le compte est enseignant ni qu'il porte `teacher.access` : seul
    compte le rôle LTI Instructor ;
  - la ligne rapprochée n'est pas liée (`foretmap_user_id` reste vide) ;
  - l'hydratation l'accepte (`lib/auth/glHydration.js`) ;
  - le `OR … LIMIT 1` rend le choix de ligne indéterminé si deux lignes correspondent.

- **Scénario** :
  1. Un compte Instructor d'un cours Moodle relié (par exemple un prof de classe) remplace son
     e-mail ForetMap par celui d'une ligne `gl_admins` historique non liée. `PATCH /me/profile`
     le permet sans mot de passe (AC3), et l'unicité n'est contrôlée que dans `users`.
  2. Il lance l'outil depuis Moodle et choisit G&L.
  3. Il obtient une session `gl_admin`.
- **Correctif** :
  - rapprocher **uniquement** par `foretmap_user_id` ;
  - exiger `user_type='teacher'` et `teacher.access`, comme le fait CDG-12 pour Google ;
  - le repli par e-mail ne sert qu'à une liaison **explicite**, faite depuis l'administration
    G&L.

### AC2 — 🟠 Changement de l'e-mail d'un pair par `admin.users.assign_roles` (résidu de CDG-07)

- **Où** : `routes/rbac.js:1111-1126`.
- **Ce que fait le code** : la garde « jamais sur soi, jamais sur un rang ≥ au sien (hors
  admin) » ne couvre que `passwordWillChange` et `activeWillChange`, pas `hasEmail`.
- **Scénario** : un profil délégué qui détient `assign_roles` remplace l'e-mail d'un prof par le
  sien, puis demande « mot de passe oublié ». Il prend le compte.
- **Portée** : par défaut, seul `admin` détient cette permission (`lib/rbac.js`). Il faut donc
  une délégation, par exemple un profil sur mesure.
- **Correctif** :
  - inclure `hasEmail` dans la garde ;
  - à tout changement d'e-mail : incrémenter `token_epoch`, consommer les jetons de
    réinitialisation ouverts, notifier l'ancienne adresse.

### AC3 — 🟡 Son propre e-mail change sans mot de passe, même en prise de contrôle

- **Où** : `PATCH /api/auth/me/profile` (`routes/auth.js:357`) et `routes/students.js:332`.
- **Ce que fait le code** : `/me/password` exige le mot de passe actuel et refuse la prise de
  contrôle ; le profil ne fait ni l'un ni l'autre, alors qu'il modifie l'e-mail.
- **Scénarios** :
  - un jeton volé suffit à rendre la prise de compte **durable** (e-mail, puis mot de passe
    oublié), et elle survit à la révocation `token_epoch` ;
  - c'est aussi le levier d'AC1.
- **Correctif** :
  - `currentPassword` exigé quand l'e-mail change ;
  - refus pendant une prise de contrôle ;
  - notification à l'ancienne adresse.

### AC4 — 🟡 Profil délégué : action sur un rang supérieur

- **Où** : `lib/rbacRoleAssignment.js:95` et `PUT /rbac/profiles/:id/permissions`
  (`routes/rbac.js:786-811`).
- **Ce que fait le code** :
  - `checkRoleAssignmentAllowed` borne le rang du profil **attribué**, pas le rang **actuel**
    de la cible ;
  - l'édition des permissions d'un profil n'a pas de garde de rang.
- **Effet** : un délégué de rang 300 rétrograde un prof de rang 400, ou vide les permissions
  d'un profil supérieur (hors admin).
- **Correctif** : refuser si le rang actuel de la cible, ou celui du profil modifié, est ≥ au
  rang de l'acteur.

### AC5 — 🟡 Énumération de comptes par le temps de réponse

- **Connexion** (`routes/auth.js:661`) : pas de bcrypt si le compte est absent. La réponse est
  immédiate, contre ~80 ms si le compte existe.
- **Mot de passe oublié** (`routes/auth.js:1005`, `1078`) : l'envoi SMTP est attendu. La réponse
  est bien plus lente si le compte existe.
- CDG-13 avait unifié les **messages**, pas les temps de réponse.
- **Correctif** : bcrypt contre un hachage factice quand le compte est absent ; envoi du courriel
  sans l'attendre.

### AC6 — 🟡 Ticket d'arrivée LTI rejouable

- **Où** : `lib/lti/session.js:36`.
- **Ce que fait le code** : `readTicket` vérifie la signature et les 2 minutes de validité, mais
  ne consomme pas le ticket. Il s'échange plusieurs fois contre une session.
- **Correctif** : `jti` consommé en base, sur le modèle de `lti_nonces`.

### AC7 — 🟡 Élève LTI rapproché par l'e-mail déclaré par Moodle

- **Où** : `lib/lti/identity.js:59`.
- **Ce que fait le code** : à la première entrée, le compte est rapproché par l'e-mail fourni par
  Moodle, puis lié définitivement.
- **Risque** : si Moodle autorise un changement d'e-mail sans confirmation
  (`emailchangeconfirmation` désactivé), un élève Moodle entre dans le compte ForetMap non encore
  lié d'un autre élève. Les enseignants restent protégés par CDG-05.
- **Correctif** :
  - rapprocher d'abord par l'identifiant Moodle synchronisé (`external_identities`,
    `provider='moodle'`) ;
  - documenter l'exigence côté Moodle dans `docs/reference/`.

### AC8 — 🟡 Secret de test de charge

- **Où** : `lib/rateLimit.js:37`.
- **Ce que fait le code** : `provided === expected`, sans longueur minimale. Le secret désactive
  **tous** les limiteurs par IP, `authLimiter` compris. Le verrou par compte reste actif.
- **Correctif** : `timingSafeSecretEqual`, qui existe déjà dans `routes/admin-ops.js` ;
  32 caractères minimum ; refus au démarrage en production.

---

## 3. Gnomes & Licornes

### GL1 — 🟠 Un MJ G&L peut prendre le compte ForetMap d'un élève (résidu de CDG-04)

- **Contexte** : CDG-04 a fermé `POST /players/:id/reset-password` (`GL_PLAYER_REAL_ACCOUNT`),
  mais pas le **pont de création et de modification**.
- **Mécanisme** :
  - `routes/gl/admin.js:168-180` (`ensureEmailAvailable`) accepte l'e-mail d'un élève ForetMap
    non lié à un joueur ;
  - `lib/glGroupBridge.js:84-99` (`findStudentUser`) rapproche ce compte par e-mail, dans tout
    l'établissement, sans condition de classe.
- **Voie (a) — compte Google seul** : `lib/glGroupBridge.js:307-312` écrit sur le vrai compte le
  hachage du mot de passe choisi par le MJ.

  > `POST /api/gl/admin/players {email: <élève>, password: …}` → le MJ se connecte à ForetMap
  > comme l'élève.

- **Voie (b) — changement d'e-mail** : `PUT /api/gl/admin/players/:id` appelle le pont avec
  `forceEmail: true`, qui réécrit `users.email` sur un compte **non miroir**
  (`glGroupBridge.js:273`, `:301-305`). Le MJ met sa propre adresse, puis passe par
  `POST /api/gl/auth/forgot-password`.
- **Effet secondaire** : l'élève est retiré de ses autres groupes G&L
  (`pruneOtherGlClassGroupMemberships`). C'est une annexion analogue à I3.
- **Correctif** :
  - ne rapprocher qu'un compte miroir (`gl_bridge`) ou un compte déjà dans la classe du MJ ;
  - ne jamais écrire de mot de passe sur un compte non miroir ;
  - refuser `forceEmail` si `auth_provider ≠ 'gl_bridge'`.
- **Tests à écrire** : création avec l'e-mail d'un élève Google → aucun hachage posé ; `PUT`
  d'e-mail sur un vrai compte → 403.

### GL2 — 🟠 Points QCM de partie illimités

- **Où** : `routes/gl/games/qcm.js:96-213`.
- **Ce que fait le code** :
  - la route accepte n'importe quel `questionCode` avec n'importe quel `presentationToken`
    valide ;
  - ces jetons s'obtiennent à volonté par `GET /api/gl/qcm/questions/:code/present`
    (`gl.read`) ;
  - le jeton ne porte ni partie, ni équipe, ni repère. L'unicité ne vaut que par `jti`
    (`lib/qcmPresentationUse.js`) ;
  - le statut de la partie n'est pas vérifié.
- **Scénario** : après un premier essai, qui renvoie la bonne réponse, le joueur boucle
  « présenter → répondre ». Chaque tour ajoute +1 au score de son équipe, y compris en partie
  terminée.
- **Correctif** :
  - signer `gameId`, `teamId` et `markerId` dans le jeton, émis seulement par
    `markers/:id/present-question` ;
  - exiger `status='live'` ;
  - une réponse notée par (partie, équipe, question), selon le réglage de re-déclenchement.

### GL3 — 🟠 Modération croisée des commentaires (= I4, toujours présent)

- **Côté G&L** (`routes/gl/context-comments.js`) :
  - `canModerate` (l. 100-102) est vrai pour **tout** `gl_admin`, MJ compris ;
  - les SELECT de suppression (l. 228-231), de réaction (l. 206-223) et de signalement
    (l. 269-272) ne filtrent pas `context_type`.
- **Côté ForetMap** (`routes/context-comments.js`) : l. 455-465, 327-363 et 515-520 n'excluent
  pas les types `gl_*`.
- **Correctif** : `AND context_type IN (<types du produit>)` dans les trois requêtes, de chaque
  côté ; 404 sinon.

### GL4 à GL8 — 🟡

- **GL4 — dés et déplacement.**
  - `lib/glDiceRoll.js` valide les valeurs **envoyées** par le client.
  - `POST /games/:id/teams/:teamId/move` accepte tout `markerId`, sans contrôle de chapitre
    (`lib/gl/gamesRuntime.js:95`).
  - Correctif : tirage serveur (`crypto.randomInt`), destination calculée en `numbered_path`,
    filtre `chapter_id`.
- **GL5 — `join-team` libre.** `routes/gl/games.js:406-443` ne contrôle ni le statut de partie ni
  un verrou. Un joueur peut agir pour plusieurs équipes dans un même tour. Correctif :
  autoriser `join-team` seulement en `draft`, ou sur réglage MJ explicite.
- **GL6 — commentaires de partie.** `routes/gl/context-comments.js:69-135` : pour `gl_game`, seul
  `contextExists` est vérifié. Un joueur lit et écrit sur la partie d'une autre classe. Correctif :
  appeler `canAccessGlGame`.
- **GL7 — limiteur strict.** `POST /api/gl/auth/staff/change-password` et
  `PATCH /api/gl/auth/me/profile` vérifient le mot de passe actuel hors de la liste du limiteur
  strict (`lib/products.js`).
- **GL8 — invité et QCM (= M5).** Le rôle `gl_observateur` possède `gl.read` : l'invité présente
  des questions et y répond, et écrit dans `gl_qcm_presentation_uses` et `gl_qcm_attempts`. Ces
  tables ne sont jamais purgées, et les jetons invités se créent à volonté. Si c'est voulu, ne
  rien écrire pour `gl_guest` ; sinon, `rejectGuest`.

---

## 4. Failles applicatives (ForetMap, Plan)

Pas d'injection SQL, pas de SSRF exploitable, pas de traversée de chemin (voir § 8).

### AP1 — 🟠 `engine.io@6.6.9` : déni de service sans compte

- **Constat** : `npm audit --omit=dev` classe GHSA-2gc4-cqfq-p2gv (« Protocol Revision Mismatch
  DoS ») en _high_. La poignée de main engine.io a lieu **avant** le `io.use()` qui vérifie le
  JWT.
- **Risque** : des requêtes forgées sur `/socket.io/` peuvent faire tomber le processus, donc les
  trois produits.
- **Correctif** : engine.io ≥ 6.6.10 (`npm audit fix`, en conservant l'override `ws` de
  `package.json`), puis tests temps réel.
- **Autres dépendances signalées** :
  - `ip-address` (moderate, via express-rate-limit) : à mettre à jour, même si
    `lib/rateLimit.js` a son propre `keyGenerator` ;
  - `brace-expansion` et `uuid` (via exceljs / archiver) : non alimentés par l'utilisateur.

### AP2 — 🟡 `err.message` brut renvoyé au client (= M4, périmètre élargi)

- **Où** :
  - `routes/groups.js:474` ;
  - `lib/pedago/quizService.js:358`, `:477`, `:577`, `:638`. **L. 477 est atteignable par un
    élève** : un deadlock MySQL renvoie le message du pilote en 400 ;
  - `lib/userContentImages.js:78` : une erreur `fs` renvoie le **chemin absolu** du serveur à un
    auteur de commentaire ;
  - `routes/gl/qcm.js:350`, `routes/gl/lore.js:1553` (ouverts à l'invité) ;
  - `routes/gl/admin.js:354`, `routes/gl/games/teams.js:32` ;
  - `lib/importTutosFromFilesystem.js:314`.
- **Correctif** : ne renvoyer que les erreurs métier (`statusCode < 500` / `expose`) ; sinon
  journaliser, puis répondre 500 avec un message générique. Un utilitaire commun dans
  `lib/asyncHandler.js` couvrirait tous les cas.

### AP3 — 🟡 Injection de formules dans les exports CSV

- **Où** : `csvEscape` (`lib/importRows.js:67`) et `escapeCSV` (`routes/stats.js:293`) ne
  traitent que `;`, `"` et le saut de ligne.
- **Vecteur anonyme** : l'en-tête `User-Agent` est stocké tel quel (`lib/auditLog.js:85`), puis
  exporté dans les événements de sécurité (`lib/securityEventsQuery.js:122`). Une tentative de
  connexion avec `User-Agent: =HYPERLINK(…)` devient une formule active dans le tableur de
  l'administrateur.
- **Vecteur élève** : prénom et nom libres à l'inscription, repris dans l'export des
  statistiques.
- **Correctif** : préfixer d'une apostrophe toute cellule qui commence par `= + - @ \t \r`
  (recommandation
  [OWASP — CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection)). Les exports
  XLSX (ExcelJS, chaînes) ne sont pas concernés.

### AP4 — 🟡 Relais média public : remplissage du disque

- **Où** : `lib/remoteMedia.js`.
- **Ce que fait le code** : `GET /api/media/remote` est public, sa clé de cache inclut la query
  string (l. 66), qu'upload.wikimedia.org ignore, et la purge n'a lieu qu'une fois par heure.
- **Scénario** : boucler sur `…/image.jpg?x=1…N` écrit jusqu'à 8 Mo par requête. Seuls
  s'y opposent les 4 téléchargements simultanés et 1 200 requêtes par minute et par IP.
- **Correctif** :
  - retirer la query string avant le cache ;
  - vérifier la taille totale du cache **avant** d'écrire ;
  - quota par IP.

### AP5 — 🟡 Commentaires de contexte sans contrôle de visibilité

- **Où** : `routes/context-comments.js:107-146`.
- **Ce que fait le code** : `contextExists()` vérifie l'existence de la cible, pas sa carte ni sa
  surface. Le code le reconnaît en commentaire. On peut donc lire et écrire les commentaires
  d'un repère réservé à la surface `staff`.
- **Limite** : il faut connaître l'identifiant.
- **Correctif** : `canViewLocation` / `canAccessMapId`, comme `routes/species-observations.js`.

### AP6 — 🟡 Suivi des individus lisible sans compte

- **Où** : `routes/individuals.js`.
- **Ce que fait le code** : `GET /` (l. 97) et `GET /:id` (l. 125) n'ont ni authentification ni
  filtre de carte ou de surface, alors que les lots S3 et S4 du 22/09 l'ont imposé ailleurs.
  `/:id` expose `observer_user_id`, `group_id` et `notes`. `POST /:id/measurements` ne vérifie
  pas le périmètre de carte.
- **Condition** : ces routes ne répondent que si le module pédagogique `individuals` est actif.
- **Correctif** : `resolveScopedMapFilter`, et masquage des champs personnels pour tout lecteur
  hors personnel.

### AP7 à AP10 — 🟡

- **AP7 — forum.** `DELETE /api/forum/posts/:id` (`routes/forum.js:575-590`) ne vérifie pas
  `isForumGroupInScope`, contrairement à `lock`, `pin` et `reports`. Sans effet avec les profils
  par défaut ; latent dès qu'un profil limité à ses groupes reçoit `forum.group.moderate`.
- **AP8 — Markdown.**
  - `src/shared/platform/markdown.js:35-45` : avec `allowImages`, l'attribut `style` est permis
    sur **toutes** les balises.
  - Un élève peut écrire, dans son carnet lu par le professeur, un
    `<p style="position:fixed;inset:0;…">` qui recouvre l'écran (hameçonnage).
  - `background:url(https://…)` contourne aussi le mode « local » des images externes (RGPD),
    puisque la CSP autorise `img-src https:`.
  - Correctif : `style` limité à `img`, avec une liste blanche de propriétés (hook DOMPurify
    `uponSanitizeAttribute`).
- **AP9 — bombe ZIP.** `lib/mascotPackArchive.js:97-105` décompresse l'entrée entière avant de
  comparer à `MAX_DECOMPRESSED_BYTES`. Même remarque pour `exceljs.load`. Réservé au personnel.
  Correctif : contrôler `entry.header.size` avant `getData()`, et plafonner les lignes.
- **AP10 — corps de 25 Mo.** `lib/jsonBodyLimit.js:25-37` analyse les gros corps sur les préfixes
  d'import **avant** le 401. Monter le parseur large après un contrôle d'authentification léger.

---

## 5. Confidentialité et RGPD

### Suivi de l'audit RGPD du 28/09

| Recommandation / lot              | État au 30/09    | Preuve                                                                       |
| --------------------------------- | ---------------- | ---------------------------------------------------------------------------- |
| R1 / RGPD-A (dump Git)            | Ouvert           | CS1                                                                          |
| R2 / RGPD-B (information)         | **Ouvert**       | RG1                                                                          |
| RGPD-C (S-2, S-3, visibilité)     | Traité           | `lib/tasks/assignmentVisibility.js`, `tests/tasks-group-visibility.test.js`  |
| RGPD-D (polices, médias, CSP)     | Traité           | `lib/csp.js`, `lib/remoteMedia.js`, polices Fontsource                       |
| R3 / RGPD-E (conservation)        | **Ouvert**       | RG2                                                                          |
| R4 / RGPD-F (export, effacer)     | Partiel          | export livré ; effacement : RG3 ; export incomplet : RG5                     |
| R5 / RGPD-G (S-6, S-7, S-8)       | Partiel          | S-7 et S-8 traités ; S-6 ouvert (RG4)                                        |
| RGPD-H (S-9 à S-14)               | Largement ouvert | S-9 (RG8), S-11 (RG6), S-14 ouverts ; S-10 partiel (RG7) ; S-12 : voir § 8   |
| R6 (S-4, droits du profil `prof`) | Ouvert           | `stats.read.all` et `stats.export` toujours accordés (`lib/rbac.js:308-314`) |
| R7 (registre, AIPD)               | Hors code        | non vérifiable ici                                                           |

### RG1 — 🟠 Aucune information des personnes (art. 12-14)

- **Constat** :
  - aucune page « confidentialité », « mentions légales » ni « vos données » dans `src/`,
    `public/` ou les HTML d'entrée ;
  - le formulaire d'inscription (`src/components/auth-views.jsx:317-380`) collecte l'e-mail sans
    un mot d'information.
- **Pourquoi c'est important** : le public est mineur. L'information doit être adaptée à l'âge
  (art. 12) et accessible **sans compte**.
- **Correctif** :
  - une page publique par produit, nommée via `brandNames.js` ;
  - un lien depuis l'inscription, la connexion et le pied de page ;
  - la liste des stockages locaux (`foretmap_session`, préférences), des destinataires et des
    durées ;
  - une section « Vos données » dans `docs/reference/`.

### RG2 — 🟠 Conservation non outillée (art. 5-1-e)

`scripts/purge-audit-logs.js` purge 8 tables. Restent **sans purge** :

- `password_reset_tokens` : marqués utilisés, jamais supprimés ;
- `sync_runs`, `sync_actions`, `sync_pending_matches` (fiches Moodle complètes en JSON),
  `elevation_audit`, `external_identities` ;
- `user_product_visits` ;
- `gl_qcm_attempts` et `gl_qcm_presentation_uses` des invités (GL8) ;
- les comptes inactifs : pas de cycle de fin d'année.

Autres points :

- `security_events` conserve **l'IP complète et le user-agent 365 jours**
  (`lib/auditLog.js:73-87`) ;
- `scripts/reconcile-orphan-uploads.js` n'est pas en crontab (`docs/CRONTAB.md`) ;
- la rotation des journaux cron n'est pas documentée.

Point conforme : notifications purgées à 60 jours.

**Correctif** :

- ajouter ces tables au script de purge ;
- tronquer les IP au-delà de 6 mois ;
- script de fin d'année passant par le registre des nettoyeurs ;
- rapprochement des fichiers orphelins en cron.

### RG3 — 🟠 Effacement incomplet (art. 17)

Comparaison du registre des nettoyeurs (`lib/accounts/*Cleaners.js`) avec les 84 tables qui
portent un identifiant de personne.

- **Élève** (`lib/studentDeletion.js`). Forum, commentaires, tâches, observations et leurs
  fichiers sont bien effacés. Restent :
  - l'IP et le user-agent de `security_events` et `audit_log` (seul l'acteur passe à NULL) ;
  - `elevation_audit` (pas de clé étrangère) ;
  - `routes/students.js:468`, qui **écrit le nom complet de l'élève supprimé** dans
    `audit_log.details` ;
  - `user_activity_events`, passé en SET NULL ;
  - les fichiers `uploads/user-journal/` sur disque (les lignes partent en cascade, pas les
    fichiers).
- **Joueur G&L** (`routes/gl/admin.js:692-704`, `lib/glPlayerPurge.js`). Restent :
  - `gl_forum_*`, les `context_comments` `gl_player`, `gl_tutorial_reads`,
    `gl_game_events.actor_id`, `gl_action_requests` ;
  - les fichiers `gl-player-journal/<id>/` et l'avatar ;
  - un **409** systématique si le joueur a contribué à un sortilège (FK `RESTRICT`), qui rend
    l'effacement impossible.
- **Enseignant** (`routes/rbac.js:1391-1397`). Seuls le compte et ses jetons sont supprimés.
  L'**avatar reste sur disque**, et l'**e-mail est recopié dans le payload d'audit**.

**Correctif** :

- anonymiser l'IP et l'UA de la personne effacée ;
- n'écrire que l'identifiant dans l'audit ;
- nettoyeur G&L complet, fichiers compris ;
- anonymisation au lieu du `RESTRICT` ;
- test d'effacement qui vérifie **toutes** les tables à colonne de personne, sur le modèle d'un
  test de registre.

### RG4 — 🟠 Productions et photos d'élèves servies sans authentification (= S-6)

- **Constat** : `lib/uploadsPrivatePaths.js:21` ne protège que `observations`, `task-logs` et
  `user-journal`. Restent publics sous `/uploads` :
  - les avatars d'élèves (`students/`) ;
  - `forum-posts/`, `context-comments/`, `tasks/` ;
  - `gl-player-journal/<playerId>/<articleId>-<horodatage>-…`, dont les noms sont
    **prévisibles et énumérables** (`routes/gl/player-journal.js:258`).
- **Correctif** : ajouter ces préfixes à la liste privée et les servir par une route autorisée,
  comme les trois familles déjà protégées. Le mécanisme existe, seule la liste est à étendre.
  Priorité à `gl-player-journal/` et `students/`.

### RG5 à RG8 — 🟡

- **RG5 — export incomplet.** `lib/accounts/exportRegistry.js` (≈ 45 tables, fichiers joints)
  omet :
  - `audit_log` (en tant qu'acteur), `elevation_audit`, `user_plant_discoveries` ;
  - `gl_tutorial_reads`, `gl_market_trades` (+ `_side_feuillets`), `gl_game_events`,
    `gl_action_requests`, `gl_spell_cast_drafts` ;
  - `sync_pending_matches`, `sync_conflicts`, `external_group_members`.
- **RG6 — journaux.**
  - `redact` (`lib/logger.js:7-19`) ne descend que d'un niveau et ne masque ni `currentPassword`,
    ni `newPassword`, ni `resetToken`, ni `email`, ni les codes des plans (= S-11).
  - `server.js:921` journalise l'e-mail de l'administrateur à chaque démarrage.
  - Point conforme : le journal HTTP ne garde ni query string, ni IP, ni UA.
- **RG7 — EXIF.**
  - La médiathèque est désormais nettoyée (point de l'audit photos traité).
  - Mais le retrait est **en échec ouvert** : sans `sharp`, ou si `sharp` échoue, l'original est
    écrit tel quel (`lib/imageMetadata.js:88-114`).
  - Ne sont pas nettoyés : les images animées, les vidéos de la médiathèque, les packs mascotte
    G&L (`routes/gl/mascots.js:100`).
  - Correctif : refuser l'image, ou au minimum alerter dans `check:runtime`, quand `sharp` est
    indisponible.
- **RG8 — mot de passe élève.** `security.password_min_length` vaut 4 par défaut
  (`lib/settings/identity.js:59`). Recommandation CNIL (délibération 2022-100) : 12 caractères,
  ou 8 avec restriction d'accès et limitation des tentatives. ForetMap a la limitation (throttle
  par compte), d'où un seuil de **8** conseillé.

### Sous-traitants et transferts — ⚪

- **Pl@ntNet** : réservé à `plants.manage`. Le navigateur réencode l'image, ce qui retire l'EXIF,
  mais le serveur ne le refait pas avant l'envoi (`lib/speciesAutofillPlantnet.js:212`). À
  ajouter par défense en profondeur.
- **OpenAI, Trefle, GBIF** : noms d'espèces uniquement.
- **Google OAuth, SMTP, Moodle** : à inscrire au registre (R7).

---

## 6. Constats ⚪ info

- **Drapeau e2e** : `--foretmap-e2e-no-rate-limit` (`E2E_DISABLE_RATE_LIMIT`) relâche trois
  protections à la fois, en production :
  - les limiteurs ;
  - la surcharge de produit par `X-Foretmap-Product`, qui permet de se déclarer `staff`
    (`lib/surfaceAccess.js:60`) ;
  - le jeton Socket.IO en query string (`lib/realtime.js:299`).

  Journaliser un avertissement fort, voire refuser le drapeau hors du harnais Playwright.

- **Replis de développement** : `JWT_SECRET`, secrets LTI et secrets des plans retombent sur des
  valeurs fixes si `NODE_ENV !== 'production'` (`middleware/requireTeacher.js:15`…). Une prod
  lancée sans `NODE_ENV` accepterait des jetons forgeables. Exiger ces secrets partout, sauf en
  `test`.
- **CORS Socket.IO** : il reflète toute origine en production sans `FRONTEND_ORIGIN(S)`
  (`lib/realtime.js:320`), alors que le CORS HTTP passe à `false`. Impact faible (Bearer, pas
  de cookie).
- **Prise de contrôle** : `POST /api/auth/admin/impersonate` (`routes/auth.js:1228`) renvoie la
  ligne `users` moins `password_hash`, par liste noire. Passer par `toPublicUserRow`.
- **Redirections** :
  - LTI : `redirect_uri` reprend `target_link_uri` (`lib/lti/oidc.js:120`) ; le valider aussi
    côté outil ;
  - OAuth : l'heuristique de « domaine parent » de `resolveProductReturnOrigin` serait
    contournable sous un suffixe public partagé ;
  - OAuth G&L sans `GL_FRONTEND_ORIGIN` : l'origine dérive de `X-Forwarded-Host`
    (`lib/oauthPublicUrl.js:34`). Définir la variable en production.
- **G&L sans périmètre de classe** : tout MJ voit et gère toutes les parties et classes, et peut
  prendre le contrôle de tout joueur (`lib/glGameAccess.js:30`, `lib/glClassAccess.js:30`). Le
  forum G&L est global : les pseudos d'élèves sont visibles entre classes. Choix de conception à
  documenter dans `docs/reference/gl/`.
- **Séances pédagogiques** : `runs/complete` (`routes/pedago-sessions.js:224`) ne vérifie pas
  qu'un `runs/start` a eu lieu, ce qui permet d'obtenir un badge sans faire la séance. Logique
  métier, à arbitrer.

---

## 7. Constats ouverts des audits antérieurs — état revérifié

| Origine                         | Constat                              | État au 30/09                                      |
| ------------------------------- | ------------------------------------ | -------------------------------------------------- |
| 29/09 C2 · 28/09 R1             | Dump dans `refs/pull/*`              | Ouvert (CS1) — commit toujours résolu par l'API    |
| 29/09 I4                        | Modération croisée des commentaires  | Ouvert (GL3), lignes identifiées                   |
| 29/09 M3                        | `xlsx@0.18.5`                        | Conservé (dépendance de test uniquement)           |
| 29/09 M4                        | `err.message` SQL                    | Ouvert et plus large (AP2)                         |
| 29/09 M5                        | Invité G&L et QCM                    | Ouvert (GL8), avec croissance de tables            |
| 29/09 M6                        | Infrastructure dans la doc           | Ouvert (CS4)                                       |
| 18/09 CDG-04                    | MJ G&L → compte ForetMap             | **Traité partiellement** : pont ouvert (GL1)       |
| 18/09 CDG-07                    | Mot de passe **et e-mail** d'un pair | **Traité partiellement** : e-mail ouvert (AC2)     |
| 18/09 CDG-01 à 05               | Bloquants comptes                    | Fermés dans le code (résidus AC1 et AC3 ci-dessus) |
| 28/09 S-4, S-6, S-9, S-11, S-14 | voir § 5                             | Ouverts                                            |

---

## 8. Vérifié conforme (à ne pas défaire)

- **JWT** :
  - HS256 épinglé, `exp` vérifié, secret ≥ 16 caractères exigé en production ;
  - TTL borné (15 min à 7 j), plafond glissant de 30 j ;
  - `token_epoch` relu à chaque requête, HTTP comme Socket.IO ;
  - isolement des produits : jeton G&L refusé hors `/api/gl`, et l'inverse.
- **Réinitialisation** : jeton de 32 octets haché SHA-256, 60 min, usage unique atomique ;
  3 demandes par 15 min ; lien construit depuis l'environnement (pas d'injection par `Host`).
- **Connexion** : message unique ; throttle par compte, non contournable par `X-Forwarded-For` ;
  `authLimiter` sur les routes sensibles.
- **Google OAuth** : `state` en cookie HttpOnly / Secure / SameSite ; `id_token` vérifié
  (audience, issuer, `email_verified`, domaine) ; `google_sub` prioritaire.
- **LTI** : RS256 via JWKS, issuer, audience, nonce comparé à temps constant puis consommé,
  `deployment_id` contrôlé.
- **En-têtes** : helmet (HSTS, nosniff, frameguard) ; CSP `script-src 'self'` sans
  `unsafe-inline` ; `frame-ancestors 'self'` ; `object-src 'none'`.
- **CORS** : HTTP `origin:false` par défaut en production. Cookies des plans signés nom + valeur
  (C1).
- **SQL** : toutes les interpolations repérées sont des constantes ou des listes blanches
  (`ORDER BY`, colonnes). `LIMIT` borné ou paramétré. Aucun _mass assignment_.
- **SSRF** :
  - relais Wikimedia : deux hôtes, https:443, redirections revalidées, taille plafonnée ;
  - pré-saisie des espèces : hôtes fixes ;
  - Moodle et LTI : URL issues de l'environnement ;
  - import Google Sheet (`toGoogleSheetCsvUrl`) : hôte limité à `google.com`, URL
    **reconstruite** sur `docs.google.com`, redirections non suivies. Le point S-12 du 28/09 n'est
    donc pas exploitable en SSRF ; seul reste le `http:` de `requestText`, sans objet ici.
- **Uploads** :
  - `assertInsideUploads`, signature binaire des images raster ;
  - SVG en `sandbox` + `attachment` ;
  - Multer placé après `requirePermission` ;
  - archives : `assets/<basename>`, `..` refusé.
- **XSS** : DOMPurify sur tout le Markdown et le HTML riche, G&L compris ; `javascript:` retiré ;
  vue tutoriel assainie côté serveur ; iframe d'aperçu sans `allow-same-origin` +
  `allow-scripts`.
- **IDOR vérifiés sans défaut** :
  - carnet ;
  - notifications ;
  - observations d'espèces ;
  - journaux de tâche ;
  - groupes (I3) ;
  - élèves ;
  - médiathèque ;
  - forum, hors AP7 ;
  - marché, sorts et équipes G&L (verrous `FOR UPDATE`, montants ≥ 0, bonne réponse jamais dans
    le jeton QCM).
- **Code source** :
  - pas de sourcemaps en production ;
  - aucune variable `VITE_*` ni clé d'API dans le bundle ;
  - `/CHANGELOG.md` et `/docs/*` réservés à `admin.settings.read` ;
  - bundle de déploiement par liste blanche ;
  - actions GitHub épinglées par SHA ;
  - plus d'interpolation `${{ github.* }}` dans les `run:`.
- **Secrets** :
  - aucun secret réel dans l'arbre ni dans l'historique local : les clés privées trouvées sont
    des gabarits de test, et les motifs `sk-` des classes CSS ;
  - `.env` non suivi ;
  - fixture `sql/fixtures/foretmap-anonymise.sql.gz` réellement anonymisée : e-mails en
    `exemple.invalid`, un seul hachage partagé.
- **RGPD** :
  - export ZIP en libre-service et export administrateur tracé ;
  - visibilité des tâches par groupe par défaut ;
  - polices locales, relais d'images, CSP imposée ;
  - effacement local à la déconnexion ;
  - sauvegardes chiffrées ;
  - aucun traceur ni CDN tiers ;
  - aucune position stockée ;
  - un élève n'a aucun droit `stats.read.*`.

---

## 9. Plan de correction proposé

Les lots sont ordonnés par gain de sécurité et par coût. Chaque lot comprend ses tests
(`tests/security-audit-2026-09-30.test.js`, sur le modèle du 29/09, avec contrôle de
rougissement).

| Lot                             | Constats                     | Contenu                                                                                                                                                                                                |
| ------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1 — E-mail sensible**         | AC1, AC2, AC3, GL1, AC7      | Changement d'e-mail : mot de passe exigé, refusé en prise de contrôle, garde de rang, époque de jeton incrémentée, notification. Rapprochements LTI et pont GL par identifiant, jamais par e-mail seul |
| **2 — Dépendances et CI**       | AP1, CS5, CS6, AC8           | engine.io ≥ 6.6.10, `ip-address` ; `npm audit --audit-level=high` **bloquant** ; `frontend-dist` en deux jobs ; liste de refus des secrets ; secret de charge à temps constant                         |
| **3 — Uploads privés**          | RG4, RG7                     | Préfixes `students`, `forum-posts`, `context-comments`, `tasks`, `gl-player-journal` servis par route autorisée ; échec fermé sans `sharp`                                                             |
| **4 — Triche et isolement G&L** | GL2, GL3, GL4, GL5, GL6, GL8 | Jeton QCM contextualisé ; filtre `context_type` ; dés serveur ; verrou `join-team` ; `canAccessGlGame`                                                                                                 |
| **5 — Durcissements mineurs**   | AP2 à AP10, AC4 à AC6, GL7   | Gestionnaire d'erreurs commun, échappement CSV, cache du relais, gardes de carte, `style` Markdown, bombe ZIP, parseur large après authentification                                                    |
| **6 — RGPD**                    | RG1, RG2, RG3, RG5, RG6, RG8 | Page « Vos données » par produit ; purge étendue et troncature des IP ; nettoyeurs complets testés contre le schéma ; export complété ; `redact` ; minimum de mot de passe à 8                         |
| **7 — Dépôt**                   | CS2, CS3, CS4                | Crédit photo, métadonnées de `Datas Sources/`, `export-ignore`, doc d'exploitation anonymisée                                                                                                          |

## 10. Actions du propriétaire (hors code)

1. **Support GitHub** : purge des `refs/pull/*` et des vues en cache qui pointent vers le dump
   (CS1).
2. **Réinitialiser les 41 comptes** du dump (`token_epoch` et `password_must_reset`) et inscrire
   l'incident au registre des violations (art. 33-2).
3. Supprimer les branches locales et le stash du poste de développement qui contiennent le dump.
4. Continuer à partager le code **par `git archive`** (`docs/EXPLOITATION.md` § 12), après le lot
   7 ou avec `export-ignore` sur `Datas Sources/`.
5. Vérifier côté Moodle que `emailchangeconfirmation` est actif (AC7).
6. Production : `NODE_ENV=production`, `GL_FRONTEND_ORIGIN` et `FRONTEND_ORIGINS` définis ;
   `LOAD_TEST_SECRET` et le drapeau e2e absents. Contrôler avec `npm run deploy:check:prod`.
7. Registre des traitements et AIPD (R7) : l'AIPD est probablement requise (données de mineurs,
   suivi de progression), avec l'appui du DPO académique.

---

## 11. Suite donnée — 30 septembre 2026

Traité le jour même, en six lots fusionnés sur la même PR. Les constats ci-dessus restent
tels quels (convention des audits datés) ; ce tableau dit ce qui a été fait. Tests :
`tests/security-audit-2026-09-30-{comptes,gl,applicatif,rgpd,uploads}.test.js`, plus les
tests existants ajustés et les Vitest cités.

| ID          | Statut     | Correctif                                                                                                                                                                                                                              |
| ----------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CS1         | **Ouvert** | Hors code : actions du propriétaire (§ 10)                                                                                                                                                                                             |
| CS2         | Traité     | Migration `313` (crédits sans e-mail, fiches 72 et 206) ; `252` corrigée en place (aucune empreinte de migration n'est contrôlée) ; adresses fictives en `@exemple.invalid` ; test de contenu                                          |
| CS3         | Traité     | Métadonnées vidées (docx, pptx, PDF), fichier renommé, `.gitattributes` `export-ignore` (dont `Datas Sources/`) ; limite : le `.doc` n'est pas nettoyé, il est exclu des archives                                                      |
| CS4         | Traité     | Compte d'hébergement et domaines remplacés par des variables dans la doc ; `.cursor/mcp.json` sans URL. L'historique Git garde les anciennes versions                                                                                  |
| CS5         | Traité     | `frontend-dist.yml` : build en lecture seule, `persist-credentials: false`, push dans un job séparé ; `npm audit --audit-level=high` bloquant                                                                                          |
| CS6         | Traité     | Liste de refus des `JWT_SECRET` publiés (`lib/env.js`) ; MariaDB publiée sur `127.0.0.1`                                                                                                                                               |
| AC1         | Traité     | Session MJ G&L par LTI : `foretmap_user_id` seul, enseignant avec `teacher.access` ; hydratation stricte pour la voie LTI                                                                                                              |
| AC2, AC3    | Traité     | `lib/accounts/emailChange.js` : garde de rang, mot de passe actuel exigé, refus en prise de contrôle, `token_epoch` incrémenté, ancienne adresse prévenue ; champ mot de passe dans « Mon profil »                                     |
| AC4         | Traité     | Rang actuel de la cible et du profil modifié bornés                                                                                                                                                                                    |
| AC5         | Traité     | bcrypt factice (`lib/auth/timingEqualizer.js`), envoi SMTP sans attente, ForetMap et G&L                                                                                                                                               |
| AC6         | Traité     | Ticket LTI à usage unique (`jti`, migration `314`)                                                                                                                                                                                     |
| AC7         | Traité     | Identifiant Moodle d'abord, e-mail en repli ; exigence Moodle documentée                                                                                                                                                               |
| AC8         | Traité     | Comparaison à temps constant, 32 caractères, ignoré en production                                                                                                                                                                      |
| GL1         | Traité     | Rapprochement limité au miroir ou à la classe ; aucun mot de passe ni e-mail écrit sur un vrai compte                                                                                                                                  |
| GL2         | Traité     | Jeton de présentation signé (partie, équipe, repère), partie `live`, un point par (partie, équipe, question, arrivée)                                                                                                                  |
| GL3 (= I4)  | Traité     | Filtre `context_type` par produit, des deux côtés ; modération G&L réservée aux permissions de gestion                                                                                                                                 |
| GL4         | Traité     | Dés tirés par le serveur ; repère du chapitre ; destination liée au dernier jet (limite : dés physiques)                                                                                                                               |
| GL5, GL6    | Traité     | Équipe verrouillée en partie ; `canAccessGlGame` sur les commentaires de partie                                                                                                                                                        |
| GL7, GL8    | Traité     | Deux routes au limiteur strict ; invité sans écriture en base                                                                                                                                                                          |
| AP1         | Traité     | engine.io 6.6.11, ip-address 10.7.2 : `npm audit --omit=dev --audit-level=high` → 0                                                                                                                                                    |
| AP2 (= M4)  | Traité     | `lib/shared/publicError.js` et `lib/safeErrorResponse.js` (classification commune)                                                                                                                                                     |
| AP3         | Traité     | `lib/shared/csvCell.js`, `src/shared/utils/csvCell.js` (OWASP)                                                                                                                                                                         |
| AP4         | Traité     | Clé de cache sans query, place réservée avant écriture (507), quota par IP (429)                                                                                                                                                       |
| AP5         | Traité     | Visibilité (audience, carte, surface) vérifiée en lecture et en écriture                                                                                                                                                               |
| AP6         | Traité     | Filtre de carte et de surface ; champs personnels réservés au personnel                                                                                                                                                                |
| AP7 à AP10  | Traité     | Périmètre de groupe du forum ; `style` limité aux images ; tailles ZIP et XLSX bornées ; parseur de 25 Mo réservé aux requêtes authentifiées                                                                                           |
| RG1         | Traité     | Page publique « Vos données » (`/confidentialite`) dans les quatre produits, liens depuis connexion, inscription et « À propos », réglage `privacy.data_contact` ; à compléter par l'établissement : DPO, hébergeur, registre          |
| RG2         | Traité     | Purge étendue (jetons, synchronisations, visites, QCM invités), IP tronquées après 6 mois, `scripts/purge-inactive-accounts.js`, crontab documentée                                                                                    |
| RG3         | Traité     | Effacement élève, joueur (plus de 409 sortilège) et enseignant : fichiers, IP, audit par identifiant ; test « registre » sur INFORMATION_SCHEMA                                                                                        |
| RG4 (= S-6) | Traité     | URL signées à durée limitée (`lib/uploadsSignedUrls.js`) pour `students/`, `forum-posts/`, `context-comments/`, `tasks/`, `gl-player-journal/`… ; accès direct → 404                                                                   |
| RG5 à RG8   | Traité     | Export complété ; `redact` imbriqué ; EXIF en échec fermé (422), `sharp` exigé ; mot de passe minimum 8                                                                                                                                |
| R6 (S-4)    | Documenté  | Comportement inchangé (arbitrage de l'établissement) : annoncé dans la notice et dans `comptes-roles-et-groupes.md`                                                                                                                    |
| § 6 (infos) | Traité     | Prise de contrôle en liste blanche ; avertissement du drapeau e2e ; CORS Socket.IO strict ; `target_link_uri` contrôlée ; `FORETMAP_OAUTH_RETURN_ORIGINS` ; séance pédagogique : fin sans début refusée ; G&L sans périmètre documenté |

**Limites connues** (détail dans les commits) : une URL signée copiée reste lisible jusqu'à son
échéance ; un compte Google sans mot de passe peut toujours s'en poser un sans
réauthentification (CDG-42), puis changer d'e-mail ; les charges `payload_json` des journaux
ne sont pas nettoyées à l'effacement ; les vidéos de la médiathèque ne sont pas nettoyées de
leurs métadonnées.
