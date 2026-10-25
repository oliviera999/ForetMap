# Fresques — Architecture

Moteur générique **« cartes + flèches cause → effet + correction »**, alimenté par des fichiers de
données, dont **La Fresque du Climat – version Enfant (FR, v7.5)** est le premier jeu. Ce
document décrit le modèle de données, le cœur partagé, les composants, l'API, et le plan de
portage vers Gnomes & Licornes (non codé). Côté fonctionnel (non technique) :
`docs/reference/foretmap/fresque-du-climat.md`.

## 1. Garde-fous

- **Licence CC BY-NC-ND** (`public/fresques/<deckId>/LICENCE-NOTICE.md`) : images servies telles
  quelles, jamais retouchées ; rien ne se superpose à l'image d'une carte (les commandes vivent
  dans `.fm-fresque-card__side`, frère de l'image) ; crédit permanent (`FresqueCreditBar`) et dans
  tout export (`fresqueExport.js`, bande de crédit) ; carte « crédits » officielle consultable ;
  test d'empreintes SHA-256 des 92 images (`tests/content/fresque-climat-junior.test.js`). Une
  nouvelle édition = **nouveau dossier versionné** ; `fresque_boards.deck_id` garde l'ancien.
- **Pédagogie** : aucune catégorie « faux » / « erreur » (test de contenu + test du cœur) ;
  indices gratuits ; niveau libre ; fin indépendante du score ; pas de classement côté prof.
- **Isolement** : `src/shared/fresque/**` n'importe aucun code produit (règle ESLint
  `SHARED_PRODUCT_DIRS`) ; l'appel réseau et le jeton sont **injectés** (`api`, `getAuthToken`).

## 2. Contenu statique et registre

```
public/fresques/<deckId>/
  deck.json          foretmap.fresque.deck/1 : cartes, lots, crédits, bandes, cartes spéciales
  correction.json    foretmap.fresque.correction/1 : liens officiels, degrés, disposition
  hints.json         foretmap.fresque.hints/1 : textes originaux ForetMap (indices, retours…)
  LICENCE-NOTICE.md
  cards/*.webp       recto/verso pleine taille (1719 × 1168) + vignettes .sm.webp (640 px)
```

- `lib/fresqueDecks.js` : lit chaque dossier au démarrage (`server.js`), valide la structure
  (zod) et la cohérence inter-fichiers (`crossCheck`), expose `getFresqueDeck`,
  `getFresqueDeckModel` (modèle du cœur, mis en cache), `listFresqueDecks`. Un identifiant hors
  registre est refusé : **aucun chemin n'est construit depuis une saisie**.
- `lib/staticCacheHeaders.js` : `dist/fresques/*` en cache long borné (30 j, sans `immutable` —
  justification dans le fichier). Vite copie `public/` dans `dist/`.
- `scripts/fresques/extraire_cartes.py` : extraction reproductible depuis le PDF officiel
  (SHA-256 contrôlé).

## 3. Cœur partagé (pur)

`src/shared/fresque/fresqueCore.js` (ESM) → miroir CJS `lib/shared/fresqueCore.js`
(`scripts/sync-shared-cores.js`, paire déclarée, `npm run sync:shared-cores`, contrôlé par
`tests/shared-cores-sync.test.js` et le build).

