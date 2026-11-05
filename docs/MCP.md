# Connecteur MCP distant

Le site expose un **serveur MCP distant** (Model Context Protocol) à l'adresse `<base>/mcp`,
protégé par un **serveur d'autorisation OAuth 2.1 intégré**. Il permet de brancher un
**assistant compatible MCP** — Claude (claude.ai, Desktop, mobile, Claude Code), **Cursor**
(HTTP distant), **ChatGPT** (connecteur personnalisé) et **Gemini CLI** — sur le **contenu
pédagogique** de ForetMap et de Gnomes & Licornes : recherche, fiches espèces, cartes, clés de
détermination, réseaux trophiques, QCM, glossaires, plateaux et lore G&L, **audits de
cohérence du corpus**, et — pour les administrateurs — **corrections de contenu par plan puis
application**.

Aucune donnée personnelle n'est exposée : voir § 5 et la fiche
[MCP_REGISTRE_TRAITEMENT.md](MCP_REGISTRE_TRAITEMENT.md). Le choix du client (Claude, ChatGPT,
Gemini…) détermine le **sous-traitant IA** qui reçoit les réponses des outils.

Le serveur MCP **stdio** pour Cursor (`scripts/mcp-foretmap-diagnostics.mjs`, diagnostic à
distance par `DEPLOY_SECRET`) reste disponible à côté du connecteur distant OAuth :
[MCP_FORETMAP_CURSOR.md](MCP_FORETMAP_CURSOR.md). Il partage le même registre d'outils de
diagnostic.

**Hors périmètre :** Gemini Enterprise / Vertex (client OAuth confidentiel avec secret) n'est
pas supporté ; seul Gemini CLI (client public, loopback) l'est.

---

## 1. Architecture

```
Client MCP ──HTTPS──▶ /mcp (POST JSON-RPC)              lib/mcp/server.js
                   │  401 + WWW-Authenticate            lib/mcp/oauth/bearer.js
                   │  jeton fmcp_at_… (haché sha256)    lib/mcp/oauth/store.js
                   ▼
            registre d'outils (portée × permission × drapeau)   lib/mcp/registry.js
                   │
   ┌───────────────┼──────────────────┬───────────────────┬────────────────┐
diagnostic      contenu             audits              usage           écriture
tools/          tools/content.js    audits/checks.js    tools/usage.js  write/plans.js
diagnostics*.js                     (fonctions pures)   (n ≥ 5)         (plan → apply)
                   │
            withReadOnly : START TRANSACTION READ ONLY,      lib/mcp/readDb.js
            max_statement_time, LIMIT forcé, liste blanche    lib/mcp/sqlGuard.js

Client ──▶ /.well-known/oauth-protected-resource[/mcp]   (RFC 9728)
       ──▶ /.well-known/oauth-authorization-server        (RFC 8414 ; alias openid-configuration)
       ──▶ /oauth/register (DCR) · /oauth/authorize · /oauth/token · /oauth/revoke
                                                         lib/mcp/oauth/router.js
```

- **Transport** : Streamable HTTP du SDK `@modelcontextprotocol/sdk`, mode **sans état**
  (`sessionIdGenerator: undefined`, un serveur et un transport par requête) et **réponses
  JSON** (`enableJsonResponse: true`) : pas de flux SSE, que Passenger/o2switch bufferise.
  `GET /mcp` et `DELETE /mcp` → 405.
- **Montage** (`server.js`) : avant les parseurs de corps généraux, avant la CSP de
  l'application (les pages de consentement posent la leur) et avant le fallback SPA ; **hors
  du limiteur général `/api/`**, avec un limiteur dédié (`MCP_RATE_LIMIT_PER_MIN`, clé = jeton
  haché ou IP — les clients cloud sortent souvent d'adresses partagées) et un corps JSON
  limité à 256 ko.
- **Hôte** : servi uniquement sur l'hôte du produit ForetMap principal. Sur `gl.*`, `plan.*`…
  ces chemins répondent 404 : un seul `resource`, un seul `issuer`. Les outils G&L lisent la
  base directement.
- **Désactivé par défaut** (`MCP_ENABLED`) : tout répond 404 et le SDK n'est pas chargé.

### Pourquoi un serveur d'autorisation fait main plutôt que `mcpAuthRouter` du SDK

Les helpers `@modelcontextprotocol/sdk/server/auth` (`mcpAuthRouter`, `OAuthServerProvider`,
`requireBearerAuth`) ont été évalués. Ils gèrent DCR et PKCE, mais pas :

- **CIMD** (Client ID Metadata Document), voie préférée de claude.ai et Claude Code ;
- une **liste blanche de redirections côté serveur** (le SDK compare seulement aux
  `redirect_uris` déclarées par le client ; il relâche bien le port des adresses de bouclage,
  logique reprise ici) ;
- un écran de connexion rendu côté serveur qui réutilise l'authentification du site (mots de
  passe bcrypt, verrou par compte, TOTP) ;
- le stockage MySQL haché avec rotation et détection de réutilisation des refresh.

Le serveur d'autorisation est donc écrit à la main en s'en inspirant (structure des
métadonnées, erreurs RFC 6749, comparaison des redirections) — SDK sous licence MIT,
<https://github.com/modelcontextprotocol/typescript-sdk>. Le SDK reste utilisé pour le
transport et le protocole MCP (`McpServer`, `StreamableHTTPServerTransport`).

---

## 2. Variables d'environnement

