# Évolution du code ForetMap — État réel et suite

Ce document sert de feuille de route d’évolution **sans changement métier non souhaité**.
Il a été mis à jour pour refléter l’état réel du dépôt (mars 2026), puis prioriser la suite en commençant par des quick wins.

---

## 1. État actuel (2026-03)

## 1.1 Réalisé

- **Auth professeur côté serveur** : `POST /api/auth/teacher`, token JWT, middleware `requireTeacher` sur les routes sensibles.
- **Suppression du PIN en dur côté client** : plus de vérification locale ; le front passe par l’API auth.
- **CORS conditionnel** : origine restreinte en production via `FRONTEND_ORIGIN`.
- **Backend découpé en routeurs** : `routes/auth`, `zones`, `tasks`, `plants`, `stats`, `students`, `map`, `observations`, `audit`.
- **Frontend migré vers Vite + React modulaire** : source dans `src/`, build `dist/`, entrée `index.vite.html`.
- **Tests backend en place** (node:test + supertest) : auth, statuts tâches, suppression élève, temps réel, nouvelles fonctionnalités.
- **Migrations versionnées** : table `schema_version`, dossier `migrations/` (001+).
- **Images sur disque (source unique)** : `uploads/` + `image_path` côté API/frontend.
- **Retrait legacy base64 réalisé** : fallback `image_data` retiré du code et migration SQL de suppression des colonnes legacy ajoutée (`migrations/006_drop_legacy_image_data.sql`).
- **Lockfile et outillage dev** : `package-lock.json`, `nodemon`, scripts debug.
- **Journalisation et observabilité** : logger Pino, traces d’erreurs route, endpoint admin de lecture des logs.
- **Vérification de déploiement** : scripts `deploy:check` et `deploy:check:prod` (sans argument) pour contrôler `/api/health`, `/api/health/db`, `/api/version`.
- **Tests UI smoke Playwright** : infrastructure e2e ajoutée (`playwright.config.js`, `e2e/`) pour couvrir les parcours critiques élève/prof.
- **CI enrichie avec e2e** : le workflow CI exécute désormais les tests Playwright smoke après build et démarrage applicatif.
- **Modularisation frontend avancée** : extraction des vues `stats`, `audit`, `about` hors de `foretmap-views.jsx` vers des modules dédiés.

## 1.2 Partiellement réalisé / restant

- **Frontend (partiellement réalisé)** :
  - `auth`, `tâches`, `carte`, `stats`, `audit`, `about` sont désormais extraits en modules dédiés.
  - **Reste à faire** : éventuel nettoyage final de façade dans `foretmap-views.jsx` (optionnel, faible valeur métier).
- **Couverture tests (partiellement réalisé)** :
  - parcours critiques scripts/images déjà renforcés (`post-deploy-check`, images tâches/zones/observations en mode disque).
  - checklist de vérifications UI manuelles post-modularisation ajoutée dans `docs/EXPLOITATION.md` + tests UI smoke Playwright + exécution e2e en CI.
  - **Reste à faire** : élargir la couverture e2e (flux complets de validation tâche/photo, cas limites métiers) pour réduire la part de validation manuelle.

---

## 2. Backlog restant priorisé

## 2.1 Priorité haute

1. **Consolider les tests UI automatisés**
   - Étendre les scénarios Playwright au cycle complet tâches/photos (création, soumission, validation, erreurs).
   - Stabiliser les sélecteurs et jeux de données de test pour limiter la fragilité.

## 2.2 Priorité moyenne

2. **Maintenance continue post-bascule image**
   - Maintenir les scripts/reportings en mode no-op explicite quand il n’y a plus de legacy.
   - Garder la documentation “disk-only” alignée avec l’état réel de prod/dev.

## 2.3 Priorité basse

3. **Nettoyage façade historique frontend (optionnel)**
   - Réduire encore `foretmap-views.jsx` si souhaité, sans changement de comportement.

---

## 3. Prochaine séquence recommandée

## Phase 1 — Renforcer la non-régression UI

- Étendre les specs Playwright smoke vers des scénarios complets.
- Ajouter des cas d’erreur (auth invalide, endpoint indisponible, média absent).

## Phase 2 — Industrialiser l’exécution

- Maintenir la stabilité des runs e2e CI (timeouts, artefacts, diagnostics).
- Ajuster les scénarios flaky au fil des retours pipeline.

## Phase 3 — Maintenance de routine

- Garder les docs et scripts de migration/reporting cohérents avec le mode disk-only.
- Continuer l’entretien de la couverture backend/scripts sur les points sensibles.

---

## 4. Ordre suggéré des actions (à partir de maintenant)

| Ordre | Action | Priorité |
|-------|--------|----------|
| 1 | Étendre les scénarios Playwright e2e (flux complets) | Haute |
| 2 | Maintenir scripts/docs post-bascule image (disk-only) | Moyenne |
| 3 | Nettoyage façade historique frontend (optionnel) | Basse |

---

## Versionnage

Le flux SemVer, `CHANGELOG.md` et les scripts `bump:*` / `release:*` sont décrits dans [VERSIONING.md](VERSIONING.md).
Ce document est mis à jour au fil des évolutions implémentées.
