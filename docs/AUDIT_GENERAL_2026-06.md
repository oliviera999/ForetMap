# Audit général ForetMap — Sécurité · Qualité · Performance · Maintenabilité

Date : 2026-06-16 · Version de référence : `1.58.20` · Branche d'application : `claude/dreamy-noether-jnilik` (PR #154)

Audit transversal du code à un instant donné, **mesuré** (outillage exécuté) et **recoupé**
(investigations multi-agents + vérifications ponctuelles). Il complète — sans les remplacer — le
tracker d'optimisation (`docs/AUDIT_OPTIMISATION.md`), l'inventaire de risques
(`docs/SITE_ISSUES.md`) et l'audit bugs (`docs/AUDIT_BUGS_INCOHERENCES.md`).

Périmètre : ~159 000 LOC (hors `node_modules`/`dist`). Backend Express commun servant deux
applications React 19 + Vite : **ForetMap** (`src/App.jsx`) et **GL « Gnomes & Licornes »**
(`src/gl/AppGL.jsx`). Hébergement o2switch mutualisé (Passenger, polling WAF), cible « classe / Wi-Fi » (≤10 VU).

## Verdict global

Codebase **saine et remarquablement disciplinée**, en refactoring actif (314 commits / 30 j).
Fondamentaux solides : SQL 100 % paramétré, XSS markdown sanitizé, secrets propres avec fail-fast prod,
CI complète, 1 716 tests UI verts. **Un seul vrai défaut de sécurité exploitable** a été trouvé
(XSS SVG stocké) — corrigé. La dette restante est surtout du **chantier d'extensibilité déjà en cours**
(God components, vues monolithiques, CSS global).

## État objectif mesuré (2026-06-16)

