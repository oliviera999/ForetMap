# Audit consolidé — stabilité et performance serveur (septembre 2026)

Document de référence unique sur la **tenue en charge et la stabilité** de la plateforme,
ForetMap **et** Gnomes & Licornes, composants communs inclus. Il reprend et remplace comme
point d'entrée les deux audits précédents, qui restent consultables pour leur détail :

| Audit                                                                | Portée                                                                              | Statut                                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [`AUDIT_CHARGE_SERVEUR_2026-08.md`](AUDIT_CHARGE_SERVEUR_2026-08.md) | régime **nominal** ForetMap : cadence de polling, mémoire au boot, coût par requête | pistes 1 à 9 traitées (lots 20-21, 30), §5 = seconde passe |
| [`AUDIT_CHARGE_ET_BUGS_2026-08.md`](AUDIT_CHARGE_ET_BUGS_2026-08.md) | **cas dégradés et pics** ForetMap : coupures, redémarrages, classe entière          | tous les constats traités                                  |
| **Ce document**                                                      | **GL + composants communs**, et synthèse générale                                   | constats **ouverts**, non corrigés                         |

## 0. Comment lire ce document

Les sections 1 à 3 exposent les constats **nouveaux**, non corrigés à ce jour. La section 4
récapitule ce qui est déjà traité (pour ne pas le réauditer), la section 5 ce qui a été
vérifié **et jugé sain**, la section 6 l'ordre de traitement suggéré.

**Périmètre et limites.** Lecture de `routes/gl/**`, `lib/gl*`, `lib/auth/**`, `lib/rbac.js`,
`lib/shared/**`, `middleware/**`, `database.js`, et des hooks temps réel des deux produits.
Les volumétries sont des **ordres de grandeur déduits du code**, pas des relevés de
production : la session d'audit n'avait ni base MySQL ni accès au `DEPLOY_SECRET` de prod.
Aucun profilage n'a été exécuté ; les coûts annoncés sont des comptages de requêtes.

## 1. Gnomes & Licornes — chemins chauds

### G1. La liste du marché coûte 1 + 4N requêtes, et toute la classe la recharge en même temps

`lib/glMarket.js:380-384` — `listTradesForPlayer` boucle sur les échanges de la page et
appelle `buildTradePayload(row.id)` pour chacun. Or `buildTradePayload` (`:168-180`) exécute
**quatre requêtes** : l'échange, ses deux côtés, ses messages, puis les joueurs concernés.
Avec la taille de page par défaut (`pageSize = 20`, `:360`), afficher une page de marché
coûte donc **jusqu'à 81 requêtes SQL**.

Cela ne serait qu'un coût unitaire élevé si l'appel était rare. Il ne l'est pas :
`src/gl/hooks/useGLMarketTrade.js:83-94` réagit à `gl:market:trade-changed` — émis **à toute
la classe** — par un `refreshAll()` qui relance trois appels API dont celui-ci, **sans
étalement**. Un seul échange modifié déclenche donc, chez chaque joueur connecté et au même
instant, une page de marché complète.

Ordre de grandeur pour une classe de 25 postes : ~2000 requêtes SQL dans la même seconde,
sur un pool de 30 connexions (`database.js:78`).

**Remède** : charger la page en trois requêtes groupées (`WHERE trade_id IN (…)`) au lieu de
quatre par échange, et ajouter le même jitter que celui posé côté ForetMap
(`src/utils/realtimeRefreshDelay.js`, réutilisable tel quel).

### G2. Les rafraîchissements temps réel GL n'ont pas de jitter

Corollaire du précédent, mais valable pour tous les hooks GL : `useGLMarketTrade` et
`useGLSpellCast` rechargent sur événement avec un délai **nul**, là où ForetMap étale
désormais de 0 à 600 ms. Le module d'étalement est commun et déjà écrit : il n'y a qu'à
l'appeler.

### G3. `gl_game_events` grossit sans fin

Une ligne par action de jeu (`lib/realtime.js` émet, les routes GL insèrent), consultée par
`routes/gl/journal.js` — qui, lui, borne correctement (`LIMIT`, 1 à 500, défaut 100). La
table n'est en revanche **couverte par aucune purge** : `scripts/purge-audit-logs.js:42-52`
ne connaît que `audit_log` et `security_events`.

Sur un mutualisé, une table de journal qui croît indéfiniment finit par peser sur les
sauvegardes (`db-backup.sh`), sur la durée des `mysqldump` et sur l'espace disque du compte.

**Remède** : ajouter `gl_game_events` (et `zone_history`, cf. §2) aux cibles du script, avec
une rétention distincte de celle des journaux de sécurité — un an de partie, par exemple.

### G4. Les imports GL ne sont ni transactionnels ni lotis

`glChaptersImport.js`, `glQcmImport.js`, `glSpeciesImport.js`, `glSpellsImport.js`,
`glGlossaryImport.js` : **aucun n'utilise `withTransaction`**, et tous écrivent **ligne par
ligne** dans une boucle `await`.

