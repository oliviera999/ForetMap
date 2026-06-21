import React, { useEffect, useState } from 'react';
import { scopeLabel, buildConstraintHelp } from '../../utils/settingDisplay.js';

/**
 * Champs pilotés des réglages admin (texte + nombre) — extraits de `settings-admin-views.jsx` (O6).
 *
 * Brouillon local commité au blur (uniquement si la valeur a changé), resynchronisé quand la
 * valeur serveur arrive ou change ; contraintes (longueur max, min/max) appliquées sur le champ
 * et rappelées dans le texte d'aide.
 */

/** Champs texte pilotés par l’état : collage (Ctrl+V / presse-papiers) fiable + resync après chargement serveur. */
export function AdminTextSettingField({ rowKey, label, row, serverValue, disabled, onSave }) {
  const multiline =
    row._multiline || (row?.constraints?.maxLength != null && row.constraints.maxLength > 100);
  const maxLength = row?.constraints?.maxLength;
  const maxLenN = maxLength == null ? NaN : Number(maxLength);
  const maxLenProp = Number.isFinite(maxLenN) && maxLenN > 0 ? maxLenN : undefined;
  const synced = serverValue == null ? '' : String(serverValue);
  const [draft, setDraft] = useState(synced);
  useEffect(() => {
    setDraft(synced);
  }, [rowKey, synced]);

  const commit = () => {
    const next = draft || '';
    if (next === synced) return;
    onSave(rowKey, next);
  };

  return (
    <div className="field">
      <label>
        {label}
        <span style={{ marginLeft: 8, fontSize: '.74rem', color: '#6b7280' }}>
          ({scopeLabel(row.scope)})
        </span>
      </label>
      {multiline ? (
        <textarea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          maxLength={maxLenProp}
          disabled={disabled}
        />
      ) : (
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          maxLength={maxLenProp}
          disabled={disabled}
        />
      )}
      <div style={{ fontSize: '.74rem', color: '#6b7280', marginTop: 3 }}>
        {buildConstraintHelp(row)}
      </div>
    </div>
  );
}

/** Champ nombre piloté : resynchronisation après chargement serveur (comme AdminTextSettingField). */
export function AdminNumberSettingField({
  rowKey,
  label,
  row,
  serverValue,
  disabled,
  min,
  max,
  fallback,
  onSave,
}) {
  const synced = Number.isFinite(Number(serverValue)) ? Number(serverValue) : fallback;
  const [draft, setDraft] = useState(String(synced));
  useEffect(() => {
    setDraft(String(Number.isFinite(Number(serverValue)) ? Number(serverValue) : fallback));
  }, [rowKey, serverValue, fallback]);

  const commit = () => {
    const n = parseInt(String(draft).trim(), 10);
    const next = Number.isFinite(n) ? n : fallback;
    if (next === synced) return;
    onSave(rowKey, next);
  };

  return (
    <div className="field">
      <label>
        {label}
        <span style={{ marginLeft: 8, fontSize: '.74rem', color: '#6b7280' }}>
          ({scopeLabel(row.scope)})
        </span>
      </label>
      <input
        type="number"
        min={Number.isFinite(Number(min)) ? Number(min) : undefined}
        max={Number.isFinite(Number(max)) ? Number(max) : undefined}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
      <div style={{ fontSize: '.74rem', color: '#6b7280', marginTop: 3 }}>
        {buildConstraintHelp(row)}
      </div>
    </div>
  );
}
