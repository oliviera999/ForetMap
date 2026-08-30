---
name: foretmap-observability
description: Observabilité ForetMap — logger Pino, X-Request-Id, logs HTTP, métriques admin, checks prod. À utiliser pour diagnostiquer la prod, enrichir les logs, ou expliquer GET /api/admin/diagnostics et /api/admin/logs.
---

# Observabilité ForetMap

## Modules backend

| Fichier                 | Rôle                                                                             |
| ----------------------- | -------------------------------------------------------------------------------- |
| `lib/logger.js`         | Pino + `redact` (tokens, mots de passe) — **toujours** préférer au `console`     |
| `lib/requestId.js`      | En-tête `X-Request-Id` sur chaque réponse                                        |
| `lib/httpRequestLog.js` | Log fin de requête (`FORETMAP_HTTP_LOG`, `FORETMAP_HTTP_SLOW_MS`)                |
| `lib/logMetrics.js`     | Compteurs + `recentHttp5xx`, `http429`/`recentHttp429` pour les diagnostics      |
| `lib/routeLog.js`       | `logRouteError` (erreurs 500 + `requestId`, incrément métriques)                 |
| `lib/cspReport.js`      | Signalements CSP `Report-Only` : **regroupés**, 1 ligne `csp_report_window`/60 s |

## Checks prod (local → prod)

Secret dans `.env` (non versionné) : `DEPLOY_SECRET` / `FORETMAP_DEPLOY_CHECK_SECRET` /
`FORETMAP_DEPLOY_SECRET` ; `FORETMAP_PROD_BASE_URL` pour cibler une instance.

```bash
npm run deploy:check:prod        # check post-déploiement (+ diagnostics si secret)
npm run prod:admin-diagnostics   # JSON diagnostics complet
npm run prod:admin-tail          # tampon Pino + résumé (UA dédié, pause anti-429)
npm run prod:remote-debug        # check puis tail
```

## Signalements CSP

La politique **imposée** reste le `img-src` historique ; une politique candidate complète part en
`Content-Security-Policy-Report-Only` avec `report-uri /api/csp-report` (`lib/csp.js`).

```bash
curl -sI https://<domaine>/api/health | grep -i content-security-policy   # les deux en-têtes
grep csp_report_window logs/*.log | tail -20                              # 1 ligne / 60 s
```

Rien n'est journalisé par signalement : regroupement par (directive, origine bloquée), plafond de
40 signatures (`droppedSignatures` compte le surplus). Silence prolongé en usage réel = la
politique candidate peut être **promue** en imposée ; sinon les lignes nomment ce qui manque.
Détail : `docs/EXPLOITATION.md` (§5) et `docs/API.md` (§ Sécurité du contenu).

## Corrélation support

Demander l'en-tête `X-Request-Id` (outils réseau du navigateur) et croiser avec
`GET /api/admin/logs` ou `metrics.recentHttp5xx` / `metrics.recentHttp429`
(429 = surcharge/rate limit, 5xx = erreur serveur/BDD).

## Voir aussi

`.cursor/skills/foretmap-observability/SKILL.md`, `docs/API.md` (§ Observabilité),
`docs/EXPLOITATION.md`, `docs/MCP_FORETMAP_CURSOR.md`.
