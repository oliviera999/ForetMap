/**
 * Liste d'onglets (présentation) des modes du studio mascotte (Packs / Dialogues),
 * extraite de `VisitMascotPackManager` (O6). Rend une barre de boutons `role="tab"`
 * avec l'état `aria-selected`. La logique de sélection reste dans le parent via
 * `onSelectMode`.
 *
 * L'habillage vient de `.fm-subtabs` (`shared/styles/subtabs.css`), la barre de
 * sous-onglets commune à toute l'application. C'étaient auparavant des
 * `btn btn-sm btn-primary/btn-ghost` : des boutons déguisés en onglets, sans rail, donc
 * sans hiérarchie lisible entre navigation principale et sous-section.
 *
 * @param {object} props
 * @param {{ id: string, label: string }[]} props.modes modes disponibles à afficher
 * @param {string} props.activeMode id du mode actuellement sélectionné
 * @param {(modeId: string) => void} props.onSelectMode remonte l'id du mode cliqué au parent
 */
export default function MascotStudioModeTabs({ modes, activeMode, onSelectMode }) {
  return (
    <div className="fm-subtabs visit-mascot-pack-manager__studio-modes" role="tablist">
      {modes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          role="tab"
          aria-selected={activeMode === mode.id}
          onClick={() => onSelectMode(mode.id)}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