Deux conséquences distinctes :

1. **Durée.** Un import de plusieurs centaines de lignes fait autant d'allers-retours MySQL
   séquentiels. Le client abandonne au bout de 40 s (`API_FETCH_TIMEOUT_MS`) alors que le
   serveur, lui, continue : l'utilisateur croit à un échec et recommence.
2. **Cohérence.** La plupart des imports sont idempotents (`ON DUPLICATE KEY UPDATE`,
   `INSERT IGNORE`), donc un réessai ne duplique pas — **sauf `glChaptersImport`**, qui
   procède par réconciliation avec **suppressions** (`:1011`, `:1115` : `toDelete` calculé
   puis appliqué). Une interruption au mauvais moment laisse un chapitre amputé de ses
   marqueurs ou de ses zones de royaume, sans rollback possible.

**Remède** : envelopper au minimum `glChaptersImport` dans `withTransaction`, et remplacer
les boucles d'insertion par des `INSERT … VALUES (…), (…), …` par lots (100 lignes, par
exemple) — un ordre de grandeur de moins en allers-retours.

### G5. `LIMIT` interpolé plutôt que paramétré

`routes/gl/journal.js:45,53` et `lib/glMarket.js:377` composent `LIMIT ${limit}` /
`LIMIT ${Number(pageSize)} OFFSET ${offset}`. Les valeurs sont bornées en amont (zod pour le
journal, `Number()` pour le marché), donc **aucune injection n'est atteignable aujourd'hui**.
C'est néanmoins la seule entorse à la règle « SQL toujours paramétré » du projet, et elle
n'est protégée que par la vigilance de l'appelant.

## 2. Composants communs

### C1. `getRoleBySlug` est le seul maillon RBAC non caché — et c'est celui qu'emprunte GL

`lib/rbac.js` met en cache ce qu'il faut : `getPrimaryRoleForUser` (`:758`) et
`getRolePermissions` (`:775`) passent par le cache versionné, invalidé à toute écriture RBAC.
Mais `getRoleBySlug` (`:610`) exécute directement `SELECT * FROM roles WHERE slug = ?`.

Or l'hydratation ForetMap emprunte le chemin `buildAuthzPayload(userType, userId)` — donc les
fonctions cachées — tandis que **l'hydratation GL** (`lib/auth/glHydration.js:145` →
`buildAuthzPayloadForRoleSlug` → `getRoleBySlug`) passe par le chemin **non caché**. Chaque
requête GL paie donc un aller-retour MySQL de plus que son équivalent ForetMap.

Le coût unitaire est faible (table minuscule, index unique sur `slug`), mais c'est exactement
le motif que l'audit d'août avait corrigé pour les groupes ForetMap, laissé en place côté GL
parce que le chemin est différent.

**Remède** : une clé `rs:<slug>` dans le même cache versionné — quelques lignes, invalidation
déjà en place.

### C2. `lib/tutorialViewCache.js` est invisible aux recherches de code

Le fichier contient des **octets de contrôle bruts** (`\x00`, `\x01`, `\x02`, `\x03`) écrits
littéralement comme séparateurs de clé de cache. L'intention est bonne — des séparateurs
qu'aucune donnée ne peut contenir — mais l'écriture est piégeuse : `file` classe le fichier
en `data`, et **`grep` sans `-a` le saute silencieusement**. Toute recherche dans le dépôt
(revue, audit, refactorisation) rate donc ce fichier sans le signaler.

**Remède** : écrire `'�'`, `''`… au lieu des octets bruts. Comportement identique,
fichier redevenu texte.

### C3. Le périmètre de purge ne couvre pas les tables de contenu à croissance continue

`scripts/purge-audit-logs.js` traite `audit_log` et `security_events`. Restent hors
couverture : `gl_game_events` (§G3) et `zone_history` (déjà signalé dans l'audit d'août : le
fenêtrage SQL a borné le **coût de lecture**, pas la croissance).

À cela s'ajoute un point d'exploitation : la ligne de purge est marquée **« optionnelle »**
dans `docs/CRONTAB.md`. Si elle n'a pas été installée, `security_events` accumule sans limite
adresse IP et user-agent — donc des données personnelles d'élèves mineurs.

### C4. Les transactions n'ont pas de garde-fou de durée

`database.js:284` — `withTransaction` prend une connexion du pool et la garde jusqu'au
commit, sans délai maximal. Une transaction lente monopolise une connexion sur les 30 du pool
et tient ses verrous d'autant. Aucun cas problématique n'a été identifié dans le code actuel
(les imports, seuls candidats, sont hors transaction — cf. §G4), mais le garde-fou manque si
l'un d'eux y entre un jour.

### C5. Rappel : le bac à sable des tutoriels est neutralisé

