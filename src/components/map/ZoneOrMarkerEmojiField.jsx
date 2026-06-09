import React from 'react';
import { clampEmojiInput } from '../../constants/emojis';

/**
 * Champ de saisie d'emoji (zone/repère) — input libre + libellé de grille + bouton « sans emoji ».
 * Partagé par ZoneInfoModal / ZoneDrawModal / MarkerModal ; extrait de `map-views.jsx` (O6).
 */
export function ZoneOrMarkerEmojiField({ id, value, onChange, maxLen, gridLabel = 'Ou choisir dans la liste :', allowNone = false }) {
  return (
    <>
      <input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        maxLength={maxLen}
        placeholder={allowNone ? 'Emoji optionnel…' : 'Colle ou tape un emoji…'}
        value={value}
        onChange={(e) => onChange(clampEmojiInput(e.target.value, maxLen))}
        style={{ fontSize: '1.2rem', width: '100%', maxWidth: 140 }}
      />
      <div style={{ fontSize: '.78rem', color: '#777', margin: '8px 0 6px' }}>{gridLabel}</div>
      {allowNone ? (
        <button
          type="button"
          className={`emoji-btn ${!String(value || '').trim() ? 'sel' : ''}`}
          style={{ marginBottom: 8, fontSize: '.78rem', padding: '6px 10px' }}
          onClick={() => onChange('')}
        >
          Sans emoji
        </button>
      ) : null}
    </>
  );
}
