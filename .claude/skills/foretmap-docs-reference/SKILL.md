---
name: foretmap-docs-reference
description: Documentation de référence fonctionnelle non technique (docs/reference/) pour admins, profs et MJ — rédaction, maintien perpétuel, traitement des modifications utilisateur comme demandes de changement. À utiliser à chaque lot qui change un comportement visible utilisateur, à chaque rédaction/relecture d'un doc de référence, et au début d'une tâche pour détecter les marqueurs « 🔧 À implémenter ».
---

# Documentation de référence fonctionnelle (`docs/reference/`)

## Rôle du dossier

`docs/reference/` décrit **ce que font les applications, pour qui, et comment on s'en
sert** — en français simple, sans jargon technique. Trois fonctions :

1. **État de l'existant** (avec ses défauts, signalés en encadrés ⚠️).
2. **Base d'évolution** : l'utilisateur édite ces documents pour décrire le comportement
   souhaité ; ces éditions valent demandes de changement pour le code.
3. **Documentation finale** pour non-codeurs (fonctionnel, pédagogique, ludique).

Structure : `docs/reference/README.md` (index + règles), `docs/reference/foretmap/*.md`,
`docs/reference/gl/*.md`. Un doc de présentation générale par application renvoie vers
les docs spécifiques.

## Workflow 1 — Après une modification de code (obligatoire, même lot)

1. Le lot change-t-il quelque chose de **visible pour un utilisateur** (élève, prof,
   joueur, invité, MJ, admin) ? Si oui :
2. Mettre à jour le(s) document(s) concerné(s) de `docs/reference/` (comportement décrit
   au présent, vocabulaire utilisateur).
3. Si le sujet n'a pas encore de doc spécifique : soit l'ajouter brièvement au doc de
   présentation, soit créer le doc spécifique et l'ajouter au sommaire du README
   (statut ✅).
4. Si le lot **résout** un marqueur `🔧 À implémenter` ou un encadré ⚠️ : retirer le
   marqueur/encadré et décrire le nouveau comportement.

## Workflow 2 — Détecter les demandes de changement de l'utilisateur

Au début d'une tâche (surtout si elle touche le fonctionnel) :

1. `grep -rn "🔧 À implémenter" docs/reference/` — chaque marqueur est une demande de
   changement à traiter ou à signaler.
2. En cas de divergence doc ↔ code constatée en cours de route : ne jamais réécrire
   silencieusement le doc pour l'aligner sur le code. Demander/confirmer : bug du code ou
   évolution voulue ?
3. `git log -p -- docs/reference/` permet de voir ce que l'utilisateur a modifié à la main.

## Workflow 3 — Rédiger un nouveau doc de référence

1. Explorer le code pour établir les faits (routes, composants, règles métier) — mais ne
   **jamais** transposer le jargon dans le doc : pas de chemins de fichiers, de routes
   HTTP, de noms de tables ni de code.
2. Plan type : _À quoi ça sert_ → _Qui l'utilise_ → _Comment ça se passe_ (pas à pas, du
   point de vue de chaque rôle) → _⚠️ Points d'attention_ → _Renvois_.
3. Signaler honnêtement incohérences / confusions / inachevé en encadrés
   **⚠️ Points d'attention**.
4. Mettre à jour le sommaire de `docs/reference/README.md` (ligne + statut).
5. Respecter l'isolement des produits : ForetMap et GL ne se mélangent pas.

## Style

- Français, phrases complètes, ton d'un guide utilisateur.
- Vocabulaire des utilisateurs (zones, plantes, tâches, chapitres, marché, sorts, PIN…).
- Encadrés : `> ⚠️ **Point d'attention** — …` et `🔧 À implémenter : …`.
- Public : admins / profs / MJ ; jamais supposer de connaissance en programmation.

## Voir aussi

- Règle : `.cursor/rules/foretmap-docs-reference.mdc` (alwaysApply)
- Index : `docs/reference/README.md`
- Docs techniques (autre public) : `docs/API.md`, `docs/EVOLUTION.md`
