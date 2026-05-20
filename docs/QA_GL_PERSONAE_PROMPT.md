# Prompt QA GL (personae)

Objectif: valider un lot Gnomes & Licornes avec 3 personae et remonter des correctifs actionnables.

## Personae à couvrir

1. Joueur (classe, Chromebook)
2. MJ (tablette, 1024x768)
3. Admin (desktop)

## Parcours obligatoires

- Joueur: login pseudo/PIN, lecture chapitre, action joueur.
- MJ: login staff, gestion statut partie, résolution action.
- Admin: gestion classes/joueurs, réglages gameplay, contenus GL.

## Cas limites obligatoires

- Champs invalides (400)
- Permission insuffisante (403)
- Token absent/invalide (401)
- Reconnexion Socket.IO
- Double soumission formulaire

## Format de rapport

- ID
- Gravité
- Persona
- Reproduction
- Résultat attendu / observé
- Piste de correction
