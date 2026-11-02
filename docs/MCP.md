# Connecteur Claude (MCP distant)

Le site expose un **serveur MCP distant** (Model Context Protocol) à l'adresse `<base>/mcp`,
protégé par un **serveur d'autorisation OAuth 2.1 intégré**. Il permet de brancher Claude
(claude.ai, Claude Desktop, Claude mobile, Claude Code) sur le **contenu pédagogique** de
ForetMap et de Gnomes & Licornes : recherche, fiches espèces, cartes, clés de détermination,
réseaux trophiques, QCM, glossaires, plateaux et lore G&L, **audits de cohérence du corpus**,
et — pour les administrateurs — **corrections de contenu par plan puis application**.

Aucune donnée personnelle n'est exposée : voir § 5 et la fiche
[MCP_REGISTRE_TRAITEMENT.md](MCP_REGISTRE_TRAITEMENT.md).

Le serveur MCP **stdio** pour Cursor (`scripts/mcp-foretmap-diagnostics.mjs`, diagnostic à
distance par `DEPLOY_SECRET`) reste disponible : [MCP_FORETMAP_CURSOR.md](MCP_FORETMAP_CURSOR.md).
Il partage désormais le même registre d'outils de diagnostic.

---

## 1. Architecture

```
Claude ──HTTPS──▶ /mcp (POST JSON-RPC)                 lib/mcp/server.js
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

Claude ──▶ /.well-known/oauth-protected-resource[/mcp]   (RFC 9728)
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
  haché ou IP — le trafic de Claude sort des adresses partagées d'Anthropic) et un corps JSON
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

| Variable                       | Défaut       | Rôle                                                                                        |
| ------------------------------ | ------------ | ------------------------------------------------------------------------------------------- |
| `MCP_ENABLED`                  | `false`      | Active `/mcp`, `/oauth/*`, `/.well-known/oauth-*`                                           |
| `MCP_PUBLIC_BASE_URL`          | (requête)    | **À poser en production** : origine publique exacte, ex. `https://foretmap.olution.info`    |
| `MCP_WRITE_ENABLED`            | **`true`**   | Outils d'écriture (plan → apply). Toujours réservés à `mcp.write` + portée `foretmap.write` |
| `MCP_SQL_ENABLED`              | `false`      | Outil `foretmap_sql_select` (admin `mcp.sql`)                                               |
| `MCP_ACCESS_TOKEN_TTL_SECONDS` | `3600`       | Durée de vie d'un jeton d'accès (300–86400)                                                 |
| `MCP_REFRESH_TOKEN_TTL_DAYS`   | `30`         | Durée de vie d'un jeton de rafraîchissement (1–365)                                         |
| `MCP_AUTH_CODE_TTL_SECONDS`    | `60`         | Durée de vie d'un code d'autorisation (30–600)                                              |
| `MCP_PLAN_TTL_MINUTES`         | `60`         | Validité d'un plan d'écriture (5–1440)                                                      |
| `MCP_STATEMENT_TIMEOUT_MS`     | `5000`       | Délai maximal par requête SQL d'un outil (500–60000)                                        |
| `MCP_RATE_LIMIT_PER_MIN`       | `300`        | Requêtes `/mcp` par minute et par jeton                                                     |
| `MCP_OAUTH_ALLOWED_REDIRECTS`  | (voir § 3)   | Liste (virgules) des redirections admises                                                   |
| `MCP_CIMD_ENABLED`             | `true`       | Accepter les `client_id` CIMD (URL https)                                                   |
| `MCP_DCR_ENABLED`              | `true`       | Accepter l'enregistrement dynamique `/oauth/register`                                       |
| `DB_MCP_USER` / `DB_MCP_PASS`  | (pool appli) | Compte MySQL **lecture seule** recommandé pour les outils de lecture (voir § 8)             |

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
  et `http://localhost/callback`, `http://127.0.0.1/callback` **port ignoré** (Claude Code,
  RFC 8252 §7.3). Rien d'autre sauf `MCP_OAUTH_ALLOWED_REDIRECTS`.
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
- **Isolation** : un jeton `fmcp_…` est refusé sur `/api/*` et `/api/gl/*` (401
  `MCP_TOKEN`) ; un JWT de session (ForetMap ou G&L) est refusé sur `/mcp`.
- **Purge** : opportuniste, au plus toutes les 10 min (déclenchée par `/oauth/token`) : codes
  expirés depuis 1 h, jetons expirés ou révoqués depuis 7 jours, plans non appliqués expirés
  depuis 7 jours. Les comptes supprimés emportent leurs jetons (`ON DELETE CASCADE`).

Google OAuth n'est **pas** branché sur l'écran de connexion du connecteur (voir § 10).

---

## 4. Outils

Noms stables préfixés, descriptions en français pour le modèle, schémas zod **stricts** (clé
inconnue refusée), pagination `limit ≤ 200` + `offset`, sorties JSON **compactes** (tronquées
au-delà de 120 000 caractères), annotations MCP renseignées.

| Outil                                    | Portée / permission                 | Rôle                                                                                                               |
| ---------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `foretmap_health`                        | read                                | Version, uptime, ping BDD                                                                                          |
| `foretmap_diagnostics`                   | read + `admin.settings.read`        | Instantané d'exploitation (mémoire, BDD, schéma, redémarrages, agrégats G&L)                                       |
| `foretmap_tail_logs`                     | read + `admin.settings.read`        | Dernières lignes Pino (redact du logger + masquage e-mail/jeton)                                                   |
| `foretmap_db_status`                     | read + `admin.settings.read`        | Migrations appliquées / en attente                                                                                 |
| `foretmap_search`                        | read + `mcp.use`                    | Plein texte : espèces FM (alias) et G&L, 3 glossaires, tutoriels, 3 jeux de QCM, zones, repères                    |
| `foretmap_get_species`                   | read + `mcp.use`                    | Fiche complète FM (taxonomie, alias, photos+crédits, dangers, interactions, présence, clés, QCM, glossaire) ou G&L |
| `foretmap_list_maps`                     | read + `mcp.use`                    | Cartes, niveau pédagogique, volumes                                                                                |
| `foretmap_get_map`                       | read + `mcp.use`                    | Zones, repères, espèces rattachées, registre, parcours                                                             |
| `foretmap_get_id_key`                    | read + `mcp.use`                    | Arbre d'une clé de détermination                                                                                   |
| `foretmap_get_food_web`                  | read + `mcp.use`                    | Réseau trophique d'une carte / d'une espèce (niveau de preuve, source) ; G&L                                       |
| `foretmap_list_qcm` / `foretmap_get_qcm` | read + `mcp.use`                    | QCM ForetMap / G&L / lore (niveau, difficulté, catégorie, biome/chapitre, espèce)                                  |
| `foretmap_get_glossary_term`             | read + `mcp.use`                    | Un terme dans les trois glossaires (comparaison FM ↔ G&L)                                                          |
| `gl_get_board`                           | read + `mcp.use`                    | Chapitres, cases ordonnées (positions, réglage de tirage), zones de frontière                                      |
| `gl_get_lore`                            | read + `mcp.use`                    | Feuillets (statut, plateau)                                                                                        |
| `foretmap_usage_overview`                | read + `mcp.use`                    | Agrégats anonymes seuillés (n ≥ 5)                                                                                 |
| `foretmap_audit`                         | read + `mcp.use`                    | Un contrôle (énumération fermée) → `{check, description, count, sample_ids ≤ 50, hint}`                            |
| `foretmap_audit_all`                     | read + `mcp.use`                    | Tableau de bord de tous les contrôles                                                                              |
| `foretmap_sql_select`                    | read + `mcp.sql`, `MCP_SQL_ENABLED` | SELECT borné sur tables de contenu (désactivé par défaut)                                                          |
| `foretmap_plan_content_change`           | write + `mcp.write`                 | Prépare une correction : diff, risques, migration idempotente + rollback ; n'écrit rien                            |
| `foretmap_apply_plan`                    | write + `mcp.write`                 | Applique un plan si l'état n'a pas changé ; transaction ; `audit_log`                                              |
| `foretmap_export_plan_as_migration`      | write + `mcp.write`                 | Migration + rollback seuls (voie « par PR »)                                                                       |

Un outil n'apparaît dans `tools/list` que si la portée, la permission et le drapeau le
permettent ; l'appel est revérifié (une liste obtenue avec d'autres droits ne suffit pas).

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
- **Lecture seule** : chaque outil de lecture tourne dans `START TRANSACTION READ ONLY`, avec
  `SET STATEMENT max_statement_time=… FOR` (MariaDB) ou `MAX_EXECUTION_TIME` (MySQL 8), un
  `LIMIT` forcé (≤ 500) et un budget total par appel.
- **Journal d'appels** : ligne Pino `mcp_tool_call` (outil, compte, client, durée, statut, code
  d'erreur) — **jamais les arguments**. Connexions, échecs et consentements dans
  `security_events` (`mcp.oauth.*`) ; écritures dans `audit_log` (`mcp.content.apply`).
- **Test anti-PII** : `tests/mcp-tools.test.js` appelle **tous** les outils sur la base semée
  (avec un e-mail piégé dans un crédit photo) et échoue si un e-mail, un hachage bcrypt ou un
  jeton apparaît dans une réponse.

Fiche de registre : [MCP_REGISTRE_TRAITEMENT.md](MCP_REGISTRE_TRAITEMENT.md).

---

## 6. Écriture de contenu — plan → apply

**Activée par défaut** (`MCP_WRITE_ENABLED=true`, choix du propriétaire du projet) mais
réservée aux comptes **admin** (`mcp.write`) ayant reçu la portée `foretmap.write`. Un prof ne
voit pas ces outils et se les voit refuser. `MCP_WRITE_ENABLED=false` les retire pour tous.

1. **`foretmap_plan_content_change`** : opérations bornées (≤ 50) sur une **liste blanche de
   tables et colonnes** (`lib/mcp/write/operations.js`) :
   - `set_field` sur `plants` (textes, crédit/licence photo), `plant_photos` (crédit,
     licence, source), `zones`, `map_markers`, `glossary_terms`, `gl_glossary_terms`,
     `gl_species`, `quiz_questions`, `gl_qcm_questions` (feedbacks, crédits, niveau G&L) ;
   - `link` / `unlink` d'une espèce sur `zone_species`, `marker_species`, `map_species`,
     `glossary_term_species`.

   Renvoie `{ plan_id, diff avant/après, risques, migration_sql, rollback_sql }` **sans rien
   écrire**. Le plan est stocké (`mcp_content_plans`) avec l'empreinte de l'état lu et expire
   (`MCP_PLAN_TTL_MINUTES`).

2. **`foretmap_apply_plan`** : relit l'état **en verrouillant les lignes** (`FOR UPDATE`) ; s'il
   diffère de l'empreinte, **conflit** et rien n'est écrit. Sinon, une seule transaction,
   écriture dans `audit_log`, et renvoi de la migration équivalente.
3. **`foretmap_export_plan_as_migration`** : migration + rollback seuls, nom de fichier suggéré.

La migration générée est **idempotente** : chaque `UPDATE` est gardé par la valeur attendue
avant correction (comparaison `BINARY`), chaque liaison par `INSERT IGNORE` / `DELETE` ciblé.
Le rollback garde symétriquement la valeur d'après.

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

1. **Migration** : `324_mcp_oauth.sql` (jouée par le démarrage ou `npm run db:migrate`) ;
   contrôler par `npm run db:status` ou l'outil `foretmap_db_status`.
2. **Variables** (cPanel → « Setup Node.js App ») : `MCP_ENABLED=true`,
   `MCP_PUBLIC_BASE_URL=https://<domaine-foretmap>` ; garder `MCP_SQL_ENABLED=false` ;
   `MCP_WRITE_ENABLED` vaut `true` sans variable (poser `false` pour couper l'écriture).
3. **Recommandé** : un utilisateur MySQL en lecture seule (`GRANT SELECT` sur la base) dans
   `DB_MCP_USER` / `DB_MCP_PASS` : c'est la seule garantie qui ne dépende pas de ce code. (Les
   écritures `apply` et le stockage OAuth passent par le pool applicatif.)
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
- **WAF / pare-feu** : autoriser la plage de sortie d'Anthropic **`160.79.104.0/21`** sur ces
  chemins (découverte, enregistrement, jeton et `/mcp` viennent tous de là). Une règle
  anti-robot sur `POST /oauth/token` casse le flux sans trace côté application.
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

| Fichier                           | Couverture                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/mcp-oauth.test.js`         | Métadonnées et 401, DCR, CIMD simulé, PKCE, CSRF, consentement, codes, rotation, révocation, isolation, TOTP                          |
| `tests/mcp-tools.test.js`         | Listes par profil, chaque outil, anti-PII, écriture (admin / prof / drapeau), plan → apply → rollback, conflit, SQL, bout en bout SDK |
| `tests/mcp-audits.test.js`        | Contrôles sur jeux construits, garde SQL, SELECT libre, opérations, migration générée, configuration                                  |
| `tests/mcp-migration-324.test.js` | Tables, idempotence, permissions semées                                                                                               |

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
- **Pool lecture seule** recommandé mais facultatif : sans `DB_MCP_USER`, la transaction
  `READ ONLY` et la liste blanche sont les seules barrières côté lecture.
- **Recherche** par `LIKE` (pas d'index plein texte) : suffisant pour quelques milliers de
  lignes ; `limit` par type ≤ 50.
- **Niveaux G&L** : le contrôle `gl_case_levels_not_6e` admet `6e`, `cycle 3`, `college`,
  `base` ; à ajuster si la convention de saisie évolue.
- **Étendre l'écriture** (nouvelles colonnes ou tables) : ajouter à `EDITABLE_FIELDS` /
  `LINK_TABLES` **et** aux tests ; une table de la liste noire reste refusée quoi qu'il arrive.
