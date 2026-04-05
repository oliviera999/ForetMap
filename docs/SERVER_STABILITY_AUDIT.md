# Audit de stabilité serveur ForetMap

Document de synthèse (exécution le **2026-04-05**). Complète les guides [EXPLOITATION.md](EXPLOITATION.md), [EVOLUTION.md](EVOLUTION.md) § 1.4 et le plan d’audit stabilité.

## 1. Vérifications production (`https://foretmap.olution.info`)

| Contrôle | Résultat |
|----------|----------|
| `npm run deploy:check:prod` | OK — `GET /api/health`, `/api/health/db`, `/api/version` en 200 |
| `npm run prod:admin-tail` (secret deploy présent en local) | OK — diagnostics 200 ; instantané au moment du test : version **1.28.29**, BDD **ok** (~0,42 ms), mémoire RSS ~126 Mo, métriques HTTP à zéro (process récent, uptime ~13 s) |

En cas de **429** sur les scripts admin, respecter la pause documentée dans [EXPLOITATION.md](EXPLOITATION.md).

## 2. Tests de charge locaux

Environnement machine d’audit : **MySQL local indisponible** (`ECONNREFUSED 127.0.0.1:3306`). Le serveur a tout de même écouté sur le port 3000 ; `initDatabase` a échoué (comportement documenté ci‑dessous).

### 2.1 `npm run test:load:10vu` (Artillery, pas de bypass rate limit)

- **Résumé** : 398 requêtes, **0** réponse **429**.
- Codes : **200** × 162 (surtout `/api/health`, `/api/version`), **500** × 189, **503** × 47 (routes dépendant de la BDD : `/api/zones`, `/api/plants`, `/api/health/db`, etc.).
- **Interprétation** : sans MySQL, le scénario ne reflète pas une classe réelle ; il confirme surtout l’absence de 429 à ce débit sur les routes encore servies. Pour une baseline **429 / latence** représentative, relancer avec **MySQL démarré** et `.env` valide (voir [LOCAL_DEV.md](LOCAL_DEV.md)).
- Rapport JSON : `load/reports/10vu-2026-04-05T19-27-50-574Z.json` (copie miroir : `load/report.json`).

### 2.2 `npm run test:load:socketio-smoke`

- Paramètres : **4** clients, **15 s**, transport **polling** uniquement, JWT signé localement (`FORETMAP_SOCKETIO_LOAD_JWT`).
- **Résultat** : 4 connexions OK, **0** `connect_error`, 4 déconnexions en fin de fenêtre.

## 3. Comportements code à connaître (stabilité / dégradation)

| Sujet | Fichier / zone | Comportement |
|-------|----------------|--------------|
| Health sans BDD | `server.js` (`/api/health`, `/health`) | Répond **200** même si la BDD est cassée. |
| Échec `initDatabase()` au boot | `server.js` (`boot`) | Le **serveur HTTP démarre** ; erreur loguée ; routes BDD en erreur. Risque UX : SPA + health OK alors que l’API métier échoue. |
| Exceptions non gérées | `server.js` | `uncaughtException` / `unhandledRejection` → log **fatal** puis `process.exit(1)` (~50 ms) : **fail-fast**, pas d’état zombie. |
| Redémarrage distant | `POST /api/admin/restart` | `process.exit(0)` après 1 s — **pas** d’arrêt gracieux explicite (pool MySQL / `server.close`). |
| Promesses async routes | `installAsyncErrorForwarding()` dans `server.js` | Réjections de handlers async routées vers le middleware d’erreur Express. |
| Pool MySQL | `database.js` | `pool.on('error', …)` pour éviter les **uncaughtException** sur connexions idle perdues ; `FORETMAP_DB_CONNECTION_LIMIT`, `queueLimit`. |
| Rate limiting | `server.js` | `express-rate-limit` **en mémoire par processus** ; avec **plusieurs instances** Node derrière un LB, le plafond **n’est pas global** (cf. [EVOLUTION.md](EVOLUTION.md) § 1.4). |
| Socket.IO multi-instance | `lib/realtime.js` + doc | Sans adaptateur Redis (ou équivalent), les événements ne traversent pas les processus — symptôme : partie des clients sans live (REST rattrape avec délai). |

## 4. Checklist hébergeur (non automatisable depuis le dépôt)

À valider **manuellement** sur le panneau (ex. o2switch / **Setup Node.js App**) :

1. **Nombre d’instances / workers Node** pour ce site : viser **une instance** tant qu’il n’y a pas d’adaptateur Socket.IO partagé ni store rate limit partagé.
2. Si **plus d’une instance** est requise par l’hébergeur : planifier **Redis** (adaptateur Socket.IO, éventuellement store rate limit) — voir [EVOLUTION.md](EVOLUTION.md) § 1.4.
3. Après incident utilisateur : demander **`X-Request-Id`** et croiser **`recentHttp5xx`** / tampon **`GET /api/admin/logs`** ([EXPLOITATION.md](EXPLOITATION.md)).

## 5. Prochaines exécutions recommandées

- Répéter **`test:load:10vu`** avec **BDD locale** pour mesurer **429** et latences sous le plafond réel `FORETMAP_API_RATE_LIMIT_PER_MIN`.
- Répéter **`prod:admin-tail`** après un pic de trafic ou un incident pour exploiter `metrics.http429`, `recentHttp5xx`, `database.latencyMs`.