| Variable                                                                                                                                                                                                                 | Défaut       | Rôle                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MCP_ENABLED`                                                                                                                                                                                                            | `false`      | Active `/mcp`, `/oauth/*`, `/.well-known/oauth-*`                                                                                                                                                                                       |
| `MCP_PUBLIC_BASE_URL`                                                                                                                                                                                                    | (requête)    | **À poser en production** : origine publique exacte, ex. `https://foretmap.olution.info`                                                                                                                                                |
| `MCP_WRITE_ENABLED`                                                                                                                                                                                                      | **`true`**   | Outils d'écriture (plan → apply). Toujours réservés à `mcp.write` + portée `foretmap.write`                                                                                                                                             |
| `MCP_SQL_ENABLED`                                                                                                                                                                                                        | (réglage)    | Verrouille `mcp.sql_select_enabled` (§ 13) : `foretmap_sql_select` (admin `mcp.sql`) ; sans `DB_MCP_USER`, pool principal en READ ONLY                                                                                                  |
| `MCP_ACCESS_TOKEN_TTL_SECONDS`                                                                                                                                                                                           | `3600`       | Durée de vie d'un jeton d'accès (300–86400)                                                                                                                                                                                             |
| `MCP_REFRESH_TOKEN_TTL_DAYS`                                                                                                                                                                                             | `30`         | Durée de vie d'un jeton de rafraîchissement (1–365)                                                                                                                                                                                     |
| `MCP_AUTH_CODE_TTL_SECONDS`                                                                                                                                                                                              | `60`         | Durée de vie d'un code d'autorisation (30–600)                                                                                                                                                                                          |
| `MCP_PLAN_TTL_MINUTES`                                                                                                                                                                                                   | `60`         | Validité d'un plan d'écriture (5–1440)                                                                                                                                                                                                  |
| `MCP_STATEMENT_TIMEOUT_MS`                                                                                                                                                                                               | `5000`       | Délai maximal par requête SQL d'un outil (500–60000)                                                                                                                                                                                    |
| `MCP_RATE_LIMIT_PER_MIN`                                                                                                                                                                                                 | `300`        | Requêtes `/mcp` par minute et par jeton                                                                                                                                                                                                 |
| `MCP_OAUTH_ALLOWED_REDIRECTS`                                                                                                                                                                                            | (voir § 3)   | Liste (virgules) des redirections admises                                                                                                                                                                                               |
| `MCP_CIMD_ENABLED`                                                                                                                                                                                                       | `true`       | Accepter les `client_id` CIMD (URL https)                                                                                                                                                                                               |
| `MCP_DCR_ENABLED`                                                                                                                                                                                                        | `true`       | Accepter l'enregistrement dynamique `/oauth/register`                                                                                                                                                                                   |
| `DB_MCP_USER` / `DB_MCP_PASS`                                                                                                                                                                                            | (pool appli) | Compte MySQL **`SELECT` sur les seules tables de contenu** : utilisé par tous les outils de lecture s'il est défini ; exigé par `foretmap_sql_select` seulement si `mcp.sql_select_pool=dedicated_only` (§ 8, § 13)                     |
| `MCP_SQL_WRITE_ENABLED`, `MCP_SQL_DDL_ENABLED`, `MCP_SQL_MAX_AFFECTED_ROWS`, `MCP_WRITE_REQUIRE_PLAN`, `MCP_PRIVACY_BYPASS`, `MCP_PRIVACY_BYPASS_ACK`, `MCP_CONFIRM_REQUIRED` et les autres variables `MCP_*` de réglage | (non posées) | **Verrous** des réglages `mcp.*` : posées, elles gagnent sur l'interface et figent la clé. Non posées (recommandé), les réglages se pilotent depuis l'administration avec des défauts ouverts. Table complète et correspondances : § 13 |

`MCP_PUBLIC_BASE_URL` compte : `resource` (métadonnées RFC 9728) doit valoir **exactement**
l'URL saisie dans Claude, et chaque jeton est lié à cette ressource. Sans la variable, l'URL
est dérivée de la requête (`trust proxy`), ce qui suffit en local mais pas derrière plusieurs
proxys.

---

## 3. Autorisation OAuth (exigences Claude)

Source : <https://claude.com/docs/connectors/building/authentication> et spécification MCP
2025-11-25 (« Authorization »).

- **Découverte** : une requête `/mcp` sans jeton valide reçoit **`401`** et
  `WWW-Authenticate: Bearer resource_metadata="<base>/.well-known/oauth-protected-resource/mcp", scope="foretmap.read foretmap.write"`
  (Claude ignore un en-tête porté par un `200`). Le contrôle se fait **avant** le SDK.
- **Ressource protégée** (RFC 9728) : `resource = <base>/mcp`, `authorization_servers = [<base>]`
  (un seul issuer), `scopes_supported`, `bearer_methods_supported: ["header"]`. Servie aussi
  sans suffixe (`/.well-known/oauth-protected-resource`).
- **Serveur d'autorisation** (RFC 8414) : `issuer`, points d'autorisation, de jeton,
  d'enregistrement et de révocation, `response_types_supported: ["code"]`,
  `grant_types_supported: ["authorization_code","refresh_token"]`,
  `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_methods_supported: ["none"]`,
  **`client_id_metadata_document_supported: true`**, `scopes_supported` avec `offline_access`.
- **Clients** : publics uniquement (PKCE, aucun secret).
  - **CIMD** : `client_id` = URL https d'un document JSON. Lecture en 3 s maximum, 16 ko
    maximum, sans redirection, vers une adresse publique seulement (protection SSRF de
    `lib/remoteMediaSsrf.js`), cache 10 min ; le `client_id` du document doit être son URL, et
    seules ses `redirect_uris` autorisées par le serveur sont retenues.
  - **DCR** (RFC 7591) : `POST /oauth/register` en JSON, `token_endpoint_auth_method` absent
    ou `none`, redirections validées strictement. Limiteur : 60 enregistrements/heure/IP.
- **Redirections admises par défaut** : `https://claude.ai/api/mcp/auth_callback` exactement,
  `http://localhost/callback` / `http://127.0.0.1/callback` **port ignoré** (Claude Code,
  RFC 8252 §7.3), callbacks Cursor (`www.cursor.com/…`, `localhost:8787`, `127.0.0.1:8787`,
  `cursor://anysphere.cursor-mcp/oauth/callback`), ChatGPT et Gemini CLI. Rien d'autre sauf
  `MCP_OAUTH_ALLOWED_REDIRECTS`.
- **`/oauth/authorize`** : PKCE `S256` obligatoire, `state` renvoyé, `resource` vérifié s'il est
  fourni, `iss` renvoyé (RFC 9207). Une `redirect_uri` non vérifiée n'est **jamais** suivie
  (erreur affichée). Écran de connexion (identifiant + mot de passe du site, même verrou par
  compte que `/api/auth/login`, même temps de réponse que le compte existe ou non), **second
  facteur TOTP** si le compte l'a activé (ou enrôlement exigé si le réglage
  `security.totp.enforcement` l'impose), puis **consentement** affichant l'application (hôte du
  `client_id`), l'**hôte de redirection**, les portées et un avertissement pour les adresses
  locales. Jeton CSRF (cookie `SameSite=Strict` + champ), étapes signées HMAC à courte durée,
  limiteur `authLimiter`. Accès réservé aux comptes porteurs de **`mcp.use`**.
- **Portées** :
  - `foretmap.read` — tout compte `mcp.use` (profils **admin** et **n3boss/prof** par défaut) ;
  - `foretmap.write` — accordée au consentement **seulement** si le compte a **`mcp.write`**
    (profil **admin** seulement) ; un prof ne reçoit que `foretmap.read`, même s'il la demande ;
  - `offline_access` — acceptée ; un refresh est toujours émis.
- **`/oauth/token`** : `application/x-www-form-urlencoded` (JSON toléré).
  - `authorization_code` : code haché, **usage unique** (écriture conditionnelle), ~60 s, lié au
    client, à la `redirect_uri` et au défi PKCE ; un code rejoué révoque les jetons qu'il avait
    produits.
  - `refresh_token` : **rotation** à chaque usage ; l'ancien refresh et l'access de la famille
    sont révoqués ; présenter un refresh déjà tourné **révoque toute la famille**. La portée est
    réduite si une permission a été retirée entre-temps, jamais élargie.
  - Erreurs RFC 6749 : `invalid_request`, `invalid_client`, `invalid_grant`, `invalid_scope`,
    `invalid_target`, `unsupported_grant_type`. Réponses `Cache-Control: no-store`. Temps
    mesuré en local : ~10 ms.
- **`/oauth/revoke`** (RFC 7009) : révoque la famille du jeton ; `200` même si inconnu.
- **Jetons** : opaques (`fmcp_at_…`, `fmcp_rt_…`), 256 bits aléatoires, **stockés hachés**
  (sha256) ; access ~1 h, refresh ~30 j. À chaque requête `/mcp`, le compte est revérifié
  (actif, `mcp.use`) et les portées effectives recalculées depuis les permissions actuelles.
- **Époque de jeton** : chaque jeton enregistre `users.token_epoch` à son émission ; un
  changement de mot de passe, une désactivation, une réinitialisation TOTP ou un changement
  d'e-mail incrémente l'époque et révoque aussitôt les jetons MCP (`bumpUserTokenEpoch` →
  `revokeAllForUser`), au point d'accès comme au refresh. La suppression d'un compte supprime
  ses jetons (clé étrangère en cascade).
- **Liaison des étapes** : les jetons d'étape MFA et consentement sont liés à l'empreinte
  complète de la demande (`client_id`, `redirect_uri`, défi PKCE, portées, `state`,
  `resource`).
- **Limiteurs** : `/oauth/token` et `/oauth/revoke` 120/min par client ; `/oauth/register`
  60/h/IP ; `/oauth/authorize` limiteur de connexion du site ; `/mcp` par jeton. Lots JSON-RPC :
  20 messages au plus (`-32600`). En production, `MCP_PUBLIC_BASE_URL` absent → 503.
- **Isolation** : un jeton `fmcp_…` est refusé sur `/api/*` et `/api/gl/*` (401
  `MCP_TOKEN`) ; un JWT de session (ForetMap ou G&L) est refusé sur `/mcp`.
- **Purge** : opportuniste, au plus toutes les 10 min (déclenchée par `/oauth/token`) : codes
  OAuth expirés depuis 1 h, jetons expirés ou révoqués depuis 7 jours, plans non appliqués
  expirés depuis 7 jours, confirmations MCP expirées ou consommées (§ 13). Les comptes
  supprimés emportent leurs jetons et confirmations (`ON DELETE CASCADE`).

Google OAuth n'est **pas** branché sur l'écran de connexion du connecteur (voir § 10).

---

## 4. Outils

Noms stables préfixés, descriptions en français pour le modèle, schémas zod **stricts** (clé
inconnue refusée), pagination `limit` + `offset` (plafond : réglage `mcp.max_rows`), sorties
JSON **compactes** tronquées au-delà de `mcp.max_output_chars` (défaut 400 000 caractères ; au-delà,
`foretmap_export`), annotations MCP renseignées. Environ 65 outils en profil `complet` ; le
profil `essentiel` (`mcp.tool_profile`) garde le socle, les tâches, les élèves, les groupes, les
espèces, les cartes et les réglages. Un outil n'apparaît dans `tools/list` que si la portée, la
permission, le réglage et le domaine (`mcp.domains_disabled`) le permettent ; l'appel est
revérifié. Six prompts guidés : `prompts/list` (`lib/mcp/prompts.js`).

Légende : **é** = action qui écrit (portée `foretmap.write`, réglage `mcp.api_bridge_enabled`,
confirmation selon `mcp.confirm_mode`) ; **\*** = action nominative (bypass actif + permission
`mcp.privacy_bypass`, chaque appel journalisé `mcp.privacy_bypass.read`).

### Étage 1 — socle universel

| Outil                                                                                        | Accès / réglage                                        | Rôle                                                                                                                                  |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `foretmap_api`                                                                               | `mcp.use` ; méthodes ≠ GET : write ; `api_bridge_*`    | Appelle **n'importe quelle route `/api/*`** en tant que la personne connectée, avec ses droits et la logique métier de la route (§ 6) |
| `foretmap_api_catalog`                                                                       | `mcp.use` ; `api_bridge_enabled`                       | Routes ForêtMap (hors G&L) d'après `docs/API.md` croisé avec les routeurs montés ; filtres `prefix`, `q`, `method`                    |
| `foretmap_describe_schema`                                                                   | `mcp.sql` ; `sql_select_enabled`                       | Tables, colonnes, clés, index, vues, volumes, migration courante ; `gl_*` exclues ; colonnes secrètes « masquee »                     |
| `foretmap_sql_select`                                                                        | `mcp.sql` ; `sql_select_enabled`, `sql_select_pool`    | SELECT analysé (AST) ; compte dédié ou pool principal en READ ONLY ; plafond `max_rows`, pagination (§ 5)                             |
| `foretmap_sql_execute`                                                                       | write + `mcp.sql_execute`, admin ; `sql_write_enabled` | Une instruction d'écriture ; **contourne la logique métier** (corrections de données) ; `dry_run`, `migration_sql` (§ 13)             |
| `foretmap_export`                                                                            | `mcp.sql` ; `sql_select_enabled`                       | Requête ou table → CSV / XLSX / JSON, fichier privé, lien signé 1 h, purge 24 h                                                       |
| `foretmap_entity_history`                                                                    | `mcp.use` + `audit.read` ; restore : write             | Journal d'audit d'une fiche + révision ; `restore` réapplique des valeurs par l'API                                                   |
| `foretmap_content_change`                                                                    | write + `mcp.write` ; `write_mode=direct`              | Écriture directe d'un champ de la liste blanche de contenu (§ 6)                                                                      |
| `foretmap_plan_content_change` / `foretmap_apply_plan` / `foretmap_export_plan_as_migration` | write + `mcp.write`                                    | Plan → apply et migration équivalente (§ 6)                                                                                           |

### Étage 2 — outils de domaine (`lib/mcp/tools/domains/`)

Écritures **toujours par le pont** (route du site) ; lectures par la route quand elle existe,
sinon SQL en lecture seule (`lib/mcp/domains/`) sous la permission applicative équivalente.

| Outil (domaine)                                       | Actions                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `foretmap_tasks` (`tasks`, essentiel)                 | list, get, logs\*, stats, to_validate, overdue, create é, update é, delete é, bulk_create é, duplicate é, validate é, set_status é, archive é, unarchive é, assign é\*, unassign é\*, mark_done é\*, assign_group é, add_log é, delete_log é, set_links é, recurrence é |
| `foretmap_task_projects` (`task_projects`, essentiel) | list, get (avancement), create é, update é, delete é, duplicate é, hold é, validate é, archive é, unarchive é, reorder é (ordre des tâches d'un projet)                                                                                                                 |
| `foretmap_students` (`students`, essentiel)           | tout nominatif : list, get, timeline, at_risk, create_bulk é, update é, deactivate é, reactivate é, merge é, reset_password_link é (lien masqué en sortie), reset_totp é, set_role é                                                                                    |
| `foretmap_groups` (`groups`, essentiel)               | list, get, create é, update é, delete é, set_members é\*, set_scopes é, class_report\*, progression_recompute é                                                                                                                                                         |
| `foretmap_tutorials` (`tutorials`)                    | list, get, create é, update é, delete é, link é, unlink é, reads_stats, reads_detail\*                                                                                                                                                                                  |
| `foretmap_learning` (`learning`)                      | gating_get, gating_set é, links_list, overrides\*, override_release é\*, links_suggest, links_accept é, links_reject é                                                                                                                                                  |
| `foretmap_quiz` (`quiz`)                              | list, get, categories, stats (réussite par question, catégorie, notion ; distracteurs non disponibles), create é, update é, retire é, set_notions é                                                                                                                     |
| `foretmap_glossary` (`glossary`)                      | list, get, set_notions é                                                                                                                                                                                                                                                |
| `foretmap_curriculum` (`curriculum`)                  | notions, coverage (notions orphelines et partielles), set_links é                                                                                                                                                                                                       |
| `foretmap_pedago_sessions` (`pedago_sessions`)        | list, get, runs, runs_detail\*, create é, update é, delete é, link_task é                                                                                                                                                                                               |
| `foretmap_species` (`species`, essentiel)             | list, get, create é, update é, delete é, aliases é, lookalikes é, photos é, hazard_review é, gbif_match, autofill_preview, registry_status é                                                                                                                            |
| `foretmap_food_web` (`food_web`)                      | list, types, create é, update é, delete é                                                                                                                                                                                                                               |
| `foretmap_observations` (`observations`)              | queue\*, get\*, validate é, reject é, evidence, evidence_write é, stats, individuals, individual_write é                                                                                                                                                                |
| `foretmap_id_keys` (`id_keys`)                        | list, get, create_key é, update_key é, delete_key é, upsert_node é, delete_node é                                                                                                                                                                                       |
| `foretmap_maps` (`maps`, essentiel)                   | list_maps, places, place_get, place_create é, place_update é (géométrie, coordonnées), place_delete é, place_notes é, place_photos, place_photo_write é, categories, category_write é, routes, route_write é, registry, registry_write é, settings_write é, inventory   |
| `foretmap_visit` (`visit`)                            | content, coverage, stats, place_write é, media_write é, tutorials_write é, mascot_packs                                                                                                                                                                                 |
| `foretmap_plans` (`plans`)                            | content, places, place_update é, settings, set_setting é, rotate_code é (nouveau code renvoyé une fois)                                                                                                                                                                 |
| `foretmap_social` (`social`)                          | forum_list, forum_get\*, forum_reports\*, forum_moderate é, comments_list\*, comments_moderate é, place_reports é, notify é, journals\*, fresques\*                                                                                                                     |
| `foretmap_settings` (`settings`, essentiel)           | list (valeur, source env / base / défaut, verrou), get, set é (refus si verrouillé)                                                                                                                                                                                     |
| `foretmap_rbac` (`rbac`)                              | roles, permissions, grant é, revoke é, set_user_role é                                                                                                                                                                                                                  |
| `foretmap_audit_log` (`audit_log`)                    | query\* (acteur, action, entité, période, `via`), security_events\*                                                                                                                                                                                                     |
| `foretmap_calendar` (`calendar`)                      | get, set_days é, set_weekdays é, prepare_year é                                                                                                                                                                                                                         |
| `foretmap_moodle` (`moodle`)                          | check, cohorts, dry_run\*, runs, run\*, apply é\*                                                                                                                                                                                                                       |
| `foretmap_stats` (`stats`)                            | dashboard, students\*, student\*, usage                                                                                                                                                                                                                                 |
| `foretmap_ops` (`ops` ; `mcp.ops`, `ops_enabled`)     | cron_jobs, run_cron é, migrate é, restart é, dump é (full \| anonymized \| structure, fichier privé, lien 1 h), storage_report, deploy_status, retention_preview, retention_run é, clear_caches é                                                                       |

Non couverts faute de route (décision du 05/11/2026 : pas de route créée) : écriture des termes
du glossaire, catégories de quiz et notions du programme, historique de zone (table retirée),
texte d'un couplet de clé, masquage ou édition d'un message du forum par un modérateur,
suppression d'un sujet, traitement des signalements de commentaires, modération des carnets,
réordonnancement des projets.

### Étage 3 — outils historiques (lecture, exploitation)

| Outil                                                                                                                                                                                                      | Portée / permission                       | Rôle                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| `foretmap_health`                                                                                                                                                                                          | read                                      | Version, uptime, ping BDD                                                       |
| `foretmap_diagnostics` / `foretmap_tail_logs` / `foretmap_db_status`                                                                                                                                       | read + `admin.settings.read`              | Instantané d'exploitation, journaux Pino en liste blanche de champs, migrations |
| `foretmap_search`, `foretmap_get_species`, `foretmap_list_maps`, `foretmap_get_map`, `foretmap_get_id_key`, `foretmap_get_food_web`, `foretmap_list_qcm`, `foretmap_get_qcm`, `foretmap_get_glossary_term` | read + `mcp.use`                          | Lecture du corpus ForêtMap et G&L (inchangés)                                   |
| `gl_get_board` / `gl_get_lore`                                                                                                                                                                             | read + `mcp.use`                          | Gnomes & Licornes (inchangés)                                                   |
| `foretmap_usage_overview`                                                                                                                                                                                  | read + `mcp.use`                          | Agrégats anonymes seuillés                                                      |
| `foretmap_audit` / `foretmap_audit_all`                                                                                                                                                                    | read + `mcp.use`                          | Contrôles du corpus                                                             |
| `foretmap_list_students` / `foretmap_get_student`                                                                                                                                                          | `mcp.privacy_bypass`, admin, bypass actif | **Dépréciés** : utiliser `foretmap_students`                                    |
| `foretmap_recall` / `remember` / `forget`                                                                                                                                                                  | read + `mcp.use`                          | Mémoire du connecteur (§ 11.1)                                                  |
| `foretmap_health_report` / `_history`                                                                                                                                                                      | read + `admin.settings.read`              | Rapport de santé (§ 11.2)                                                       |
| `foretmap_list_files` / `read_file` / `grep_files` / `cron_status`                                                                                                                                         | read + `mcp.write` ; `files_enabled`      | Journaux et fichiers du serveur en lecture seule (§ 11.3, § 11.4)               |

### Contrôles de `foretmap_audit`

Fonctions pures dans `lib/mcp/audits/checks.js` (testées sans base, réutilisables par
`tests/content/`) :

| `check`                           | Ce qui est signalé                                                                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `photos_missing_credit`           | Photo (galerie, principale, G&L, QCM) sans crédit ou sans licence                                                                                                          |
| `species_not_in_id_key`           | Espèce présente sur une carte mais atteinte par aucune clé publiée de la carte                                                                                             |
| `id_key_dead_paths`               | Feuille sans espèce, double issue, renvoi cassé ou hors clé, couplet inatteignable, espèce atteinte par plusieurs feuilles                                                 |
| `glossary_orphans`                | Terme (FM, G&L, lore) sans lien et jamais employé dans les textes                                                                                                          |
| `glossary_divergence_fm_gl`       | Même terme FM et G&L, définitions courtes différentes                                                                                                                      |
| `gl_qcm_glossary_link_divergence` | Liens glossaire ↔ QCM G&L : ancienne table si présente, et liens `import` périmés (voir ci-dessous)                                                                        |
| `qcm_incomplete`                  | Énoncé, choix, bonne réponse, `feedback_correct`, feedback des distracteurs, niveau/difficulté G&L — **le slot de feedback de la bonne réponse vide n'est jamais signalé** |
| `qcm_quality`                     | Choix en double, feedback qui recopie l'énoncé, biais de longueur (`lib/pedagoContentAudit.js`)                                                                            |
| `gl_case_levels_not_6e`           | Question G&L ou case dont le niveau n'est pas 6ᵉ / cycle 3 / `college` / `base`                                                                                            |
| `species_duplicates`              | Même nom scientifique normalisé (auteur, rang, casse ignorés) ; nom/alias désignant deux fiches                                                                            |
| `emoji_collisions`                | Emoji partagé par plusieurs fiches (comparaison **binaire**) ; nom de zone/repère qui répète son emoji                                                                     |
| `species_without_presence`        | Fiche présente sur aucune carte                                                                                                                                            |
| `zones_without_species`           | Zone non spéciale sans espèce                                                                                                                                              |
| `orphan_links`                    | Liaisons logiques sans clé étrangère cassées (liens ressource ↔ question, cases, interactions G&L)                                                                         |

> **Constat sur `gl_qcm_question_glossary`** : contrairement à l'hypothèse de départ, cette
> table **n'existe plus** — la migration 186 l'a reprise dans `gl_resource_question_links` puis
> supprimée, et `lib/glQcmCrud.js` / `lib/glQcmImport.js` écrivent désormais dans la source de
> vérité (`origin = 'import'`). Le contrôle lit donc l'ancienne table **si** une base restée en
> arrière l'a encore, et compare surtout les liens `import` en base à ce que l'appariement par
> mots-clés produirait aujourd'hui : un écart désigne un lien périmé (question ou glossaire
> modifiés depuis le dernier enregistrement).

Mesuré sur la base de test semée (`npm run db:init`) : 329 constats, dont 119 fiches sans
présence (les cartes de test sont presque vides) et 9 photos sans crédit/licence.

---

## 5. Données personnelles — garde-fous par construction

> **Depuis le 05/11/2026 (§ 13)** : le bypass RGPD est **actif par défaut**
> (`mcp.privacy_bypass`) pour les porteurs de la permission `mcp.privacy_bypass` (admin) — ils
> lisent et modifient les données nominatives d'élèves (outils de domaine marqués « nominatif »,
> `foretmap_api`, SQL hors secrets), chaque lecture nominative étant journalisée. Les garde-fous
> ci-dessous restent ceux de **tous les autres comptes** et de la sortie sans bypass ; les
> secrets ne sortent jamais. Sans `DB_MCP_USER`, `foretmap_sql_select` passe par le pool
> principal en transaction READ ONLY (analyse syntaxique conservée, `SELECT *` refusé sur une
> table à colonnes secrètes).

- **Liste blanche** de tables (`lib/mcp/sqlGuard.js`, `CONTENT_TABLES`) : contenu pédagogique,
  cartes, contenu G&L. Toute requête d'outil est analysée **avant** envoi ; une table hors
  liste lève `McpDataAccessError`.
- **Liste noire prioritaire** : `users`, `user_*`, `students`, `teachers`,
  `password_reset_tokens`, `external_identities`, `security_events`, `audit_log`,
  `elevation_audit`, `lti_*`, `group_members`, `forum_*`, `context_comment*`, `notifications`,
  `visit_seen_*`, `oauth_*`, `mcp_*`, `gl_players`, `gl_player_*`, `gl_admins`,
  `user_journal*`, `task_logs`, `app_settings`… Elle prime même sur la blanche.
- **Colonnes** : tout identifiant d'e-mail, mot de passe, hachage, jeton, secret, IP, agent
  utilisateur, auteur (`*_by`, `*_user_id`, `owner_*`, `actor_*`), nom/prénom/pseudo est refusé
  dans le texte SQL et **retiré des sorties** ; les valeurs qui ressemblent à un e-mail, un
  hachage bcrypt, un JWT ou un jeton MCP sont masquées (un crédit photo a déjà contenu une
  adresse, migration 313).
- **Traces d'élèves** (`species_observations`, `user_quiz_attempts`, `gl_qcm_attempts`,
  `user_tutorial_reads`, `task_assignments`, `usage_counters`…) : **agrégats uniquement**
  (`COUNT`/`SUM`), jamais par personne ni par classe, et tout effectif **< 5** devient `"<5"`.
- **SQL libre (`foretmap_sql_select`)** : trois contrôles, tous exigés.
  1. **Texte brut** (`assertPlainSqlText`, avant toute analyse) : après normalisation NFKC, refus
     de toute requête contenant `/*`, `*/`, `#`, `--`, `;`, un caractère de contrôle (hors
     tabulation et fin de ligne) ou de format (`U+200B`, `U+202E`, `U+2028`…), ou dont la forme
     NFKC diffère de l'original (barre et astérisque pleine chasse `／＊`). Raison : MariaDB
     **exécute** le contenu d'un commentaire `/*! … */` (`/*!50000 …*/`, `/*M! …*/`) que le
     parseur ignore — `SELECT id FROM plants /*!UNION SELECT email FROM users*/` passait
     l'analyse syntaxique (contre-vérification de la PR #616). Une requête du connecteur n'a
     aucun besoin de commentaire ni de « ; », même dans une chaîne littérale.
  2. **Analyse syntaxique** (`lib/mcp/sqlAst.js`, parseur
     [`node-sql-parser`](https://github.com/taozhi8833998/node-sql-parser), Apache-2.0, grammaire
     MariaDB) : une seule instruction SELECT ; parcours récursif de l'AST (sous-requêtes, tables
     dérivées, `FROM (t)` parenthésé, jointures, CTE, `UNION`, expressions) ; **toutes** les
     tables doivent être dans la liste blanche (les noms non qualifiés `tables`, `columns`,
     `schemata`, `user` n'y sont pas) ; refus de toute base qualifiée (`information_schema`,
     `mysql`, `performance_schema`…), d'`INTO`, des verrous, des variables, de toute fonction hors
     liste blanche de fonctions pures (`LOAD_FILE`, `CURRENT_USER`, `USER`, `DATABASE`,
     `VERSION`, `SLEEP`, `BENCHMARK`… refusées) et de tout ce que le parseur n'analyse pas
     (fail-closed). L'ancienne analyse par expressions régulières laissait passer
     `SELECT * FROM (users)` (relecture de sécurité, constat B1). `CAST`, `HEX` et `CONCAT`
     restent admis : ils ne lisent rien de plus que les colonnes déjà lisibles et ne servent
     qu'à mettre en forme ; ce qui est lisible est borné par le contrôle 3, pas par la liste de
     fonctions.
  3. **Droits réels du compte MySQL dédié `DB_MCP_USER`** (`lib/mcp/readOnlyGrants.js`) : à
     **chaque appel** de l'outil (et pour `tools/list`, avec un cache de 60 s), le serveur lit
     `SHOW GRANTS FOR CURRENT_USER()`, `SHOW GRANTS FOR PUBLIC` et `CURRENT_ROLE()` sur ce pool.
     Seules sont admises, pour le compte, `GRANT USAGE ON *.*` et `GRANT SELECT [(colonnes)]`
     sur une table de la liste blanche de la base ; pour `PUBLIC`, seule `GRANT USAGE ON *.*`
     (l'erreur 1141 « aucun droit » et l'erreur de syntaxe d'un serveur sans `PUBLIC` valent
     « aucun droit »). **Tout le reste rend l'outil indisponible** — absent de `tools/list`,
     refusé à l'appel (`MCP_READONLY_GRANTS_REFUSED`), raison journalisée
     (`mcp_sql_grants_refused`) : droit global autre que `USAGE`, droit au niveau base,
     privilège autre que `SELECT`, `WITH GRANT OPTION`, table hors liste blanche ou d'une autre
     base, rôle attribué ou actif, `PROXY`, procédure, droit accordé à `PUBLIC`, ligne de forme
     inconnue (refus par défaut). Sous MariaDB 10.11+, un droit accordé à `PUBLIC` n'apparaît
     pas dans les droits du compte mais vaut pour lui : sans la seconde lecture,
     `GRANT SELECT ON <base>.users TO PUBLIC` rendait `users` lisible (troisième relecture).
     Les droits se posent avec
     `node scripts/mcp-print-grants.js --db <base> --user <compte> --check-db`. Sans ce compte,
     l'outil n'est ni proposé ni exécutable, même avec `MCP_SQL_ENABLED=true`. Les tests
     d'intégration créent un tel compte sur MariaDB, vérifient que le serveur SQL refuse lui-même
     `SELECT * FROM (users)`, puis qu'un droit au niveau base, ou un `GRANT … TO PUBLIC`, rend
     l'outil indisponible.
