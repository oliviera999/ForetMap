# Activer le connecteur MCP (tous les assistants)

> **Public : administrateur du site et personne qui gère l’hébergement.** Guide pas à pas,
> sans jargon. Une fois le serveur prêt, chaque assistant (Claude, Cursor, ChatGPT, Gemini
> CLI…) se branche de la même façon sur l’adresse `…/mcp`. Retour au sommaire :
> [../README.md](../README.md)

## En deux temps

1. **Côté site** (une seule fois) : allumer le connecteur sur le serveur.
2. **Côté assistant** (par personne) : ajouter l’adresse du site et se connecter avec son
   compte enseignant ou admin.

Sans l’étape 1, aucun assistant ne pourra se brancher.

## Partie A — Allumer le connecteur sur le serveur

À faire dans l’ordre. Demandez de l’aide à la personne qui gère l’hébergement si besoin.

### A1. Mettre le site à jour

Le code du connecteur doit être déployé (dernière version du site). Les mises à jour de base
de données associées passent en général toutes seules au redémarrage.

### A2. Poser les réglages d’environnement

Dans les variables de l’application (cPanel « Setup Node.js App », ou fichier `.env` du
serveur), ajouter au minimum :

| Réglage               | Valeur                                      | Pourquoi                                                      |
| --------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| `MCP_ENABLED`         | `true`                                      | Allume le connecteur                                          |
| `MCP_PUBLIC_BASE_URL` | `https://votre-domaine` (sans `/` à la fin) | Doit être **exactement** l’adresse du site ForêtMap (pas G&L) |

Recommandé aussi : un jeton long pour le rapport de santé (`MCP_HEALTH_TOKEN`), et vérifier
que l’envoi d’e-mails (`SMTP_…`) fonctionne si vous voulez les alertes.

Gardez `MCP_SQL_ENABLED` à `false` sauf besoin particulier (réglage avancé).

### A3. Redémarrer l’application

Bouton « Restart » de l’hébergeur, ou équivalent. Sans redémarrage, les nouveaux réglages
ne sont pas pris en compte.

### A4. Contrôler que le serveur répond

Sur un poste qui a Node.js et le dépôt (ou depuis le serveur) :

```bash
npm run mcp:activate-check -- --base https://votre-domaine
```

Le script doit indiquer que `/mcp` répond « non autorisé » (c’est normal sans connexion) et
que les pages d’autorisation sont visibles. S’il échoue, corrigez d’abord le serveur avant
d’ouvrir un assistant.

Contrôle plus poussé (connexion complète avec un compte admin) :

```bash
npm run mcp:smoke
```

(il faut fournir l’URL et les identifiants via des variables d’environnement — voir la doc
technique).

### A5. Pare-feu / protection du site (si vous en avez une)

Si un filtre bloque les robots ou certaines adresses, autorisez les chemins `/mcp`,
`/oauth/…` et `/.well-known/oauth-…`. Sinon la page de connexion ne s’ouvrira pas depuis
l’assistant. Détail technique : doc d’exploitation du connecteur.

### A6. Permission sur les comptes

Dans **Profils & utilisateurs**, les profils admin et n3boss ont en général la permission
**« Connecteur MCP »**. Sans cette permission, la page de connexion du site refuse le compte.

---

## Partie B — Brancher un assistant (même adresse pour tous)

Adresse à utiliser partout :

**`https://votre-domaine/mcp`**

(remplacez `votre-domaine` par l’adresse réelle du site ForêtMap.)

Puis, selon l’assistant :

### Claude (site, bureau ou téléphone)

1. Réglages → **Connecteurs** → **Ajouter un connecteur personnalisé**.
2. Collez l’adresse `…/mcp` → **Connecter**.
3. Page du site : identifiant, mot de passe, code à 6 chiffres si double authentification.
4. **Autoriser**.

### Claude Code (terminal)

```bash
claude mcp add --transport http foretmap https://votre-domaine/mcp
```

Puis dans Claude Code : `/mcp` → `foretmap` → Authenticate (même page du site).

### Cursor

1. Dans l’environnement Windows (ou le shell), définir :
   `FORETMAP_MCP_URL=https://votre-domaine/mcp`
2. Redémarrer Cursor.
3. Réglages → **MCP** : le serveur **`foretmap`** doit apparaître ; lancer
   l’authentification (navigateur → page du site → Autoriser).

Le serveur **`foretmap-diagnostics`** (santé du site via un secret de déploiement) est
**autre chose** : utile pour le diagnostic, pas pour le contenu pédagogique.

### ChatGPT

1. Selon votre compte : mode développeur / applications MCP / connecteur personnalisé.
2. Ajoutez un serveur MCP avec l’URL `…/mcp` et l’authentification OAuth.
3. Suivez la page du site (identifiants → Autoriser).

### Gemini CLI

Dans la config MCP de Gemini CLI, ajoutez une entrée avec l’URL `…/mcp`, puis lancez la
connexion OAuth (navigateur local). **Gemini Enterprise** (offre pro avec secret client)
n’est pas supporté.

---

## Après la connexion : premiers essais

Dans l’assistant, essayez par exemple :

- « Fais une revue du contenu pédagogique du site »
- « Cherche l’espèce [nom] »
- (admin) « Comment va le site ? »

Si l’assistant dit qu’il n’a pas d’outils ou que la connexion a échoué : revérifiez la
partie A avec `npm run mcp:activate-check`, puis retirez et rajoutez le connecteur côté
assistant.

## ⚠️ Points d’attention

- L’adresse **`MCP_PUBLIC_BASE_URL`** doit être **identique** à celle saisie dans
  l’assistant (`https`, pas de `www.` en trop ou en moins, pas de `/` final).
- Ce que vous écrivez à l’assistant et les réponses du connecteur passent chez le
  **fournisseur de cet assistant** (Anthropic, OpenAI, Google, Cursor…). Voir la fiche
  registre et le DPO avant d’ouvrir largement.
- Aucune donnée d’élève nominative n’est exposée en mode normal. Des options avancées
  (mode productivité) existent pour les admins : elles restent **éteintes** tant qu’on ne
  les allume pas volontairement.
- Pour **couper** le connecteur pour tout le monde : `MCP_ENABLED=false` puis redémarrer.
  Pour un seul compte : retirer la permission « Connecteur MCP ».

## Pour les curieux

Checklist technique complète : `docs/MCP.md` (section « Activer en production »). Script de
contrôle : `npm run mcp:activate-check`. Fiche qui décrit ce que fait le connecteur au
quotidien : [connecteur-claude.md](connecteur-claude.md).
