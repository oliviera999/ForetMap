---
name: foretmap-mascot-catalog
description: Guide l’ajout et l’évolution des mascottes visite (catalogue multi-renderer Rive / spritesheet / sprite_cut, états, preview prof/admin, fallback SVG, tests).
---

# Mascottes visite ForetMap (catalogue)

## Quand utiliser ce skill

- Ajout d’une nouvelle mascotte dans la visite.
- Migration d’une mascotte entre renderers (`rive` ↔ `spritesheet` ↔ `sprite_cut`).
- Extension de comportements (`running`, `inspect`, `map_read`, `celebrate`, etc.).
- Ajustement des boutons de preview prof/admin selon la mascotte active.

## Fichiers à connaître

| Fichier | Rôle |
|---------|------|
| `src/utils/visitMascotCatalog.js` | Entrées mascottes, renderer, assets, états supportés |
| `src/utils/visitMascotState.js` | États canoniques + résolution prioritaire + dialogues |
| `src/hooks/useVisitMascotStateMachine.js` | Pilotage runtime/preview et comportements transitoires |
| `src/components/VisitMapMascotRenderer.jsx` | Routeur renderer |
| `src/components/VisitMapMascotRive.jsx` | Rendu Rive + fallback |
| `src/components/VisitMapMascotSpritesheet.jsx` | Rendu spritesheet + fallback |
| `src/components/VisitMapMascotSpriteCut.jsx` | Rendu `sprite_cut` (PNG par frame, manifeste + catalogue) |
| `src/components/VisitMascotFallbackSvg.jsx` | Silhouettes de secours |
| `src/components/visit-views.jsx` | Déclencheurs UI et preview prof/admin |

## Checklist d’intégration

1. Ajouter l’entrée dans `visitMascotCatalog.js` (`id`, `label`, `renderer`, fallback, config renderer).
2. Vérifier les états supportés (`stateAnimations` Rive, `stateFrames` spritesheet, ou `spriteCut.stateFrames` avec `srcs` + `fps` pour `sprite_cut`).
3. Étendre `VISIT_MASCOT_STATE` et `resolveVisitMascotState` si nouveau comportement global.
4. Vérifier la preview prof/admin : boutons dynamiques + animation visible.
5. Couvrir les tests:
   - `tests/visit-mascot-state.test.js`
   - `tests/visit-mascot-catalog.test.js`
   - `e2e/visit-mascot.spec.js`

## Conventions importantes

- Toujours garder un fallback (`fallbackSilhouette`) pour les assets manquants.
- Favoriser des noms d’états stables et explicites (`map_read`, `happy_jump`, etc.).
- Si l’asset ne couvre pas un état, fallback vers `idle` (pas d’erreur runtime).
- Préserver la compatibilité `prefers-reduced-motion`.

## Validation minimale

```bash
node --test tests/visit-mascot-state.test.js tests/visit-mascot-catalog.test.js
```

Puis vérifier au moins le scénario e2e mascotte:

```bash
npm run test:e2e -- e2e/visit-mascot.spec.js
```