- **Lecture seule** : chaque outil de lecture tourne dans `START TRANSACTION READ ONLY`, avec
  `SET STATEMENT max_statement_time=… FOR` (MariaDB) ou `MAX_EXECUTION_TIME` (MySQL 8), un
  `LIMIT` forcé (≤ 500) et un budget total par appel.
- **Journaux et diagnostics** (`foretmap_tail_logs`, `foretmap_diagnostics`,
  `lib/mcp/logSanitizer.js`) : **liste blanche de champs**. D'une ligne Pino ne sortent que
  `level`, `time`, `msg` (nettoyé), `requestId` (UUID du serveur, sinon pseudonyme), `method`,
  `statusCode`, `durationMs`, `route` (gabarit Express `/api/tasks/:id/done` seulement ; sans
  gabarit, `autre` — un chemin, même normalisé, fuit : `/api/visit/zone-Lea_Martin`), `err.type`
  (nom de classe d'erreur, sinon `[valeur]`), `err.code` (forme `ER_DUP_ENTRY` ou nombre, sinon
  `[valeur]`) et `err.message` (nettoyé) ; toute autre clé (`newId`, `sourceId`,
  `teamId`, `author`, `studentIds`, `ctx.student.id`, `pseudo`, pile d'erreur…) est retirée.
  Dans le texte libre : e-mails, hachages et jetons masqués ; littéraux entre apostrophes ou
  guillemets → `'[valeur]'` (`Duplicate entry 'lea.martin' for key …`) ; UUID (avec ou sans tirets) et
  suites hexadécimales de 16 caractères ou plus → `id#xxxxxx`, IP → `ip#xxxxxx` (pseudonymes
  HMAC à sel aléatoire par appel : stables dans une réponse, non reliables d'un appel à
  l'autre) ; nombres de 3 chiffres ou plus → `[n]`. Les diagnostics ne transmettent que des
  compteurs, états, versions et gabarits de route nommés un par un. **Limite** : un nom écrit
  en clair dans le texte d'un message ne peut pas être reconnu de façon sûre ; la convention du
  dépôt est de passer les identifiants en champs structurés (`logger.warn({ teamId }, '…')`),
  jamais dans le texte. La première version (relecture de sécurité, I2) pseudonymisait des
  clés devinées : la contre-vérification a montré des fuites par clés imprévues et par chemin.
- **Journal d'appels** : ligne Pino `mcp_tool_call` (outil, compte, client, durée, statut, code
  d'erreur) — **jamais les arguments**. Connexions, échecs et consentements dans
  `security_events` (`mcp.oauth.*`) ; écritures dans `audit_log` (`mcp.content.apply`).
- **Test anti-PII** : `tests/mcp-tools.test.js` appelle **tous** les outils sur la base semée
  (avec un e-mail piégé dans un crédit photo) et échoue si un e-mail, un hachage bcrypt ou un
  jeton apparaît dans une réponse.
- **Bypass RGPD (`MCP_PRIVACY_BYPASS` + ACK)** : tant que le bypass n'est **pas** actif, le
  comportement ci-dessus tient. S'il est actif (admin, permission `mcp.privacy_bypass`), les
  outils `foretmap_list_students` et `foretmap_get_student` peuvent transmettre des **données
  nominatives d'élèves** à Claude (nom, prénom, pseudo, e-mail, groupes, activité récente) ;
  les seuils « &lt;5 » de `foretmap_usage_overview` ne s'appliquent plus non plus. **Les secrets
  ne sont jamais renvoyés** : mots de passe, hachages, secrets TOTP, jetons et clés sont exclus
  ou masqués (`scrub: secrets`, `lib/mcp/secretGuard.js`) — y compris dans les échantillons SQL
  en mode bypass. Prérequis juridiques : [MCP_REGISTRE_TRAITEMENT.md § 9](MCP_REGISTRE_TRAITEMENT.md).

Fiche de registre : [MCP_REGISTRE_TRAITEMENT.md](MCP_REGISTRE_TRAITEMENT.md).

---

## 6. Écriture — pont API, outils de domaine, contenu

Trois voies d'écriture, de la plus sûre à la plus brute :

1. **Outils de domaine et `foretmap_api`** (voie normale) : l'écriture passe par la **route du
   site**, appelée en processus en tant que la personne connectée (`lib/mcp/apiBridge.js`). La
   route applique **sa** logique métier (recalcul des statuts, avancement des projets,
   progression des élèves, notifications, détachement et restauration des lieux, temps réel,
   journal d'audit) et **ses** droits. Réglages `mcp.api_bridge_enabled` et
   `mcp.api_bridge_methods` ; portée `foretmap.write` exigée pour toute méthode autre que GET.
2. **Liste blanche de contenu** (`foretmap_content_change`, plan → apply) : champs texte de
   contenu sans logique métier (fiches espèces, zones, repères, glossaires, quiz, tutoriels,
   catégories de lieux, parcours, contenus de visite, séances, notions), réservée à `mcp.write`.
   Par défaut (`mcp.write_mode=direct`), `foretmap_content_change` écrit tout de suite ; en
   `plan`, seul plan → apply est exposé.
3. **SQL d'écriture** (`foretmap_sql_execute`, § 13) : corrections de données seulement — il
   contourne la logique métier.

### Pont API interne (`foretmap_api`)

- Injection **sans réseau** par `light-my-request` (BSD-3-Clause, équipe Fastify) ; Express 5
  remplaçant les prototypes de `req` / `res`, l'injecteur fige les méthodes de la bibliothèque
  en propriétés propres.
- Identité : JWT applicatif **éphémère (120 s)** signé pour chaque appel, même charge qu'une
  connexion (rôle effectif, époque de jeton, droits), revendication `via: 'mcp'`, second facteur
  marqué si le compte a la double authentification (le consentement OAuth l'a alors exigée). Le
  jeton n'est ni renvoyé ni journalisé ; `rejectMcpTokensOnApi` reste en place.
- Marquage : `Symbol` posé sur `req` par l'injecteur (impossible à produire par un en-tête) et
  `AsyncLocalStorage` autour de chaque appel d'outil (`lib/mcp/callContext.js`). Effets :
  `logAudit` ajoute `via`, `mcp_tool`, `mcp_client_id` à `payload_json` ; journaux HTTP et
  d'erreur marqués ; limiteurs général et d'authentification levés pour les seules requêtes
  internes (le limiteur `/mcp` reste la garde).
- Refus permanents : `/api/gl/*`, `/api/auth/login`, `/api/auth/logout`, tout chemin hors
  `/api/`. Routes d'authentification sensibles (prise de contrôle, enrôlement / vérification
  TOTP, réinitialisation de mot de passe, Google, LTI, accès aux plans) refusées sauf
  `mcp.api_bridge_sensitive_auth=true`.
- Sortie : `{ status, json | text, location?, request_id }`, en-têtes réduits à une liste
  blanche (`Set-Cookie` jamais renvoyé) ; nettoyage « secrets » si le bypass est actif, sinon
  complet (aucun élève nommé).
- Journal : une ligne `audit_log` `mcp_api_call` par appel autre que GET, et par GET quand le
  bypass est actif ; la route journalise en plus sa propre action, marquée `via: 'mcp'`.
- Fichiers : multipart, 15 Mo au total (corps `/mcp` porté à 21 Mo pour un appel authentifié).

### Liste blanche de contenu (plan → apply, écriture directe)

1. **`foretmap_plan_content_change`** : opérations bornées (≤ 50) sur une **liste blanche de
   tables et colonnes** (`lib/mcp/write/operations.js`) :
   - `set_field` sur `plants` (textes, crédit/licence photo), `plant_photos` (crédit,
     licence, source), `zones`, `map_markers`, `glossary_terms`, `gl_glossary_terms`,
     `gl_species`, `quiz_questions`, `gl_qcm_questions` (feedbacks, crédits, niveau G&L),
     et depuis le 05/11/2026 `tutorials`, `location_categories`, `map_routes`, `visit_zones`,
     `visit_markers`, `visit_media`, `pedago_sessions`, `curriculum_notions` ;
   - `link` / `unlink` d'une espèce sur `zone_species`, `marker_species`, `map_species`,
     `glossary_term_species`.

   Renvoie `{ plan_id, diff avant/après, risques, migration_sql, rollback_sql }` **sans rien
   écrire**. Le plan est stocké (`mcp_content_plans`) avec l'empreinte de l'état lu et expire
   (`MCP_PLAN_TTL_MINUTES`).

2. **`foretmap_apply_plan`** : relit l'état **en verrouillant les lignes** (`FOR UPDATE`) ; s'il
   diffère de l'empreinte, **conflit** et rien n'est écrit. Sinon, une seule transaction,
   écriture dans `audit_log`, et renvoi de la migration équivalente.
3. **`foretmap_export_plan_as_migration`** : migration + rollback seuls, nom de fichier suggéré.

La migration générée est **idempotente** et équivalente à l'application dans l'ordre du plan :
chaque `UPDATE` est gardé par la valeur attendue juste avant lui (comparaison `BINARY`). Si le
plan corrige deux fois la même cellule, la seconde part du résultat de la première, pas de
l'instantané d'origine. Chaque liaison passe par `INSERT IGNORE` / `DELETE` ciblé. Le rollback
défait les opérations dans l'ordre inverse.

### Pourquoi la voie « migration par PR » reste privilégiée

Le corpus pédagogique est **semé par les migrations** et vérifié par `tests/content/`. Une
correction faite seulement en base de production :

- serait **écrasée** par une migration ultérieure qui réécrit la même ligne ;
- ferait **diverger** la production d'une base neuve (`npm run db:init`, CI, poste local) ;
- échapperait aux tests de contenu et à la relecture.

Après un `apply`, verser donc la `migration_sql` renvoyée dans `migrations/NNN_*.sql` (numéro
libre, vérifier les PR ouvertes) par une PR ; ou, pour une correction qui peut attendre,
n'utiliser que `export_plan_as_migration` et laisser la PR faire foi.

---

## 7. Connexion

### claude.ai, Claude Desktop, mobile

Réglages → **Connecteurs** → **Ajouter un connecteur personnalisé** → URL :
`https://<domaine-foretmap>/mcp` → **Connecter** : la page de connexion du site s'ouvre
(identifiant, mot de passe, code TOTP si activé), puis le consentement. Claude s'enregistre
par CIMD (ou DCR à défaut) ; la redirection est `https://claude.ai/api/mcp/auth_callback`.

### Claude Code

```bash
claude mcp add --transport http foretmap https://<domaine-foretmap>/mcp
claude            # puis /mcp → foretmap → Authenticate
```

Claude Code utilise son document CIMD et une redirection `http://localhost:<port>/callback` ;
l'écran de consentement affiche alors l'avertissement « adresse locale ».

### Cursor (connecteur distant OAuth)

Dans `.cursor/mcp.json` (déjà présent dans le dépôt) :

```json
{
  "mcpServers": {
    "foretmap": {
      "url": "${env:FORETMAP_MCP_URL}"
    }
  }
}
```

Poser `FORETMAP_MCP_URL=https://<domaine-foretmap>/mcp` dans l'environnement Windows / shell,
puis redémarrer Cursor. L'OAuth (DCR + PKCE) s'ouvre dans le navigateur ; redirects admises :
`https://www.cursor.com/agents/mcp/oauth/callback`, `http://localhost:8787/callback`
(et `127.0.0.1`), `cursor://anysphere.cursor-mcp/oauth/callback`. Le retour vers le client se fait par une page HTML (meta refresh), pas un `302`, pour
éviter le blocage Chrome de `form-action` sur la chaîne de redirections. Si « Autoriser »
semble bloqué : déployer au moins la version qui inclut ce correctif, refermer l’onglet
et relancer Auth depuis Cursor.

Le serveur stdio **`foretmap-diagnostics`** (secret de déploiement) reste distinct :
[MCP_FORETMAP_CURSOR.md](MCP_FORETMAP_CURSOR.md).

### ChatGPT (connecteur / plugin MCP)

Dans ChatGPT (mode développeur / apps MCP selon le compte) : ajouter un serveur MCP
personnalisé avec l'URL `https://<domaine-foretmap>/mcp`, authentification OAuth. ChatGPT
utilise CIMD (`chatgpt.com/oauth/…/client.json`) ou DCR ; redirects admises :
`https://chatgpt.com/connector_platform_oauth_redirect` et
`https://chatgpt.com/connector/oauth/*`.

### Gemini CLI

```json
{
  "mcpServers": {
    "foretmap": {
      "url": "https://<domaine-foretmap>/mcp"
    }
  }
}
```

Découverte OAuth automatique ; redirect loopback `http://localhost:<port>/oauth/callback`
(chemin `/oauth/callback`, distinct de Claude Code). **Gemini Enterprise / Vertex** (client
confidentiel + secret) n'est **pas** supporté.

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector
```

Transport **Streamable HTTP**, URL `https://<domaine-foretmap>/mcp`, puis **Open Auth
Settings** → **Quick OAuth Flow**. Les métadonnées, `/oauth/token` et `/mcp` envoient les
en-têtes CORS nécessaires (aucune authentification par cookie n'y est acceptée).

### Smoke test (flux complet)

```bash
MCP_SMOKE_BASE_URL=https://<domaine-foretmap> \
MCP_SMOKE_IDENTIFIER=<pseudo ou e-mail> MCP_SMOKE_PASSWORD=<mot de passe> \
[MCP_SMOKE_TOTP=<code>] npm run mcp:smoke
```

Enchaîne 401 → métadonnées → DCR → connexion → consentement → jeton → rotation → client SDK
(`initialize`, `tools/list`, `tools/call foretmap_audit_all`). N'écrit rien dans le contenu.

---

## 8. Mise en production (o2switch / Passenger)

> La liste complète et ordonnée, rapport de santé et cron compris, est au **§ 12 « Activer en
> production »** ; cette section détaille les points propres au connecteur OAuth.

1. **Migration** : `324_mcp_oauth.sql` (jouée par le démarrage ou `npm run db:migrate`) ;
   contrôler par `npm run db:status` ou l'outil `foretmap_db_status`.
2. **Variables** (cPanel → « Setup Node.js App ») : `MCP_ENABLED=true`,
   `MCP_PUBLIC_BASE_URL=https://<domaine-foretmap>` ; garder `MCP_SQL_ENABLED=false` ;
   `MCP_WRITE_ENABLED` vaut `true` sans variable (poser `false` pour couper l'écriture).
3. **Recommandé** (et **obligatoire** pour `foretmap_sql_select`) : un utilisateur MySQL dans
   `DB_MCP_USER` / `DB_MCP_PASS`, avec **`GRANT SELECT` table par table** sur les seules tables de
   contenu : `node scripts/mcp-print-grants.js --db <base> --user <compte> --check-db` imprime
   les instructions, à exécuter avec un compte administrateur MySQL. C'est la seule garantie qui
   ne dépende pas de ce code. (Les écritures `apply` et le stockage OAuth passent par le pool
   applicatif.)

   > ⚠️ **o2switch / cPanel** : l'écran « Bases de données MySQL » n'attribue les privilèges
   > que **pour une base entière** ; il n'offre pas de `GRANT` par table, et le compte cPanel
   > n'a en général pas les droits pour l'exécuter en SQL. **Ne donnez pas `SELECT` sur toute
   > la base** à ce compte : il lirait `users`, le forum, les observations. Dans ce cas, laissez
   > `DB_MCP_USER` vide et **`foretmap_sql_select` reste désactivé** — c'est le fonctionnement
   > attendu, et les 20 autres outils restent disponibles (avec la liste blanche et la
   > transaction `READ ONLY` comme barrières côté lecture). Si le support o2switch accepte de
   > poser les `GRANT` par table, renseignez alors le compte.

4. **Redémarrer** l'application (Passenger : `touch tmp/restart.txt` ou bouton « Restart »).
5. **Vérifier** : `curl -i -X POST https://<domaine>/mcp` → `401` avec `WWW-Authenticate` ;
   `curl https://<domaine>/.well-known/oauth-authorization-server` ; puis MCP Inspector ou
   `npm run mcp:smoke`.
6. **Ajouter le connecteur** dans claude.ai (§ 7).

### Dépannage

- **« Couldn't reach the MCP server »** : le `401` n'arrive pas avec son en-tête, ou
  `/.well-known/*` n'est pas servi par Node. Vérifier que le frontal (Apache/Passenger, Tiger
  Protect / WAF o2switch) transmet `/.well-known/oauth-*`, `/oauth/*` et `/mcp` à
  l'application, et ne retire pas `WWW-Authenticate`.
- **WAF / pare-feu** : selon les clients utilisés, autoriser les plages d'egress concernées
  (Anthropic **`160.79.104.0/21`**, plus celles d'OpenAI / Google si ChatGPT ou Gemini CLI
  appellent depuis le cloud). Les clients desktop (Cursor, Claude Code, Gemini CLI) passent
  souvent par l'IP de l'utilisateur. Une règle anti-robot sur `POST /oauth/token` casse le
  flux sans trace côté application.
- **Délais** : Claude attend 10 s (découverte, enregistrement, jeton) et 30 s (refresh). Le
  jeton répond en millisecondes ; un délai vient du frontal.
- **SSE / buffering** : sans objet, les réponses sont du JSON simple.
- **`resource` incohérent** (jeton refusé « autre ressource ») : `MCP_PUBLIC_BASE_URL` absent
  ou différent de l'URL saisie dans Claude (`www.`, `http`/`https`, barre finale).
- **Cache de découverte** : Claude garde les métadonnées ~5 min.
- **Journaux** : `foretmap_tail_logs` ou `GET /api/admin/logs`, filtrer `mcp_tool_call`,
  `mcp_cimd_fetch_failed`, `mcp_refresh_reuse`.

---

## 9. Tests

| Fichier                                 | Couverture                                                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/mcp-oauth.test.js`               | Métadonnées et 401, DCR, CIMD simulé, PKCE, CSRF, consentement, codes, rotation, révocation, isolation, TOTP                                                                    |
| `tests/mcp-tools.test.js`               | Listes par profil, chaque outil, anti-PII, écriture (admin / prof / drapeau), plan → apply → rollback, conflit, SQL, bout en bout SDK                                           |
| `tests/mcp-audits.test.js`              | Contrôles sur jeux construits, garde SQL, SELECT libre, opérations, migration générée, configuration                                                                            |
| `tests/mcp-migration-324.test.js`       | Tables, idempotence, permissions semées                                                                                                                                         |
| `tests/mcp-migration-325.test.js`       | Tables d'exploitation, idempotence, notes semées (clé SQL = clé JS, aucun secret)                                                                                               |
| `tests/mcp-ops.test.js`                 | Mémoire, règles de statut, rapport et historique, endpoint, script cron (mailer simulé), fichiers (traversée, lien, binaire, `.env`, secrets, `tail`, `grep`, refus prof), cron |
| `tests/mcp-productivity-config.test.js` | Drapeaux mode productivité, ACK bypass, visibilité des outils dans le registre                                                                                                  |
| `tests/mcp-confirm.test.js`             | Confirmation par code (e-mail simulé), expiration 10 min, empreinte d'arguments, verrouillage après 3 essais                                                                    |
| `tests/mcp-sql-execute.test.js`         | Classification SQL, dry_run DML/DDL, plafond `max_affected_rows`, confirmation, migration générée, refus d'instructions dangereuses                                             |
| `tests/mcp-privacy-bypass.test.js`      | Outils nominatifs élèves, audit, secrets absents des réponses, seuils usage levés si bypass actif                                                                               |
| `tests/mcp-migration-327.test.js`       | Table `mcp_confirmations`, permissions `mcp.sql_execute` / `mcp.privacy_bypass` semées (admin)                                                                                  |

```bash
node --test --test-concurrency=1 --test-force-exit tests/mcp-*.test.js
```

---

## 10. Limites connues et suites

- **Google OAuth** non proposé sur l'écran de connexion du connecteur : le parcours Google
  existant repose sur des cookies et une redirection vers la SPA ; le brancher demande une
  redirection dédiée (`/oauth/google/callback`) à enregistrer dans la console Google. Les comptes
  Google-seuls doivent d'abord se donner un mot de passe sur le site.
- **Pas de gestion des connexions dans l'interface** : un compte ne voit pas (encore) la liste
  de ses connecteurs ; un admin coupe l'accès en retirant `mcp.use`, et la révocation est
  immédiate (le compte est revérifié à chaque requête).
- **Pool lecture seule** recommandé mais facultatif pour les outils de lecture : sans
  `DB_MCP_USER`, la transaction `READ ONLY` et la liste blanche (SQL écrit par le code des
  outils, jamais par le modèle) sont les seules barrières. Obligatoire pour `foretmap_sql_select`,
  qui reste donc indisponible sur un hébergement sans `GRANT` par table.
- **Recherche** par `LIKE` (pas d'index plein texte) : suffisant pour quelques milliers de
  lignes ; `limit` par type ≤ 50.
- **Niveaux G&L** : le contrôle `gl_case_levels_not_6e` admet `6e`, `cycle 3`, `college`,
  `base` ; à ajuster si la convention de saisie évolue.
- **Étendre l'écriture** (nouvelles colonnes ou tables) : ajouter à `EDITABLE_FIELDS` /
  `LINK_TABLES` **et** aux tests ; une table de la liste noire reste refusée quoi qu'il arrive.

---

## 11. Mémoire, rapport de santé, fichiers (exploitation)

Fonctions d'**observation et de diagnostic** ajoutées après la première version du connecteur
(migration `325_mcp_exploitation.sql`). Elles ne retirent aucune protection : la liste blanche
des tables de contenu, la transaction `READ ONLY`, l'outil SQL et l'écriture plan → apply sont
inchangés. Les nouvelles tables (`mcp_memory`, `mcp_health_reports`) sont en `mcp_*`, donc sur
la liste noire de lecture : aucun outil de contenu ni `foretmap_sql_select` ne les lit.

| Outil                     | Portée / permission                | Rôle                                                                                  |
| ------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------- |
| `foretmap_recall`         | read + `mcp.use`                   | Cherche dans la mémoire (sujet, texte, étiquettes) ; signale les notes à revérifier   |
| `foretmap_remember`       | read + `mcp.use`                   | Crée ou met à jour (même sujet) une note stable ; refuse secrets et e-mails           |
| `foretmap_forget`         | read + `mcp.use` (auteur ou admin) | Supprime une note                                                                     |
| `foretmap_health_report`  | read + `admin.settings.read`       | Rapport de santé structuré, statut vert / orange / rouge ; `store: true` l'historise  |
| `foretmap_health_history` | read + `admin.settings.read`       | Derniers rapports stockés et évolution du statut ; `id` pour un rapport complet       |
| `foretmap_list_files`     | read + `mcp.write` (admin)         | Racines consultables, contenu d'un dossier                                            |
| `foretmap_read_file`      | read + `mcp.write` (admin)         | Lecture `offset`/`limit` ou `tail`, 500 lignes au plus ; tampon Pino (`root: "pino"`) |
| `foretmap_grep_files`     | read + `mcp.write` (admin)         | Recherche bornée (300 fichiers, 200 résultats, 3 s)                                   |
| `foretmap_cron_status`    | read + `mcp.write` (admin)         | Dernières exécutions et retards des tâches planifiées connues                         |

`mcp.write` est la permission la plus stricte existante (profil admin seulement). Les outils de
fichiers ne demandent que la portée `foretmap.read` : lire un fichier n'écrit rien.

### 11.1 Mémoire du connecteur

Table `mcp_memory`. Une note = **sujet** (clé de mise à jour), **contenu** (4 000 caractères au
plus), **étiquettes** (12 au plus), **portée** :

- `site` (défaut) : partagée entre tous les comptes `mcp.use` ; réécrite ou oubliée par son
  auteur ou un admin (`mcp.write`) — une note semée par migration est réécrivable par un admin ;
- `user` : visible et modifiable par son seul auteur.

Règles :

- `foretmap_remember` sur un sujet existant (casse et espaces ignorés, même portée, même compte
  pour `user`) **met à jour** la note et pose `verified_at = NOW()` ; `subject_key` =
  `SHA2(portée|compte|sujet normalisé)` rend le sujet unique (même calcul en SQL dans la
  migration 325 et en JS dans `lib/mcp/memory.js`) ;
- **refus** (`MCP_MEMORY_REJECTED`) d'un contenu qui ressemble à un secret ou à une donnée
  personnelle évidente (`lib/mcp/secretMask.js`, `findSecretLike`) : adresse e-mail, jeton de
  format connu (GitHub, Google, AWS, Slack, Anthropic/OpenAI/Stripe, JWT, `fmcp_…`), hachage
  bcrypt, clé privée PEM, `Bearer …`, mot de passe dans une URL, affectation `password=…` /
  `SECRET: …`, longue suite aléatoire (≥ 32 caractères mêlant majuscules, minuscules et chiffres,
  entropie ≥ 4 bits/caractère ; UUID et empreintes de commit admis) ;
- `foretmap_recall` : tous les mots de `query` doivent apparaître (sujet, contenu ou
  étiquettes, `LIKE` paramétré), `tags` exigés ; une note non vérifiée depuis
  `MCP_MEMORY_STALE_DAYS` (90 j) porte `stale: true` et « À revérifier » ;
- plafond de 500 notes par compte (et pour le site).

**Notes semées** (techniques, tirées du dépôt) : isolement G&L et produits par hôte ; corpus
semé par les migrations (corriger par migration) ; convention QCM (feedback de la bonne réponse
à NULL) ; emoji comparés en `BINARY` ; G&L = 4 chapitres, 6ᵉ ; `gl_resource_question_links`
source de vérité ; droits `PUBLIC` sous MariaDB 10.11+ ; emplacements des journaux et du cron.

Le champ `instructions` renvoyé par `initialize` demande à Claude de consulter
`foretmap_recall` en début de tâche et d'enregistrer avec `foretmap_remember` ce qui est stable.

### 11.2 Rapport de santé

Collecte : `lib/mcp/health/collect.js` (chaque section bornée et indépendante : une section en
échec devient `{ ok: false, error }` sans faire échouer le rapport). Règles :
`lib/mcp/health/rules.js` (fonctions pures). Stockage : `lib/mcp/health/store.js`.

| Section    | Contenu                                                                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `process`  | version, Node, `NODE_ENV`, uptime, mémoire (RSS, tas)                                                                                                       |
| `database` | ping et latence                                                                                                                                             |
| `schema`   | version du schéma, dernière migration, migrations en attente                                                                                                |
| `tables`   | 12 plus grosses tables (taille, lignes approximatives — métadonnées `information_schema`, aucune ligne lue), total                                          |
| `http`     | 5xx et 429 sur 24 h et 7 j (tranches horaires en mémoire, `lib/logMetrics.js`) ; `coveredHours` = fenêtre réellement couverte depuis le dernier redémarrage |
| `restarts` | journal de cycle de vie sur 24 h (crash, échecs de démarrage, processus tués, verdict)                                                                      |
| `cron`     | état des tâches planifiées (§ 11.4)                                                                                                                         |
| `disk`     | espace total / libre du système de fichiers, taille d'`uploads/` et de `logs/`                                                                              |
| `tls`      | jours restants avant expiration du certificat de chaque hôte (`tls.connect`, 5 s, erreur gérée)                                                             |
| `mcp`      | connexions MCP actives (familles de jetons valides), comptes, jetons d'accès utilisés sur 24 h                                                              |
| `audit`    | résumé de `foretmap_audit_all` (total, 5 contrôles les plus fournis)                                                                                        |

Hôtes TLS : `MCP_HEALTH_TLS_HOSTS` (liste), sinon l'hôte de `MCP_PUBLIC_BASE_URL` et celui de
`GL_PROD_BASE_URL` (à défaut, le préfixe `gl.` du registre `lib/products.js` sur le même domaine).

**Règles du statut** — rouge si un constat est rouge, sinon orange si un constat est orange,
sinon vert (les constats `info` ne comptent pas). Seuils renvoyés dans `thresholds` :

| Règle             | Orange                                                              | Rouge                                                     |
| ----------------- | ------------------------------------------------------------------- | --------------------------------------------------------- |
| `app_unreachable` | —                                                                   | application injoignable (script cron)                     |
| `database`        | latence ≥ 500 ms (`MCP_HEALTH_DB_LATENCY_WARN_MS`)                  | ping en échec, ou ≥ 2 000 ms (`…_CRIT_MS`)                |
| `migrations`      | —                                                                   | migration(s) en attente                                   |
| `http_5xx_24h`    | ≥ 5 (`MCP_HEALTH_5XX_WARN`)                                         | ≥ 50 (`MCP_HEALTH_5XX_CRIT`), ou ≥ 5 % sur ≥ 100 requêtes |
| `http_429_24h`    | ≥ 500 (`MCP_HEALTH_429_WARN`)                                       | —                                                         |
| `restarts`        | crash, échec de démarrage ou processus tué sur 24 h                 | —                                                         |
| `memory`          | RSS ≥ 800 Mo (`MCP_HEALTH_RSS_WARN_MB`)                             | —                                                         |
| `disk`            | espace libre < 10 %                                                 | < 5 %                                                     |
| `tls`             | expiration < 21 j (`MCP_HEALTH_TLS_WARN_DAYS`), contrôle impossible | < 7 j (`…_CRIT_DAYS`), certificat refusé                  |
| `cron`            | tâche en échec, en retard ou bloquée par un seuil                   | —                                                         |
| `audit`           | — (`info` : nombre de constats du corpus)                           | —                                                         |

**À la demande** : `foretmap_health_report` (admin), ou `GET /api/health/report` avec
l'en-tête `X-Health-Token` (`docs/API.md`, « Rapport de santé »).

**Régulier** :

- `scripts/health-report.js` (crontab cPanel, quotidien, ligne 9 de `docs/CRONTAB.md`)
  interroge l'application (`/api/health/report` : c'est elle qui détient les compteurs HTTP),
  construit le rapport lui-même si elle ne répond pas (statut **rouge**, `app_unreachable`),
  le stocke dans `mcp_health_reports` (purge au-delà de `MCP_HEALTH_REPORT_RETENTION_DAYS`,
  90 j), purge `scheduled_job_runs` au-delà de 180 j, et envoie un e-mail par le mailer
  existant (`OPS_ALERT_TO`) si le statut est **orange ou rouge** — ou chaque jour avec
  `MCP_HEALTH_REPORT_EMAIL=daily` (`off` coupe l'e-mail). Sortie : une ligne de résumé.
  Code 0 si le rapport a été produit (quel que soit son statut), 1 si le script a échoué ;
- `.github/workflows/health-check.yml` : une exécution courte par jour (04:40 UTC) +
  `workflow_dispatch`, un job sans checkout ni `npm ci` (`curl` + `jq`), moins d'une minute
  facturée. Échoue si le statut est rouge ou si le site ne répond pas ; avertissement si
  orange ; **succès avec explication** si les secrets `HEALTH_CHECK_URL` /
  `HEALTH_CHECK_TOKEN` manquent.

`foretmap_health_history` relit les rapports stockés : nombre par statut, changements de
statut, série en cours, rapport complet par `id`.

### 11.3 Fichiers du serveur (lecture seule)

Racines (`lib/mcp/files/roots.js`). `MCP_FILE_ROOTS` remplace la liste par défaut :
`nom=chemin` séparés par des virgules (chemin absolu ou relatif à l'application). Par défaut,
seules les racines qui existent sont exposées :

| Racine                          | Chemin                                                                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `logs`                          | `MCP_CRON_LOG_DIR`, sinon `<application>/logs`, sinon `~/foretmap-logs` (journaux de la crontab, `boot-journal.ndjson`) |
| `startup`, `startup-diag`       | `startup.log`, `startup-diag.log` (écrasés à chaque démarrage)                                                          |
| `passenger`                     | `MCP_PASSENGER_LOG`, sinon `<application>/stderr.log`, sinon `~/logs/<dossier>.stderr.log`                              |
| `cpanel`                        | `.cpanel.yml`                                                                                                           |
| `scripts`, `docs`, `migrations` | dossiers du dépôt                                                                                                       |
| `pino` (virtuelle)              | tampon Pino en mémoire, mêmes règles que `foretmap_tail_logs`                                                           |

Sur o2switch, Passenger écrit sa sortie d'erreur là où le désigne la directive
`PassengerAppLogFile` du `.htaccess` (souvent `stderr.log` à la racine de l'application, parfois
`~/logs/`). Si aucun des emplacements par défaut ne convient, poser `MCP_PASSENGER_LOG`.

**Sécurité, sans dérogation** :

- **anti-traversée** : chemin relatif seulement (absolu refusé), résolu par `realpath` (liens
  symboliques compris) ; le chemin réel doit rester **dans la racine** — `..` et un lien
  symbolique qui en sort sont refusés (`MCP_FILE_TRAVERSAL`) ; la recherche ne suit un lien que
  s'il reste dans la racine ; `node_modules`, `.git`, `dist`, `uploads`, `backups` ne sont jamais
  parcourus ;
- **binaires refusés** (`MCP_FILE_BINARY`) : octet nul ou plus de 10 % de caractères de contrôle
  dans les 8 premiers ko, ou extension d'archive, d'image, de base…;
- **`.env` et apparentés** (`.env.*`, `.my.cnf`, `.npmrc`, `.netrc`, `.pgpass`, `.htpasswd`) :
  seuls les noms de variables sortent (`CLE=****`) ; tout autre commentaire ou ligne libre est
  masqué en entier ; exclus de la recherche ;
- **fichiers de clés et certificats** (`.pem`, `.key`, `.p12`, `id_rsa`, `*secret*`…) :
  contenu jamais transmis ;
- **secrets reconnaissables masqués** dans tout autre fichier (`maskSecrets`) : jetons de
  formats connus, `Bearer …` / `Basic …`, mot de passe dans une URL (`scheme://u:****@hôte`),
  paramètre `token=`, `password=`, `code=`…, affectation dont le nom contient
  `pass`/`secret`/`token`/`key`/`auth`/`session`/`salt`… ; e-mails, hachages et jetons du site
  (`scrubString`) ;
- **journaux** (racines `logs`, `startup*`, `passenger`) : en plus, littéraux cités →
  `'[valeur]'`, UUID et suites hexadécimales → `id#xxxxxx`, IP → `ip#xxxxxx` (`logSanitizer`,
  pseudonymes à sel aléatoire par appel) ; les nombres restent (horodatages, tailles, codes) ;
- **bornes** : 2 Mo lus par fichier (la fin pour `tail` et pour la recherche dans un journal),
  500 lignes et 2 000 caractères par ligne, motif de 200 caractères (expressions à quantificateurs
  imbriqués et références arrière refusées), recherche sur la ligne **déjà nettoyée** (un secret
  masqué ne se retrouve pas par motif).

**Limite** : un nom ou un pseudo écrit en clair dans un journal texte n'est pas reconnaissable
de façon sûre (même limite que `foretmap_tail_logs`, § 5) ; ces outils sont donc réservés aux
administrateurs.

### 11.4 Tâches planifiées (`foretmap_cron_status`)

Lit **ce que le code trace déjà** (`lib/mcp/files/cron.js`) :

| Tâche                                                                               | Trace                                                     | Attendue           |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------ |
| `recurring_tasks`, `auto_archive`, `notifications_purge`, `task_deadline_reminders` | `scheduled_job_runs` (jobs quotidiens de `server.js`)     | 24 h               |
| `health_report`                                                                     | `scheduled_job_runs` (`scripts/health-report.js`)         | 24 h               |
| `retention_purge`                                                                   | `retention_purge_runs` (migration 319)                    | 24 h               |
| `auto_deploy`, `db_backup`, `uptime_check`                                          | dernière ligne horodatée de `logs/<ligne de crontab>.log` | 2 min, 24 h, 5 min |
| `moodle_sync`, `reconcile_uploads` (facultatives)                                   | `logs/moodle-sync.log`, `logs/reconcile-uploads.log`      | 4 j, 32 j          |

`scheduled_job_runs` est **nouveau** (migration 325, `lib/scheduledJobs.js`) : les jobs
quotidiens du serveur ne laissaient jusque-là qu'une ligne Pino, perdue au redémarrage. Le
traçage est best-effort et ne change rien au job. États : `ok`, `late` (plus vieux que
l'attente + 50 %), `failure`, `blocked` (purge arrêtée par un seuil), `never` (aucune trace),
`not_configured` (tâche facultative sans journal).

La **crontab** elle-même (`crontab -l`, `child_process.execFile`, 3 s) n'est lue que si
`MCP_CRON_READ_CRONTAB=true` : sous Passenger / CageFS, le processus web peut se la voir
refuser ; la réponse le dit alors (`crontab.available: false` et la raison). Sortie masquée
comme un fichier.

### 11.5 Variables

| Variable                           | Défaut                  | Rôle                                                                                      |
| ---------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| `MCP_FILES_ENABLED`                | `true`                  | `false` retire les quatre outils de fichiers et de cron pour tous                         |
| `MCP_FILE_ROOTS`                   | (racines par défaut)    | `nom=chemin,…` : remplace la liste des racines                                            |
| `MCP_CRON_LOG_DIR`                 | `<app>/logs`            | Dossier des journaux de la crontab                                                        |
| `MCP_PASSENGER_LOG`                | (recherché)             | Chemin du `stderr.log` Passenger                                                          |
| `MCP_CRON_READ_CRONTAB`            | `false`                 | Lire `crontab -l` dans `foretmap_cron_status`                                             |
| `MCP_MEMORY_STALE_DAYS`            | `90`                    | Au-delà, une note est « à revérifier »                                                    |
| `MCP_HEALTH_TOKEN`                 | (absent : endpoint 404) | Jeton de `GET /api/health/report` (en-tête `X-Health-Token`) ; ≥ 32 caractères aléatoires |
| `MCP_HEALTH_REPORT_EMAIL`          | (alerte)                | `daily` : e-mail chaque jour ; `off` : jamais ; sinon orange / rouge seulement            |
| `MCP_HEALTH_REPORT_RETENTION_DAYS` | `90`                    | Conservation des rapports stockés (7–730)                                                 |
| `HEALTH_REPORT_BASE_URL`           | `MCP_PUBLIC_BASE_URL`   | Adresse de l'application pour le script cron                                              |
| `MCP_HEALTH_TLS_HOSTS`             | (dérivés)               | Hôtes dont le certificat est contrôlé                                                     |
| `MCP_HEALTH_*_WARN` / `_CRIT`      | (§ 11.2)                | Seuils des règles                                                                         |

---

## 12. Activer en production

> **Version simple (admins / hébergeur)** : guide pas à pas tous assistants —
> [docs/reference/foretmap/activer-le-connecteur.md](reference/foretmap/activer-le-connecteur.md).
> Contrôle automatique des endpoints : `npm run mcp:activate-check -- --base https://<domaine>`.

Liste ordonnée technique, à suivre dans l'ordre. Les étapes marquées « facultatif » peuvent
être sautées sans rien casser.

1. **Fusion et migrations.** Fusionner les PR du connecteur ; le cron de déploiement applique
   `324_mcp_oauth.sql` et `325_mcp_exploitation.sql` (`DEPLOY_AUTO_MIGRATE=1`). Contrôler :
   `bash scripts/with-app-node.sh npm run db:status` → « à jour » (ou l'outil
   `foretmap_db_status`).
2. **Variables cPanel** (« Setup Node.js App » → variables d'environnement, ou `.env` du serveur) :
   - `MCP_ENABLED=true` ;
   - `MCP_PUBLIC_BASE_URL=https://<domaine-foretmap>` (exactement l'URL saisie dans Claude,
     sans barre finale ; obligatoire en production, sinon 503) ;
   - `MCP_HEALTH_TOKEN=<secret>` (`openssl rand -base64 36`) ;
   - facultatif : `MCP_HEALTH_REPORT_EMAIL=daily`, `MCP_PASSENGER_LOG=<chemin du stderr.log>`,
     `MCP_CRON_READ_CRONTAB=true`, `GL_PROD_BASE_URL=https://<domaine-gl>` ;
   - garder `MCP_SQL_ENABLED=false` ; `MCP_WRITE_ENABLED` et `MCP_FILES_ENABLED` valent `true`
     sans variable (poser `false` pour couper) ;
   - vérifier que `SMTP_*` et `OPS_ALERT_TO` sont posés (e-mails du rapport de santé).
3. **Compte MySQL restreint** (facultatif ; obligatoire pour `foretmap_sql_select`) :
   `node scripts/mcp-print-grants.js --db <base> --user <compte> --check-db`, exécuter les
   `GRANT` avec un compte administrateur MySQL, puis `DB_MCP_USER` / `DB_MCP_PASS`. Sur
   o2switch, les `GRANT` par table ne sont en général pas possibles depuis cPanel : laisser vide
   (§ 8).
4. **Dépendances et redémarrage** : `npm install --production` dans le dossier de l'application
   (le déploiement cPanel le fait via `.cpanel.yml`), puis redémarrer Passenger (« Restart »
   dans Setup Node.js App, ou `touch tmp/restart.txt`).
5. **Entrée cron cPanel** pour le rapport de santé (ligne 9 de `docs/CRONTAB.md`) :

   ```cron
   40 6 * * * mkdir -p /home/USER/foretmap/logs && bash /home/USER/foretmap/scripts/with-app-node.sh node scripts/health-report.js >> /home/USER/foretmap/logs/health-report.log 2>&1
   ```

   Lancer une fois à la main la même commande et lire `logs/health-report.log`.

6. **WAF o2switch (Tiger Protect)** : autoriser la plage d'egress d'Anthropic
   **`160.79.104.0/21`** sur `/mcp`, `/oauth/*` et `/.well-known/oauth-*`, et vérifier que
   `WWW-Authenticate` n'est pas retiré (§ 8, « Dépannage »).
7. **Vérifications** (script recommandé, ou `curl`) :

   ```bash
   npm run mcp:activate-check -- --base https://<domaine-foretmap>
   # équivalent manuel :
   curl -i -X POST https://<domaine-foretmap>/mcp          # 401 + WWW-Authenticate: Bearer resource_metadata="…"
   curl -s https://<domaine-foretmap>/.well-known/oauth-protected-resource/mcp
   curl -s https://<domaine-foretmap>/.well-known/oauth-authorization-server
   curl -s -o /dev/null -w '%{http_code}\n' https://<domaine-foretmap>/api/health/report   # 401
   curl -s -H "X-Health-Token: $MCP_HEALTH_TOKEN" https://<domaine-foretmap>/api/health/report | jq '.status, .summary'
   ```

8. **Smoke** (flux OAuth complet, `initialize`, `tools/list`, `foretmap_audit_all`, puis
   `foretmap_health_report` pour un admin) :

   ```bash
   MCP_SMOKE_BASE_URL=https://<domaine-foretmap> MCP_SMOKE_IDENTIFIER=<compte admin> \
   MCP_SMOKE_PASSWORD=<mot de passe> [MCP_SMOKE_TOTP=<code>] npm run mcp:smoke
   ```

9. **Ajouter le connecteur** (même URL `https://<domaine-foretmap>/mcp` pour tous) :
   - claude.ai / Desktop / mobile ; Claude Code ; Cursor (`FORETMAP_MCP_URL`) ; ChatGPT ;
     Gemini CLI — détail :
     [reference/foretmap/activer-le-connecteur.md](reference/foretmap/activer-le-connecteur.md)
     § « Partie B ».
10. **Secrets du workflow** `health-check.yml` (GitHub → Settings → Secrets and variables →
    Actions) : `HEALTH_CHECK_URL=https://<domaine-foretmap>` et `HEALTH_CHECK_TOKEN` = la valeur
    de `MCP_HEALTH_TOKEN`. Lancer une fois Actions → _Health check_ → _Run workflow_.

---

## 13. Réglages du connecteur

Décision du propriétaire du projet (05/11/2026) : le connecteur permet de **tout faire** sur
ForêtMap depuis Claude. Tout est **ouvert par défaut** et **paramétrable** depuis
l'administration (Réglages → Exploitation → « Connecteur Claude », clés `mcp.*` déclarées dans
`lib/settings/mcp.js`), avec un **verrou possible par variable d'environnement**.

### Résolution d'une valeur

1. une **variable d'environnement posée et valide gagne toujours** et **verrouille** la clé :
   l'interface l'affiche grisée, « fixé par le serveur (VARIABLE) », et `PUT
/api/settings/admin/mcp.*` répond `409 MCP_SETTING_LOCKED` ;
2. sinon la valeur enregistrée en base (`app_settings`) ;
3. sinon le **défaut ouvert** ci-dessous.

`resolveMcpSettings()` (`lib/mcp/config.js`) lit la base à chaque requête `/mcp` (cache 10 s,
invalidé à l'écriture d'une clé `mcp.*`) ; `getMcpConfig()` reste synchrone et consomme cet
instantané. Le script stdio Cursor, sans base, retombe sur environnement + défauts. Chaque
changement de réglage `mcp.*` écrit `audit_log` `mcp.settings.change` (ancienne et nouvelle
valeur), qu'il vienne de l'interface ou de `foretmap_settings`.

Hors réglages : `MCP_ENABLED` (interrupteur général, **désactivé** par défaut) et
`MCP_WRITE_ENABLED` (outils plan → apply et écriture de contenu, activé par défaut).

| Clé                               | Défaut            | Variable qui verrouille                    | Effet                                                                                                                                                                  |
| --------------------------------- | ----------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mcp.write_mode`                  | `direct`          | `MCP_WRITE_MODE`, `MCP_WRITE_REQUIRE_PLAN` | `direct` : `foretmap_content_change` et écritures immédiates ; `plan` : plan → apply seulement (`MCP_WRITE_REQUIRE_PLAN=true` ↔ `plan`).                               |
| `mcp.write_scope_policy`          | `app_permissions` | `MCP_WRITE_SCOPE_POLICY`                   | Portée `foretmap.write` accordée au consentement à tout compte `mcp.use` (il agit avec ses droits applicatifs) ; `admin_only` : seulement aux porteurs de `mcp.write`. |
| `mcp.api_bridge_enabled`          | `true`            | `MCP_API_BRIDGE_ENABLED`                   | `foretmap_api` et écritures des outils de domaine.                                                                                                                     |
| `mcp.api_bridge_methods`          | toutes            | `MCP_API_BRIDGE_METHODS`                   | Méthodes HTTP admises par le pont (`GET,POST,PUT,PATCH,DELETE`).                                                                                                       |
| `mcp.api_bridge_sensitive_auth`   | `false`           | `MCP_API_BRIDGE_SENSITIVE_AUTH`            | Routes d'authentification sensibles par le pont (prise de contrôle, TOTP, LTI, accès aux plans…) ; jetons et secrets restent masqués en sortie.                        |
| `mcp.domains_disabled`            | vide              | `MCP_DOMAINS_DISABLED`                     | Domaines d'outils retirés (`tasks`, `students`, `maps`, `ops`…).                                                                                                       |
| `mcp.sql_select_enabled`          | `true`            | `MCP_SQL_ENABLED`                          | `foretmap_sql_select`, `foretmap_describe_schema`, `foretmap_export`.                                                                                                  |
| `mcp.sql_select_pool`             | `auto`            | `MCP_SQL_SELECT_POOL`                      | `auto` : compte `DB_MCP_USER` s'il existe, sinon pool principal en transaction READ ONLY ; `dedicated_only` : compte dédié exigé.                                      |
| `mcp.sql_write_enabled`           | `true`            | `MCP_SQL_WRITE_ENABLED`                    | `foretmap_sql_execute` (DML).                                                                                                                                          |
| `mcp.sql_ddl_enabled`             | `true`            | `MCP_SQL_DDL_ENABLED`                      | DDL / DCL dans `foretmap_sql_execute`.                                                                                                                                 |
| `mcp.sql_max_affected_rows`       | `10000`           | `MCP_SQL_MAX_AFFECTED_ROWS`                | Plafond de lignes touchées par instruction (1 à 1 000 000).                                                                                                            |
| `mcp.confirm_mode`                | `off`             | `MCP_CONFIRM_MODE`, `MCP_CONFIRM_REQUIRED` | Confirmation par code e-mail : `off`, `sensitive` (opérations sensibles du SQL d'écriture), `all_writes` (toute écriture). `MCP_CONFIRM_REQUIRED=true` ↔ `sensitive`.  |
| `mcp.privacy_bypass`              | `true`            | `MCP_PRIVACY_BYPASS`                       | Données nominatives d'élèves (lecture et écriture) pour les porteurs de `mcp.privacy_bypass`.                                                                          |
| `mcp.privacy_bypass_ack`          | vide              | `MCP_PRIVACY_BYPASS_ACK`                   | Date de lecture du registre de traitement, **informative** (journal `warn` si absente).                                                                                |
| `mcp.privacy_reads_audit_details` | `summary`         | `MCP_PRIVACY_READS_AUDIT_DETAILS`          | Détail de la ligne d'audit d'une lecture nominative (`summary` ou `full`) ; il n'existe pas de valeur `off`.                                                           |
| `mcp.ops_enabled`                 | `true`            | `MCP_OPS_ENABLED`                          | `foretmap_ops` (tâches planifiées, migrations, redémarrage, sauvegarde, rétention, caches).                                                                            |
| `mcp.files_enabled`               | `true`            | `MCP_FILES_ENABLED`                        | Outils fichiers (journaux, `cron_status`).                                                                                                                             |
| `mcp.max_rows`                    | `2000`            | `MCP_MAX_ROWS`                             | Plafond de lignes des lectures (50 à 5 000).                                                                                                                           |
| `mcp.max_output_chars`            | `400000`          | `MCP_MAX_OUTPUT_CHARS`                     | Plafond de caractères d'une réponse ; au-delà, la réponse invite à `foretmap_export`.                                                                                  |
| `mcp.tool_profile`                | `complet`         | `MCP_TOOL_PROFILE`                         | `essentiel` : socle, tâches, élèves, groupes, espèces, cartes, réglages (si le choix d'outil par Claude se dégrade).                                                   |

### Ce qui reste non négociable

1. **Aucun secret ne sort**, quel que soit le réglage : hachages, secrets et codes TOTP, jetons
   (OAuth, MCP, réinitialisation, LTI), valeurs `.env`, clés. `secretGuard.js` /
   `secretMask.js` nettoient toute sortie ; `SELECT *` est refusé sur une table à colonnes
   secrètes quand le SQL passe par le pool principal. Exception voulue par le propriétaire :
   `foretmap_ops dump full` produit une sauvegarde **complète** dans un fichier privé (lien
   signé d'une heure, purgé à 24 h) — son contenu n'est jamais renvoyé dans la conversation.
2. **Tout est tracé** : chaque écriture, et chaque lecture nominative, laisse une ligne
   `audit_log` marquée `via: 'mcp'`, avec l'outil (`mcp_tool`), l'utilisateur et le client
   OAuth (`mcp_client_id`).
3. **OAuth + TOTP + `mcp.use`** restent la porte d'entrée ; `MCP_ENABLED` l'interrupteur
   général.

### Qui peut faire quoi

- Avec `mcp.write_scope_policy=app_permissions`, **tout compte `mcp.use`** (admin, n3boss)
  reçoit la portée d'écriture : par le pont et les outils de domaine, il ne peut faire que ce
  que ses **droits applicatifs** lui permettent dans le site (un prof sans `tasks.validate` reçoit
  le 403 de la route).
- Restent réservés aux porteurs de leur permission (admin par défaut) les outils qui
  **contournent le RBAC applicatif** : SQL (`mcp.sql`, `mcp.sql_execute`), bypass RGPD
  (`mcp.privacy_bypass`), `foretmap_ops` (`mcp.ops`, migration 328), écriture de la liste
  blanche de contenu (`mcp.write`).

### Confirmation par code (hors Claude)

En `mcp.confirm_mode=sensitive`, les opérations sensibles de **`foretmap_sql_execute`**
(DDL/DCL, UPDATE/DELETE **sans** `WHERE` ou dont le `WHERE` est toujours vrai — `1=1`, `TRUE`,
`col = col`, `LIKE '%'`, `… OR 1=1`, `IF(1,1,0)` —, tables d'autorisation RBAC/OAuth/MCP,
dépassement du plafond de lignes) ne s'exécutent pas tant qu'un code à **6 chiffres** n'a pas
été validé ; en `all_writes`, toute écriture d'un outil de domaine le demande aussi :

1. Premier appel → code envoyé à l'**e-mail du compte**, ligne `mcp_confirmations` (10 min,
   usage unique, ≤ 3 essais, liée au compte, à l'outil et à l'empreinte des arguments), réponse
   `{ confirmation_required: true, confirmation_id, summary }`.
2. Second appel avec les **mêmes** arguments + `confirmation_id` + `confirmation_code`.

En `off` (défaut), l'étape est sautée (audit `mcp.confirm.skipped` pour les opérations
sensibles).

### Limites de `foretmap_sql_execute`

- **Une seule instruction**, sans `;` final ; texte contrôlé (`classify.js`) : pas de
  `LOAD DATA`, `INTO OUTFILE`, `SHUTDOWN`, `SET PASSWORD`, etc.
- **DML** : transaction applicative ; **`dry_run=true`** exécute puis **rollback**.
- **DDL / DCL** : **hors transaction** (commit implicite) ; `dry_run=true` ne lance pas
  l'instruction.
- Réponse avec une **`migration_sql`** idempotente à verser par PR pour le corpus semé.
- Colonnes secrètes refusées, y compris dans la liste d'un `INSERT` / `REPLACE` ; un `INSERT` /
  `REPLACE` **sans** liste de colonnes est refusé.
- **Contourne la logique métier** : pour les tâches, projets, inscriptions et validations,
  utiliser `foretmap_tasks` / `foretmap_api`.

### Blocs `.env`

**Tout ouvert** (défaut du dépôt) : ne poser **aucune** des variables de la table ci-dessus — les
réglages se pilotent alors depuis l'interface. Seules restent nécessaires :

```env
MCP_ENABLED=true
MCP_PUBLIC_BASE_URL=https://foretmap.example
```

**Protégé** (verrouille les clés dans l'état historique, non modifiable depuis l'interface) :

```env
MCP_WRITE_REQUIRE_PLAN=true
MCP_WRITE_SCOPE_POLICY=admin_only
MCP_API_BRIDGE_ENABLED=false
MCP_SQL_ENABLED=false
MCP_SQL_WRITE_ENABLED=false
MCP_SQL_DDL_ENABLED=false
MCP_SQL_MAX_AFFECTED_ROWS=100
MCP_CONFIRM_REQUIRED=true
MCP_PRIVACY_BYPASS=false
MCP_OPS_ENABLED=false
```

Redémarrer l'application après un changement de variable. Migrations **`327_mcp_productivity.sql`**
(table `mcp_confirmations`, permissions SQL et bypass) et **`328_mcp_acces_complet.sql`**
(permissions `mcp.ops` et `notifications.send`) : `npm run db:migrate` ou cron de déploiement.