| Contrôle                    | Résultat                          | Détail                                                                                                    |
| --------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Build Vite                  | ✅ OK (~0,7 s)                    | `main` 356 Ko (97 Ko gz), `gl` 266 Ko, `react-vendor` 190 Ko, `rive` 166 Ko **lazy**, vues code-splittées |
| Tests UI (Vitest)           | ✅ 245 fichiers / **1 716 tests** | ~130 s                                                                                                    |
| Tests backend (`node:test`) | ⚠️ non exécutables hors CI        | MySQL requis (~142/241 fichiers) → CI MariaDB 11.4                                                        |
| ESLint                      | ✅ 0 erreur / ⚠️ warnings         | 392 `no-unused-vars` réels + 27 `react-hooks/exhaustive-deps` (185 `catch(_)` désormais ignorés)          |
| Prettier `--check`          | ✅ conforme (après PR #154)       | était ❌ 1 156 fichiers ; **gate `format:check` ajouté en CI**                                            |
| `npm audit`                 | 17 vulns                          | **3 prod modérées** (était 6 / 1 high) · 12 dev-only (dont `xlsx` high)                                   |
| Secrets committés           | ✅ aucun                          | `.env` ignoré, scan heuristique négatif                                                                   |

## Points sains à préserver

- **Data layer** (`database.js`) : helpers `queryAll/queryOne/execute/withTransaction` **100 % paramétrés**
  (`database.js:104-153`), aucune concaténation SQL avec entrée utilisateur. Invalidation cache RBAC par
  version d'écriture (`database.js:88-101`). 120 migrations versionnées.
- **Sécurité de base** : bcrypt (10 rounds), JWT cloisonné par claim `product` (foret/GL rejet croisé 403),
  reset password SHA-256 usage-unique + anti-énumération, `helmet`, rate-limit (1200/min + 20/15 min sur auth),
  `DEPLOY_SECRET` en `timingSafeEqual`, fail-fast prod si `JWT_SECRET`/`VISIT_COOKIE_SECRET` manquants.
- **XSS markdown** : tous les `dangerouslySetInnerHTML` passent par `src/utils/markdown.js` → `DOMPurify.sanitize`
  avec hooks de durcissement (`javascript:` bloqué, `src` d'images restreintes).
- **Uploads** : multer en `memoryStorage`, noms générés serveur (UUID+timestamp), allowlist MIME + magic bytes,
  anti zip-slip + anti zip-bomb (`lib/contentLibraryBulk.js`), `assertInsideUploads` (`lib/uploads.js:7-13`).
- **Observabilité** : 0 `console.log`, pino avec redaction des secrets, IP tronquées.

## Constats priorisés

Statuts : ✅ traité (PR #154) · ⏳ ouvert · 🔁 chantier en cours (tracker O5-O10).

### P0 — critique

| ID     | Constat                                                                                                                                                                                                                                                                                    | Preuve                                                       | Statut                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| **G1** | **XSS SVG stocké** : `image/svg+xml` en allowlist, non sanitizé, servi inline depuis `/uploads` sans `Content-Disposition`, CSP helmet désactivée → SVG malveillant exécuté en navigation directe ; combiné au JWT en `localStorage` ⇒ vol de session. Compte privilégié → tous visiteurs. | `lib/mediaLibrary.js:43,61,79` · `server.js:348-360,125-129` | ✅ CSP `sandbox` + `Content-Disposition: attachment` pour `.svg` |

### P1 — important

| ID     | Constat                                                                                                                    | Preuve                                                                                          | Statut                                                                                     |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **G2** | CVE **high `ws`** (divulgation mémoire + DoS) via la pile socket.io ; transport `websocket` actif côté GL.                 | `lib/realtime.js:84` · `npm audit`                                                              | ✅ override `ws@^8.21.0` (artillery `ws@7` préservé)                                       |
| **G3** | **CORS permissif par défaut** en prod sans origine configurée (reflet `*`, simple `warn`).                                 | `server.js:111-120` · `lib/env.js:47-48`                                                        | ✅ défaut `{ origin: false }` (same-origin)                                                |
| **G4** | **Prettier configuré mais non appliqué/gardé** : 1 156 fichiers non conformes, `format:check` absent de la CI.             | `.prettierrc.json` · `.github/workflows/ci.yml`                                                 | ✅ passe Prettier + gate CI                                                                |
| **G5** | **`React.memo` quasi absent** (2/313) ; les 4 vues lourdes (890-1 480 l, 10-17 props) re-rendues à chaque tick de polling. | `src/App.jsx:827`                                                                               | ✅ partiel : memo sur 4 vues + `updateZone` stabilisé ; reste props dérivées de `fetchAll` |
| **G6** | **N+1 d'écriture hors transaction** (DELETE+INSERT en boucle).                                                             | `routes/task-projects.js:85-104` · `routes/tutorials.js:77-82` · `routes/visit/sync.js:131-195` | ⏳ ouvert (cf. O10)                                                                        |
| **G7** | **Sûreté des migrations** : pas de lock (déploiement concurrent) ni transaction par migration (échec partiel).             | `database.js:368-413`                                                                           | ⏳ ouvert                                                                                  |

### P2 — durcissement / dette de fond

| ID      | Constat                                                                                                                                                                             | Preuve                                          | Statut                               |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------ |
| **G8**  | `security.password_min_length` défaut **4** (comptes staff/MJ inclus).                                                                                                              | `lib/settings.js:96`                            | ⏳ → 8-10                            |
| **G9**  | **JWT en `localStorage`** (amplifie tout XSS) ; **CSP `script-src` absente** (helmet `contentSecurityPolicy:false`).                                                                | `src/services/api.js` · `server.js:125,300-304` | ⏳ cookie httpOnly + CSP stricte SPA |
| **G10** | `displayName` interpolé sans échappement dans l'email de reset.                                                                                                                     | `lib/mailer.js:59-64`                           | ⏳ échapper                          |
| **G11** | 392 `no-unused-vars` réels (imports/constantes morts), souvent reliquats de refactor.                                                                                               | `npx eslint .`                                  | ⏳ nettoyage incrémental             |
| **G12** | `no-console` absent d'ESLint : les 0 `console.log` ne sont pas protégés contre régression.                                                                                          | `eslint.config.cjs`                             | ⏳ ajouter `no-console: warn`        |
| **G13** | God components / vues monolithiques / CSS global (`index.css` 5 491 l + `gl-theme.css` 6 695 l) ; couverture test inversée (0 test direct sur visit/profiles/foretmap/stats-views). | —                                               | 🔁 O5 / O6                           |
| **G14** | `try/catch` dispersés (293, −13 % vs baseline) ; `asyncHandler` adopté 36/39 routeurs.                                                                                              | —                                               | 🔁 O8                                |
| **G15** | `npm audit` prod résiduel : `qs` (DoS modéré, fix express dispo) ; `uuid` via `exceljs` (downgrade cassant requis).                                                                 | `npm audit --omit=dev`                          | ⏳ suivi deps                        |

## Détail sécurité (verdicts)

1. **`xlsx` (CVE high)** — ✅ **OK** : dev-only ; le parsing Excel runtime passe par `lib/spreadsheet.js` → `exceljs` (confirme O4).
2. **Auth / JWT** — ✅ **OK** : bcrypt 10 rounds, TTL 90 min (bornes 900 s–7 j), cloisonnement par claim `product`, reset robuste. Vigilance : `password_min_length=4` (G8).
3. **Uploads** — ⚠️ **1 risque** : XSS SVG (G1, corrigé). Reste solide par ailleurs.
4. **Helmet / CORS / rate-limit / DEPLOY_SECRET** — ✅ **OK** (réserve CORS G3, corrigée). CSP `script-src` absente (G9).
5. **Injection SQL** — ✅ **OK** : 100 % paramétré, aucune concaténation user-controlled. Note : `lib/sqliteGardenSqlExport.js` génère un `.sql` téléchargeable (pas un sink runtime), échappement maison correct.
6. **DOMPurify / XSS markdown** — ✅ **OK** : sanitization centralisée et durcie.

## Croisement avec le tracker `AUDIT_OPTIMISATION.md`

- `done` confirmés : **O1, O2, O3, O4, O9, O11, O13, O14**.
- `done` à nuancer : **O12** — Prettier était ajouté mais **non appliqué ni gardé** ; corrigé par PR #154 (passe + `format:check`).
- `wip` avancés : **O7** (zod adopté dans 32 routeurs / 65 appels via `lib/validate` — _résolu de fait_), **O8** (doublon `respondInternalError` _résolu_ ; dispersion try/catch partielle), **O10** (plus aucune route > 2000 l ; reste 4 > 1000 l), **O5/O6** (forte progression : 48 hooks extraits, 3 contextes, sous-composants ; vues racines + CSS restants).

## Suivi recommandé (hors quick-wins)

1. **G6** — batcher les N+1 de liaison (projets/tutoriels/sync) en INSERT multi-valeurs + `withTransaction` (idiome déjà appliqué à rbac/students/groups).
2. **G9** — CSP `script-src` stricte (nonce/hash) compatible SPA + envisager cookie httpOnly.
3. **G8 / G10 / G12** — durcissements rapides (mot de passe min, échappement email, règle `no-console`).
4. **G13 / G14** — poursuivre O5/O6/O8/O10 (extraction vues racines, tests d'intégration des grosses vues, migration des catches restants).
5. **G7** — lock advisory + transaction par migration avant tout déploiement multi-worker.

## Méthode & reproductibilité

```bash
npm ci
npm run lint            # ESLint (0 erreur attendu)
npm run format:check    # Prettier (conforme depuis PR #154)
npm run build           # Vite → dist/
npm run test:ui         # Vitest (245 fichiers / 1716 tests)
npm test                # backend node:test — nécessite MySQL/MariaDB
npm audit --omit=dev    # vulnérabilités runtime production
```

Investigation menée en agents parallèles (sécurité, frontend, backend/tests) sur périmètres de
fichiers disjoints, avec vérifications ponctuelles `fichier:ligne`. Aucune affirmation non sourcée.
