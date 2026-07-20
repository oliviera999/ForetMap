# Audit de code ForetMap — juillet 2026

Audit expert de la base de code (analyse en lecture seule, aucun comportement modifié) portant sur
la **simplification**, le **refactoring**, la **mutualisation** (mise en shared) et la
**performance**, sans régression fonctionnelle.

## Méthodologie et périmètre

Analyse parallèle par 6 auditeurs spécialisés (+ 5 sous-audits ciblés) :

| Domaine                      | Périmètre                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------- |
| Backend ForetMap             | `routes/*.js` (~11 000 L), `lib/`, `middleware/`, `server.js`                   |
| Backend GL                   | `routes/gl/**` (~7 800 L), `lib/gl*`, `lib/shared/**`                           |
| Frontend ForetMap            | `src/App.jsx` (2 259 L), `src/components/**`, `src/hooks/**`, `src/services/**` |
| Frontend GL + partage fronts | `src/gl/**`, frontière `src/` / `src/gl/` / `src/shared/`                       |
| Base de données              | `database.js`, `sql/`, 160 migrations, toutes les requêtes SQL des routes/lib   |
| Infra / build / tests        | `server.js`, Vite, scripts npm, CI, `tests/` (305 fichiers), `tests-ui/`        |

Tous les constats citent du code réel (`fichier:lignes`). Les similitudes chiffrées proviennent de
diffs effectifs ; le bug P0 frontend a été **reproduit empiriquement** (sonde React 19 hors dépôt).

### Points sains à préserver (constatés)

- SQL **systématiquement paramétré** : aucune injection détectée sur les 125 sites de SQL dynamique inspectés.
- Refactorings antérieurs (O6/O8) bien avancés : `asyncHandler`, `lib/shared/`, `src/shared/`,
  code-splitting `React.lazy` (~20 vues ForetMap, 8 vues GL), pattern pan/zoom en ref de `useMapGestures`,
  `manualChunks` Vite corrects, helpers de tests mutualisés (`tests/helpers/` utilisé par 170 fichiers).
- Isolement produit GL respecté : **aucun import** de `src/gl/**` côté ForetMap ; JWT `product:'gl'`
  correctement articulé via `lib/auth/jwtPipeline.js`.
- `GET /api/tasks` correctement batché (8 requêtes `IN (…)` en `Promise.all`).

---

## Synthèse exécutive — Top 10 (meilleur ratio gain/risque)

| #   | Action                                                                                                          | Impact                                | Risque       |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------ |
| 1   | **P0** Corriger la boucle infinie de re-renders `MarkerModal`/`ZoneInfoModal`                                   | Élevé (CPU/batterie mobile)           | Faible       |
| 2   | Cache `immutable` sur `dist/assets/*` (`server.js:356-368`) — inclut 2×1,9 Mo de wasm Rive                      | Élevé (perf utilisateur)              | Faible       |
| 3   | Index `task_assignments(student_first_name, student_last_name)` + `task_logs` idem                              | Élevé (fin des full scans)            | Faible       |
| 4   | Supprimer `LOWER()` non sargable sur `users` (login/inscription) — collation déjà `_ci`                         | Élevé (chemin le plus fréquent)       | Faible       |
| 5   | CI : supprimer le double run de la suite backend (`test` puis `test:coverage`)                                  | Élevé (temps CI ÷ ~2)                 | Faible       |
| 6   | Réécrire le N+1 de `GET /api/stats/all` (~200-400 requêtes → ~5 pour 200 élèves)                                | Élevé                                 | Moyen        |
| 7   | `fetchAll` (App.jsx) : garder l'identité des tableaux si contenu inchangé (fin du re-render global par polling) | Élevé                                 | Moyen        |
| 8   | Mémoïser la chaîne de filtrage `TasksView` + sortir `loading` des props communes des tuiles                     | Élevé                                 | Faible/Moyen |
| 9   | Mutualiser le cluster « tasks » backend (~450 L recopiées 3×) dans `lib/tasks/taskQueries.js`                   | Élevé (fin de la dérive silencieuse)  | Moyen        |
| 10  | Extraire la boucle fetch/retry commune `api`/`apiGL` (~90 L clonées, dérive déjà visible)                       | Élevé (robustesse réseau ×2 produits) | Moyen        |

**Bilan chiffré estimé** : ~2 500-3 500 lignes supprimables sans changement fonctionnel
(≈ 1 000 backend ForetMap, 600-800 backend GL, 1 300-1 700 frontend), ~10 foyers N+1 SQL éliminés,
re-renders globaux périodiques supprimés, temps CI quasi divisé par deux.

---

## 1. Correctifs prioritaires (P0)

### 1.1 Boucle infinie de re-renders — MarkerModal / ZoneInfoModal (bug vérifié)

- **Fichiers** : `src/components/map/MarkerModal.jsx:166-170`, `src/components/map/ZoneInfoModal.jsx:249-253`.
- **Constat** : `studentAssignableTasks` est recalculé sans `useMemo` à chaque rendu
  (`MarkerModal.jsx:99`, `ZoneInfoModal.jsx:125`), et l'effet fait
  `setSelectedTaskIds((prev) => prev.filter(...))` qui renvoie **toujours** un nouveau tableau →
  boucle rendu/effet. Reproduit avec React 19.2 + jsdom : **66 799 rendus en ~3 s**,
  `Maximum update depth exceeded` en continu (pas de crash visible, mais CPU saturé tant que la
  modale est ouverte).
- **Correctif** : retourner `prev` quand rien ne change (`next.length === prev.length ? prev : next`)
  **et** mémoïser `studentAssignableTasks` (`useMemo` sur `[tasks, student, id]`).
- **Risque** : faible.

### 1.2 Défaut latent de concurrence — événements de partie GL

- **Fichiers** : ×8 — `routes/gl/games/status.js:67-77`, `games/actions.js:75-84, 162-171`,
  `games/feuillet-zones.js:146-151`, `games/markers.js:269-274, 440-445, 617-622`, `games/qcm.js:216-222`.
- **Constat** : pattern « INSERT event → re-SELECT `ORDER BY id DESC LIMIT 1` → `emitGlGameEvent` ».
  Sous concurrence, le re-SELECT peut émettre l'événement **d'une autre requête**.
- **Correctif** : helper `insertAndEmitGameEvent()` dans `lib/glGameEvents.js` utilisant
  `result.insertId` (convention CLAUDE.md). Corrige le défaut et supprime 8 duplications.
- **Risque** : faible.

### 1.3 Numéros de migration dupliqués (piège réel)

