# Audit du code ForetMap (hors G&L) — 26 novembre 2026

> **Statut : à traiter.** Instantané daté, lecture statique croisée (trois relectures
> parallèles + vérification manuelle des constats prioritaires). Aucun correctif dans ce
> document. Périmètre : **ForetMap hors Gnomes & Licornes** — `server.js`, `app.js`,
> `database.js`, `routes/**` (hors `routes/gl`), `lib/**` (hors `lib/gl*`), `middleware/`,
> `src/**` (hors `src/gl`), miroirs `lib/visit-pack/` et `lib/shared/*` liés au produit forêt.
>
> Base : `main` @ `278967897`, version **1.263.9** (release du 24/11/2026). Suite au
> [`AUDIT_BUGS_FORETMAP_2026-11-19.md`](AUDIT_BUGS_FORETMAP_2026-11-19.md) (**69 constats,
> PR #692–#702 fusionnées**) et au chantier UI/UX
> [`AUDIT_UI_UX_2026-11-19.md`](AUDIT_UI_UX_2026-11-19.md) (lots partiellement livrés).
>
> Objet : **bugs résiduels ou nouveaux**, **cohérence** (doc ↔ code, dual-source, dette de
> nommage), **performance / charge**, **code mort**. Hors objet : G&L, justesse scientifique
> des textes, style cosmétique seul.

## 1. Méthode et niveau de preuve

| Niveau      | Signification                                                                |
| ----------- | ---------------------------------------------------------------------------- |
| **Lu**      | Chemin lu deux fois (route / hook / SQL / appelants) ; grep de confirmation. |
| **Signalé** | Relevé sur lecture, non revérifié en profondeur.                             |
| **Rejoué**  | Non utilisé ici (pas de campagne HTTP/UI dédiée pour cet instantané).        |

Contrôles d’ambiance au moment de l’audit :

| Vérification                      | Résultat                                                    |
| --------------------------------- | ----------------------------------------------------------- |
| `npm run lint`                    | **0 erreur**, 318 avertissements                            |
| `npm run sync:shared-cores:check` | **OK** — 32 miroirs `lib/shared/`                           |
| PR ouvertes (`gh pr list`)        | aucune                                                      |
| Correctifs audit 19/11            | gardes A1/A2/T1/T2/C1/P1/S1… **visibles** dans le code relu |

Les constats majeurs du 19/11 **ne sont pas repris** sauf résiduels assumés (ex. C13 photos
publiques) ou effets de bord non couverts par les lots (session front).

## 2. Synthèse

L’application est **globalement saine** après la vague de correctifs du 19/11 et les lots
collège / quiz / UI de la semaine suivante. Aucun bloquant d’autorisation ni injection SQL
n’a été trouvé sur ce passage. Ce que l’audit apporte de neuf tient en quatre priorités :

1. **Fuite visuelle / course de session côté front** : après déconnexion (ou avant le
   `fetchAll` du compte suivant), les états domaine (`maps`, `zones`, `tasks`, `plants`…) et
   `loading === false` ne sont pas purgés ; des requêtes en vol (polling, temps réel) peuvent
   encore écrire l’état (**S1–S4**).
2. **Charge API** : listes non bornées (`GET /api/tasks`, stats « tous », catalogue plantes /
   glossaire / quiz admin) et N+1 ou O(N) encore ouverts (**P1–P5**).
3. **Disponibilité** : toute `unhandledRejection` tue le process Node (**S5**) — politique
   volontaire, mais fragile hors chemins déjà blindés.
4. **Dette documentaire et code mort** : `SITE_ISSUES.md` périmé ; quelques exports
   `@deprecated` sans consommateur ; prop `isN3Affiliated` toujours `false`.

| Gravité   | Bugs / cohérence | Perf | Code mort |
| --------- | ---------------- | ---- | --------- |
| Important | 5                | 3    | —         |
| Moyen     | 4                | 6    | —         |
| Mineur    | 5                | 3    | 4         |

## 3. Bugs et courses

### S1 — Après déconnexion, les données du compte précédent restent affichables — Lu

- **Où** : `src/hooks/useAppSession.js:343-378` (`handleLogout`) ;
  `src/hooks/useAuthSession.js:99-108` (`forceLogout`) ; états dans
  `src/hooks/useAppDataSync.js:77-88,408-409`.
- **Défaut** : la déconnexion efface session, jeton et (selon réglage) stockage local, mais
  **ne remet pas à zéro** `maps` / `zones` / `tasks` / `plants` / `archivedTasks` / …
  ni `loading` / `initialFetchDoneRef`. Tant que le prochain `fetchAll` n’a pas fini (debounce
  ~250 ms), le shell authentifié du compte suivant peut s’afficher **sans loader** avec les
  données de l’ancien compte. Sur poste partagé (salle info), fuite visuelle nominative
  possible (tâches, élèves assignés, etc.).
- **Correction** : à la perte de `hasAuthenticatedShell`, purger les états domaine +
  `setLoading(true)` + invalider `initialFetchDoneRef` / `lastSyncStateRef` ; test UI
  logout → login autre compte.

### S2 — Un `fetchAll` en vol peut réécrire l’état après logout — Lu

- **Où** : `src/hooks/useAppDataSync.js:117-414` (boucles `setZones` / `setTasks` / …).
- **Défaut** : contrairement à `/api/auth/me` (garde `getStoredSessionAccountKey`,
  l.336-340), les réponses du cycle `fetchAll` ne vérifient pas le compte courant avant
  `setState`. Une déconnexion pendant un cycle laisse la réponse ancienne gagner la course.
- **Correction** : capturer une clé de session en tête de cycle ; ignorer les `set*` si la
  clé a changé ou si `!hasAuthenticatedShell`.

### S3 — Temps réel : même course après `enabled: false` — Lu

- **Où** : `src/hooks/useForetmapRealtime.js:97-160` (`refreshTasksFromServer` /
  `refreshGardenFromServer`).
- **Défaut** : après `await api(...)`, aucune vérification jeton / compte / `enabled` avant
  mutateurs. Variante de S2 pour le canal Socket.IO.
- **Correction** : même garde de session ; annuler ou ignorer si déconnecté.

### S4 — `forceLogout` ne nullifie pas `studentRef` tout de suite — Lu

- **Où** : `useAuthSession.js:99-108` vs `handleLogout` (`studentRef.current = null`
  synchrone, `useAppSession.js:370`).
- **Défaut** : `forceLogout` (401, compte supprimé, autre onglet) pose seulement
  `setStudent(null)` ; `studentRef` peut rester peuplé un tick. `fetchAll` lit encore
  `studentRef` pour la clé de sync et certaines gardes.
- **Correction** : aligner `forceLogout` sur `handleLogout` (`studentRef.current = null`).

### S5 — Toute promesse rejetée non gérée arrête le serveur — Lu

- **Où** : `server.js:893-896` (`unhandledRejection` → `process.exit(1)`).
- **Défaut** : politique « fail-fast » : un oubli async hors chemins blindés (présence S1 du
  19/11) tue **tout** le Node, pas seulement la requête. Acceptable en prod surveillée, mais
  surface de disponibilité large.
- **Correction** (à arbitrer) : sortir seulement sur exceptions non récupérables, ou
  `runDetached` systématique pour les hooks fire-and-forget ; conserver le crash pour
  `uncaughtException`.

### Autres bugs / footguns

| ID  | Constat                                                                                                                                                                       | Où                                                                               | Gravité | Preuve |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------- | ------ |
| S6  | Deep links (`?tache=`) attendent `!loading` : après S1, navigation possible vers des IDs d’un autre compte avant refetch.                                                     | `useAppTargetNavigation.js:110-118`                                              | Moyen   | Lu     |
| S7  | Réconciliateur de carte active peut garder un `activeMapId` hors périmètre du nouveau compte.                                                                                 | `useActiveMapVisibilityReconciler.js:40-52`                                      | Moyen   | Lu     |
| S8  | `assertQuestionOpen` renvoie `{ ok: true }` si une ressource est posée **sans** lecteur résolu — safe tant que quiz P1 garde l’auth en amont ; piège pour un nouvel appelant. | `lib/learningGatingLockMode.js:173-175` ; contournement `quizService.js:415-421` | Mineur  | Lu     |
| S9  | Prof « groupe » : inscriptions héritées **sans** `student_id` absentes du détail filtré (`isScopedRow`). Sous-affichage, pas fuite.                                           | `lib/tasks/assignmentVisibility.js:129-134,169`                                  | Mineur  | Lu     |
| S10 | Journal MCP : `privacy_bypass` reflète le réglage **global**, pas le bypass effectif de l’appelant.                                                                           | `lib/mcp/apiBridge.js:326-345`                                                   | Mineur  | Lu     |

## 4. Cohérence (doc ↔ code, dual-source, dette)

| ID  | Constat                                                                                                                                                                                                                                                                            | Gravité                  | Preuve |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------ |
| C1  | **`docs/SITE_ISSUES.md` / `SITE_ISSUES.json`** datés du **20/08/2026** : O7 (« `zod` jamais utilisé ») est **faux** (Zod massivement dans MCP + packs mascotte) ; plusieurs items « critiques » sont traités depuis. Endpoint `/api/site-issues` sert donc un inventaire trompeur. | Important                | Lu     |
| C2  | **`isN3Affiliated` toujours `false`** : propagé via Session / tuiles / stats ; `getRoleTerms` ignore l’argument. Dette de prop-drilling (~50+ usages).                                                                                                                             | Moyen                    | Lu     |
| C3  | Alias géométrie **encore utilisés** : `visitMapGeometry.js` (deprecated) importé par Visite / mascotte ; `biodivMapGeometry` / `mapImageFit` restent des façades. Unifier vers `zoneGeometry.js`.                                                                                  | Moyen                    | Lu     |
| C4  | Monolithes encore très gros (maintenabilité) : `visit-views.jsx` ~66 Ko, `routes/rbac.js` ~66 Ko, `routes/visit/mascot.js` ~65 Ko, `tasks-views.jsx` ~50 Ko.                                                                                                                       | Moyen                    | Lu     |
| C5  | Double cœur `learnerLevel` (`lib/pedago` + `src/utils`) maintenu par tests de parité — OK tant que le test reste vert ; fragile si on oublie le miroir manuel (pas de sync script, contrairement à `shared-cores`).                                                                | Mineur                   | Lu     |
| C6  | `PinModal` : nom hérité du PIN, modal réelle de connexion prof — confusion pour les nouveaux contributeurs.                                                                                                                                                                        | Mineur                   | Lu     |
| C7  | Photos lieux : après contrôle API, **302 vers `/uploads/...` public** (décision produit §11 audit 19/11). Contournement par URL devinée toujours possible. Documenter clairement dans `docs/API.md` / référence si ce n’est pas déjà exhaustif.                                    | Mineur (résiduel assumé) | Lu     |
| C8  | Migrations « en retard » (`NNN < schema_version` absentes du registre) : `findSkippedMigrationFiles` **ne signale rien** si le registre est vide (premier boot).                                                                                                                   | Moyen (S13-R)            | Lu     |

## 5. Performance et charge

Référence croisée : [`AUDIT_STABILITE_PERF_2026-09.md`](AUDIT_STABILITE_PERF_2026-09.md),
[`AUDIT_CHARGE_BIODIVERSITE_2026-09.md`](AUDIT_CHARGE_BIODIVERSITE_2026-09.md). Les lots
vignettes / pagination catalogue / gating batch / sync-state différentiel **tiennent**.

| ID  | Constat                                                                                                                                                           | Gravité   | Preuve                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------- |
| P1  | **`GET /api/tasks`** : toutes les tâches du filtre, **sans `LIMIT`**, puis jointures agrégées. Vue prof large = risque timeout / mémoire.                         | Important | Lu                         |
| P2  | **`GET /api/stats/all`** : après agrégats, `mapWithConcurrency` appelle `syncStudentPrimaryRoleFromProgress` **par élève** (O(N)).                                | Important | Lu                         |
| P3  | **`GET /api/plants`** : liste = fiche complète (`SELECT *` + enrichissement) ; chaque bump domaine `plants` recharge tout le catalogue.                           | Important | Lu                         |
| P4  | Glossaire et quiz admin : charge **toute** la table puis filtre `q` en JS ; cache glossaire 30 s sans filtre seulement.                                           | Moyen     | Lu                         |
| P5  | Commentaires de contexte : chaque tuile monte un résumé → lot HTTP coalescé mais **1 id par tuile** ; côté serveur, contrôles d’accès par id après le SQL groupé. | Moyen     | Lu                         |
| P6  | Quiz élève : N appels `/api/glossary/terms/:code` pour les termes liés (`useQuizSession`).                                                                        | Moyen     | Lu                         |
| P7  | Socket.IO : émissions tâches **sans `mapId`** (ex. archivage auto) → salon `domain:tasks` (tous les clients ForetMap connectés).                                  | Moyen     | Lu                         |
| P8  | `user_plant_observation_events` : croissance sans purge dans le pipeline de rétention actuel.                                                                     | Moyen     | Lu                         |
| P9  | Bundle / CSS connexion : objectif ~400 Ko JS encore hors de portée (React + icônes) ; CSS pédagogie encore dans `index.css` (reliquat U1).                        | Moyen     | Lu (audit UI + lots 24/11) |
| P10 | Fontsource : 7 feuilles synchrones au boot (`foretmapFonts.js` via `main.jsx`).                                                                                   | Mineur    | Lu                         |
| P11 | Tutoriels : INSERT zone/marker en boucle `await` (chemin admin).                                                                                                  | Mineur    | Lu                         |
| P12 | Dépendance **`xlsx@0.18.5`** toujours présente (CVE historiques, O4 différé) — utilisée hors GL aussi (`fmQuizImport`, spreadsheet).                              | Mineur    | Lu                         |

Polling client : cadence adaptative OK (`useAppDataPolling`, planchers 90 s live / 120 s
arrière-plan) + sonde `/api/sync-state`. Double refetch possible reconnect socket + retour
réseau (**signalé**, filet probablement voulu).

## 6. Code mort et wrappers

| Élément                                                 | Statut                                                             | Preuve         |
| ------------------------------------------------------- | ------------------------------------------------------------------ | -------------- |
| `parseMascotPackV1`                                     | `@deprecated`, **aucun import** (définitions + doc seulement)      | Lu             |
| `shouldShowPedagoQcmAnswerPhase`                        | alias export **seul**, non importé                                 | Lu             |
| `normalizeImportUserType` / `ALLOWED_IMPORT_USER_TYPES` | `@deprecated` ; usage routes **0** ; tests + doc                   | Lu             |
| `extractMascotPackValidationIssues` (alias shared)      | deprecated **mais encore branché** via `mascotPackValidationUi.js` | Lu — pas mort  |
| `visitMapGeometry` / `mapImageFit`                      | façades encore importées                                           | Lu — pas mort  |
| Routes `staff-plan`, `enov-plan`, `usage`, `rewards`    | consommées (Plan / réglages)                                       | Lu — pas mort  |
| Miroirs `lib/shared/*`, `lib/visit-pack/*`              | synchronisés (`sync:shared-cores:check` OK)                        | Lu — pas morts |

## 7. Relu sans constat notable

- Correctifs 19/11 : import élèves (rang), PATCH profils RBAC, quiz contexte → 401, parcours
  plan fermé, présence Socket.IO détachée, CSP cache, SPA 404 assets, MCP path/CTE/bypass.
- Auth reset mot de passe enseignant : `password_must_reset = 0` (A10).
- `sync:shared-cores` : 32 miroirs alignés.
- Pas de `TODO`/`FIXME` dans `routes/*.js` ; pas de `catch {}` vide dans `routes/` /
  `middleware/`.
- Front shell : `no-use-before-define` OK sur les fichiers clés relus.

## 8. Non couvert / à approfondir

- Rejeu HTTP (supertest) et parcours navigateur des S1–S4.
- `routes/admin/moodle.js`, `lib/moodle/**`, LTI signature/nonce en profondeur.
- `lib/speciesAutofill*.js`, `lib/remoteMedia.js` (SSRF), rétention comptes.
- e2e complets et profilage prod (latences `/api/tasks`, `/api/stats/all`, poids
  `/api/visit/content` après allègement mascottes).
- Contenu pédagogique (`tests/content`) et écarts `docs/reference/` (aucun `🔧` ouvert côté
  `foretmap/` au moment de l’audit).

## 9. Lots de correction proposés

Découpage par fichiers pour des PR parallèles (comme le 19/11) :

| Lot | Contenu                                                                                                                     | Constats         |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| A   | Session front : purge domaine au logout, gardes compte sur `fetchAll` / realtime, `studentRef` dans `forceLogout`, tests UI | S1–S4, S6–S7     |
| B   | Charge listes : pagination ou plafond `GET /api/tasks` ; projection liste plantes ; filtre SQL glossaire/quiz admin         | P1, P3, P4       |
| C   | Stats : sortir `syncStudentPrimaryRoleFromProgress` du chemin chaud `/api/stats/all` (précalcul / cache scope)              | P2               |
| D   | Temps réel + commentaires : `mapId` sur émissions sans carte ; résumés commentaires au dépli / un appel page                | P5, P7           |
| E   | Hygiène : retirer exports morts ; retirer ou figer `isN3Affiliated` ; rafraîchir `SITE_ISSUES` ; route batch glossaire quiz | morts, C1–C2, P6 |
| F   | Dispo / dette : arbitrage `unhandledRejection` ; purge `user_plant_observation_events` ; suite budget bundle U1             | S5, P8–P10, P12  |

## 10. Décisions à trancher

- [ ] **S5** — garder le crash process sur toute `unhandledRejection`, ou journaliser +
      continuer pour les rejets « métier » détachés ?
- [ ] **P1** — plafond dur (ex. 500) avec curseur, ou pagination explicite (casse contrat
      front) ?
- [ ] **P3** — endpoint liste allégée + détail à la demande, ou accepter le payload complet
      sous ~N fiches ?
- [ ] **C7** — maintenir les photos lieux en `/uploads` public (choix actuel), ou signer /
      cloisonner ?

---

_Audit du 26/11/2026. Ne remplace pas une campagne de tests ni le suivi UI/UX du 19/11._
