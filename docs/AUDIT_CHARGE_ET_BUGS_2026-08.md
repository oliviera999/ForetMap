# Audit — bugs, incohérences et charge serveur (août 2026)

> **Suite** : [`AUDIT_STABILITE_PERF_2026-09.md`](AUDIT_STABILITE_PERF_2026-09.md) étend
> l'analyse à **Gnomes & Licornes et aux composants communs**, et sert désormais de point
> d'entrée. Le présent document garde le détail des constats ForetMap, tous traités.

Seconde passe d'audit, partie d'un symptôme d'exploitation : des « déconnexions » et des
tentatives de reconnexion qui s'enchaînent. Le premier audit
([`AUDIT_CHARGE_SERVEUR_2026-08.md`](AUDIT_CHARGE_SERVEUR_2026-08.md)) mesurait le **régime
nominal** — cadence de polling, mémoire au boot, coût d'une requête authentifiée. Celui-ci
regarde les **cas dégradés et les pics** : ce qui se passe quand le serveur redémarre,
quand une classe entière est connectée, quand la base est momentanément absente.

**Périmètre et limites.** Lecture du backend (`routes/`, `lib/`, `database.js`,
`server.js`), du chemin de rafraîchissement client, du schéma et des migrations. Les
volumétries sont des **ordres de grandeur déduits du code et des fichiers du dépôt**, pas
des relevés de production : la session d'audit n'avait ni base MySQL ni accès au
`DEPLOY_SECRET` de prod. Les correctifs sont en revanche couverts par des tests, et la CI
rejoue la suite backend complète avec base.

Tous les points ci-dessous ont été **traités** dans le même lot ; chaque ligne indique le
correctif et sa couverture de test.

## 1. Charge serveur

### 1.1 Corps JSON de 25 Mo ouverts sur des préfixes entiers — traité

`lib/jsonBodyLimit.js` montait la limite haute sur `/api/tasks`, `/api/zones`, `/api/map`,
`/api/plants`, `/api/students`, `/api/settings`, `/api/forum`, `/api/context-comments`,
`/api/visit`, `/api/observations`, `/api/quiz`, `/api/media-library` — donc sur _toutes_
les routes de ces préfixes. Valider une tâche ou poster un commentaire acceptait 25 Mo.

`express.json` bufferise l'intégralité du corps **avant** de parser : 25 Mo de Buffer, puis
la conversion en chaîne, puis les objets de `JSON.parse` — un pic transitoire de l'ordre de
75 à 100 Mo pour une seule requête, sur un process dont la RSS de repos est mesurée à
~120 Mo. Deux requêtes concurrentes suffisent vraisemblablement à déclencher le kill LVE,
et le plafond de 1200 req/min/IP n'y change rien : il en faut deux.

C'est le candidat le plus sérieux pour les `hard_kills` que le journal de cycle de vie
signale sans pouvoir les expliquer.

**Correctif** : trois niveaux appliqués aux chemins réels — 2 Mo par défaut, 8 Mo pour le
contenu illustré, 25 Mo pour les imports et packs. Chaque 413 est journalisé avec le
chemin et le niveau appliqué, pour qu'un oubli se diagnostique en une ligne de log.
_Tests_ : `tests/server-load-hardening.test.js` (résolution du niveau par chemin, ordre des
paliers, surcharge par variable d'environnement).

### 1.2 Aucune borne de taille par image — traité

`lib/userContentImages.js` limitait le **nombre** d'images (3 par message) mais pas leur
**taille** : la seule borne était celle du corps JSON. Sur des routes ouvertes aux élèves.

**Correctif** : `assertUploadSize` dans `lib/uploads.js`, 8 Mo décodés par fichier
(`FORETMAP_MAX_UPLOAD_BYTES`), erreur 400 explicite au lieu d'un 413 opaque.

### 1.3 Écriture des fichiers dans la boucle d'événements — traité

`saveBase64ToDisk` et `writeBufferToDisk` utilisaient `fs.writeFileSync`. Pendant l'écriture
— plusieurs mégaoctets sur le disque partagé d'un mutualisé — le process ne sert **rien** :
ni les autres requêtes, ni `/api/health`, ni les pings Socket.IO, ce qui peut au passage
provoquer des déconnexions temps réel visibles côté élèves.

**Correctif** : `fs.promises.writeFile`, et les 21 sites d'appel passés en `await`
(y compris `persistUserContentImages` et `applyAvatarUpdate`, devenues asynchrones).
_Test_ : la nature asynchrone et la borne sont vérifiées dans
`tests/server-load-hardening.test.js`.

### 1.4 `GET /api/zones` rapatriait tout l'historique de récolte — traité

La liste des zones — dans le chemin du rafraîchissement périodique — exécutait
`SELECT * FROM zone_history WHERE zone_id IN (…) ORDER BY harvested_at DESC` **sans
`LIMIT`**, pour ne garder ensuite que 5 lignes par zone en mémoire. `zone_history` grossit
à chaque récolte, sans purge.

**Correctif** : fenêtrage SQL (`ROW_NUMBER() OVER (PARTITION BY zone_id …)`, MariaDB 11.4,
déjà employé par la migration 073) plus un comptage groupé pour `history_truncated`.

### 1.5 `GET /api/tutorials` chargeait un LONGTEXT jamais renvoyé — traité

`SELECT t.*` sur une table dont `html_content` est un `LONGTEXT` (25 à 32 ko par fiche du
dépôt), alors que `toPublicTutorialRow` ne l'expose jamais et que la fiche ne le renvoie
que sur `include_content=1`.

**Correctif** : colonnes explicites (`TUTORIAL_PUBLIC_COLUMNS`), `html_content` ajouté
uniquement quand il est demandé.

### 1.6 `GET /api/visit/content` : huit requêtes séquentielles, public, sans cache — traité

Seul point d'entrée **non authentifié** qui agrège des données (zones, repères, médias,
photos, tutoriels, packs mascotte), ouvert à quiconque a l'URL de visite — QR code, lien
partagé, robot d'indexation — pour un contenu éditorial qui change quelques fois par mois.