- **Fichiers** : `migrations/021_add_new_tutorials_seed.sql` / `021_visit_public_flow.sql` ;
  `037_message_reactions.sql` / `037_visitor_role_default.sql`.
- **Constat** : `runMigrations` (`database.js:432-434`, `if (num <= current) continue;`) **saute le
  second fichier** d'un doublon dès que le premier a fixé `schema_version`. Masqué aujourd'hui par
  le snapshot, mais dangereux pour toute base migrée sans snapshot.
- **Correctif** : garde-fou au démarrage (échec si deux fichiers partagent un numéro) + interdiction
  des doublons à l'avenir.
- **Risque** : faible.

---

## 2. Performance — Base de données et backend

### 2.1 Index manquants (DDL additifs, risque faible)

```sql
-- Prédicat "student_id = ? OR (first_name = ? AND last_name = ?)" omniprésent
-- (stats.js:140/265/345, studentTaskEnrollment.js:54, studentDeletion.js, assignments.js, rbac.js)
ALTER TABLE task_assignments
  ADD INDEX idx_task_assignments_student_name (student_first_name, student_last_name);
ALTER TABLE task_logs
  ADD INDEX idx_task_logs_student_name (student_first_name, student_last_name);

-- routes/zones.js:202 : SELECT * FROM zone_history sans WHERE ni index de tri
ALTER TABLE zone_history
  ADD INDEX idx_zone_history_zone_harvested (zone_id, harvested_at);
-- (idx_zone_history_zone_id devient redondant)

-- routes/observations.js:52,84 : ORDER BY created_at DESC sans index
ALTER TABLE observation_logs ADD INDEX idx_observation_logs_created (created_at);
```

Option basse priorité : `tasks (recurrence, status, due_date)` pour `lib/recurringTasks.js:126-132`.

### 2.2 `LOWER()` non sargable sur `users` (login, inscription, reset)

- **Fichiers** : `routes/auth.js:154, 384, 391, 464, 469, 475, 807, 846` ;
  `routes/students.js:386, 393, 400, 597, 604`.
- **Constat** : `LOWER(email)=LOWER(?)` etc. alors que la collation `utf8mb4_unicode_ci` est **déjà
  insensible à la casse** → `uq_users_email` / `uq_users_pseudo` inutilisables, full scan de `users`
  à chaque login.
- **Correctif** : `col = ?` (sémantique identique) ; verrouiller par les tests auth existants.

### 2.3 N+1 majeurs

