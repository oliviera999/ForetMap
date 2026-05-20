---
name: foretmap-gl-qa-personae
description: Routine d'audit QA UX pour Gnomes & Licornes (joueur, MJ, admin). À utiliser après un lot GL critique.
---

# QA personae GL

## Quand utiliser ce skill

- Après un lot GL touchant auth, gameplay, Socket.IO, mascottes, permissions.
- Avant merge d’un lot GL large (backend + e2e + UI).

## Personae minimaux

1. **Joueur classe (Chromebook)**
   - Connexion pseudo + PIN
   - Consultation chapitre
   - Soumission d’action
2. **MJ tablette (1024x768)**
   - Connexion staff
   - Démarrage / pause / fin partie
   - Résolution d’actions pending
3. **Admin desktop**
   - Gestion classes/joueurs
   - Réglages gameplay
   - Contrôle contenus / chapitres

## Checklist courte

- Auth : 401/403 explicites, pas de blocage silencieux.
- Permissions : chaque route admin GL refuse un joueur.
- Temps réel : au moins un event `gl:game:event` reçu côté client.
- Accessibilité : navigation clavier sur `GLAuthView`, labels visibles.
- Responsive : aucun débordement critique sur viewport tablette/mobile.

## Rapport attendu

- Gravité (bloquant/majeur/mineur)
- Persona impactée
- Étapes de reproduction
- Correctif testable (API/e2e/UI)
