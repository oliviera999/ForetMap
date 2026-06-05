# GL — Brief prototype HUD plateau de jeu (Claude Design)

Document d’entrée pour une session [Claude Design](https://claude.ai/design) : HUD mobile-first du plateau (`GLGameBoard`).

## Contexte

Le plateau affiche simultanément :

- Carte chapitre (`GLPctMapCanvas`) avec markers et mascottes
- Popovers : QCM, effets marker, contenu zone royaume
- Dés virtuels (`GLVirtualDiceDock`)
- Musique de zone (`GLZoneMusicMuteButton`)
- Actions : plein écran, sortilèges, demande d’action joueur

**Problème** : surcharge cognitive, boutons dispersés, styles inline.

## Implémentation de référence (Cursor)

Composant `GLGameBoardHud.jsx` : barre d’actions flottante regroupant plein écran et sortilèges ; musique et dés restent positionnés sur la carte.

## Variantes à prototyper

### Variante A — Barre flottante bas de carte

- Pill semi-transparente : ⛶ Plein écran | ✨ Sort | 🔊 Musique
- Safe area iOS en bas
- Z-index sous les popovers modales

### Variante B — Rail vertical droit

- Icônes empilées à droite de la carte (style FAB stack)
- Labels au focus / long-press

### Variante C — Header carte compact

- Titre chapitre tronqué + actions à droite
- Disparaît en plein écran

### Variante D — Mode « focus carte »

- Par défaut HUD minimal (1 bouton « Outils »)
- Sheet expandable avec toutes les actions

## États à maquetter

| État | Éléments visibles |
|------|-------------------|
| Joueur standard | HUD actions + musique si module actif |
| MJ (déplacement mascotte) | Pas de demande d’action ; pins équipes visibles |
| Plein écran | Bouton Fermer seul en overlay |
| Popover QCM ouvert | HUD masqué ou atténué |
| Dés virtuels actifs | Dock dés + HUD |

## Design system

Mêmes tokens que [GL_UI_PROTO_TOPBAR.md](./GL_UI_PROTO_TOPBAR.md).

Classes existantes : `.gl-board-shell`, `.gl-game-board-head`, `.gl-map-fullscreen-open`.

## Critères de validation

- [ ] Touch 44px minimum sur chaque action
- [ ] Pas de chevauchement avec `.gl-virtual-dice-dock`
- [ ] `prefers-reduced-motion` : pas d’animation HUD agressive
- [ ] Contraste boutons sur fond carte (photo variable)

## Handoff

Retranscrire en `GLGameBoardHud.jsx` + règles dans `gl-theme.css` (section `.gl-board-hud`).