| Site                                                                                                                                                    | Constat                                                                                                                                                                                         | Correctif                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/stats.js:261-267, 341-347` (`GET /all`, `/export`)                                                                                              | 1 SELECT `task_assignments` **par élève** + `syncStudentPrimaryRoleFromProgress` par élève (~200-400 requêtes pour 200 élèves ; plafonné à 8 en parallèle, commentaire l.28 assume le problème) | 2 agrégations `GROUP BY` (par `student_id` + matching legacy par nom fusionné en JS) ; ne garder la synchro de rôle que quand `done` change (effets de bord de promotion) |
| `routes/groups.js:238-249`                                                                                                                              | `enrichGroupRow` = 2 `queryOne` **par groupe** (roles, gl_classes) alors que membres/scopes sont déjà batchés                                                                                   | 2 requêtes `IN (…)` ou LEFT JOIN                                                                                                                                          |
| `routes/task-projects.js:126-137, 538-583`                                                                                                              | validation carte + duplication de projet : requêtes par id/par tâche                                                                                                                            | `WHERE id IN (…)` (le pattern batch existe déjà dans `tasks.js:391-437`)                                                                                                  |
| `routes/tasks.js:458-469`, `tasks/proposals.js:70-90`, `tutorials.js:71-90`                                                                             | `getZone`/`getMarker` par id                                                                                                                                                                    | `SELECT id, map_id FROM zones WHERE id IN (…)`                                                                                                                            |
| `routes/visit.js:517-533` (PUT `/tutorials`)                                                                                                            | exists-check + INSERT **par tutoriel**                                                                                                                                                          | 1 `SELECT IN` + 1 INSERT multi-valeurs (préserver `sort_order` et le skip silencieux)                                                                                     |
| `routes/visit/sync.js:283-296`, `routes/rbac.js:609-616`, `lib/glPlayerJournal.js:92-133`, `lib/glSpellCast.js:562-570`, `lib/studentDeletion.js:73-75` | lectures en boucle                                                                                                                                                                              | `IN (…)`                                                                                                                                                                  |
| `routes/gl/games/status.js:37-47`                                                                                                                       | 1 UPDATE par équipe avec valeurs identiques                                                                                                                                                     | 1 `UPDATE gl_teams … WHERE game_id = ?`                                                                                                                                   |
| `routes/gl/admin.js:664-681` (import joueurs)                                                                                                           | `SELECT pseudo/email FROM gl_players` **sans LIMIT** (table entière) pour valider l'unicité                                                                                                     | `WHERE pseudo IN (…)` / `email IN (…)`                                                                                                                                    |

Écritures en boucle (INSERT multi-valeurs possible) : `task-projects.js:95-123` (`setProject*` —
le bon helper `replaceTaskJoinRows` existe déjà dans `tasks.js:296-304`), `tutorials.js:116-121`,
`lib/recurringTasks.js:231-259`, `visit/sync.js:151-208`. Réordonnancements `sort_order` en boucle
(en transaction, priorité basse) : `tasks.js:729-736`, `tutorials.js:709-712`, `zones.js:390-393`,
`map.js:241-243`, `visit/media.js:68-71` → 1 `UPDATE … CASE id WHEN ? THEN ? …`.

### 2.4 Requêtes coûteuses / projections

- `routes/stats.js:248, 330` et `routes/auth.js:300/411/464` : `SELECT * FROM users` transporte
  **`password_hash`** et colonnes TEXT pour n'utiliser que quelques champs → lister les colonnes
  (perf + hygiène sécurité).
- `routes/plants.js:430` : `SELECT * FROM plants` (~35 colonnes dont ~10 TEXT) sur la liste publique
  → projection « liste » réduite, fiche complète sur `/plants/:id`.
- `routes/zones.js:202` : charge **tout** `zone_history` puis filtre en JS par zone → `WHERE zone_id IN (…)`.
- GL : tirage aléatoire QCM (`qcm.js:215-229`, `lore.js:1210-1225`) charge le pool complet avec
  toutes les colonnes pour ne tirer qu'un code → `SELECT question_code` seul.
- `routes/tasks.js:659-668` : re-SELECT des labels de cartes déjà résolubles par la jointure de la
  liste (l.555) — à ne toucher qu'avec test dédié (sémantique de résolution subtile).

### 2.5 Transactions manquantes (cohérence)

| Site                                              | Constat                                                                                                                                               |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/tasks.js:909-941` (POST)                  | INSERT tâche + liens zones/markers/tutoriels/référents + colonnes legacy **hors transaction** (le rollback manuel d'image l.949-955 montre le besoin) |
| `routes/task-projects.js:316-330+` (POST/PUT)     | INSERT projet + liens hors tx ; `setProject*` fait DELETE **puis** INSERTs séparés → crash au milieu = liens perdus                                   |
| `routes/tasks.js:296-304` (`replaceTaskJoinRows`) | DELETE + INSERT via pool (2 statements non atomiques)                                                                                                 |
| `routes/tutorials.js:110-121`                     | création tutoriel + liens hors tx                                                                                                                     |

Correctif : `withTransaction` (déjà utilisé ~60 fois ailleurs) avec helpers acceptant un exécuteur
(`db` ou `tx`) comme le fait déjà `lib/speciesJunction.js:258-262`.

**Statut juillet 2026** : partiellement livré. `routes/task-projects.js` crée, met à jour et
duplique désormais un projet dans `withTransaction`, avec helpers de jointure acceptant un exécuteur
transactionnel. `routes/tutorials.js` crée les tutoriels et leurs liens zones/repères dans une
transaction. `routes/tasks.js` reste le principal site à traiter pour le POST tâche complet.

### 2.6 Divers backend

- `server.js:317-340` + `middleware/requireTeacher.js` : **livré v1.83.11**. La garde `/api`
  rejette les tokens GL hors `/api/gl/*`, mémorise les claims ForetMap vérifiés sur
  `req.verifiedForetJwt`, puis `resolveAuthOrRespond` les réutilise si le token est identique et
  réapplique `checkClaimsProduct`. Couvert par `tests/jwt-pipeline.test.js`.
- `lib/httpRequestLog.js:59-64` : **livré v1.83.4**. `parseHttpLogMode()` et `parseSlowMs()` sont
  résolus une seule fois à la création du middleware ; les variables `FORETMAP_HTTP_LOG` /
  `FORETMAP_HTTP_SLOW_MS` restent des réglages de démarrage.
- `routes/gl/games.js:434-450` : deux `queryOne` successifs sur `gl_teams` → 1 requête (préserver le
  contrat 404 vs 403, testé).
- Re-fetch complet après écriture (GL) : `chapters.js:407-416` (4 requêtes après UPDATE d'une
  colonne), `mascots.js:259-278`, `player-journal.js:129-134`, `context-comments.js:166-175` →
  construire la réponse depuis `insertId` + paramètres quand le contrat le permet.

---

## 3. Performance — Frontend

### 3.1 Re-render global périodique (App.jsx / DataContext)

- **Fichier** : `src/App.jsx:634-641, 1191-1202`.
- **Constat** : à chaque polling, `fetchAll` remplace **tous** les tableaux (`setZones(z)`, etc.)
  même si rien n'a changé → `dataContextValue` change → tous les consommateurs de `DataContext`
  re-rendent, **contournant les `React.memo`** posés sur `MapView`/`TasksView`/`VisitView`.
- **Correctif** : setters conditionnels gardant la référence si contenu équivalent
  (`setTasks(prev => sameCollection(prev, t) ? prev : t)` — comparaison longueur + `id`/`updated_at`).
  Ensuite seulement, envisager de scinder le contexte (données carte / tâches / catalogue).
- Compléments : fallback `currentUser` instable (`App.jsx:1281-1287`) ; mutation de ref pendant le
  rendu (`App.jsx:526-535`, à déplacer en effet) ; 2 arrows inline `App.jsx:1216-1227`
  (`onBackToAuth`, `onGuestMascotChoiceDone`) qui cassent `memo(VisitView)` **en mode invité mobile**.

### 3.2 Chaîne de mémoïsation cassée — TasksView

- **Fichier** : `src/components/tasks-views.jsx:635-714`.
- **Constat** : `allFiltered`, `visibleProjects`, la partition par statut et
  `collectUsedLocationIds` calculés **sans `useMemo`** → tous les `useMemo` en aval (l.652-703)
  invalidés à chaque rendu (chaque frappe de filtre, chaque toast). 8 passes de `filter` avec
  parsing de dates par rendu.
- **Constat 2** : `taskTileProps` (l.764-852) inclut `loading` (objet recréé au début **et** à la
  fin de chaque action) et `quickAssignStudentIds` → un clic « Je m'en occupe » re-réconcilie
  **toutes** les tuiles ; `React.memo(TaskTileCard)` est neutralisé.
- **Correctifs** : envelopper la chaîne dans `useMemo` ; ne passer à chaque carte que les flags
  dérivés de sa propre tâche, ou isoler l'UI d'affectation rapide dans un sous-composant monté
  uniquement pour la tuile ouverte.

### 3.3 Pan/zoom de la vue visite — setState par pointermove

- **Fichier** : `src/components/visit-views.jsx:1164-1184, 1248-1268` vs `src/hooks/useMapGestures.js:98-128`.
- **Constat** : chaque mouvement fait `setMapTransform(next)` → re-render du composant de ~1 600 L
  à fréquence pointermove (re-parse des polygones `parsePctPoints` par zone par frame, marqueurs non
  mémoïsés). `useMapGestures` résout le même problème avec le bon pattern (transform en ref +
  `style.transform` impératif + commit en fin de geste) — la visite ré-implémente les gestes en
  version non optimisée.
- **Correctif** : appliquer le pattern ref au calque `visitWorldRef` (déjà présent), idéalement
  factoriser un hook commun ; mémoïser une couche `VisitZonesSvgLayer`.

### 3.4 Gestes carte (MapView)

- `src/hooks/useMapGestures.js:200-202, 529` : `enableMapInteraction` sans `useCallback` dans les
  deps de l'effet qui attache les 8 listeners → démontage/remontage à **chaque rendu** de
  `MapViewImpl`, et le cleanup peut annuler une animation de zoom en cours.
- `useMapGestures.js:547-570` : API retournée (`applyTransform`, `commit`, `fitMap`…) non mémoïsée →
  toute mémoïsation aval impossible.
- `map-views.jsx:618-712` : `renderZonePoly` refait `JSON.parse(z.points)` + centroïde **par zone à
  chaque rendu** ; `MapViewMarkerBubble` non `React.memo` → pré-parser les zones en `useMemo`,
  extraire `ZonePolygon` mémoïsé.
- Incohérence de bornes zoom : pinch clampé `(0.15, 6)` (l.494) vs molette/boutons `0.15/8` (l.11-12).

### 3.5 GL — AppGL.jsx et gameplay

- `src/gl/AppGL.jsx` (1 569 L, **34 useState**, ~50 props vers `GLMapView`) : tout toast/popover
  re-rend l'arbre entier. Correctif par étapes : `useGlGameRuntime()` (gameState, socket, dés —
  l.588-962), `useTimedToasts()` (4 paires state+timeout identiques l.731-753), contexte
  `GlGameContext` pour le prop-drilling. Gain estimé −10-15 % de re-renders.
