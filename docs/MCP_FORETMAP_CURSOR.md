# Diagnostic ForetMap via MCP (Cursor)

Cette approche est la plus efficace pour qu’un assistant dans **Cursor** interroge la prod (ou un staging) **sans coller le secret dans le chat** : le secret vit uniquement dans la configuration du serveur MCP.

## Prérequis

- Déploiement avec **`DEPLOY_SECRET`** défini côté serveur (comme pour `/api/admin/logs`).
- Sur la machine où tourne Cursor : dépôt ForetMap cloné, **`npm install`** effectué (le script utilise `@modelcontextprotocol/sdk` et `zod`).

## Outils exposés

| Outil | Secret | Rôle |
|--------|--------|------|
| `foretmap_public_health` | Non | `/api/health`, `/api/health/db`, `/api/version` en parallèle |
| `foretmap_diagnostics` | Oui (`FORETMAP_DEPLOY_SECRET`) | Instantané : version, uptime, mémoire, latence MySQL, tampon logs |
| `foretmap_tail_logs` | Oui | Tampon Pino (paramètre optionnel `lines`, 1–5000) |

## Configuration Cursor

1. Ouvrir les paramètres MCP (Cursor : *Settings → MCP* ou fichier JSON des serveurs MCP selon votre version).
2. Ajouter un serveur qui lance le script du dépôt, **avec des variables d’environnement** (exemple ; adaptez le chemin Windows) :

```json
{
  "mcpServers": {
    "foretmap-diagnostics": {
      "command": "node",
      "args": ["C:/projets_code/ForetMap/scripts/mcp-foretmap-diagnostics.mjs"],
      "env": {
        "FORETMAP_BASE_URL": "https://foretmap.olution.info",
        "FORETMAP_DEPLOY_SECRET": "remplacer-par-votre-secret"
      }
    }
  }
}
```

3. Redémarrer Cursor ou recharger les serveurs MCP.
4. Vérifier que l’assistant peut appeler les outils `foretmap_*` (liste des outils MCP).

**Sécurité :** ne pas versionner le secret ; ne pas le mettre dans `.env` du dépôt si ce fichier est partagé. Préférer les variables d’environnement du **profil utilisateur** ou la config MCP locale uniquement sur votre poste.

## Ligne de commande (test manuel)

Le processus reste bloqué sur stdin (protocole MCP) :

```bash
npm run mcp:diag
```

Pour un test HTTP sans MCP, utilisez plutôt `npm run deploy:check:prod` ou `curl` avec `X-Deploy-Secret` vers `/api/admin/diagnostics`.

## API associée

Voir **`docs/API.md`** : `GET /api/admin/diagnostics` (même protection que `/api/admin/logs`).
