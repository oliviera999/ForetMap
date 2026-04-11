---
name: foretmap-e2e
description: Centralise les conventions Playwright ForetMap (scénarios UI élève/prof, stabilité locale et CI). À utiliser quand on écrit, modifie ou exécute des tests e2e.
---

# Tests e2e ForetMap (Playwright)

## Quand utiliser ce skill

- Création, correction ou extension de scénarios dans `e2e/`.
- Stabilisation des tests UI en CI (timeouts, attentes, ordre des actions).
- Vérification des parcours élève/prof après une évolution frontend ou API.

## Quand ne pas l'utiliser

- Tests backend API/unitaires (`node:test` + supertest) : préférer **foretmap-tests**.
- Évolution d'architecture globale : préférer **foretmap-evolution**.

## Commandes

```bash
npm run test:e2e
npm run test:e2e:headed
```

Les deux enchaînent **`node scripts/e2e-kill-listen-port.js`** (hors CI) pour libérer le port d’écoute (souvent **3000**) avant Playwright, puis lancent la suite. Cela évite de réutiliser par erreur un **vieux `node server.js`** sans le mode e2e.

## Démarrage du serveur (local, hors CI)

- **`playwright.config.js`** charge **`.env`** (`require('dotenv').config()`) pour que **`TEACHER_PIN`** (et le reste) soient alignés avec le serveur lors des tests qui élèvent le mode prof (PIN saisi = `E2E_ELEVATION_PIN` ou `TEACHER_PIN` ou `1234` par défaut dans la fixture).
- Après import d'un dump de prod, vérifier la cohérence entre `.env` (`TEACHER_PIN`) et la table `role_pin_secrets` : sinon l'élévation prof échoue malgré un PIN "correct" côté fichier.
- Hors CI, Playwright démarre **`npm run db:init && npm run start:e2e`**.
- **`npm run start:e2e`** exécute **`node server.js --foretmap-e2e-no-rate-limit`**, ce qui positionne **`E2E_DISABLE_RATE_LIMIT=1`** au démarrage. Sur Windows, seule la variable d’environnement (sans ce flag) peut **ne pas** atteindre le process Node : le flag CLI est la source de vérité pour le bypass du **rate limiting** (`429` « Trop de requêtes » sur l’inscription ou les formulaires).
- **`webServer.env`** du config Playwright redonde encore **`E2E_DISABLE_RATE_LIMIT=1`** ; le flag CLI reste indispensable pour la fiabilité.

### Réutiliser un serveur déjà lancé

- Variable **`E2E_REUSE_SERVER=1`** : Playwright ne redémarre pas le serveur si **`baseURL/api/health`** répond.
- Le serveur réutilisé **doit** être lancé avec **`npm run start:e2e`** (ou équivalent avec le flag **`--foretmap-e2e-no-rate-limit`**) et un **`dist/`** à jour si vous servez la prod locale, sinon les tests peuvent échouer ou subir le rate limit.

### À éviter

- Lancer **`npx playwright test …`** seul alors qu’un **`npm start`** classique occupe déjà le port : Playwright peut réutiliser ce process (**sans** bypass) → **429** ou code obsolète.
- Préférer **`npm run test:e2e`** pour la suite complète locale.

## Fichiers clés

| Fichier/Dossier | Rôle |
|-----------------|------|
| `e2e/` | Scénarios Playwright (auth, tâches, photos, temps réel, cas PIN invalide) |
| `e2e/fixtures/auth.fixture.js` | Inscription, login, mode prof (`enableTeacherMode` / `disableTeacherMode`), onglets tâches |
| `e2e/fixtures/visit-api.fixture.js` | Seed / cleanup **zones et repères visite** via `page.request` + JWT `foretmap_teacher_token` (scénarios déterministes, ex. mascotte) |
| `e2e/visit-mascot.spec.js` | Mascotte visite : position initiale N3, déplacement au clic (% sur `.visit-map-fit-layer`), classe **walking**, `prefers-reduced-motion` |
| `scripts/e2e-kill-listen-port.js` | Libère le port HTTP (Windows : `taskkill` via `netstat`) avant les runs |
| `playwright.config.js` | Workers, timeouts, `webServer`, `serviceWorkers: 'block'`, dotenv |
| `package.json` | `test:e2e`, `test:e2e:headed`, **`start:e2e`** |
| `server.js` | Traitement du flag **`--foretmap-e2e-no-rate-limit`** en tout début de fichier |

## Conventions de rédaction

- Écrire des scénarios orientés comportement utilisateur (actions + résultat visible).
- Préférer des sélecteurs robustes : **`getByRole`**, **`getByLabel`** (labels correctement liés aux champs dans le JSX : `htmlFor` / `id`), texte stable.
- Libellés prof pour les statuts tâche : boutons du type **`✔️ Validée`**, toasts du type **`Statut mis à jour : Validée`** (pas de bouton « Valider » générique si l’UI a changé).
- Apostrophe dans « Je m'en occupe » : prévoir **`/Je m['\u2019]en occupe/`** (ASCII ou typographique).
- Garder les tests indépendants : chaque spec prépare ses prérequis.
- Couvrir en priorité les flux critiques avant les cas rares.
- En cas de flaky test, corriger la synchronisation (attentes explicites) avant d’augmenter brutalement les timeouts.

### Visite — mascotte (e2e)

- Le conteneur **`.visit-map-mascot`** est en **0×0** (ancrage en %) : Playwright le considère souvent **non visible** ; cibler **`.visit-map-mascot-inner`** (ou le Lottie) pour **`toBeVisible`**.
- Les élèves **N3 + Forêt** ouvrent souvent la visite sur le plan **n3** : les données de test mascotte sont seedées sur **`map_id: 'n3'`** dans `visit-api.fixture.js` pour éviter un plan vide ou incohérent.
- Clics au pourcentage du plan : utiliser le **bounding box** de **`.visit-map-fit-layer`** (même repère que `left` / `top` des repères), pas seulement le stage 16/10.

## CI

- Le workflow GitHub démarre le serveur avec **`npm run start:e2e`** en arrière-plan, puis **`npm run test:e2e`** avec **`E2E_BASE_URL`** et les variables BDD de test. Pas de **`webServer`** Playwright en CI (`CI=true`).

## Priorités (alignées EVOLUTION)

1. Maintenir la non-régression sur les parcours critiques.
2. Étendre progressivement vers les cas limites (erreurs API, interruptions, concurrence).
3. Garder l'exécution CI stable et diagnosable (artefacts, logs utiles).

## Voir aussi

- Développement local : [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) (§ tests Playwright)
- Rate limit / charge : [docs/API.md](docs/API.md) (en-tête load test + mode e2e)
- Feuille de route : [docs/EVOLUTION.md](docs/EVOLUTION.md) (backlog § 2.1, séquence §§ 3-4)
- Skill backend tests : `.cursor/skills/foretmap-tests/SKILL.md`
- Règle frontend : `.cursor/rules/foretmap-frontend.mdc`
