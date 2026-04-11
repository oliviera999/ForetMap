---
name: foretmap-mascot-spritesheet
description: Méthode pour intégrer une mascotte en spritesheet (atlas, frameWidth/frameHeight, rows/cols, fps, aliases d’états, contrôle preview).
---

# Mascotte spritesheet ForetMap

## Quand utiliser ce skill

- Intégration d’un nouveau spritesheet mascotte (ex. OLU).
- Découpage d’une fiche sprite en atlas exploitable.
- Calibration d’animation frame par frame (`row`, `col`, `frames`, `fps`).

## Pré-requis asset

- Export final en PNG (fond transparent recommandé).
- Grille régulière (frameWidth/frameHeight constants).
- États organisés par lignes (ou offsets de colonnes via `col`).

## Intégration technique

1. Déposer l’asset dans `public/assets/mascots/<mascot-id>/`.
2. Déclarer la mascotte dans `src/utils/visitMascotCatalog.js`:
   - `renderer: 'spritesheet'`
   - `spritesheet.src`
   - `frameWidth`, `frameHeight`
   - `stateFrames`
   - `stateAliases` si nécessaire
3. Vérifier le rendu dans `src/components/VisitMapMascotSpritesheet.jsx`.
4. Vérifier la preview dans `src/hooks/useVisitMascotStateMachine.js` + `src/components/visit-views.jsx`.

## Exemple de table d’états

```js
stateFrames: {
  idle: { row: 0, frames: 4, fps: 4 },
  walking: { row: 1, frames: 6, fps: 10 },
  running: { row: 1, frames: 6, fps: 14 },
  talk: { row: 2, frames: 4, fps: 8 },
  celebrate: { row: 3, frames: 5, fps: 12 },
}
```

## Débogage rapide

- Si la ligne est mauvaise: corriger `row`.
- Si l’animation démarre au mauvais frame: utiliser `col`.
- Si animation trop lente/rapide: corriger `fps`.
- Si état non disponible: ajouter `stateAliases` ou fallback vers `idle`.

## Validation

- Unit tests:
  - `tests/visit-mascot-catalog.test.js`
  - `tests/visit-mascot-state.test.js`
- E2E:
  - `e2e/visit-mascot.spec.js` (sélecteur mascotte + boutons preview + `data-mascot-state`)
