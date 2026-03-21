---
name: foretmap-evolution
description: S'appuie sur les recommandations d'évolution du projet ForetMap (audit). À utiliser quand on planifie ou implémente des changements de sécurité, d'architecture, de données, de tests ou de configuration sans casser le comportement actuel.
---

# Évolution du code ForetMap

## Quand utiliser ce skill

- Planification ou implémentation d'une évolution listée dans [docs/EVOLUTION.md](docs/EVOLUTION.md).
- Refactoring, amélioration de sécurité, changement d'architecture, migration de schéma.
- Ajout ou amélioration de tests.

## Quand ne pas l'utiliser

- Bug fix simple ou feature courante sans impact architectural : préférer **foretmap-project**.
- Release ou versionnage uniquement : préférer **foretmap-versioning**.

## Checklist avant toute évolution

1. **Lire** `docs/EVOLUTION.md` (section concernée) pour connaître le contexte et la solution proposée.
2. **Vérifier l'ordre** suggéré (§ 5 du document) — respecter les dépendances entre étapes.
3. **Identifier les fichiers impactés** à l'aide du tableau ci-dessous.
4. **Tester le comportement actuel** avant de modifier (lancer `npm test` ou vérifier manuellement).
5. **Implémenter par petites étapes** : un commit par changement logique, pas de big-bang.
6. **Valider** : relancer les tests, vérifier qu'aucune régression n'est introduite.
7. **Documenter** : mettre à jour `CHANGELOG.md` (section `[Non publié]`) et, si nécessaire, `docs/EVOLUTION.md`.

## Référence

Toutes les recommandations détaillées sont dans **docs/EVOLUTION.md** (à la racine du projet). Ce skill rappelle les priorités et les fichiers concernés.

## Priorités (résumé)

1. **Haute — Sécurité :** Auth côté serveur pour les actions « prof » (middleware JWT + vérification PIN côté serveur). Supprimer le PIN du frontend. Restreindre CORS en production.
2. **Moyenne :** Renforcer la non-régression UI automatisée et l’intégration CI e2e.
3. **Basse :** Maintenance continue des scripts/docs post-bascule image.

## État d'avancement

| Évolution | Statut |
|-----------|--------|
| Auth serveur JWT + middleware `requireTeacher` | Fait |
| CORS restreint en production | Fait |
| Découpage backend en `routes/` | Fait |
| Script `dev` avec nodemon | Fait |
| Logger Pino + trace erreurs | Fait |
| Tests backend (auth, statuts, suppression) | Fait (base) |
| Supprimer PIN du frontend | Fait |
| Images sur disque (au lieu de base64) | Fait |
| Migration frontend Vite | Fait |
| Migrations de schéma versionnées | Fait |

## Fichiers à modifier selon le sujet

| Sujet | Fichiers |
|-------|----------|
| Auth / PIN / CORS | `server.js`, `middleware/requireTeacher.js`, `routes/auth.js`, `src/components/auth-views.jsx` |
| Images | `routes/zones.js`, `routes/tasks.js`, `database.js` (schéma), `lib/uploads.js` |
| Tests | `tests/`, `tests/helpers/setup.js`, `package.json` |
| Migration Vite | `src/`, `vite.config.js`, `package.json`, `index.vite.html` |
| Schéma / migrations | `database.js`, `sql/schema_foretmap.sql`, `migrations/` |
| Config | `package.json`, `.env.example`, `docker-compose.yml` |

Lire systématiquement le fichier `docs/EVOLUTION.md` à la racine du projet avant d'implémenter une évolution pour respecter le plan et l'ordre suggéré.

## Voir aussi

- Règles Cursor : `.cursor/rules/foretmap-conventions.mdc`, `foretmap-backend.mdc`, `foretmap-frontend.mdc`
- Skill contexte : `.cursor/skills/foretmap-project/SKILL.md`
