import React from 'react';
import { GLButton } from '../ui/GLButton.jsx';

/**
 * Sélecteur des sorts d'un chapitre (grimoire), groupés par catégorie.
 * Composant feuille prop-driven : aucun état interne, tout vient du parent.
 *
 * @param {Array} spellsByCategory groupes { slug, nom, spells:[{spell_code, nom, emoji}] }
 * @param {string[]} allSpellCodes tous les codes du catalogue (pour « Tout cocher »)
 * @param {string[]} selectedCodes codes actuellement sélectionnés
 * @param {(code:string, checked:boolean)=>void} onToggleSpell
 * @param {(codes:string[])=>void} onSelectAll
 * @param {(codes:string[])=>void} onDeselectAll
 * @param {()=>void} onClearAll
 */
export function GLChapterSpellsFieldset({
  spellsByCategory,
  allSpellCodes,
  selectedCodes,
  onToggleSpell,
  onSelectAll,
  onDeselectAll,
  onClearAll,
}) {
  return (
    <fieldset className="gl-fieldset">
      <legend>Sorts du chapitre (grimoire)</legend>
      <p className="gl-hint">
        Cochez les sorts disponibles pour ce chapitre en partie (onglet Sortilèges).
      </p>
      <div className="gl-inline-actions gl-inline-actions--wrap">
        <GLButton
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onSelectAll(allSpellCodes)}
          disabled={allSpellCodes.length === 0}
        >
          Tout cocher
        </GLButton>
        <GLButton
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onClearAll()}
          disabled={selectedCodes.length === 0}
        >
          Tout décocher
        </GLButton>
      </div>
      {selectedCodes.length > 0 ? (
        <p className="gl-hint">
          {selectedCodes.length}
          {' '}
          sort(s) sélectionné(s).
        </p>
      ) : (
        <p className="gl-hint">Aucun sort sélectionné.</p>
      )}
      {spellsByCategory.length === 0 ? (
        <p className="gl-hint">
          Catalogue vide — importez des sorts dans Contenus → Sortilèges.
        </p>
      ) : (
        spellsByCategory.map((group) => {
          const groupCodes = group.spells.map((s) => s.spell_code);
          const allInGroup = groupCodes.every((c) => selectedCodes.includes(c));
          return (
            <div key={group.slug} className="gl-chapter-spells-group">
              <div className="gl-inline-actions gl-inline-actions--wrap">
                <strong>{group.nom}</strong>
                <GLButton
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => (
                    allInGroup
                      ? onDeselectAll(groupCodes)
                      : onSelectAll(groupCodes)
                  )}
                >
                  {allInGroup ? 'Tout décocher' : 'Tout cocher'}
                  {' '}
                  (
                  {group.spells.length}
                  )
                </GLButton>
              </div>
              <ul className="gl-chapter-spells-options">
                {group.spells.map((spell) => {
                  const code = spell.spell_code;
                  const checked = selectedCodes.includes(code);
                  return (
                    <li key={code}>
                      <label>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => onToggleSpell(code, event.target.checked)}
                        />
                        <span aria-hidden="true">{spell.emoji || '✨'}</span>
                        {' '}
                        {spell.nom}
                        {' '}
                        <span className="gl-hint">({code})</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })
      )}
    </fieldset>
  );
}
