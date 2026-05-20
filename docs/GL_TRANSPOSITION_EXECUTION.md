# GL - Execution backlog (monorepo)

Contexte valide:
- GL reste dans le monorepo ForetMap.
- Portee demandee: tout traiter (pas seulement 1-3 modules).

Objectif:
- Transposer les briques ForetMap utiles vers GL sans casser l'existant.
- Garder la mutualisation backend/ops/tests/deploiement.

## Phase 0 - Garde-fous transverses (avant toute feature)

### Etapes
- Ajouter un suivi de drapeau par module GL dans `lib/glSettings.js` (activation progressive).
- Centraliser les cles de flags GL cote front dans `src/gl/services/apiGL.js` (ou `src/gl/constants` si besoin).
- Documenter les nouveaux flags dans `docs/API.md` et `docs/LOCAL_DEV.md`.

### Tests
- Ajouter un test backend GL de lecture de flags dans `tests/gl-settings.test.js`.
- Ajouter un test e2e smoke GL pour afficher/masquer un module selon flag dans `e2e/gl-foundations.spec.js`.

### Documentation
- Mettre a jour `docs/API.md` (section GL settings et endpoints impactes).
- Mettre a jour `docs/EVOLUTION.md` avec la sequence de livraison par phase.

---

## Phase 1 - Mascottes GL avancees (studio + packs + renderer complet)

### 1.1 Backend packs GL
Fichiers cibles:
- `routes/gl/mascots.js`
- `lib/visit-pack/mascotPack.js` (schema partage)
- migrations SQL GL (`migrations/*gl*`)

Travaux:
- Introduire des endpoints GL de packs (CRUD + assets) sur le modele `/api/visit/mascot-packs`.
- Reutiliser la validation Zod existante (`mascotPack`) avec garde product GL.
- Ajouter support sprite library GL (table dediee ou colonne product).

Tests:
- `tests/gl-mascots.test.js` (CRUD packs, validation schema, upload/suppression asset, erreurs 4xx).
- `tests/uploads-public-urls.test.js` (chemins GL publics si nouveaux patterns).

Doc:
- `docs/API.md` (nouveaux endpoints `/api/gl/mascots/packs*`).
- `docs/MASCOT_PACK.md` (section GL).

### 1.2 Front GL renderer & state machine
Fichiers cibles:
- `src/gl/components/*` (nouveaux composants mascotte GL)
- `src/components/VisitMapMascotRenderer.jsx` (extract si mutualisation)
- `src/hooks/useVisitMascotStateMachine.js` (mutualisable)
- `src/utils/visitMascotState.js`

Travaux:
- Reprendre le renderer multi-mode (rive/spritesheet/sprite_cut) dans GL.
- Integrer fallback SVG sur erreurs d'asset.
- Ajouter panneau preview MJ pour tester les etats runtime.

Tests:
- `tests/gl-mascot-catalog.test.js` (catalogue + alias etats).
- `e2e/gl-mascots.spec.js` (preview MJ + rendu joueur + fallback).

Doc:
- `docs/LOCAL_DEV.md` (workflow assets GL).

### 1.3 Studio WYSIWYG GL
Fichiers cibles:
- `src/components/MascotPackWysiwygEditor.jsx` (factorisation)
- `src/gl/components/*pack*`
- `mascot-pack-tool.html` (extension GL ou page GL dediee)

Travaux:
- Exposer un studio GL pour creer/valider/exporter/importer des packs.
- Reutiliser les modeles `mascotPackEditorModel`.

Tests:
- `e2e/gl-mascots.spec.js` (scenario edition + publication pack).

Doc:
- `docs/MASCOT_PACK.md` (workflow complet GL).

---

## Phase 2 - Interaction communautaire (commentaires + forum + notifications)

### 2.1 Commentaires contextuels GL
Fichiers cibles:
- `routes/context-comments.js` (ou routeur GL dedie)
- `src/gl/components/*comments*`

Travaux:
- Ajouter types de contexte GL (`gl_chapter`, `gl_scene`, `gl_game`, `gl_mascot`).
- Activer reactions/signalements et moderation MJ.

Tests:
- Nouveau `tests/gl-context-comments.test.js`.
- e2e dans `e2e/gl-content.spec.js` (poster, reagir, moderer).

Doc:
- `docs/API.md` (contrat context comments GL).

### 2.2 Forum GL dedie
Fichiers cibles:
- `routes/forum.js` (scope product) ou `routes/gl/forum.js`
- `src/gl/components/*forum*`

Travaux:
- Isoler flux GL (threads/posts/reactions) par `product='gl'`.
- Ajouter permissions RBAC GL (`gl.forum.participate`, `gl.forum.moderate`).

Tests:
- Nouveau `tests/gl-forum.test.js`.
- e2e dans `e2e/gl-foundations.spec.js` et/ou nouveau `e2e/gl-forum.spec.js`.

Doc:
- `docs/API.md` + `docs/EVOLUTION.md`.

### 2.3 Centre de notifications GL
Fichiers cibles:
- `src/hooks/useNotificationCenter.js` (factorisation)
- `src/gl/components/*notification*`
- `src/gl/AppGL.jsx`

Travaux:
- Ajouter categories GL (nouvelle action de partie, message MJ, moderation).
- Stockage local specifique GL pour eviter collisions avec ForetMap.

