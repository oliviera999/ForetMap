# Diagnostic ForetMap via MCP (Cursor)

> Deux voies distinctes dans Cursor :
>
> 1. **Connecteur distant OAuth** (`foretmap` dans `.cursor/mcp.json`, URL
>    `${env:FORETMAP_MCP_URL}`) : même serveur `/mcp` que Claude / ChatGPT / Gemini CLI —
>    contenu pédagogique, audits, corrections. Voir **[MCP.md](MCP.md)** § 7.
> 2. **stdio diagnostics** (`foretmap-diagnostics`) : la présente page. Interroge la prod par
>    `DEPLOY_SECRET` ; outils partagés avec le distant (`lib/mcp/tools/diagnostics.js`).

Le stdio permet à l’assistant dans **Cursor** d’interroger la prod (ou un staging) **sans
coller le secret dans le chat**, sans passer par OAuth.

## Prérequis

- Côté serveur : **`DEPLOY_SECRET`** défini (comme pour `/api/admin/logs` et `/api/admin/diagnostics`).
- Sur le PC où tourne Cursor : dépôt ForetMap, **`npm install`** à la racine (`@modelcontextprotocol/sdk`, `zod`).

## Fichier projet (recommandé)

Le dépôt contient **`.cursor/mcp.json`** : **`foretmap-diagnostics`** (stdio) et **`foretmap`**
(HTTP distant). L’URL publique du connecteur est écrite en clair pour que Cursor la charge
même si `FORETMAP_MCP_URL` n’est pas définie dans le process (sinon l’entrée disparaît des
réglages). Contournement UI Cursor (Customize → MCPs qui masque les serveurs _projet_) :
dupliquer les entrées dans **`%USERPROFILE%\.cursor\mcp.json`** (niveau utilisateur).

Au démarrage, le script **`scripts/mcp-foretmap-diagnostics.mjs`** charge le fichier **`.env` à la racine du workspace** (via `dotenv`, sans écraser les variables déjà posées par le système). Y définir au moins une de :

- **`FORETMAP_DEPLOY_SECRET`** (recommandé pour distinguer MCP des autres usages), ou
- **`DEPLOY_SECRET`**, ou **`FORETMAP_DEPLOY_CHECK_SECRET`**

(même valeur que **`DEPLOY_SECRET`** sur le serveur). Ne pas commiter `.env`.

### Option : secret uniquement dans l’OS (sans `.env`)

Variable utilisateur Windows **`FORETMAP_DEPLOY_SECRET`** (ou **`DEPLOY_SECRET`**) : elle est lue **avant** le chargement `.env` et n’est pas écrasée par `dotenv`. Puis **redémarrer Cursor** après changement.

Si besoin d’une config MCP hors dépôt : **`%USERPROFILE%\.cursor\mcp.json`** (fichier utilisateur, non versionné).

### Autre URL que la prod

Définissez **`FORETMAP_BASE_URL`** et **`GL_BASE_URL`** dans le `.env` local (ex.
`FORETMAP_BASE_URL=https://<domaine-foretmap>`, `GL_BASE_URL=https://<domaine-gl>`, ou
`http://127.0.0.1:3000` pour une instance locale), ou dans la config MCP utilisateur (bloc `env`).
Sans variable, le script retombe sur l'instance de production du projet.

## Outils exposés

| Outil                                              | Secret | Rôle                                                         |
| -------------------------------------------------- | ------ | ------------------------------------------------------------ |
| `foretmap_health` (alias `foretmap_public_health`) | Non    | `/api/health`, `/api/health/db`, `/api/version` en parallèle |
| `foretmap_diagnostics`                             | Oui    | Instantané serveur (équivalent `GET /api/admin/diagnostics`) |
| `foretmap_tail_logs`                               | Oui    | Tampon Pino (`lines` optionnel, 1–1000)                      |
| `foretmap_db_status`                               | Oui    | Section `schema` des diagnostics (migrations en attente)     |
| `gl_public_health`                                 | Non    | Santé publique G&L                                           |
| `gl_diagnostics`                                   | Oui    | Section `gl` des diagnostics                                 |

Après configuration : _Cursor Settings → MCP_ : vérifier que **`foretmap-diagnostics`** est actif ; en cas de doute, redémarrer Cursor.

Les réponses HTTP exposent **`X-Request-Id`** : pour une erreur signalée par un utilisateur, demandez l’ID affiché dans les outils dev du navigateur et corrélez-le avec **`GET /api/admin/logs`** ou les champs `recentHttp5xx` de **`foretmap_diagnostics`**.

## Check post-déploiement avec la route admin

Si **`DEPLOY_SECRET`** ou **`FORETMAP_DEPLOY_CHECK_SECRET`** est défini dans l’environnement lorsque vous lancez le script, **`npm run deploy:check`** vérifie aussi **`GET /api/admin/diagnostics`** (header `X-Deploy-Secret`). Utile juste après une mise en prod pour confirmer que le nouveau code est bien déployé.

```powershell
# Exemple : charger .env local puis contrôler la prod
# (ne commitez jamais un .env contenant le secret réel)
npm run deploy:check:prod
```

Sans variable, le check reste limité à health / version comme avant.

## Ligne de commande MCP (test)

Le processus reste bloqué sur stdin (protocole MCP) :

```bash
npm run mcp:diag
```

## API associée

Voir **`docs/API.md`** : `GET /api/admin/diagnostics` (même protection que `/api/admin/logs`).

## Déploiement du code sur l’hébergeur

Le fichier `.cursor/mcp.json` et ce guide ne déploient pas l’application : il faut toujours **publier** le commit sur le serveur (cron, ZIP, SSH, etc.), comme décrit dans **`docs/EXPLOITATION.md`**.
