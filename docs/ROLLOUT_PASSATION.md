# Rollout d'optimisation ForetMap — Rapport de passation

> Document de fin de session (2026-06-12 → 2026-06-13). Sert de point de départ
> pour reprendre le chantier dans une session propre. Complète le tracker
> détaillé `docs/AUDIT_OPTIMISATION.md` (lots 1 à 15 tracés ligne par ligne).

## 1. Ce qui a été accompli

**15 lots multi-agents, 13 PR mergées dans `main` (#110 → #122).** Méthode constante :
agents en worktrees git isolés, **déplacement pur** (comportement strictement inchangé),
chaque extraction livrée avec ses tests, intégration par cherry-pick sur la branche
`claude/multi-agent-rollout-o6-o10-br7wai`, validation (Vitest + ESLint + build + CI
MariaDB), un PR par lot, merge après CI verte.

**Filet de tests** : suite UI Vitest **625 → 1587 tests** (+962), plus ~250 tests
backend no-DB ajoutés (`lib/*Helpers`). 0 erreur ESLint maintenue tout du long.
105 modules `src/utils/`, 218 fichiers de tests UI, 19 helpers de route backend.

### État des 14 recommandations (tracker §3)

| ID | Axe | État | Note |
|----|-----|------|------|
| O1 | Perf bundle | **done** | Lazy renderers mascotte |
| O2 | Perf rendu | **done** | `React.memo` TaskTileCard + mémoïsation effective |
| O3 | Perf RBAC | **done** | Cache versionné global, validé en CI |
| O4 | Sécu | **done** | xlsx→exceljs, prod 100 % xlsx-free |
| O5 | Extensibilité | **wip** | 3 contexts livrés, ~121 passes de props éliminées ; App.jsx allégé |
| O6 | Maint/Test | **wip** | Cœur de la session — voir §2 |
| O7 | Validation zod | **wip** | **File numérique épuisée** ; reste flags texte/CSV/OAuth (faible enjeu) |
| O8 | asyncHandler | **wip** | **Queues tasks/settings soldées** ; reste handlers à mapping spécial documentés |
| O9 | Dédup | **done** | (cas initiaux) — voir mise en garde §4 |
| O10 | Routes obèses | **wip** | 12 routes allégées (logique pure) ; reste couche service — voir §3 |
| O11 | Bundle | **done** | Reste markdown eager (non bloquant) |
| O12 | Outillage | **done** | eslint-hooks, prettier, checkJS |
| O13 | Sécu durcissement | **done** | helmet, timingSafeEqual |
| O14 | Maint | **done** | fichiers morts, version servie |

## 2. O6 — découpage des méga-composants (le gros du travail)

Tous les fichiers frontend significatifs ont été traités, plusieurs avec 2 passages.
Réductions notables (lignes) :

- `tasks-views.jsx` 4230 → **1031** (chantiers cumulés)
- `map-views.jsx` 4049 → **1070**
- `foretmap-views.jsx` (PlantManager) → **758**
- `visit-views.jsx` 2931 → **1517**
- `App.jsx` 2119 → **1902** (état/polling/realtime volontairement intouchés)
- `AppGL.jsx` 1200 → **1093**
- `profiles-views.jsx` 1340 → **897**
- `VisitMascotPackManager.jsx` 1346 → **740**
- `MascotPackWysiwygEditor.jsx` 916 → **504**
- `MarkerModal.jsx` 960 → **731**, `ZoneInfoModal.jsx` → **592**
- + tous les éditeurs/vues GL moyens (GLGameMasterConsole, GLChaptersAdminView,
  GLSettingsView, GLContentLibraryView, GLSpellCastWizard, GLMarkerEventEditor,
  les 4 éditeurs de catalogue species/glossary/qcm/spells, GLChapterMapStudio,
  GLPlayersPanel), `context-comments`, `auth-views`, `forum-views`,
  `tutorials-views`, `settings-admin-views`, `stats-views`, `MediaLibraryMenu`.

**Convention établie** : logique pure d'abord (→ `src/utils/` ou `src/gl/utils/`,
testée), puis sous-composants JSX feuilles prop-driven (→ sous-dossiers dédiés
`src/components/{tasks,map,visit,mascot,media,context-comments,app,...}` et
`src/gl/components/{admin,mj,settings,spell-cast}/`), état conservé dans le parent.

## 3. Recommandations pour la suite (par ordre de valeur/risque)

