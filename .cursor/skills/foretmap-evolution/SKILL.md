---
name: foretmap-evolution
description: S’appuie sur les recommandations d’évolution du projet ForetMap (audit). À utiliser quand on planifie ou implémente des changements de sécurité, d’architecture, de données ou de tests sans casser le comportement actuel.
---

# Évolution du code ForetMap

## Référence

Toutes les recommandations détaillées sont dans **docs/EVOLUTION.md** (à la racine du projet). Ce skill rappelle les priorités et les fichiers concernés.

## Priorités (résumé)

1. **Haute — Sécurité :** Auth côté serveur pour les actions « prof » (middleware + vérification PIN), supprimer le PIN du frontend, optionnellement restreindre CORS en production.
2. **Moyenne :** Lockfile, script `dev` (nodemon), découpage du backend en routes, images sur disque au lieu de base64.
3. **Basse :** Tests (auth, statuts tâches, suppression élève), migration frontend React + Vite, migrations de schéma versionnées.

## Fichiers à modifier selon le sujet

- **Auth / PIN / CORS :** `server.js`, `public/index.html` (PinModal).
- **Découpage backend :** nouveau dossier `routes/`, puis `server.js` (montage des routeurs).
- **Images :** `server.js` (routes zones/tasks), `database.js` (schéma).
- **Tests :** nouveau dossier `tests/` ou `__tests__/`, `package.json`.
- **Config :** `package.json` (lockfile, script dev).

Lire systématiquement le fichier docs/EVOLUTION.md à la racine du projet avant d’implémenter une évolution pour respecter le plan et l’ordre suggéré.
