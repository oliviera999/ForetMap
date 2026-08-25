# Audit charge serveur — août 2026

État des lieux de la charge générée par ForetMap + GL sur l'hébergement mutualisé
(o2switch : CloudLinux LVE, Passenger, proxy Tiger Protect), et pistes de réduction
**sans perte de fonctionnalité**. Mesures faites sur la révision du lot 14 (v1.117.0),
Node 22, base MariaDB locale.

## 1) Profil de charge constaté (un utilisateur actif)

| Source                                                                    | Cadence                                                                  | Coût                                                                                                                                                      |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Polling `fetchAll()` (App.jsx) quand le temps réel n'est **pas** connecté | toutes les **60 s** (×2 sur onglets « secondaires », 120 s onglet caché) | **~8 appels API** par cycle : `/api/maps`, `/api/zones`, `/api/tasks`, `/api/task-projects`, `/api/plants`, `/api/map/markers`, tutoriels, `/api/auth/me` |
| Polling `fetchAll()` quand Socket.IO est **live**                         | toutes les **90 s** + refetchs ciblés sur événements                     | idem, mais moins souvent ; refetchs partiels (zones+repères seulement pour certains événements jardin)                                                    |
| Socket.IO (transport long-polling forcé en prod, `allowUpgrades:false`)   | continu, `pingInterval` 20 s                                             | ~3–6 requêtes HTTP/min par client connecté (hors chaîne Express pour l'essentiel)                                                                         |
| Assets statiques `dist/assets/*`                                          | premier chargement uniquement                                            | `Cache-Control: immutable, max-age=1an` déjà en place — recharges quasi nulles                                                                            |
| Jobs serveur                                                              | 1×/jour (tâches récurrentes + archivage auto, jitter au boot)            | négligeable                                                                                                                                               |

Ordre de grandeur : **~10–15 requêtes/min** pour un utilisateur actif, très loin du rate
limit (1200/min/IP). **Le CPU « requêtes » n'est pas le problème** ; les deux vrais
postes de charge sont la **mémoire résidente** et les **redémarrages/cold starts**.

### Coût par requête authentifiée

Chaque requête authentifiée refait l'hydratation de session :

- rôle + permissions : **cachés** (cache RBAC versionné, invalidation par version
  d'écriture — sain) ;
- **groupes accessibles** (`getUserDirectGroupIds` + `getAllGroups` dans
  `lib/groupScope.js`) : **2 requêtes SQL non cachées à chaque requête** —
  soit ~16 SQL/min/utilisateur rien que pour le polling.

### Mémoire (mesures)

| Mesure                                                         | Valeur             |
| -------------------------------------------------------------- | ------------------ |
| RSS du process Node juste après boot (prod locale, dist servi) | **~120 Mo**        |
| Baseline Node nu                                               | ~45 Mo             |
| `require('exceljs')` seul                                      | **+30 Mo**, 178 ms |
| `require('pdfkit')` seul                                       | **+26 Mo**, 104 ms |

`exceljs` est chargé **au boot** via `routes/students.js` → `lib/spreadsheet.js` (et les
imports GL), `pdfkit` via `routes/tutorials.js` → `lib/tutorialRouteHelpers.js` — pour
des fonctions d'export/import utilisées occasionnellement. Sur mutualisé, la mémoire
est le premier critère de kill LVE/Passenger → kills = redémarrages = fenêtres 503.

### Boot

Localement : **~0,8 s** entre `node server.js` et `/api/ready` OK (le boot applicatif
est sain : `initDatabase()` ne rejoue pas les migrations, il fait un `ping` + une
reprise légère des tutoriels legacy). La lenteur des cold starts **en prod** vient
donc surtout du spawn Passenger + du chargement de ~1000 modules depuis le disque
mutualisé — c'est-à-dire de la **fréquence** des cold starts plus que de leur coût
unitaire côté code.

### Redémarrages (source majeure des 503 traités au lot 14)

- `scripts/auto-deploy-cron.sh` appelle `POST /api/admin/restart` **à chaque commit
  poussé sur `main`** (y compris docs-only si l'opt-in n'est pas activé).
- Passenger **stoppe l'application inactive** ; avec un seul utilisateur, chaque
  retour après une pause = cold start.

### Points déjà sains (ne pas y toucher)

Logs HTTP `minimal` en prod (5xx et lents uniquement) · cache immutable des assets
hashés · compression avec exclusions pertinentes · `/api/version` sans lecture disque ·
cache RBAC versionné · rate limit en mémoire · jobs quotidiens uniques avec jitter ·
`connectionStateRecovery` et heartbeat Socket.IO modérés.

## 2) Pistes de réduction, par impact décroissant

Aucune ne retire de fonctionnalité ; les gains sont estimés pour un usage
mono-utilisateur → petite classe.

### A. Mémoire (réduit kills et cold starts)

1. **Lazy-require des bibliothèques lourdes** (`exceljs`, `pdfkit`, `adm-zip`, et
   `sharp`) au premier usage dans les handlers plutôt qu'au boot. Gain **mesuré après
   mise en œuvre : −31 Mo de RSS** (~ −25 % du process) — les coûts unitaires du §1 se
   recouvrent partiellement (dépendances et pages V8 partagées), leur somme surestimait.
   Aucun impact fonctionnel (premier export ~200 ms plus lent, une fois par vie de
   process).
2. **Config Passenger côté hébergeur** : viser **1 instance** (`passenger_max_pool_size 1`
   — le socket temps réel suppose déjà une instance unique, cf. EXPLOITATION §temps réel)
   et allonger `passenger_pool_idle_time`. Moins d'instances = moins de RAM totale et
   moins de cold starts.

### B. Requêtes / SQL

3. **Cacher le scope groupes** comme le RBAC (même cache versionné, invalidé par
   écriture sur `groups`/`group_members`) : **−2 SQL par requête authentifiée**.
4. **Endpoint « fraîcheur » léger pour le polling** : un `GET /api/sync-state`
   renvoyant un compteur/horodatage par domaine (zones, tâches, plantes, repères,
   tutoriels…) ; `fetchAll()` ne refetcherait que les domaines qui ont bougé.
   Gain : cycle de polling ramené de ~8 requêtes lourdes à **1 requête légère**
   dans le cas courant « rien n'a changé ». Chantier plus conséquent (backend +
   client), à faire par étapes.
5. **Fallback polling** : si le Socket.IO s'avère fiable en prod (état `live`
   majoritaire dans les diagnostics), allonger le polling de secours 90 s → 120 s
   ne perd rien — les événements assurent déjà la fraîcheur.