Constat de sécurité relevé en fin d'audit précédent, **non corrigé**, rappelé ici parce qu'il
touche un composant commun (le rendu de contenu) : `TutorialPreviewModal.jsx:118` combine
`allow-same-origin` et `allow-scripts`, ce qui annule le bac à sable ; le contenu vient de
`GET /api/tutorials/:id/view`, servi en `text/html` sur l'origine de l'application et **non
assaini** (`renderTutorialViewHtml` n'ajoute que les liens de glossaire) ; le jeton de session
vit dans `localStorage`. Un script placé dans une fiche importée s'exécute donc avec l'origine
de l'application, chez chaque élève qui l'ouvre.

Le correctif n'est pas un attribut à retirer : `readGlossaryTermMessage`
(`GlossaryPopover.jsx:80`) exige `event.origin === appOrigin`, et le CSP candidat
(`script-src 'self'`) bloquerait aussi le script inline que l'application injecte elle-même.
Trois pièces liées, à traiter ensemble.

## 3. Dépendances

`npm audit --omit=dev` : **2 vulnérabilités modérées**, `uuid < 11.1.1` tiré par `exceljs`
(bornes de tampon sur les versions 3/5/6 quand `buf` est fourni). Le correctif proposé est un
retour à `exceljs@3.4.0`, cassant. Le chemin d'appel (export tableur) ne passe pas d'entrée
utilisateur à la fonction vulnérable. **À suivre plutôt qu'à forcer.**

## 4. Déjà traité (ne pas réauditer)

Reprise condensée des deux audits précédents, tous points livrés :

- **Mémoire au boot** : chargement paresseux d'`exceljs`, `pdfkit`, `adm-zip`, `sharp`
  (−31 Mo RSS mesurés).
- **Polling** : sonde `GET /api/sync-state` + saut de cycle + refetch ciblé par domaine
  (−85 % du volume).
- **Groupes** : cache versionné (−2 requêtes SQL par requête authentifiée).
- **Redémarrages** : accalmie avant déploiement, keepalive `*/3`, journal de cycle de vie et
  verdict `restarts`.
- **Reprise BDD** : `initDatabase()` réessayé en boucle — une panne MySQL au boot n'est plus
  définitive.
- **Coupures** : état conservé au lieu d'être vidé, bandeau et repli de polling rétablis,
  fenêtre de réessai partagée, timeout réessayé sur GET, reconnexion Socket.IO arrêtée sur
  refus d'authentification.
- **Corps JSON** : trois paliers (2 / 8 / 25 Mo) au lieu de 25 Mo sur des préfixes entiers ;
  borne de 8 Mo par fichier écrit ; écritures disque devenues asynchrones.
- **Requêtes lourdes** : fenêtrage de `zone_history`, colonnes explicites des tutoriels, cache
  et parallélisation de `/api/visit/content`, index média linéaire.
- **Expositions** : `/api/sync-state` authentifié, projection publique des comptes en liste
  blanche.

## 5. Vérifié et sain

- **Bornes mémoire** : tampon de logs (2000 lignes, `lib/logBuffer.js:10`), anneaux de
  métriques (20 et 15 entrées, `lib/logMetrics.js:18,22`), cache des vues de tutoriels
  (32 entrées / 16 Mo, `lib/tutorialViewCache.js`).
- **Caches** : réglages ForetMap (TTL 15 s) et GL (TTL 30 s, `lib/glSettings.js:157`),
  permissions et rôle primaire RBAC (versionnés).
- **Gating pédagogique** : purement calculatoire — `learningGatingRuntime` et
  `learningGatingSummary` n'exécutent **aucune** requête, les données leur sont passées.
- **Journal GL** : borné (`LIMIT` validé 1–500).
- **Sortilèges** : verrou pessimiste `FOR UPDATE` assumé et documenté, sur un nombre de
  contributeurs faible.
- **Index** : présents sur les colonnes de filtrage chaudes des deux produits.
- **Isolement produit** : un jeton GL est refusé hors `/api/gl/*`, et réciproquement.

## 6. Ordre de traitement suggéré

| Priorité | Constat                                                                              | Effort                | Gain                                                         |
| -------- | ------------------------------------------------------------------------------------ | --------------------- | ------------------------------------------------------------ |
| 1        | **G1** requêtes groupées du marché + **G2** jitter GL                                | petit lot             | supprime le pic de ~2000 requêtes par événement de classe    |
| 2        | **C1** cache `getRoleBySlug`                                                         | quelques lignes       | −1 requête SQL par requête GL                                |
| 3        | **G4** transaction et lotissement des imports                                        | lot moyen             | supprime le risque de chapitre amputé, divise la durée       |
| 4        | **C3** purge `gl_game_events` / `zone_history` + ligne crontab                       | script + exploitation | borne la croissance et le poids des sauvegardes              |
| 5        | **C5** bac à sable des tutoriels                                                     | lot dédié             | ferme une exfiltration de jeton (décision produit à prendre) |
| 6        | **C2** octets de contrôle, **G5** `LIMIT` paramétré, **C4** garde-fou de transaction | petits                | hygiène, dette de convention                                 |

Les points 1 à 4 sont sans changement fonctionnel visible. Le point 5 demande un arbitrage :
la correction la plus simple (retirer `allow-same-origin`) casse le glossaire dans les fiches.
