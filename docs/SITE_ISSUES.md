# Problemes potentiels du site ForetMap

Date de reference: 2026-04-12

Ce document liste les principaux problemes potentiels identifies a ce jour.
Il consolide les constats des audits internes, notamment:

- `docs/AUDIT_BUGS_INCOHERENCES.md`
- `docs/AUDIT_PHOTOS_BIODIVERSITE.md`
- `docs/AUDIT_OPTIMISATION.md` (extensibilite / maintenabilite / performance)

## Critiques / Haute priorite

- `B3` - Actions eleves basees sur un `studentId` client (risque d'usurpation selon contexte reseau).
- `R1` - Suppressions SQL sans purge systematique des fichiers medias associes.
- `R2` - Validation des uploads image a durcir (MIME, magic bytes, taille decodee).
- `R3` - Exposition potentielle de medias via URLs publiques (`/uploads`) ; routes `.../photos/:pid/data` durcies mais politique globale encore a unifier.

## Moyenne priorite

- `B5` - Temps reel incomplet sur les observations (creation/suppression non diffusees).
- `R4` - Pipeline base64 JSON couteux en CPU/memoire pour les uploads.
- `R5` - Logique de compression image dupliquee cote frontend.
- `R6` - Gouvernance des URLs externes plantes a renforcer (allowlist / verifications periodiques).
- `R7` - Moderation explicite des photos eleves a clarifier selon besoin pedagogique.
- `R9` - Risque de rupture HTTP/2 / WAF (Tiger Protect) sur o2switch : erreurs type Chrome **`ERR_HTTP2_PROTOCOL_ERROR`** sur `/socket.io` ou `/api/*` (voir **`docs/EXPLOITATION.md`**, section *Chrome ERR_HTTP2_PROTOCOL_ERROR*).
- `GL1` - Isolement cross-produit : verifier en CI/QA qu'un JWT `product: 'gl'` ne donne pas acces aux routes ForetMap principales (cf. garde dans **`server.js`**).
- `GL2` - Tests GL : la base est partagee, executer les suites `tests/gl-*.test.js` en `--test-concurrency=1 --test-force-exit` (sinon deadlocks `initSchema`).

## Basse priorite

- `R8` - Strategie de distribution medias a harmoniser (`/uploads` + endpoints `sendFile`).
- `B7` - Evenements de presence eleve non diffuses en temps reel.

## Deja traite

- `B4` - Incoherence `unassign` eleve/prof corrigee et alignee avec la documentation.
- `B6` - Regle interne frontend mise a jour sur la stack Vite.
- `B1` - Suppression d'observation protegee (proprietaire ou n3boss selon perimetre).
- `B2` - Lecture observations protegee contre IDOR inter-eleves.
- `B8` - `PATCH /api/students/:id/profile` protege par JWT et verification proprietaire.

## Optimisation (extensibilite / maintenabilite / performance)

Source et tracker detaille: `docs/AUDIT_OPTIMISATION.md`. Statuts: todo / wip / done / differe.

- `O1` - [done] Renderers mascotte charges en eager sur la Carte (~268 KB inutiles) ; lazy par renderer.
- `O2` - [done] Tuiles de taches non memoisees (re-render par tick) ; `useMemo` + `React.memo`.
- `O3` - [differe] RBAC recalcule a chaque requete ; cache TTL tente puis reverte (invalidation incomplete, SQL direct hors hooks). A refaire avec compteur de version RBAC global ou cache request-scoped.
- `O4` - [differe] `xlsx@0.18.5` (CVE-2023-30533 / CVE-2024-22363) via parsing uploads ; choix exceljs vs SheetJS CDN a trancher.
- `O5` - [wip] `App.jsx` God component + prop-drilling x4 ; Contexts par domaine.
- `O6` - [wip] Composants monolithiques + 0 test UI (~21k LOC) ; extraire logique pure + tests, puis decouper.
- `O7` - [wip] `zod` installe mais jamais utilise ; middleware `validate(schema)` par endpoint.
- `O8` - [todo] try/catch disperses + `respondInternalError` redefini ; wrapper `asyncHandler`.
- `O9` - [done] Helpers dupliques (`normalizeOptionalString` x25, pagination, `Lightbox` x2, compression image) ; mutualisation.
- `O10` - [wip] Routes obeses (2000+ l.) + N+1 d'ecriture (boucles INSERT) ; services par domaine + INSERT multi-valeurs.
- `O11` - [done] Lazy ineffectif + markdown/GL eager + sourcemap prod ; corrections bundle.
- `O12` - [done] ESLint sans react-hooks ; pas de Prettier ; 0 typage ; outillage durci.
- `O13` - [done] Pas de `helmet` ; CORS ouvert par defaut ; `DEPLOY_SECRET` non constant-time ; durcissement.
- `O14` - [done] Fichiers morts + `fs.readFileSync(package.json)` en chemin requete ; nettoyage.

## Endpoint d'acces

- API: `GET /api/site-issues`
- API: `GET /api/site-issues.json`
- Type de contenu: `text/markdown; charset=utf-8`

## Notes

- Cette liste est un inventaire technique des risques et incoherences possibles.
- Pour le detail complet des causes, impacts et actions, consulter les rapports d'audit sources.
