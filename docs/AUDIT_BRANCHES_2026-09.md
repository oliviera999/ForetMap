# Audit des branches — fusion dans `main` (8 septembre 2026)

> Instantané de la passe qui a ramené les branches locales et distantes vers `main`.
> Méthode : **un seul merge Git de branche complète** (`feat/moodle-sync`) ; jamais de
> merge en bloc des branches `cursor/*` en retard de 600–750 commits (cela
> réécraserait le code actuel). Pour chacune : extraire le patch unique, le comparer
> au `main` d’aujourd’hui, **porter** le trou éventuel dans les fichiers courants, puis
> **supprimer** la branche.

## 1. Fusionnée

| Branche            | Verdict   | Note                                                                                                                                                                                                                                                      |
| ------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feat/moodle-sync` | Fusionnée | Lots Moodle M1–M6 (annuaire, admin, LTI, miroirs d’équipes) + correctifs gabarits / verrous « séparés ». Conflits résolus : spec d’audit (état « dans le code ») et `env.local.example` (variables LTI réellement lues). Migration `219_moodle_sync.sql`. |

## 2. Déjà dans `main` (supprimées sans rejeu)

| Branche                                                                                                                                                                                                                                                          | Preuve                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `feat/gl-team-composition`                                                                                                                                                                                                                                       | [PR #438](https://github.com/oliviera999/ForetMap/pull/438)                                       |
| `backup-filtres-carte`                                                                                                                                                                                                                                           | Commits déjà présents (`1e985f3a`, `c4eff4a3`)                                                    |
| `feat/realtime-o2switch-hardening`                                                                                                                                                                                                                               | [PR #397](https://github.com/oliviera999/ForetMap/pull/397) ; reste un rebuild `dist/` équivalent |
| `cursor/engineering-documentation-updates-fd54`                                                                                                                                                                                                                  | [PR #433](https://github.com/oliviera999/ForetMap/pull/433)                                       |
| Locales déjà ancêtres : `fix/polling-pedago-tabs-race`, `claude/interface-emoji-audit-mdkv2v`, `cursor/critical-bug-investigation-c6c8` / `c8be` / `dfbe`, `cursor/engineering-documentation-updates-8580`, `dependabot/npm_and_yarn/npm-patch-minor-db8ad3ba48` | `git merge-base --is-ancestor`                                                                    |

## 3. Portées dans le code actuel (puis branches supprimées)

Pas un merge de la branche d’août : hunks adaptés aux fichiers d’aujourd’hui.

| Branche                           | Sujet                                              | Action sur `main`                                                                                                                      |
| --------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `critical-bug-investigation-4984` | `POST /done` n’écrase plus `validated` / `on_hold` | Garde SQL `AND status NOT IN ('validated','on_hold')` ; relecture avant `unassign` ; test dans `tests/task-assign-status-lock.test.js` |
| `critical-bug-investigation-6dd1` | Double score si deux MJ résolvent la même action   | `SELECT … FOR UPDATE` + `UPDATE … WHERE status='pending'` dans `routes/gl/games/actions.js`                                            |
| `critical-bug-investigation-0819` | Mutation / validation d’une tâche archivée         | `PUT /api/tasks/:id` et `POST /:id/validate` → 409 « Désarchivez… » ; test dans `tests/tasks-archive.test.js`                          |
| `critical-bug-investigation-8eec` | Course double découverte à la consultation         | `lockGlTeamRow` + skip si déjà trouvé dans `lib/glFeuilletAcquisition.js`                                                              |
| `critical-bug-investigation-8a19` | Photos d’observations / journaux de tâches en 401  | Composant `AuthedImage` (fetch Bearer → blob URL) dans `ObservationCard` et `TaskLogModals`                                            |

## 4. Déjà là ou design dépassé (supprimées sans portage)

| Branche                                  | Verdict           | Preuve                                                                                                                                                                                        |
| ---------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `095a`                                   | Déjà là           | `lib/glFeuilletZonePresence.js` + tests `gl-feuillet-zone-presence` / `gl-marker-present-arrival-authz`                                                                                       |
| `2229`                                   | Déjà là           | `/admin/feuillets/export` avant `/:code` dans `routes/gl/lore.js`                                                                                                                             |
| `291a`                                   | Déjà là           | `lib/tasks/assignmentIdentityMatch.js` + `tests/tasks-identity-usurpation.test.js`                                                                                                            |
| `34d1`                                   | Déjà là           | Filtre `reponse_correcte` dans `routes/quiz.js`                                                                                                                                               |
| `7897`                                   | Déjà là           | `archived_at IS NULL` dans `lib/recurringTasks.js`                                                                                                                                            |
| `7ebf`                                   | Déjà là           | `normalizedTutorialIds` avant autosave dans `TaskFormModal.jsx`                                                                                                                               |
| `85e5`                                   | Déjà là           | `deliverFeuillets` + `isFeuilletFound` ; `tests/gl-market-feuillets-deliver.test.js`                                                                                                          |
| `8981`                                   | Design dépassé    | Le `present` actuel autorise volontairement `unlockedVia: 'story'` (pool du chapitre) ; la garde spatiale stricte de 8981 casserait ce canal. Read/hold déjà protégés par `teamOwnsFeuillet`. |
| `93e2`                                   | Déjà là           | Plafond inscriptions ignore les archivées (`lib/studentTaskEnrollment.js`)                                                                                                                    |
| `95e4` / `a187` / `bb7a`                 | Déjà là           | Anti-wipe autosave Help/Intro/Réglages / éditeur feuillets / doc de référence                                                                                                                 |
| `a70a`                                   | Déjà là (renommé) | `lib/qcmPresentationUse.js` + migration `193` (≠ 171 de la branche)                                                                                                                           |
| `b5a2`                                   | Déjà là           | `lib/glXlsxAttachment.js` `wrapXlsxRoute`                                                                                                                                                     |
| `d6b1`                                   | Déjà là           | `claimAssignmentSeat` + `passwordMustReset` relu en base                                                                                                                                      |
| `d8eb`                                   | Déjà là           | `lib/mediaLibrary.js` `normalizeMediaApp`                                                                                                                                                     |
| `fd4f`                                   | Déjà là           | `lib/glLoreFeuillets.js` préserve `effacementPct`                                                                                                                                             |
| `engineering-documentation-updates-13dc` | Déjà là           | `docs/GL_ARCHITECTURE.md` § Contenus                                                                                                                                                          |
| `engineering-documentation-updates-17a6` | Déjà là           | `docs/EXPLOITATION.md` / `docs/CRONTAB.md`                                                                                                                                                    |
| `engineering-documentation-updates-960b` | Déjà là           | Audits juillet absorbés / actualisés                                                                                                                                                          |
| `engineering-documentation-updates-de07` | Déjà là           | Contrat `assign-group` dans `docs/API.md`                                                                                                                                                     |

## 5. Hors lot (non commité)

WIP local écarté en stash, **pas** fusionné ici : fixtures e2e Playwright ; chantier pédago / réseau trophique GL (migrations 220+, `audit:pedago`). À reprendre à part.

## 6. Travail local préservé

- stash `wip e2e fixtures avant merge main`
- stash `wip pedago concurrent hors merge moodle` (et stashes pédago antérieurs)
