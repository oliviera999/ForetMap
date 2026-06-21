import React, { useMemo } from 'react';
import { VISIT_MASCOT_STATE } from '../../utils/visitMascotState.js';
import { STATE_OPTIONS, STATE_LABELS } from '../../constants/mascotStateLabels.js';

/**
 * Éditeur d'alias d'états (feuille) : mappe un état canonique vers un autre.
 * La cible par défaut d'un nouvel alias privilégie un état possédant des frames
 * (idle prioritaire). État détenu par le parent via `onChange`.
 * @param {{
 *   stateFrames: Record<string, unknown>,
 *   aliases: Record<string, string>,
 *   onChange: (next: Record<string, string>) => void,
 * }} props
 */
export default function StateAliasesEditor({ stateFrames, aliases, onChange }) {
  const keys = Object.keys(stateFrames || {});
  const rows = useMemo(() => Object.entries(aliases || {}), [aliases]);

  const addRow = () => {
    const used = new Set(rows.map(([a]) => a));
    const aliasKey = STATE_OPTIONS.find((s) => !used.has(s)) || STATE_OPTIONS[0];
    const withFrames = keys.filter((k) => {
      const sf = stateFrames[k];
      if (!sf || typeof sf !== 'object') return false;
      const f = /** @type {{ files?: unknown[], srcs?: unknown[] }} */ (sf);
      return (
        (Array.isArray(f.files) && f.files.length > 0) ||
        (Array.isArray(f.srcs) && f.srcs.length > 0)
      );
    });
    const target = withFrames.includes(VISIT_MASCOT_STATE.IDLE)
      ? VISIT_MASCOT_STATE.IDLE
      : withFrames[0] || VISIT_MASCOT_STATE.IDLE;
    onChange({ ...aliases, [aliasKey]: target });
  };

  return (
    <div>
      {rows.length === 0 ? (
        <p className="section-sub">Aucun alias.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {rows.map(([alias, target]) => (
            <li
              key={alias}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                marginBottom: 8,
                alignItems: 'center',
              }}
            >
              <select
                className="form-select"
                value={alias}
                onChange={(ev) => {
                  const next = { ...aliases };
                  delete next[alias];
                  next[ev.target.value] = target;
                  onChange(next);
                }}
              >
                {STATE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {STATE_LABELS[s] || s} ({s})
                  </option>
                ))}
              </select>
              <span>→</span>
              <select
                className="form-select"
                value={target}
                onChange={(ev) => {
                  onChange({ ...aliases, [alias]: ev.target.value });
                }}
              >
                {STATE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {STATE_LABELS[s] || s} ({s})
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  const next = { ...aliases };
                  delete next[alias];
                  onChange(next);
                }}
              >
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={addRow}
        disabled={rows.length >= STATE_OPTIONS.length}
      >
        + Alias
      </button>
    </div>
  );
}
