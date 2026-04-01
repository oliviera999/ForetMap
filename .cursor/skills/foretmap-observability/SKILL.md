---
name: foretmap-observability
description: Observabilité ForetMap (Pino, X-Request-Id, logs HTTP, métriques admin, MCP Cursor). À utiliser pour diagnostiquer la prod, enrichir les logs ou expliquer GET /api/admin/diagnostics et /api/admin/logs.
---

# Observabilité ForetMap

## Références

- **API / variables** : [docs/API.md](docs/API.md) section *Observabilité* ; [docs/EXPLOITATION.md](docs/EXPLOITATION.md) (check post-déploiement, secret pour diagnostics).
- **MCP Cursor** (accès outils `foretmap_*` sans coller le secret dans le chat) : [docs/MCP_FORETMAP_CURSOR.md](docs/MCP_FORETMAP_CURSOR.md).
- **Évolutions externes** (Sentry, OpenTelemetry) : [docs/EVOLUTION.md](docs/EVOLUTION.md).

## Modules backend

| Fichier | Rôle |
|---------|------|
| `lib/logger.js` | Pino + `redact` (tokens, mots de passe) |
| `lib/requestId.js` | `X-Request-Id` sur chaque réponse |
| `lib/httpRequestLog.js` | Fin de requête ; `FORETMAP_HTTP_LOG`, `FORETMAP_HTTP_SLOW_MS` |
| `lib/logMetrics.js` | Compteurs + `recentHttp5xx` pour `/api/admin/diagnostics` |
| `lib/routeLog.js` | `logRouteError` (+ `requestId`, incrément métriques) |

## Checks rapides (local → prod)

```bash
npm run deploy:check:prod
```

Avec `DEPLOY_SECRET` (ou `FORETMAP_DEPLOY_CHECK_SECRET`) dans l’environnement : le script vérifie aussi `GET /api/admin/diagnostics`.

## Corrélation support

Demander aux utilisateurs l’en-tête **`X-Request-Id`** (outils réseau du navigateur) et croiser avec `GET /api/admin/logs` ou le champ `metrics.recentHttp5xx` des diagnostics.
