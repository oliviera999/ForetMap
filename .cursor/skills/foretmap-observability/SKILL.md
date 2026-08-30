---
name: foretmap-observability
description: Observabilité ForetMap (Pino, X-Request-Id, logs HTTP, métriques admin, MCP Cursor). À utiliser pour diagnostiquer la prod, enrichir les logs ou expliquer GET /api/admin/diagnostics et /api/admin/logs.
---

# Observabilité ForetMap

## Références

- **API / variables** : [docs/API.md](docs/API.md) section _Observabilité_ ; [docs/EXPLOITATION.md](docs/EXPLOITATION.md) (check post-déploiement, secret pour diagnostics).
- **MCP Cursor** (accès outils `foretmap_*` sans coller le secret dans le chat) : [docs/MCP_FORETMAP_CURSOR.md](docs/MCP_FORETMAP_CURSOR.md) — le processus **`foretmap-diagnostics`** charge **`.env`** à la racine du dépôt.
- **Évolutions externes** (Sentry, OpenTelemetry) : [docs/EVOLUTION.md](docs/EVOLUTION.md).

## Modules backend

| Fichier                 | Rôle                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `lib/logger.js`         | Pino + `redact` (tokens, mots de passe)                                                |
| `lib/requestId.js`      | `X-Request-Id` sur chaque réponse                                                      |
| `lib/httpRequestLog.js` | Fin de requête ; `FORETMAP_HTTP_LOG`, `FORETMAP_HTTP_SLOW_MS`                          |
| `lib/logMetrics.js`     | Compteurs + `recentHttp5xx`, `http429` + `recentHttp429` pour `/api/admin/diagnostics` |
| `lib/routeLog.js`       | `logRouteError` (+ `requestId`, incrément métriques)                                   |
| `lib/cspReport.js`      | Signalements CSP `Report-Only` regroupés (1 ligne `csp_report_window` / 60 s)          |

## Checks rapides (local → prod)

Secret dans `.env` non versionné : **`DEPLOY_SECRET`**, **`FORETMAP_DEPLOY_CHECK_SECRET`** ou **`FORETMAP_DEPLOY_SECRET`** (même valeur que sur le serveur). **`FORETMAP_PROD_BASE_URL`** pour cibler une autre instance.

```bash
npm run deploy:check:prod
```

Avec l’un des secrets ci-dessus : le script appelle aussi `GET /api/admin/diagnostics`.

JSON complet diagnostics (métriques, `recentHttp5xx`, `http429` / `recentHttp429`, etc.) :

```bash
npm run prod:admin-diagnostics
```

Tampon Pino + résumé parsé (comptage niveaux, échantillon erreurs), **User-Agent** dédié + pause anti-429 :

```bash
npm run prod:admin-tail
```

Tout enchaîner (check puis tail) :

```bash
npm run prod:remote-debug
```

Helper partagé : `scripts/lib/deploy-secret-from-env.js`.

## Signalements CSP

Politique **imposée** = `img-src` historique (inchangée) ; politique **candidate** complète servie en `Content-Security-Policy-Report-Only` avec `report-uri /api/csp-report` (`lib/csp.js`, chaque directive justifiée en commentaire).

```bash
curl -sI https://<domaine>/api/health | grep -i content-security-policy
grep csp_report_window logs/*.log | tail -20
```

Rien n’est journalisé par signalement : regroupement par (directive, origine bloquée), fenêtre de 60 s, plafond de 40 signatures (`droppedSignatures` = surplus). Silence prolongé en usage réel ⇒ la candidate peut être **promue** en imposée (échanger les en-têtes dans `server.js` **et** mettre à jour le test dédié de `tests/csp.test.js`, qui verrouille ce choix). Détail : `docs/EXPLOITATION.md` (§5), `docs/API.md` (§ Sécurité du contenu).

## Corrélation support

Demander aux utilisateurs l’en-tête **`X-Request-Id`** (outils réseau du navigateur) et croiser avec `GET /api/admin/logs` ou les champs `metrics.recentHttp5xx` / `metrics.recentHttp429` des diagnostics (429 = surcharge / rate limit, 5xx = erreur serveur ou BDD).