Tests:
- Nouveau `tests/gl-notifications.test.js` (utilitaire pur si extrait).
- e2e `e2e/gl-game-flow.spec.js` (notification visible a l'evenement).

Doc:
- `docs/LOCAL_DEV.md` (comportement et reset local storage GL).

---

## Phase 3 - Pedagogie GL (tutoriels + aide contextuelle + journal de partie)

### 3.1 Tutoriels GL + accusés de lecture
Fichiers cibles:
- `routes/tutorials.js` (scope GL) ou `routes/gl/tutorials.js`
- `src/gl/components/*tutorial*`

Travaux:
- CRUD tutoriels GL (MJ), lecture joueur, accusé `read`.
- Liaison chapitre/scene/evenement de jeu.

Tests:
- Nouveau `tests/gl-tutorials.test.js`.
- e2e `e2e/gl-content.spec.js` (lecture + marquage lu).

Doc:
- `docs/API.md` (endpoints `/api/gl/tutorials*`).

### 3.2 Aide contextuelle GL
Fichiers cibles:
- `src/hooks/useHelp.js`
- `src/gl/components/HelpPanelGL.jsx` (ou reuse)

Travaux:
- Decliner les hints pour joueur novice / MJ.
- Ajouter dismiss persistant par role GL.

Tests:
- Nouveau test utilitaire `tests/gl-help-state.test.js` si extraction de logique.
- e2e smoke dans `e2e/gl-foundations.spec.js`.

Doc:
- `docs/LOCAL_DEV.md` (flags GL help).

### 3.3 Journal de partie (adaptation observations)
Fichiers cibles:
- `routes/observations.js` (pattern a adapter vers GL)
- `routes/gl/games.js`
- `src/gl/components/*journal*`

Travaux:
- Construire un journal d'evenements joueur/MJ (texte + image optionnelle).
- Ajouter vues timeline par partie.

Tests:
- Nouveau `tests/gl-journal.test.js`.
- e2e `e2e/gl-game-flow.spec.js`.

Doc:
- `docs/API.md` + cas d'usage dans `docs/EVOLUTION.md`.

---

## Phase 4 - Carte de royaume GL (image + polygones %)

Fichiers cibles:
- `src/utils/visitMapGeometry.js` (mutualisation)
- `src/gl/components/*map*`
- `routes/gl/content.js` ou `routes/gl/chapters.js` (liens entites -> lieux)

Travaux:
- Reprendre le pattern ForetMap: image de fond + zones polygonales en pourcentage.
- Ajouter edition MJ des zones et liens avec chapitres/scenes.

Tests:
- Nouveau `tests/gl-map-geometry.test.js`.
- e2e `e2e/gl-content.spec.js` (navigation carte -> chapitre).

Doc:
- `docs/API.md` (nouveaux payloads carte GL).
- `docs/LOCAL_DEV.md` (assets map GL).

---

## Phase 5 - Qualite/ops specifiques GL (MCP + QA personae)

### 5.1 MCP diagnostics GL
Fichiers cibles:
- `scripts/mcp-foretmap-diagnostics.mjs`
- `.cursor/mcp.json`
- `docs/MCP_FORETMAP_CURSOR.md`

Travaux:
- Ajouter sorties/indicateurs GL (sessions de jeu, erreurs GL, event replay gap).
- Garder un seul serveur MCP mais outils enrichis GL.

Tests:
- `tests/gl-settings.test.js` ou nouveau `tests/gl-diagnostics.test.js` (si endpoint GL expose de nouveaux champs).

Doc:
- `docs/MCP_FORETMAP_CURSOR.md` (commandes GL).

### 5.2 QA personae GL
Fichiers cibles:
- `docs/QA_AUDIT_PERSONAE_PROMPT.md`
- `.cursor/skills/foretmap-qa-personae/SKILL.md` (ou nouveau skill GL)

Travaux:
- Ajouter 4 personae GL: joueur novice, joueur confirme, MJ, admin GL.
- Ajouter matrice parcours GL (connexion, chapitre, partie live, mascotte, moderation).

Tests:
- Pas de test auto direct; verification via rapport QA.

Doc:
- nouveau rapport type `docs/reports/qa-ux-gl-template.md`.

---

## Sequence de livraison recommandee

1. Phase 0 (flags/garde-fous)
2. Phase 1 (mascottes) -> valeur visible immediate
3. Phase 2 (engagement communautaire)
4. Phase 3 (onboarding + retention)
5. Phase 4 (carte de royaume)
6. Phase 5 (ops/qualite)

## Definition of done (chaque phase)

- Backend:
  - endpoints testes (`npm test`)
  - RBAC applique (permissions explicites)
  - docs API a jour
- Front:
  - flux principal couvert par e2e (`npm run test:e2e`)
  - erreurs utilisateur explicites
  - fallback UI en cas de ressource indisponible
- Ops:
  - aucun impact deploy/check (`npm run deploy:check:prod` conserve)
  - diagnostics GL lisibles (si phase touche observabilite)

## Validation finale

- Executer `npm test`
- Executer `npm run test:e2e` (au moins specs GL)
- Mettre a jour `docs/API.md`, `docs/EVOLUTION.md`, `docs/LOCAL_DEV.md` au fil des phases
- Maintenir coherence `docs/SITE_ISSUES.md` et `docs/SITE_ISSUES.json` si nouveaux risques identifies