### C. Redémarrages / cold starts

6. **Activer l'opt-in existant** `DEPLOY_SKIP_RESTART_IF_SOFT_ONLY=1` sur le cron de
   déploiement : plus de restart pour les commits docs/CHANGELOG uniquement.
7. **Grouper les merges sur `main`** (le cron redémarre à chaque commit) : merger les
   PR par rafale plutôt qu'au fil de l'eau réduit d'autant les fenêtres 503.
8. **Keepalive optionnel** : un cron `curl -fsS https://…/api/health` toutes les
   5 min évite l'arrêt d'inactivité Passenger en journée. Coût : ~300 requêtes/jour
   sur une route exclue des logs/métriques — négligeable, à mettre en regard de la
   disparition des cold starts en journée. (Désactivable la nuit.)

### D. Statique (optionnel, gain CPU Node)

9. **Servir `dist/` et les familles publiques d'`uploads/` par le frontal Apache/
   LiteSpeed** (`.htaccess` / config o2switch) au lieu de Node : chaque visite
   décharge Node de dizaines de requêtes statiques. À condition de **garder sous
   Node** les chemins privés (`/uploads/observations/`, `/uploads/task-logs/` —
   autorisation applicative) et les en-têtes actuels (immutable, CSP des SVG).
   À valider avec la config hébergeur ; le comportement applicatif ne change pas.

## 3) Ce que l'audit écarte

- **Réduire la fréquence de polling par défaut (60 s)** sans l'endpoint « fraîcheur »
  (piste 4) : dégraderait la fraîcheur perçue quand le socket ne tient pas — refusé
  (perte fonctionnelle).
- **Désactiver le temps réel** pour économiser le long-polling : le socket est
  précisément ce qui permet au client d'espacer ses refetchs — le retirer
  _augmenterait_ la charge et dégraderait l'UX.
- **Toucher aux logs** : déjà au minimum utile en prod.

## 4) Ordre de mise en œuvre suggéré — et état de réalisation (lot 15)

| Étape | Pistes                                  | Effort           | Gain principal                | État                                                                                                       |
| ----- | --------------------------------------- | ---------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1     | 6 (opt-in cron) + 2 (config Passenger)  | config seule     | moins de restarts/cold starts | ✅ 6 : défaut du cron passé à 1 · 2 : documenté EXPLOITATION                                               |
| 2     | 1 (lazy-require)                        | petit lot code   | −31 Mo RSS (mesuré)           | ✅ réalisé (exceljs, pdfkit, adm-zip, sharp)                                                               |
| 3     | 3 (cache groupes)                       | petit lot code   | −2 SQL/req auth               | ✅ réalisé (cache versionné, lib/groupScope.js)                                                            |
| 4     | 8 (keepalive) puis 9 (statique frontal) | config hébergeur | cold starts, CPU Node         | 📋 documenté (EXPLOITATION §Charge serveur) — à faire cPanel                                               |
| 5     | 4 (endpoint fraîcheur) ± 5              | lot dédié        | −85 % du volume de polling    | ✅ 4 : `GET /api/sync-state` + saut de cycle client · 5 : sans objet (le cycle sauté coûte déjà 1 requête) |

Mise en œuvre retenue pour la piste 4 : un **compteur global d'écritures SQL** (plus
`bootId` du process) plutôt qu'un compteur par domaine — toute écriture, connue ou non,
déclenche un cycle complet (aucun risque de fraîcheur perdue) ; les écritures hors
process (scripts CLI) sont couvertes par un **plafond de sauts consécutifs** qui force
un cycle complet périodique. Détail : `docs/API.md` §Client HTTP.
