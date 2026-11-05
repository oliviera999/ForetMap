# Activer le connecteur MCP (tous les assistants)

> **Public : administrateur du site et personne qui gère l’hébergement.** Guide pas à pas,
> sans jargon. Une fois le serveur prêt, chaque assistant (Claude, Cursor, ChatGPT, Gemini
> CLI…) se branche de la même façon sur l’adresse `…/mcp`. Retour au sommaire :
> [../README.md](../README.md)

## En deux temps

1. **Côté site** (une seule fois) : allumer le connecteur sur le serveur, puis le régler
   depuis l’administration si besoin.
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

N’ajoutez **pas** d’autre réglage `MCP_…` : tout le reste se règle depuis l’administration du
site (partie B). Un réglage `MCP_…` posé sur le serveur **verrouille** l’option correspondante :
elle apparaît alors grisée, « fixé par le serveur », et ne se change plus que sur le serveur.

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

## Partie B — Régler le connecteur (administration du site)

**Réglages → Exploitation → « Connecteur Claude ».** Tout y est **ouvert par défaut** : Claude
peut lire et modifier le site, comme la personne connectée.

Pour chaque option, vous voyez sa valeur, d’où elle vient (**serveur** = fixée par une
variable d’environnement, grisée ; **réglage** = choisie ici ; **défaut**) et une phrase
d’aide. Les principales :

| Option                                    | Ce qu’elle change                                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Écritures par Claude                      | Appliquées tout de suite (défaut), ou proposées en plan à valider avant application                    |
| Qui peut écrire par Claude                | Chacun avec ses droits dans le site (défaut), ou les administrateurs seulement                         |
| Claude peut utiliser toutes les fonctions | Créer, valider, archiver… exactement comme dans le site                                                |
| Domaines retirés                          | Retirer un domaine entier à Claude (ex. `students`, `ops`)                                             |
| Lecture / correction SQL                  | Réservées aux administrateurs ; la correction SQL contourne les règles du site : à garder pour réparer |
| Code par e-mail                           | Jamais (défaut), pour les actions sensibles, ou pour toute écriture                                    |
| Données nominatives des élèves            | Lisibles et modifiables par les administrateurs (défaut) ; chaque lecture est notée au journal         |
| Exploitation                              | Tâches planifiées, mises à jour de la base, redémarrage, sauvegardes (administrateurs)                 |

L’encart d’état indique combien d’outils voit un administrateur, un n3boss et un prof de
classe, si les données nominatives sont accessibles, et les **vingt dernières actions** faites
par Claude (qui, quel outil, quelle action, quand).

Le bouton **« Couper l’écriture »** arrête d’un geste toute modification par Claude (fonctions du
site, correction SQL, écritures de contenu passées en plan à valider). Les lectures restent
possibles. Pour rouvrir, remettez les options une par une.

### Ce qu’un professeur peut faire par Claude

Avec le réglage par défaut, un n3boss connecté au connecteur peut faire par Claude **ce qu’il
peut déjà faire dans le site, et rien de plus** : créer et valider des tâches, gérer ses
projets, ses groupes, les fiches espèces… Si le site lui refuse une action, Claude reçoit le
même refus. Un prof de classe n’a pas le connecteur par défaut (permission « Connecteur MCP » à
lui accorder si besoin).

Restent **réservés à l’administrateur** : la lecture et la correction de la base en SQL, les
données nominatives des élèves, l’exploitation (redémarrage, mises à jour, sauvegardes) et
l’écriture directe des champs de contenu.

### Ce qui ne change jamais

- Les mots de passe, codes de double authentification, jetons et secrets du serveur ne sortent
  **jamais** vers l’assistant.
- Tout ce que Claude modifie, et chaque lecture de données d’élèves, est **noté au journal**
  avec la mention « via Claude ».

---

## Partie C — Brancher un assistant (même adresse pour tous)

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
- « Liste les tâches à valider de la carte [nom] » puis « Valide la tâche [titre] »
- « Exporte le bilan des tâches de l’année en tableur »

Si l’assistant dit qu’il n’a pas d’outils ou que la connexion a échoué : revérifiez la
partie A avec `npm run mcp:activate-check`, puis retirez et rajoutez le connecteur côté
assistant.

## ⚠️ Points d’attention

- L’adresse **`MCP_PUBLIC_BASE_URL`** doit être **identique** à celle saisie dans
  l’assistant (`https`, pas de `www.` en trop ou en moins, pas de `/` final).
- Ce que vous écrivez à l’assistant et les réponses du connecteur passent chez le
  **fournisseur de cet assistant** (Anthropic, OpenAI, Google, Cursor…). Voir la fiche
  registre et le DPO avant d’ouvrir largement.
- Les données nominatives des élèves sont **accessibles aux administrateurs par défaut**
  (option « Données nominatives des élèves »). Avant de s’en servir, voir la fiche registre et
  le DPO ; pour les couper, décochez l’option (ou posez `MCP_PRIVACY_BYPASS=false` sur le
  serveur pour les verrouiller).
- Pour **couper** le connecteur pour tout le monde : `MCP_ENABLED=false` puis redémarrer.
  Pour un seul compte : retirer la permission « Connecteur MCP ». Pour arrêter seulement les
  modifications : bouton « Couper l’écriture » (partie B).

## Pour les curieux

Checklist technique complète : `docs/MCP.md` (section « Activer en production »). Script de
contrôle : `npm run mcp:activate-check`. Fiche qui décrit ce que fait le connecteur au
quotidien : [connecteur-claude.md](connecteur-claude.md).
