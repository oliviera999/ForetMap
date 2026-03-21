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
- **Images majoritairement sur disque** : `uploads/` + colonnes `image_path` (fallback legacy conservé).
- **Lockfile et outillage dev** : `package-lock.json`, `nodemon`, scripts debug.
- **Journalisation et observabilité** : logger Pino, traces d’erreurs route, endpoint admin de lecture des logs.

## 1.2 Partiellement réalisé / restant

- **Décommission base64** : `image_data` reste présent pour compatibilité.
  - **Avancement** : scripts de migration/reporting disponibles (`npm run db:migrate:images:report`, `npm run db:migrate:images:dry`, puis `npm run db:migrate:images`, et option finale `npm run db:migrate:images:clear` après validation).
- **Durcissement sécurité production** : comportements permissifs utiles en dev, à verrouiller davantage en prod (secret JWT, endpoints admin, conventions de rotation).
- **Frontend** : certains composants restent volumineux (notamment `src/components/foretmap-views.jsx`).
- **Couverture tests** : bonne base, mais des zones critiques restent peu couvertes (config prod, admin/restart, cas limite upload/observations).

---

## 2. Backlog restant priorisé

## 2.1 Quick wins (faible risque, fort retour)

1. **Mettre la documentation en cohérence stricte avec le code**
   - Éviter les constats obsolètes (ex. “pas de tests”, “Vite à migrer”).
   - Aligner scripts annoncés et scripts réellement disponibles.

2. **Durcir les prérequis de configuration prod**
   - Documenter clairement les variables obligatoires/recommandées (`TEACHER_PIN`, `JWT_SECRET`, `FRONTEND_ORIGIN`, `DEPLOY_SECRET`).
   - Préciser les comportements de repli et leur impact sécurité.

3. **Documenter la sortie progressive du legacy image base64**
   - Garder la rétrocompatibilité court terme.
   - Définir la cible de fin (`image_path` uniquement) et les étapes de migration.
   - **Fait partiellement** : script et commandes de migration ajoutés, suppression finale de `image_data` encore différée.

## 2.2 Moyen terme

4. **Étendre les tests ciblés**
   - Cas de sécurité prof (token invalide/expiré).
   - Endpoints admin sensibles (`/api/admin/restart`, `/api/admin/logs`).
   - Parcours images (création/suppression, fichier manquant, fallback legacy).

5. **Poursuivre le découpage du frontend**
   - Scinder `foretmap-views.jsx` par domaines (carte, tâches, auth, stats, audit, à-propos).
   - Réduire le coût des changements et améliorer la lisibilité.

## 2.3 Long terme

6. **Finaliser la migration des données image**
   - Migration SQL + script de conversion éventuel vers `image_path`.
   - Retrait progressif des colonnes `image_data` après fenêtre de transition.

7. **Renforcer la stratégie de déploiement**
   - Contrôles de santé et rollback documentés.
   - Clarifier le flux recommandé entre build local, livraison `dist/`, et redémarrage.
   - **Avancement** : script post-déploiement ajouté (`npm run deploy:check`) pour valider `/api/health`, `/api/health/db` et `/api/version`.

---

## 3. Plan d’exécution proposé (suite)

## Phase 1 — Documentation vérité terrain (quick win)

- Mettre à jour `docs/EVOLUTION.md` et les docs annexes pour refléter l’existant.
- Garder trois statuts explicites : **réalisé**, **partiel**, **à faire**.
- Produire un ordre d’action centré uniquement sur ce qui reste.

## Phase 2 — Quick wins techniques

- Aligner `README.md`, `docs/LOCAL_DEV.md` et `package.json` sur le flux dev actuel.
- Formaliser les prérequis prod et les valeurs de secours acceptées.
- Poser le plan de sortie du legacy base64 (sans suppression immédiate).

## Phase 3 — Itérations structurantes

- Ajouter les tests manquants sur les points à plus fort risque de régression.
- Continuer la modularisation frontend.
- Préparer/valider la migration data image complète.

---

## 4. Ordre suggéré des actions (à partir de maintenant)

| Ordre | Action | Priorité |
|-------|--------|----------|
| 1 | Cohérence docs + scripts (quick wins) | Haute |
| 2 | Clarification/hardening config prod | Haute |
| 3 | Plan de sortie `image_data` legacy | Moyenne |
| 4 | Tests ciblés sécurité/admin/images | Moyenne |
| 5 | Découpage progressif du frontend | Moyenne |
| 6 | Migration finale des données image | Basse |

---

## Versionnage

Le flux SemVer, `CHANGELOG.md` et les scripts `bump:*` / `release:*` sont décrits dans [VERSIONING.md](VERSIONING.md).
Ce document est mis à jour au fil des évolutions implémentées.