| Fonction                                                                                                       | Rôle                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `buildDeckModel(deck, correction, hints)`                                                                      | cartes par id, lots, `linkSet`, adjacence, degrés, accessibilité ≥ 2 flèches, rôles (`arrivee`, `sans_consequence`, `relais`), bandes, étapes |
| `createInitialState`, `migrateState`, `validateState`                                                          | état v1 (§ 4) ; bornes : cartes connues, ≤ 200 flèches, ≤ 40 post-it, textes ≤ 280, coordonnées 0–100, titre ≤ 60, ≤ 64 Ko                    |
| `cardsOnTable`, `cardsInHand`, `canOpenNextLot`, `openNextLot`, `canEnterUnderstand`, `canGoToStep`, `setStep` | lots et étapes (règle officielle)                                                                                                             |
| `classifyLink(model, from, to, state?)`                                                                        | `boucle` → `doublon` → `trouvee` → piège (`hints.traps`) → `inversee` → `raccourci` → `a_discuter`                                            |
| `evaluateBoard`, `outgoingStats`, `missingOutgoingByCard`                                                      | catégories, manquantes, `{ found, expected, placed, total }`, puces Éclaireur                                                                 |
| `placeCard`, `moveCard`, `flipCard`, `placeAllHand`, `findFreeSpot`, `bandRect`                                | gestes ; « Tout poser » dans la bande en Éclaireur                                                                                            |
| `addLink`, `removeLink`, `setLinkColor`                                                                        | flèches (refus boucle / doublon / hors table / plafond)                                                                                       |
| `addNote`, `updateNote`, `removeNote`, `nudgeNoteAwayFromCards`                                                | post-it (un indice n'est que fermé, jamais supprimé)                                                                                          |
| `nextHint`, `chooseHintTarget`, `nextRungFor`, `acceptRevealedLink`                                            | échelle Lire → Structure → Piste → Révélation, cible déterministe                                                                             |
| `markCorrectionViewed`, `revealNextMissing`, `revealAllMissing`                                                | étape Comprendre                                                                                                                              |
| `recordCheckpoint`, `checkpointMessage`                                                                        | points d'étape                                                                                                                                |
| `setLevel`, `setShowBands`, `setTutorialDone`, `setViewport`, `setCreative`                                    | réglages persistés                                                                                                                            |
| `isComplete`, `summarize`, `diffStates`, `stampAuthor`, `fillTemplate`                                         | fin (21 cartes + correction ouverte), colonnes de suivi, journal, auteur réécrit                                                              |

Tests : `tests/fresque-core.test.js` (52 cas, dont les six pièges et chaque catégorie).

## 4. État du plateau (JSON v1)

```json
{
  "v": 1,
  "deckId": "climat-junior-fr-v7-5",
  "level": "explorateur",
  "step": "lot2",
  "lotReached": 2,
  "tutorialDone": true,
  "showBands": false,
  "cards": { "c04": { "x": 12.5, "y": 30, "flipped": false, "placedAt": "…" } },
  "links": [
    {
      "id": "l1",
      "from": "c04",
      "to": "c07",
      "color": null,
      "revealed": false,
      "createdAt": "…",
      "by": "<userId>"
    }
  ],
  "notes": [
    {
      "id": "n1",
      "kind": "note|hint",
      "text": "…",
      "x": 40,
      "y": 70,
      "color": "yellow|hint",
      "cardId": null,
      "link": null,
      "rung": null,
      "createdAt": "…",
      "by": "<userId>",
      "dismissed": false
    }
  ],
  "hints": { "log": [{ "target": "c21", "rung": 2, "at": "…" }] },
  "checks": [{ "lot": 1, "at": "…", "found": 3, "expected": 4 }],
  "correction": { "viewedAt": null, "revealedMissing": ["c07>c13"] },
  "creative": { "title": "", "arrowColor": null, "favoriteCardId": null },
  "viewport": { "scale": 1, "tx": 0, "ty": 0 },
  "clientSeq": 42
}
```

`viewport.tx/ty` = centre de la vue en % de la table, `scale` = zoom (`usePctMapViewport`
`getViewSnapshot`). `by` est réécrit côté serveur (`stampAuthor`) pour tout élément nouveau.

## 5. Base de données (migration 321)

- `fresque_boards` : `id CHAR(36)`, `deck_id`, `owner_type` (`user` | `team`), `owner_user_id`
  (FK `users`, cascade), `owner_group_id` (FK `groups`, cascade), `owner_key`
  (`user:<id>` / `team:<groupId>`), `active_owner_key` (= `owner_key` si actif, `NULL` archivé),
  **unicité (`deck_id`, `active_owner_key`)**, `level`, `step`, `lot_reached`, `state_json`
  (MEDIUMTEXT), colonnes dénormalisées (`cards_placed`, `links_count`, `links_found`,
  `hints_used`), `status` (`in_progress` | `completed` | `archived`), `edit_revision`,
  `created_at`, `updated_at`, `completed_at`.
- `fresque_board_events` : `id BIGINT`, `board_id` (FK cascade), `actor_user_id` (FK SET NULL),
  `type`, `payload_json`, `created_at`, index (`board_id`, `id`).
- « Recommencer » archive (`active_owner_key = NULL`) et recrée.
- Conservation : suppression avec le compte (FK) ; `scripts/purge-audit-logs.js` purge le journal
  après 12 mois et les plateaux **archivés** après 12 mois sans modification (catégorie
  « historiques » de `scripts/retention-purge.js`).
- `sql/schema_foretmap.sql` porte les deux tables (base neuve).

## 6. API (`routes/fresques.js`, `/api/fresques`)

Voir `docs/API.md` § Fresques. Toutes les routes : `requireAuth`, garde
`requirePedagoModuleOrManager('fresque')` (`ui.modules.fresque_enabled`, défaut `true` ;
éteint : 503 élève, `plants.manage` passe). Corps validés par zod (`lib/validate.js`).
Persistance et droits : `lib/fresqueBoards.js` (`getOrCreateActiveBoard`, `resolveBoardAccess`,
`saveBoardState` — verrou optimiste `lib/editRevision.js` (`fresque_boards` ajoutée à
`EDIT_REVISION_TABLES`), journal par `diffStates`, fin → statut + badge `fresque_climat_junior`
via `awardReward` (propriétaire, ou contributeurs d'une équipe) —, `restartBoard`, `listEvents`,
`overview` scopé par `getScopedStudentIds`). Limiteur `fresqueSaveLimiter` (240/min/compte).

## 7. Front

```
src/shared/fresque/
  fresqueCore.js           cœur pur (§ 3)
  fresqueGeometry.js       flèches bord à bord, décalage des paires, repères (SVG 160 × 100)
  fresqueExport.js         scène d'export pure + rendu canvas (bande de crédit)
  useFresqueBoardState.js  miroir local `fm:fresque:<boardId>` (clientSeq, baseRevision),
                           autosave 500 ms (`useDebouncedAutoSave`), keepalive sur
                           visibilitychange/pagehide, reprise du miroir plus récent, 409 →
                           conflit (reprendre / garder), signal temps réel → reload ou conflit
  FresqueBoard.jsx         orchestration (étapes, niveau, table, main, Comprendre, dialogues)
  FresqueTable.jsx         scène `usePctMapViewport` (mode stage), bandes, cartes, flèches, post-it
  FresqueCard.jsx          recto/verso 3D, glisser (beginExternalDrag), appui long, clavier
  FresqueArrowLayer.jsx    SVG : halo, marqueur, zone de toucher, repères, manquantes, aperçu
  FresqueHand.jsx          main : glisser (fantôme) ou toucher-toucher, « Tout poser »
  FresqueNotes.jsx         post-it élève et indices
  FresqueStepper.jsx, FresqueLevelMenu.jsx, FresqueCreditBar.jsx
  FresqueCorrectionPanel.jsx, FresqueNoteEditor.jsx
src/shared/styles/fresque.css   classes `fm-fresque-*`, couleurs en variables CSS (G&L recolore)
src/components/pedago/FresqueView.jsx         vue ForetMap (jeux, plateau perso / équipe, carnet)
src/components/pedago/FresqueTeacherPanel.jsx suivi prof (filtre groupe, lecture seule)
src/services/fresqueRealtime.js + foretmapSocketRegistry.js   abonnement `subscribe:fresque-board`
```

Navigation : onglet `fresque` (`KNOWN_TAB_VALUES`, `PedagoTabs`, `StudentBottomNav`,
`TeacherTopTabs`, `useTabNavigationGuards`, `resolvePedagoModuleAccess().fresque`). Séances :
action `open_fresque` (`lib/pedagoSessions.js`, `usePedagoSession.js`, `SessionStepEditor`).
Crédit dans « À propos » : `THIRD_PARTY_CREDITS` (`src/utils/appCredits.js`).

Accessibilité : cibles ≥ 44 px (contre-échelle `--fm-fresque-inv` dans la scène zoomée), icône +
couleur, clavier complet, `prefers-reduced-motion` (fondu au lieu du `rotateY`), `aria-live`.

## 8. Temps réel

Après `PUT /boards/:id` : `emitFresqueBoardChanged(boardId, { revision, by, clientSeq })` dans le
salon `fresque:board:<id>`. `subscribe:fresque-board` (`lib/realtime.js`) vérifie
`canReadBoard` (chargé à la demande pour éviter le cycle d'imports), un seul salon par socket,
refus `fresque:board:subscription-refused`. Côté client, `useForetmapRealtime` expose sa socket
au registre ; `subscribeFresqueBoard` (ré)abonne à chaque connexion. Pas de présence, pas de
curseur : la prod tourne en long-polling.

## 9. Tests

- Contenu : `tests/content/fresque-climat-junior.test.js` (job CI « Contenu pédagogique »).
- Cœur : `tests/fresque-core.test.js`. Backend : `tests/fresques-api.test.js`,
  `tests/fresques-realtime.test.js`, `tests/purge-audit-logs-targets.test.js`,
  `tests/pedago-modules-toggle.test.js`, `tests/static-cache-headers.test.js`.
- UI : `tests-ui/shared/fresque/*` (plateau, lot 5, géométrie, export),
  `tests-ui/services/fresqueRealtime.test.js`, onglets / gardes / séances.
- E2e : `e2e/fresque-student.spec.js`, `e2e/fresque-team.spec.js`.

## 10. Plan de portage Gnomes & Licornes (non codé)

Relevé à l'inventaire, à faire dans un lot GL dédié :

- **Tables propres à GL** `gl_fresque_boards` / `gl_fresque_board_events` (même schéma, propriétaire
  = joueur ou équipe de partie), routes sous `/api/gl/fresques/*`, garde `requireGlAuth`, JWT
  `product: 'gl'` (isolement produit : un jeton GL est rejeté hors `/api/gl/*`), salons `gl:*`.
- **Récompense à l'achèvement, jamais au score** (règle anti-effet Matthieu du jeu) :
  `commitFeuilletDiscovery` (`lib/glFeuilletAcquisition.js`) avec `lien_canal = 'fresque'` ;
  migration ajoutant la valeur à `gl_game_feuillet_states.unlocked_via` ; popover
  `GLFeuilletDiscoveryPopover`.
- **Composants** : `FresqueBoard` est réutilisable tel quel (API injectée, classes
  `fm-fresque-*`, couleurs en variables CSS à redéfinir sous `.gl-theme`) ; seul le conteneur
  produit (`src/gl/…`) change.
- **Jeux suivants** : fresque de la Fondation Tara Océan (licence à confirmer avant toute copie
  d'images) ; jeux « trame » dont les cartes sont des espèces de la base : le schéma de jeu
  recevra un champ de face `text` ou `image` (aujourd'hui `recto`/`verso` sont des images), le
  cœur n'en dépend pas.
