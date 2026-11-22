# Orchestration fin novembre 2026 — fiche de coordination

> Fiche de travail de la série du 22/11/2026, temporaire. Elle est supprimée à l'intégration finale.
> Base : `main` à `5d0fe3b` (v1.263.3), schéma **387** en prod et sur `main`. Aucune PR ouverte au
> lancement.

## Branches et flux

| Flux                                               | Branche            | Worktree          | Base MariaDB        | Port | Vague |
| -------------------------------------------------- | ------------------ | ----------------- | ------------------- | ---- | ----- |
| C1 — collège : réseau trophique et visibilité      | `orch/c1`          | `../ForetMap-c1`  | `foretmap_test_c1`  | 3201 | 1     |
| C2 — collège : fiche, Visite cycle 4, données      | `orch/c2`          | `../ForetMap-c2`  | `foretmap_test_c2`  | 3202 | 1     |
| Q — quiz : réponse choisie                         | `orch/q`           | `../ForetMap-q`   | `foretmap_test_q`   | 3203 | 1     |
| F7 — reprise de la dérive de schéma et signalement | `orch/f7`          | `../ForetMap-f7`  | `foretmap_test_f7`  | 3207 | 2     |
| T3 — retrait des tables figées et suites CPT       | `orch/t3`          | `../ForetMap-t3`  | `foretmap_test_t3`  | 3208 | 2     |
| INT — intégration                                  | `orch/integration` | ce dépôt          | `foretmap_test_int` | 3209 | —     |
| VER — vérification indépendante                    | `orch/integration` | `../ForetMap-ver` | `foretmap_test_ver` | 3210 | —     |

## Carte de propriété (vérifiée sur le code au 22/11)

- **C1** : `routes/food-web.js` ; `src/components/pedago/FoodWeb*.jsx`, `foodWeb*.js`,
  `foodWebView.css` ; `src/hooks/useFoodWeb*.js` ; `src/shared/pedagoVisibilityCore.js`,
  `src/shared/enums/biodivEnums.js` et leurs miroirs `lib/shared/` (`lib/shared/biodivEnums.js`) ;
  `src/utils/biodivPedagoLevel.js`, `lib/biodivPedagoLevel.js` ; `lib/shared/pedagoStepActions.js` ;
  contexte de séance (`src/hooks/usePedagoSession.js`, `src/contexts/PedagoSessionContext.jsx`) ;
  `openPedagoFoodWeb` dans `src/hooks/useAppPedago.js` ; `lib/mcp/tools/domains/pedagoSessions.js` ;
  leurs tests ; sections « réseau » et « séances » de `docs/API.md` et `docs/MCP.md`.
- **C2** : `src/constants/plantMetaSections.js`, `src/components/biodiv/PlantMetaSections.jsx`,
  `PlantCatalogPreview.jsx`, `PlantSummaryBlocks.jsx` (et `PlantPedagoFetchedSections`) ;
  `src/utils/learnerLevel.js`, `lib/pedago/learnerLevel.js` ; migration `college_assouplissement` ;
  `data/college-assouplissement/` ; `scripts/college-assouplissement/` ; `tests/content/`
  correspondants ; section « Profil collège et paliers » de `docs/`.
- **Q** : `routes/quiz.js`, `lib/qcmChoices.js`, `lib/qcmPresentationUse.js`, jeton de
  présentation, `lib/quizQuestionFingerprint.js` (nouveau), `lib/quizQuestionStats.js`,
  `lib/accountMerge.js`, `lib/mcp/tools/domains/quiz.js` et `lib/mcp/domains/` (quiz), écran
  d'administration des questions (hors `src/gl/`), `src/shared/privacy/privacyNoticeContent.js`,
  `lib/retention/`, `docs/MCP_REGISTRE_TRAITEMENT.md`, migration `quiz_attempt_choice`, tests,
  sections « quiz » de `docs/API.md` et `docs/MCP.md`.
- **F7** (vague 2) : migration `reprise_derive_schema`, `lib/migrationStatus.js`,
  `scripts/db-migration-status.js`, script d'empreinte, `lib/mcp/health/`, module de
  `foretmap_db_status` (`lib/mcp/tools/diagnostics.js`), valeurs `health_risk` de
  `src/shared/enums/biodivEnums.js`, tests et docs.
- **T3** (vague 2) : migration `retrait_t3_quiz_question_links`, modules qui référencent encore
  `quiz_question_species` / `quiz_question_tutorials` (relevé au démarrage : `lib/tutorialDedup.js`,
  `lib/schemaRetirements.js`, `lib/rewards/metrics.js`, `lib/biodiv/speciesService.js`,
  `lib/pedago/learningLinks.js`, `lib/mcp/audits/index.js`, `lib/mcp/tools/content.js`,
  `lib/mcp/sqlGuard.js`, `routes/tutorials.js`, `routes/learning-links.js`, `database.js`),
  aperçu de tutoriel et onglet Tutoriels, tests et docs.

Fichiers chauds réservés à l'intégration : `package.json`, `package-lock.json`, `src/App.jsx`,
registre des outils MCP, fichiers d'export groupé, `sql/schema_foretmap.sql`, `CHANGELOG.md`.
Chaque flux écrit `changelog.d/<flux>.md` et note ses besoins sous « À faire par l'intégration ».

## Migrations

Le numéro n'apparaît que dans le nom du fichier : chaque flux prend le premier numéro libre de sa
base, et les tests, le code, la doc et le changelog citent la migration par son suffixe.
Ordre définitif, renuméroté sans trou au-dessus de `main` à l'intégration :

1. `college_assouplissement` (C2)
2. `quiz_attempt_choice` (Q)
3. `reprise_derive_schema` (F7)
4. `retrait_t3_quiz_question_links` (T3), toujours en dernier

## Ordre d'intégration

Vague 1 : C1 → C2 → Q dans `orch/integration`, puis vague 2 (F7, T3) depuis `orch/integration`
intégrée, puis F7 → T3. Les journaux de flux vivent sous `docs/coordination/orch-2026-11/journal/`
sur chaque branche ; ils sont repris dans la description de la PR finale, pas dans le dépôt.
