---
name: foretmap-project
description: Donne le contexte du projet ForetMap (forêt comestible, Lycée Lyautey). À utiliser quand on travaille sur l’application ForetMap, l’API, la base MySQL, ou le frontend React (zones, tâches, plantes, élèves, mode prof).
---

# Contexte projet ForetMap

## Rôle de l’application

- **Élèves :** Connexion/inscription (prénom, nom, mot de passe), consultation de la carte des zones, prise de tâches, marquer une tâche comme faite (commentaire/image), voir ses stats.
- **Professeurs :** Accès via PIN (mode prof) pour gérer zones, plantes, tâches, voir les stats de tous les élèves, valider les tâches faites, supprimer un élève (avec cascade sur assignments/logs et recalcul des statuts de tâches).

## Stack

- **Backend :** Node.js, Express, MySQL (mysql2, pool). Fichiers : `server.js` (montage des routeurs), `database.js` (pool, schéma, seed), `routes/` (zones, plants, tasks, auth, stats, students, map), `middleware/requireTeacher.js`. Auth élèves : bcrypt, session en localStorage. Auth prof : PIN vérifié côté serveur, JWT.
- **Frontend :** React 18 (UMD) + Babel standalone, tout dans `public/index.html`. Pas de build. Thème « forêt » (couleurs CSS, mobile-first).

## Points d’attention

- Requêtes SQL toujours paramétrées (`?`). Mots de passe hashés bcrypt. Réponses API en JSON avec `error` en cas d’erreur.
- Comptes supprimés : l’API renvoie 401 avec `{ error: '...', deleted: true }` ; le front doit déconnecter et afficher un toast.
- Évolutions (sécurité, architecture, tests) : voir [docs/EVOLUTION.md](docs/EVOLUTION.md) à la racine du projet.

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `server.js` | Montage des routeurs `/api/*`, CORS, static, fallback SPA |
| `database.js` | Pool MySQL, `initDatabase()`, schéma, seed |
| `routes/*.js` | Routeurs (zones, plants, tasks, auth, stats, students, map) |
| `public/index.html` | App React complète (carte, zones, tâches, auth, mode prof via API) |