- `socket.io-client` importé statiquement (`AppGL.jsx:2`) alors qu'utile seulement en partie active →
  `import()` dynamique sortirait le chunk du chargement initial (idem `useForetmapRealtime` côté ForetMap).
- `src/gl/styles/gl-theme.css` (7 692 L) chargé en entier, y compris les styles des écrans admin
  lazy → scinder `gl-admin.css` importé par les vues lazy.
- Cache LRU sur `marked.parse()` (autolinks glossaire/lore) : −5-10 % CPU sur les grandes listes.

### 3.6 Assets et réseau

- **`server.js:356-368`** : aucun `Cache-Control` long sur `dist/assets/*` (noms hashés donc
  immuables par construction) → chaque visite revalide JS/CSS/wasm, dont **2×1,9 Mo de wasm Rive**.
  Correctif : `public, max-age=31536000, immutable` si le chemin matche `/assets/` (HTML reste `no-store`).
- Chunk visite couplé au barrel `map-views` : `visit-views.jsx:90` importe `Lightbox` (wrapper 8 L)
  et `VisitDetailPanel.jsx:10-14` trois panneaux via `../map-views` → tire les 1 276 L de
  `map-views` + `MarkerModal` + gestes dans le graphe du chunk **payé par le visiteur invité**.
  Importer directement `shared/components/ImageLightbox.jsx` et `./map/…`.
- `foretmap-views.jsx:6-15, 843-860` : ré-exports morts (`TasksView`, `MapView`…) qui tirent
  `tasks-views` + `map-views` dans le chunk lazy biodiversité → supprimer.
- `VisitMascotFallbackSvg.jsx` (723 L de SVG, chargé eagerly comme fallback Suspense) : une seule
  silhouette sert par session → découpage possible (gain modeste, après le point barrel).

### 3.7 Refetchs et effets

- `tasks-views.jsx:185-202` et `tutorials-views.jsx:137-154` : `fetchTutorialReadIds` avec dep
  `[tutorials]` → **refetch à chaque tick du polling** (nouvelle identité du tableau) → dep sur clé
  stable ; même motif `visit-views.jsx:363-380`.
- `settings-admin-views.jsx:177-190` : chaque sauvegarde (même un checkbox) refait `load()` complet →
  mise à jour locale, rechargement seulement en erreur.
- `VisitMascotPackManager.jsx:241-247` : 3 refetchs systématiques par retour d'onglet.
- `foretmap-views.jsx:146-147, 285-287` : `zonesForPlant`/`markersForPlant` O(plantes×(zones+repères))
  par rendu → `Map plantId → {zones, markers}` mémoïsée.
- `FoodWebGraph.jsx:247-275` : drag/pan en setState par pointermove (throttle rAF ou transform en ref) ;
  `onPointerMove` redondant par nœud (l.566).

---

## 4. Mutualisation — Backend

### 4.1 Cluster « tasks » : ~450 lignes recopiées entre 3 fichiers (gain n°1 backend)

- **Fichiers** : `routes/tasks.js` vs `routes/tasks/proposals.js:45-300` vs
  `routes/tasks/assignments.js:48-215` — copies **assumées** (« recopiés … pour éviter tout import
  circulaire »). Or ces helpers ne dépendent que de `database.js` et `lib/*` : un module
  `lib/tasks/taskQueries.js` ne crée **aucun cycle** (le répertoire `lib/tasks/` existe déjà).
- Fonctions dupliquées ×2-3 : `parseOptionalAuth`, `mapExists`, `getZone`/`getMarker`,
  `validateTaskLocations`, `replaceTaskJoinRows`, `setTask*`, `syncLegacyLocationColumns`,
  `getTaskProposerStudentId`, `fetch{Zones,Markers,Tutorials,Referents}ForTasks`,
  `getTaskWithAssignments`, `recalculateTaskStatus`.
- **Risque** : moyen — bonne couverture `tests/tasks*.test.js` ; comparer les corps au diff près
  avant fusion (petites divergences possibles).

**Statut juillet 2026** : partiellement livré dans `lib/tasks/taskQueries.js`. Le module contient
le parsing auth optionnel, la validation groupée zones/repères (`validateTaskLocations` sans N+1),
les remplacements multi-valeurs des jointures, la synchronisation des colonnes legacy et les loaders
batchés tâches → zones/repères/tutoriels/référents. Les helpers d'écriture acceptent `dbx`/`tx` pour
être utilisés dans une transaction englobante.

### 4.2 Paires « Lore vs non-Lore » GL (~600-800 lignes)

Similarités mesurées par diff réel (token `Lore` neutralisé) :

| Paire                                                                                            | Mesure                                                                          | Cible                                                              |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `lib/glQcmImport.js` (818 L) ↔ `glQcmLoreImport.js` (861 L) (+ `fmQuizImport.js` même squelette) | ~50 % identiques                                                                | `lib/shared/xlsxImportCore.js` (moteur mutualisé, schémas séparés) |
| `lib/glQcmCrud.js` ↔ `glQcmLoreCrud.js`                                                          | ~60 %                                                                           | normalisation + UPDATE dynamique paramétrés                        |
| `lib/glQcmQuestionQuery.js` ↔ `glQcmLoreQuestionQuery.js`                                        | seules table et colonnes diffèrent                                              | générique `{ table, select }`                                      |
| `lib/glMarkerQuestionPool.js` ↔ `glMarkerLoreQuestionPool.js`                                    | `fisherYates`, `applyTextSearch`, `applySelectedCodes` identiques ligne à ligne | `lib/shared/questionPoolFiltering.js`                              |
| `lib/glGlossaryMatch.js` ↔ `glLoreGlossaryMatch.js`                                              | normalisation identique                                                         | `lib/shared/glossaryNormalization.js`                              |
| `routes/gl/lore.js:1195-1226` ↔ `qcm.js:200-230`                                                 | handler tirage quasi identique                                                  | helper paramétré par colonne de scope                              |

