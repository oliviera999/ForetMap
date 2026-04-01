# Diagnostic ForetMap via MCP (Cursor)

Cette approche permet à l’assistant dans **Cursor** d’interroger la prod (ou un staging) **sans coller le secret dans le chat**.

## Prérequis

- Côté serveur : **`DEPLOY_SECRET`** défini (comme pour `/api/admin/logs` et `/api/admin/diagnostics`).
- Sur le PC où tourne Cursor : dépôt ForetMap, **`npm install`** à la racine (`@modelcontextprotocol/sdk`, `zod`).

## Fichier projet (recommandé)

Le dépôt contient **`.cursor/mcp.json`** : serveur **`foretmap-diagnostics`**, URL prod par défaut dans `env.FORETMAP_BASE_URL`.

Au démarrage, le script **`scripts/mcp-foretmap-diagnostics.mjs`** charge le fichier **`.env` à la racine du workspace** (via `dotenv`, sans écraser les variables déjà posées par le système). Y définir au moins une de :

- **`FORETMAP_DEPLOY_SECRET`** (recommandé pour distinguer MCP des autres usages), ou  
- **`DEPLOY_SECRET`**, ou **`FORETMAP_DEPLOY_CHECK_SECRET`**  

(même valeur que **`DEPLOY_SECRET`** sur le serveur). Ne pas commiter `.env`.

### Option : secret uniquement dans l’OS (sans `.env`)

Variable utilisateur Windows **`FORETMAP_DEPLOY_SECRET`** (ou **`DEPLOY_SECRET`**) : elle est lue **avant** le chargement `.env` et n’est pas écrasée par `dotenv`. Puis **redémarrer Cursor** après changement.

Si besoin d’une config MCP hors dépôt : **`%USERPROFILE%\.cursor\mcp.json`** (fichier utilisateur, non versionné).

### Autre URL que la prod

Éditez **`FORETMAP_BASE_URL`** dans `.cursor/mcp.json` (ex. `http://127.0.0.1:3000`) ou surchargez via config MCP utilisateur.

## Outils exposés

| Outil | Secret | Rôle |
|--------|--------|------|
| `foretmap_public_health` | Non | `/api/health`, `/api/health/db`, `/api/version` en parallèle |
| `foretmap_diagnostics` | Oui | Instantané serveur (équivalent `GET /api/admin/diagnostics`) |
| `foretmap_tail_logs` | Oui | Tampon Pino (`lines` optionnel, 1–5000) |

Après configuration : *Cursor Settings → MCP* : vérifier que **`foretmap-diagnostics`** est actif ; en cas de doute, redémarrer Cursor.

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
