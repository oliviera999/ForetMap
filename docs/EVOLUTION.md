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

## 1.2 Partiellement réalisé / restant

- **Frontend** : certains composants restent volumineux (notamment `src/components/foretmap-views.jsx`).
- **Couverture tests** : bonne base, mais des zones critiques restent peu couvertes (notamment découpage frontend et parcours UI complets).

---

## 2. Backlog restant priorisé

## 2.1 Quick wins (faible risque, fort retour)

1. **Finaliser la doc opérationnelle serveur**
   - Vérifier que les pages d’exploitation mentionnent systématiquement `deploy:check:prod` pour les interfaces sans arguments.
   - Garder la checklist lock/restart o2switch à jour.
   - **Avancement** : doc d’exploitation dédiée ajoutée (`docs/EXPLOITATION.md`).

## 2.2 Moyen terme

3. **Étendre les tests ciblés**
   - Parcours images (création/suppression, fichier manquant, bascule post-`clear`).
   - Vérifications de scripts d’exploitation (reporting/migration/check déploiement).
   - **Avancement** : tests scripts `post-deploy-check` renforcés (réponses HTTP réelles), et tests images d’observations ajoutés (lecture fichier + fichier manquant).

4. **Poursuivre le découpage du frontend**
   - Scinder `foretmap-views.jsx` par domaines (carte, tâches, auth, stats, audit, à-propos).
   - Réduire le coût des changements et améliorer la lisibilité.

## 2.3 Long terme

5. **Stabiliser la maintenance post-bascule image**
   - Conserver les scripts de migration/reporting en mode no-op explicite une fois le legacy retiré.
   - Documenter le mode “disk-only” dans les guides d’exploitation et de dev.

---

## 3. Plan d’exécution proposé (suite)

## Phase 1 — Documentation vérité terrain (quick win)

- Mettre à jour `docs/EVOLUTION.md` et les docs annexes pour refléter l’existant.
- Garder trois statuts explicites : **réalisé**, **partiel**, **à faire**.
- Produire un ordre d’action centré uniquement sur ce qui reste.

## Phase 2 — Quick wins techniques

- Aligner `README.md`, `docs/LOCAL_DEV.md` et `package.json` sur le flux dev actuel.
- Formaliser les prérequis prod et les valeurs de secours acceptées.
- Stabiliser le mode “disk-only” après retrait du legacy base64.

## Phase 3 — Itérations structurantes

- Ajouter les tests manquants sur les points à plus fort risque de régression.
- Continuer la modularisation frontend.
- Renforcer les tests post-bascule image (mode disque uniquement).

---

## 4. Ordre suggéré des actions (à partir de maintenant)

| Ordre | Action | Priorité |
|-------|--------|----------|
| 1 | Vérification doc d’exploitation serveur (`deploy:check:prod`) | Haute |
| 2 | Tests ciblés scripts/images en mode disk-only | Moyenne |
| 3 | Découpage progressif du frontend | Moyenne |
| 4 | Maintenance outillage migration (no-op explicites) | Basse |

---

## Versionnage

Le flux SemVer, `CHANGELOG.md` et les scripts `bump:*` / `release:*` sont décrits dans [VERSIONING.md](VERSIONING.md).
Ce document est mis à jour au fil des évolutions implémentées.