Ordre conseillé : petits modules purs d'abord (Query → Pool → Match → Crud → Import).

**Statut juillet 2026** : un premier noyau de tirage a été mutualisé dans
`lib/gl/questionDrawShared.js` pour les chemins QCM/lore. Les imports, CRUD et pools complets
restent à traiter par paires avec tests dédiés.

### 4.3 Helpers dupliqués (mutualisation triviale, risque faible)

| Helper                               | Canonique                                                | Doublons                                                                                                                                                                                 |
| ------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `normalizeOptionalString`            | `lib/shared/httpHelpers.js:3`                            | ×8+ : `server.js:112`, `lib/fmQuizCrud.js:32`, `fmQuizImport.js:172`, `helpContent.js:72`, `identity.js:3`, `mediaLibrary.js:98`, `taskRouteHelpers.js:36`, imports GL                   |
| `normalizeImportHeader`              | —                                                        | ×6 strictement identiques (`glQcmImport.js:210`, `glSpellsImport.js:120`, `fmQuizImport.js:177`, `glGlossaryImport.js:93`, `glLoreGlossaryImport.js:38`, `glChapterCharteImport.js:125`) |
| `getPasswordMinLength`               | `lib/passwordReset.js:43-48`                             | `routes/rbac.js:85-90`, `routes/students.js:338`                                                                                                                                         |
| `rethrowSlugConflict`                | `lib/slugConflict.js`                                    | `routes/groups.js:34-41`                                                                                                                                                                 |
| `parseId`                            | —                                                        | ×10 dans `routes/gl/games*`                                                                                                                                                              |
| `isVisitorRole`                      | `lib/taskAuthzHelpers.js:64`                             | `routes/context-comments.js:88`, `routes/forum.js:76`                                                                                                                                    |
| `normalizeIdArray`                   | `lib/taskRouteHelpers.js:228`                            | `lib/tutorialRouteHelpers.js:82`, `routes/task-projects.js:25`                                                                                                                           |
| `mapExists`                          | —                                                        | **9 fichiers de routes** (21 requêtes `FROM maps WHERE id`)                                                                                                                              |
| Helpers OAuth purs                   | `lib/authRouteHelpers.js` ↔ `lib/gl/authRouteHelpers.js` | `parseCsvLowercaseSet`, `googleOauthConfigured`, `isGoogleEmailAllowed` identiques → `lib/shared/oauthCommon.js` (fonctions pures uniquement)                                            |
| Placeholders `IN (…)`                | `buildInClauseParams` (`lib/shared/httpHelpers.js`)      | **103 occurrences** de `.map(() => '?').join(',')`                                                                                                                                       |
| Expression SQL `author_display_name` | —                                                        | ×9 (`forum.js` ×4, `context-comments.js`, `groups.js` ×2, `rbac.js`, `lib/shared/contextCommentsCore.js`)                                                                                |

Autres motifs backend factorisables : `replaceJunctionRows` générique (4 implémentations dont 2 en
N+1, cf. §2.3) ; batch loaders `fetch*For*` (9 fonctions quasi identiques entre tasks /
task-projects / tutorials) ; cluster « visit » (`nowIso`, `resolveVisitMapId`, `mapExists` recopiés
dans 5 sous-fichiers de `routes/visit/`) ; slug unique par `while(true)` dupliqué
(`tutorials.js:255-258`, `lib/importTutosFromFilesystem.js:142-145`) ; `admin.js:508-548` GL
(`reset-password`/`reset-pin` identiques au champ près) ; `upsertGlSetting` + table de validateurs
pour `admin.js:873-1079` (207 L) ; `isMj(req)` (×17 tests inline `userType === 'gl_admin'`).

**Statut juillet 2026** : les helpers OAuth strictement purs sont extraits dans
`lib/shared/oauthCommon.js`. Garder locales les sessions, redirects, claims et variantes produit :
ce module ne doit contenir aucune I/O, aucun accès `req/res`, DB ou `process.env` runtime.

### 4.4 Reliquats de migration O8 (asyncHandler)

27 `respondInternalError` résiduels côté ForetMap (dont `routes/learning-links.js` entièrement non
migré — 9 occurrences), 76 `catch (err)` manuels côté GL (`forum.js`, `journal.js`,
`learning-links.js`, `games/markers.js`, `games/qcm.js`, `games/spell-casts.js`). Terminer route par
route en conservant les catch « spéciaux » (conflits de slug, nettoyage d'images).

**Statut juillet 2026** : rollout avancé depuis le constat initial. `routes/auth.js`,
`routes/students.js`, `routes/rbac.js`, `routes/plants.js` et `routes/gl/games/markers.js` utilisent
désormais `lib/asyncHandler` sur les handlers génériques récemment migrés, tout en conservant les
blocs spécifiques nécessaires (transactions, conflits, rollback, statuts métier).

---

## 5. Mutualisation — Frontend

### 5.1 Frontière de bundle et rangement (préalable)

- **`withAppBase`** : 14 imports GL tirent tout `src/services/api.js` (session ForetMap,
  `AccountDeletedError`, événements prof) pour 8 lignes utiles → déplacer `API`+`withAppBase` dans
  `src/shared/appBase.js`, ré-export de compat dans `api.js`.
- **16 utilitaires GL rangés dans `src/utils/`** alors qu'importés uniquement par GL (vérifié par
  résolution des imports) : `glBrandTheme`, `glFeuilletZones`, `glMapZoneDetect`,
  `glMarkerAppearance`, `glMarkerEffects`, `glMarkerEventConfig`, `glMascotCatalog`,
  `glMascotPackToVisit`, `glNormMapCoords`, `glPointInPolygon`, `glZoneAtPct`,
  `glZoneContentDetect`… → déplacer vers `src/gl/utils/` (les « cores » partagés sont déjà dans
  `src/shared/`). Garder sous `src/utils/` les 4 réellement partagés (`glImageFrame`,
  `glMascotPack`, `glGlossaryAutolink`, `glLoreGlossaryAutolink`). Attention aux miroirs
  `sync:*-pack-lib` et aux tests node qui importent `src/utils/gl*`.

### 5.2 Boucle fetch/retry `api` / `apiGL` (~90 lignes clonées)

- `src/services/api.js:294-381` vs `src/gl/services/apiGL.js:49-143` : même boucle
  attempt/AbortController/timeout/`parseApiBody`/retry — seuls diffèrent le getter de jeton et la
  réaction au 401. **Dérive déjà visible** (gestion `code:'jwt_expired'` différente).