**Correctif** : requêtes indépendantes lancées ensemble, et cache mémoire par carte
invalidé par la **version d'écriture globale** (même principe que le cache RBAC), avec un
TTL de 30 s en garde-fou pour les écritures hors process.
_Tests_ : `tests/server-load-hardening.test.js` (péremption par écriture, TTL, borne
d'entrées, exigence de la source de version).

### 1.7 Bibliothèque média : scan synchrone et quadratique — traité

`listMediaLibraryItems` parcourait tout `uploads/media-library/` en `readdirSync`, avec un
`statSync` par fichier, puis un `Object.entries(keyIndex).find(...)` **par fichier**. Le
`limit` n'était appliqué qu'à la fin : il ne bornait aucun coût.

**Correctif** : index inverse `relativePath → entrée` construit une fois (linéaire).
_Test_ : `buildKeyIndexByRelativePath` dans `tests/server-load-hardening.test.js`.

### 1.8 Rafraîchissements temps réel synchronisés — traité

Le ciblage par salle de carte existe, mais le cas réel est une classe sur une même carte :
tous les clients recevaient l'événement et refetchaient après un débounce **fixe**
(220 ms pour les tâches, 400 ms pour le jardin). Trente postes tapaient donc dans la même
fenêtre de quelques dizaines de millisecondes ; dix validations d'affilée, dix rafales.

**Correctif** : jitter de 0 à 600 ms (`src/utils/realtimeRefreshDelay.js`).
_Test_ : `tests-ui/utils/realtimeRefreshDelay.test.js`.

### 1.9 Réessais non coordonnés (lot précédent)

Traité dans le lot « réessais partagés » : voir `src/shared/apiRetryGate.js` et
`docs/EXPLOITATION.md`. Rappel du mécanisme : pendant une coupure, chaque requête d'un
cycle retentait pour son compte (~70 par poste) et, derrière l'IP publique d'un
établissement, ces réessais atteignaient eux-mêmes le plafond de 1200 req/min.

## 2. Expositions et fragilités

### 2.1 `GET /api/sync-state` était public — traité

La sonde du polling différentiel expose l'identité du process et le rythme des écritures,
alors que toutes les autres routes de données exigent un jeton.

**Correctif** : jeton requis, mais vérification limitée à la **signature** — pas
d'hydratation rôles/permissions/groupes, qui réintroduirait les requêtes SQL que cette
sonde existe précisément pour éviter. Un jeton `product: 'gl'` reçoit 403 (isolement
produit). _Tests_ : `tests/sync-state-and-scope-cache.test.js` (401 sans jeton, 401 jeton
invalide, 403 jeton GL, et le cas nominal inchangé).

### 2.2 Masquage du hash de mot de passe par liste noire — traité

Huit endroits faisaient `{ ...row, password_hash: undefined }` après un `SELECT *`. Cela
fonctionne tant que la table `users` ne gagne pas de colonne sensible : le jour où une
migration ajoute un jeton de réinitialisation ou un secret TOTP, il part au client depuis
ces huit endroits, silencieusement.

**Correctif** : liste blanche unique (`lib/publicUser.js`, `toPublicUserRow`).
_Test_ : une colonne sensible fictive est vérifiée absente de la projection.

### 2.3 Sockets GL sans gestion de `connect_error` — traité

`useGLMarketTrade` et `useGLSpellCast` créaient leurs sockets sans gestionnaire d'erreur de
connexion et avec les réglages de reconnexion par défaut : un jeton GL refusé produisait le
même martèlement que celui corrigé côté ForetMap.

**Correctif** : la garde `isSocketAuthRejection` est appliquée aux deux hooks GL. La
fonction est testée (`tests-ui/utils/realtimeAuthRejection.test.js`) ; le câblage dans les
deux hooks GL n'a pas de test d'intégration dédié.

## 3. Ce qui a été vérifié et jugé sain

À ne pas réauditer sans raison :

- **SQL paramétré** partout ; les quelques interpolations sont des fragments constants
  (`SELECT` prédéfinis) ou des listes de `?` générées.
- **Index** présents sur les colonnes de filtrage chaudes : `tasks.map_id`,
  `zone_history(zone_id, harvested_at)`, `user_plant_observation_events(user_id, plant_id)`
  — ce dernier couvre le `GROUP BY user_id` des statistiques.
- `ZONES_LIST_SQL` **exclut déjà** `body_json` de la liste au profit d'un booléen
  `has_visit_body`.
- **Cache des réglages** en place (`lib/settings.js`, TTL 15 s).
- **Détection de cycle** correcte dans l'arbre des groupes (`routes/groups.js`).
- `GET /api/sync-state` ne touche pas la base (compteurs mémoire).
- Presque **aucune erreur avalée** ; pas de recherche `LIKE '%…%'` ; les `res.status()`
  sans `return` échantillonnés sont tous en fin de gestionnaire.

## 4. Reste à faire (hors code applicatif)

- **Purge de `zone_history`** : le fenêtrage borne le coût de lecture, pas la croissance de
  la table. Une purge ou un archivage reste à décider côté produit.
- **Statique servi par le frontal** (piste 9 du premier audit) : toujours à faire côté
  cPanel.
