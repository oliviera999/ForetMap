import React from 'react';

/**
 * Sélecteur d'emoji de l'éditeur de visite (zone / repère), extrait de
 * `VisitEditorPanel` (O6). Présentation pure : l'état du formulaire reste dans le
 * parent, ce composant n'émet que des intentions (clic « sans emoji » / clic emoji).
 * DOM/classes/textes inchangés.
 *
 * Props :
 * - `selectedType` : 'zone' | 'marker' (change le libellé et l'option « Sans emoji »).
 * - `markerEmojis` : liste d'emojis proposés.
 * - `selectedEmoji` : emoji courant (pour marquer le bouton sélectionné).
 * - `onClearEmoji()` : intention de retirer l'emoji (repère uniquement).
 * - `onSelectEmoji(emoji)` : intention de choisir l'emoji donné.
 */
export function VisitEditorEmojiPicker({
  selectedType,
  markerEmojis = [],
  selectedEmoji,
  onClearEmoji,
  onSelectEmoji,
}) {
  return (
    <div className="field">
      <label>
        {selectedType === 'zone'
          ? 'Liste d’emojis (insérer dans le titre de zone)'
          : 'Emoji du repère (optionnel)'}
      </label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {selectedType === 'marker' ? (
          <button
            type="button"
            className={`emoji-btn ${!String(selectedEmoji || '').trim() ? 'sel' : ''}`}
            style={{ fontSize: '.78rem', padding: '6px 10px' }}
            onClick={() => onClearEmoji?.()}
          >
            Sans emoji
          </button>
        ) : null}
        {markerEmojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={`emoji-btn ${selectedEmoji === emoji ? 'sel' : ''}`}
            onClick={() => onSelectEmoji?.(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