- Correctif : `fetchJsonWithRetry({ getToken, onUnauthorized, messages })` dans `src/shared/` ;
  `api()` et `apiGL()` deviennent des adaptateurs. **Ne jamais fusionner les stores de session**
  (`foretmap_session` / `gl_session`) — c'est la garantie de l'isolement produit.
- Même logique : `downloadGlFile.js` (51 L) vs `downloadApiFile.js` (48 L) → `src/shared/downloadAuthedFile.js`.

### 5.3 Familles de clones

| Famille                     | Fichiers                                                                                                                                                                                                                                                                  | Similarité                                                | Cible                                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Éditeurs de questions QCM   | `src/gl/components/admin/GLQcmQuestionEditorPanel.jsx` (354 L), `GLQcmLoreQuestionEditorPanel.jsx` (353 L), `src/components/pedago/admin/FMQuizQuestionEditorPanel.jsx` (353 L) + formulaires `glQcm*EditorForm.js` / `fmQuizEditorForm.js`                               | ~68-75 %                                                  | `src/shared/qcm/QuestionEditorPanel.jsx` piloté par descripteur `{ fields, endpoints, labels, toForm, toPayload }`, client HTTP injecté (−~600 L)                         |
| 6 hooks « arrival » GL      | `useGLMarkerArrival` (265 L), `useGLFeuilletZoneArrival` (196 L), `useGLLoreFeuilletArrival` (157 L), `useGLZoneContentArrival` (140 L), `useGLGuestFeuilletArrival` (131 L), `useGLZoneMusicArrival` (56 L)                                                              | 60-75 % (mêmes refs, même dédup `PRESENT_DEDUPE_MS=3000`) | noyau `useGLZonePresence({ onEnter, dedupeMs })` + stratégies (−~400 L) — risque moyen-élevé, tests avant refactor                                                        |
| Panneaux CRUD admin GL      | `GLSpeciesEditorPanel` ↔ `GLSpellsEditorPanel` (~80 %), `GLGlossaryEditorPanel`, `GLLoreFeuilletsEditorPanel` (513 L, 17 useState)                                                                                                                                        | même squelette loadList/startNew/persist/autosave         | hook `useGlAdminCrud({ listPath, itemPath, toForm, toPayload })`                                                                                                          |
| Autolinks glossaire         | `src/utils/glGlossaryAutolink.js` (186 L) ↔ `glLoreGlossaryAutolink.js` (145 L) + les 2 hooks d'index                                                                                                                                                                     | quasi identiques                                          | `glTermAutolink.js` paramétré `{ codeField, cssClass, dataAttr }` (−~150 L)                                                                                               |
| Modales carte               | `MarkerModal.jsx` ↔ `ZoneInfoModal.jsx` : panneaux tâches prof/élève et tutoriels (~110 L identiques), aside visite (~95 L), dérivations `linkedTasks`/`assignable*`, médias visite (comparateur de tri copié ×4), barres d'onglets identiques au caractère près          | ~400 L                                                    | paramétrer les panneaux extraits (`ZoneTasksPanel`, `ZoneTutorialsPanel`) par `locationKind`, hooks `useLocationModalData` / `useVisitMediaBlocks`, `LocationModalTabBar` |
| Pick-lists de formulaires   | `TaskFormModal.jsx:461-514` ≡ `TaskProjectFormModal.jsx:257-310` ≡ `TutorialEditorPanel.jsx:100-152` (+ toggles, recherche tutoriels, champ tutoriels réimplémenté inline alors que `TaskFormTutorialsField` existe)                                                      | ~150 L                                                    | `<LocationPickList/>` + réutiliser `TaskFormTutorialsField`                                                                                                               |
| Panneaux d'import           | `TaskImportPanel.jsx:76-173` ≡ `StudentImportPanel.jsx:21-119` ≡ `PlantImportPanel.jsx` (même `accept`, même rapport `errors.slice(0,15)`)                                                                                                                                | ~120 L                                                    | `ImportPanel({ templateEndpoint, importEndpoint, totalsRenderer })`                                                                                                       |
| Matcher d'assignation élève | ×4 : `taskComputations.js:47-65` ≡ `task-assignments.js:5-25` (strictement identiques), `TaskTileCard.jsx:109-126`, `taskDisplayHelpers.js:16-45` (+ variantes `App.jsx:790-801`, `useNotificationCenter.js:302-323`)                                                     | —                                                         | `assignmentMatchesStudent(assignment, student)` unique dans `task-assignments.js`                                                                                         |
| Géométrie                   | `parseZonePointsJson` ≡ `parseVisitZonePoints` (identiques ligne à ligne) + 3 parses inline dans `map-views.jsx` ; `computeBiodivMapFitRect` ≡ `computeMapImageContainRect` ; formule de zoom pivot ×4 dans `useMapGestures` alors que `zoomVisitTransformToScale` existe | —                                                         | `utils/zoneGeometry.js` unique + ré-exports d'alias                                                                                                                       |
| Hooks divers                | `usePrefersReducedMotion` réimplémenté ×4 alors que `src/shared/hooks/` l'a ; 3 wrappers `Lightbox` ; fetch+listener `foretmap_session_changed` ×4 ; `downloadApiFile` réimplémenté à la main ×3 (`profiles-views.jsx:666-687, 724-740`, `TaskImportPanel.jsx:19-42`)     | —                                                         | imports partagés, hooks `useTutorialReadIds` / `usePlantObservationCounts`                                                                                                |

**Statut juillet 2026** : `src/utils/zoneGeometry.js` est le module fédérateur pour le parsing des
polygones et le rectangle `object-fit: contain`; les anciens modules réexportent les alias publics.
`src/utils/glTermAutolink.js` mutualise les primitives glossaire SVT/lore, en laissant le rendu et la
sanitisation aux modules appelants.

### 5.4 Hook manquant : `useApiResource`

~30 réimplémentations du trio `data/loading/error` + fetch + garde anti-course (grep confirmé :
`tasks-views`, `tutorials-views`, `profiles-views` — 14 `setLoading(true)` —, `settings-admin-views`,
`foretmap-views` ×3, `visit-views` ×2, `VisitMascotPackManager` ×4, pedago ×3, forum…).
→ `useApiResource(fetcher, deps, { onForceLogout })` retournant `{ data, loading, error, reload }`
avec annulation et gestion `AccountDeletedError` (le helper `safeApi` d'`App.jsx:574-582` est le
pattern à généraliser). Migration progressive, vue par vue. Complément : couche
`services/resources/*.js` par domaine (108 appels `api('/api/…')` éparpillés dans 38 fichiers).