1. **Finir O5/O6 sur les cœurs sensibles restants** (`App.jsx` 1902, `AppGL.jsx` 1093,
   `visit-views.jsx` 1517, `map-views.jsx` 1070). Ces fichiers contiennent l'état
   global (37 `useState`), le polling, Socket.IO, le rendu SVG interactif et les
   gestes tactiles. **Ne pas faire par déplacement pur naïf** : nécessite une vraie
   réflexion d'architecture (extraction de hooks `useXxx` avec state, ou un state
   manager léger). À faire en petites étapes très vérifiées, pas en parallèle massif.

2. **O10 couche service backend** (`gl/games.js` 2024, `visit.js` 1997, `tasks.js` 1810).
   La logique *pure* en est déjà sortie ; le reste est de l'orchestration DB/handlers.
   Le seul vrai levier est un **découpage en sous-routeurs par domaine**
   (ex. `routes/gl/games/{teams,roster,vitality,markers,spell-casts}.js`). C'est un
   refactor structurel, pas un déplacement pur — à valider avec tests d'intégration DB.

3. **O7 reliquat** (flags texte/CSV/OAuth) : faible enjeu, à faire opportunément.

4. **O8 reliquat** : handlers à mapping spécial (`PUT /tasks/:id` debug body,
   `PUT /settings/admin/:key` 400-toujours, messages custom) — laissés à dessein,
   ne convertir que si le contrat d'erreur est prouvé équivalent.

5. **O11 markdown** : rendre `MarkdownContent` (marked+DOMPurify) lazy. Délicat
   (nombreux consommateurs synchrones) — mesurer le gain bundle avant.

## 4. Mises en garde (à lire avant de reprendre)

- **Branche de travail** : `claude/multi-agent-rollout-o6-o10-br7wai`. Toujours
  `git merge --ff-only origin/main` avant un nouveau lot pour repartir du `main`
  à jour (les 13 PR sont mergées).
- **Pas de MariaDB en dev** : les tests d'intégration backend (`api.test.js`,
  `rbac.test.js`, `*.test.js` DB) **ne tournent pas localement** — ils sont délégués
  à la CI GitHub. Toujours pousser et attendre la CI verte avant de merger.
- **Flake CI connu** : la suite backend est exécutée **deux fois** en CI (step
  « tests » puis « coverage ») **sans réinitialiser la DB**. Tout test qui génère
  des identifiants à partir de `Date.now()` doit garantir l'unicité entre les deux
  passes (cf. fix `gl-content-import-export` lot du 12/06 : codes QCM élargis).
- **Rendements décroissants atteints sur le déplacement pur** : les composants
  restants non touchés sont soit petits/déjà serrés, soit des cœurs sensibles.
  Forcer des extractions y crée des feuilles à 15+ props couplées à l'état du parent,
  sans gain net. Les agents ont pour consigne « jamais d'extraction forcée » — la
  respecter.
- **O9 dédup transverse — NE PAS forcer** : des helpers homonymes
  (`normalizeOptionalString`, compression image, `Lightbox`) existent dans plusieurs
  modules mais peuvent différer subtilement. Toute dédup doit être prouvée
  byte-identique avant mutualisation, sinon on casse un comportement local.
- **Mémoïsation O2** : le `React.memo` de `TaskTileCard` dépend de `useCallback`/
  `useMemo` dans `TasksView`. Test gardien : `tests-ui/components/TaskTileCard.test.jsx`.
  Ne pas casser les identités de handlers en touchant `tasks-views.jsx`.
- **Hygiène worktree** : les agents créent un symlink `node_modules` dans leur
  worktree — il ne doit JAMAIS être commité (utiliser des `git add` ciblés, jamais
  `git add -A`). Nettoyer les worktrees après chaque lot.
- **Périmètre intouchable des agents** : `docs/AUDIT_OPTIMISATION.md` (mis à jour
  par l'orchestrateur seul), `dist/`, `package.json`.

## 5. Comment reprendre proprement

1. Nouvelle session, `git fetch && git checkout claude/multi-agent-rollout-o6-o10-br7wai && git merge --ff-only origin/main`.
2. `npm ci` puis baseline : `npx vitest run --config vitest.config.js` (doit être vert) + `npx eslint .`.
3. Choisir UN chantier de §3. Pour les cœurs sensibles (§3.1) et la couche service
   (§3.2), privilégier 1–2 agents prudents avec validation manuelle plutôt que
   du fan-out massif.
4. Tracer chaque lot dans `docs/AUDIT_OPTIMISATION.md`, un PR par lot, merge sur CI verte.
