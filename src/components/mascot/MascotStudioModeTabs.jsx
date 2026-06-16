import React from 'react';

/**
 * Liste d'onglets (présentation) des modes du studio mascotte (Packs / Dialogues),
 * extraite de `VisitMascotPackManager` (O6). Rend une barre de boutons `role="tab"`
 * avec l'état `aria-selected` et la classe active (`btn-primary`/`btn-ghost`).
 * La logique de sélection reste dans le parent via `onSelectMode`.
 * DOM/classes/textes inchangés.
 *
 * @param {object} props
 * @param {{ id: string, label: string }[]} props.modes modes disponibles à afficher
 * @param {string} props.activeMode id du mode actuellement sélectionné
 * @param {(modeId: string) => void} props.onSelectMode remonte l'id du mode cliqué au parent
 */
export default function MascotStudioModeTabs({ modes, activeMode, onSelectMode }) {
  return (
    <div
      className="visit-mascot-pack-manager__studio-modes"
      role="tablist"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
    >
      {modes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          role="tab"
          aria-selected={activeMode === mode.id}
          className={`btn btn-sm ${activeMode === mode.id ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => onSelectMode(mode.id)}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