**Statut juillet 2026** : le hook existe dans `src/hooks/useApiResource.js` et est couvert par
`tests-ui/hooks/useApiResource.test.jsx`. Il fournit la garde anti-course et `reload`; la migration
des vues reste volontairement progressive et doit injecter un `fetcher` produit-local.

---

## 6. Simplification — God components et gros handlers

### 6.1 Frontend

| Composant                                                                                                                                                           | État actuel                                                                                                      | Découpage proposé (iso-comportement)                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/App.jsx` (2 259 L)                                                                                                                                             | 4 responsabilités mêlées                                                                                         | `useAuthSession` (~250 L : forceLogout, impersonation, désélévation inline de 60 L au JSX l.1666-1724), `useAppData` (fetchAll + polling, y intégrer §3.1), `AppHeader` (~255 L) + `NoticeBanner`, **dédupliquer les arbres prof/élève** (l.1789-2043 vs 2057-2229, quasi copiés-collés → `MapTasksArea`, `PedagoTabs`) ; `isTeacher` dérivable de `authClaims` (7 setState jumeaux supprimés). Cible ~850 L |
| `VisitViewImpl` (`visit-views.jsx`, 30 useState, 23 effets)                                                                                                         | données + sync offline + mascotte + pan/zoom + UI                                                                | `useVisitContent`, `useVisitSeenSync`, `useVisitMapMascotController`, `useVisitStagePanZoom` (§3.3), couches `VisitZonesSvgLayer`/`VisitMarkersLayer` mémoïsées                                                                                                                                                                                                                                              |
| `VisitMascotPackManager.jsx` (1 640 L, 33 useState)                                                                                                                 | `onSave` ≈ `onTogglePublish` (diff : 1 champ), `openCatalogModelForEdit` recopie `postNewPack`                   | `savePack({ togglePublish })`, hooks `useMascotPackAssets`, `useMascotPackBulkImageActions` (~200 L autonomes), `useMascotPackEditorState` ; `fileToPngDataUrl` → `src/utils/` (−~300 L)                                                                                                                                                                                                                     |
| `MapViewImpl` (`map-views.jsx`, 1 276 L, 16 useState)                                                                                                               | dessin + édition points + CRUD + modales                                                                         | `useZoneDrawing`, `useZoneEditPoints` (~250 L autonomes), `ZonePolygonsLayer` mémoïsé, `useMapCrudActions`, `MapViewModals`. Cible 300-400 L                                                                                                                                                                                                                                                                 |
| `ProfilesAdminView` (942 L, ~40 useState)                                                                                                                           | 9 états `create*` + 10 `edit*` redescendus 1-pour-1 (21 et 26 props), `ProfilesRbacAdminSection` reçoit 35 props | `CreateUserPanel`/`StudentImportPanel` autonomes (modèle : `TaskImportPanel`), `UserEditModal` piloté par `{ user, fields }` + `onSave(payload)` (−~300 L)                                                                                                                                                                                                                                                   |
| `TasksView` (~35 slots d'état, 10 effets)                                                                                                                           | modales + filtres + données prof + quick-assign + drag                                                           | `useTaskModals`, `useTaskFilters`, `useTeacherTaskData`, `useQuickAssign`, `useTaskDragReorder`                                                                                                                                                                                                                                                                                                              |
| GL : `GLGameMasterConsole` (867 L), `GLChaptersAdminView` (723 L), `GLChapterMapStudio` (695 L), `GLSettingsView` (643 L), `GLContentLibraryView` (475 L, 13 états) | monolithes admin (vues lazy — impact perf faible)                                                                | extraction par section + `useReducer` pour les groupes d'états liés ; opportuniste                                                                                                                                                                                                                                                                                                                           |

### 6.2 Backend — gros handlers

- `routes/gl/games.js:215-423` (PUT, 208 L) et `routes/gl/chapters.js:265-383, 551-674` : if-chains
  de `hasOwnProperty` ×47 → builder déclaratif `buildDynamicUpdate(body, fieldSpecs)` (risque moyen,
  préserver la sémantique « présent mais null »).
- `routes/gl/admin.js:873-1079` (PUT settings, 207 L) → table `{ clé: validateur }` + `upsertGlSetting`.
- `routes/gl/admin.js:646-807` (import joueurs, 162 L) → `importPlayersFromRows()`.
- `routes/gl/games.js:468-582` (POST events, 114 L) → `validateEventPayload(eventType, payload, settings)`.
- `server.js` (964 L) : extraire `routes/admin-ops.js` (garde `DEPLOY_SECRET` dupliquée ×4,
  l.471-629) + middleware `requireDeploySecret`, `routes/health.js` (l.419-460), `lib/rateLimit.js`
  (l.190-288) → ~550-600 L sans changement de comportement.
- `middleware/requireTeacher.js` : bloc verify+hydrate dupliqué ×3 (l.108-177) + littéral auth
  dupliqué ×2 → `resolveAuthOrRespond(req, res, { product })` (−~60 L sur un fichier de sécurité
  central ; à faire tests verts uniquement).
- `routes/tasks.js:586-598` vs `691-704` : bloc SQL `ORDER BY importance` dupliqué → constante.
- `routes/gl/market.js:53-62` : réimplémente `handleMarketError` défini juste au-dessus.

### 6.3 Code mort (suppressions sûres)

- `lib/helpers.js` (43 L) : **jamais importé** (les routes utilisent leurs copies).
- `src/components/mascot/MascotAssetsLibraryPanel.jsx` (264 L) : importé uniquement par son test.
- `src/gl/utils/glQcmCatalogPanel.js` : ré-exports jamais importés.
- `foretmap-views.jsx:6-15, 843-860` : ré-exports morts (cf. §3.6).
- `ZoneInfoModal.jsx:116` (`plantObj` inutilisé), `useMapViewMascot.js:156-166` (`triggerHappy`
  exporté non consommé), prop `onForceLogout` déclarée non utilisée (`TaskTileCard.jsx:77`,
  `VisitMascotStudioPreviewSection.jsx:19/26-34`), `useNotificationCenter.js:460-473`
  (effet no-op + `criticalCount` jamais consommé), `server.js:263, 274` (propriété `message` des
  limiteurs court-circuitée par le `handler` custom), scripts npm morts/doublons
  (`test:load` ≡ `test:load:normal`, `release:*` supplantés par `bump:*`+`ship`).

---

## 7. Infra, build, CI, tests

| #   | Constat                                                                                                                                                                               | Proposition                                                                                                                              | Impact / Risque                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 7.1 | CI : suite backend complète exécutée **deux fois** (`ci.yml:56` `npm run test` puis `:71` `test:coverage`, même commande + coverage)                                                  | garder une seule étape                                                                                                                   | temps CI ÷ ~2 / faible                                                        |
| 7.2 | `lint`, `format:check`, `test:ui` attendent le health-check MariaDB (~40 s) sans en avoir besoin ; bloc `env` DB copié ×4                                                             | 2 jobs parallèles (`quality` sans MySQL, `backend`) + `env` hissé au job                                                                 | plusieurs minutes / faible                                                    |
| 7.3 | 305 processus node:test séquentiels, 119 appels `initSchema()` relisant 156 migrations chacun                                                                                         | mémoïser « schéma à jour » par run dans `tests/helpers/setup.js` (hash des migrations) ; essayer `--test-isolation=none` sur une branche | durée `npm test` (payée 2× en CI et à chaque `ship`) / faible→moyen           |
| 7.4 | Dépendances prod front-only ou outillage : `marked`, `isomorphic-dompurify`, `@rive-app/react-canvas`, `turndown` (script) ; `uuid` remplaçable par `crypto.randomUUID()` (Node ≥ 20) | migrer en devDependencies, supprimer `uuid`                                                                                              | deploy runtime plus léger / moyen (vérifier `prepare-runtime-deploy` et cron) |
| 7.5 | `sync-gl-pack-server-lib.js:14-22` : transpilation ESM→CJS par 3 regex + `module.exports` codé en dur — tout nouvel export produit un miroir silencieusement incomplet                | échouer si le texte transformé contient encore `^import\|^export` ; idéalement mini-passe esbuild `--format=cjs`                         | robustesse d'un piège documenté / faible                                      |
| 7.6 | `eslint.config.cjs` : ~120 L de globals manuels (déjà rustinés) + liste manuelle de 10 fichiers ESM                                                                                   | paquet `globals` + convention de nommage `*.esm.test.js`                                                                                 | config 210→~90 L / faible                                                     |
| 7.7 | `vite.config.js:60` : `id.includes('node_modules/react')` matche tout paquet `react*` ; `scheduler` non capturé                                                                       | regex `/node_modules\/(react\|react-dom\|scheduler)\//`                                                                                  | faible                                                                        |
| 7.8 | ~7 fichiers de test redéfinissent un wrapper 1-ligne `getAdminToken` autour de `ensureAdminTeacherAuthToken`                                                                          | déplacer dans `helpers/adminAuth.js`                                                                                                     | faible                                                                        |
| 7.9 | `db:admin:audit*` codent en dur `--login oliviera9` (donnée personnelle versionnée)                                                                                                   | paramètre/env                                                                                                                            | faible                                                                        |

---

## 8. Plan d'exécution par lots (risque croissant)

Chaque lot suit la routine du dépôt : tests dans le même lot, `npm run lint` + `npm run format:check`

- `npm test` + `npm run test:ui` verts, `CHANGELOG.md`, `npm run bump:*`, commit, push (cf.
  `docs/VERSIONING.md`). Les lots GL en commits `fix(gl)`/`chore(gl)` exclusifs.

1. **Lot 0 — Correctifs P0** (0,5 j) : boucle infinie MarkerModal/ZoneInfoModal (§1.1) ;
   `insertAndEmitGameEvent` avec `insertId` (§1.2) ; garde-fou migrations dupliquées (§1.3).
2. **Lot 1 — Quick wins perf plateforme** (0,5-1 j) : cache immutable `dist/assets` (§3.6) ;
   CI dédupliquée + jobs parallèles (§7.1-7.2) ; index SQL additifs (§2.1) ; suppression `LOWER()`
   (§2.2) ; memo `TasksView` + arrows inline `App.jsx` (§3.2, §3.1 complément).
3. **Lot 2 — Hygiène et code mort** (1 j) : §6.3 ; helpers dupliqués triviaux (§4.3, hooks §5.3
   dernière ligne) ; reliquats asyncHandler (`learning-links.js` en premier, §4.4) ; barrel
   `map-views` et ré-exports morts (§3.6).
4. **Lot 3 — N+1 et transactions** (2-3 j) : `stats /all` (§2.3, le plus rentable) ; groups,
   task-projects, visit, GL (§2.3) ; transactions création tâche/projet (§2.5) ; projections
   `SELECT *` (§2.4).
5. **Lot 4 — Mutualisation backend** (3-5 j) : `lib/tasks/taskQueries.js` (§4.1, fichier par
   fichier) ; `replaceJunctionRows` + batch loaders (§4.3) ; cluster visit ; paires Lore/non-Lore
   GL par taille croissante (§4.2, une paire par lot livrable).
6. **Lot 5 — Mutualisation frontend** (3-5 j) : `withAppBase` → shared puis déménagement des 16
   utils GL (§5.1) ; `fetchJsonWithRetry` (§5.2) ; identité des tableaux `fetchAll` (§3.1) ;
   modales carte (§5.3) ; `useApiResource` en fil de l'eau (§5.4).
7. **Lot 6 — Découpages structurants** (au fil de l'eau) : App.jsx, VisitView, MapView,
   VisitMascotPackManager, ProfilesAdminView, AppGL (§6.1) ; gros handlers GL (§6.2) ; éditeurs
   QCM génériques et hooks « arrival » (§5.3, avec tests préalables).

## 9. Garde-fous anti-régression (transverses)

- **Contrats API intouchables** : statuts HTTP, corps `{ error }` et **messages français exacts**
  (testés dans `tests/*.test.js`), ordre 403-avant-400, 404 vs 403 (`games.js` join-team),
  `sort_order`, skip silencieux des ids inconnus.
- **Isolement produit GL** : mutualiser uniquement des **fonctions/composants purs** vers
  `lib/shared/` et `src/shared/` ; getter de jeton et gestion 401 toujours **injectés** ; jamais de
  fusion des stores de session ni des claims/redirects OAuth.
- **Comportement métier gelé** : matching d'assignation par prénom+nom (legacy), promotion des
  rôles (`syncStudentPrimaryRoleFromProgress`), récurrence des tâches — extraire sans modifier
  (cf. `docs/EVOLUTION.md`).
- **Tests** : GL séquentiels obligatoires ; e2e après `npm run build` ; ajouter des tests **avant**
  les refactors à risque moyen+ (hooks « arrival », `requireTeacher.js`, stats `/all`).
- **Miroirs CJS** : tout déplacement de `src/utils/glMascotPack.js` ou fichiers synchronisés doit
  passer par `sync:visit-pack-lib` / `sync:gl-pack-lib` (et §7.5 durcit ce point).
