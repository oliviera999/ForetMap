import React, { useMemo } from 'react';
import { VISIT_MASCOT_STATE } from '../../utils/visitMascotState.js';
import { buildStateOptions } from '../../utils/visitMascotBehaviorRegistry.js';

/**
 * Éditeur d'alias d'états (feuille) : mappe un état (canonique ou personnalisé)
 * vers un autre. La cible par défaut privilégie un état possédant des frames
 * (idle prioritaire). État détenu par le parent via `onChange`.
 * @param {{
 *   stateFrames: Record<string, unknown>,
 *   aliases: Record<string, string>,
 *   onChange: (next: Record<string, string>) => void,
 *   pack?: Record<string, unknown>,
 * }} props
 */
export default function StateAliasesEditor({ stateFrames, aliases, onChange, pack = null }) {
  const keys = Object.keys(stateFrames || {});
  const rows = useMemo(() => Object.entries(aliases || {}), [aliases]);
  // Options d'états (canonique + personnalisés du pack) via le registre central.
  const stateOptions = useMemo(() => buildStateOptions(pack), [pack]);

  const addRow = () => {
    const used = new Set(rows.map(([a]) => a));
    const aliasKey = stateOptions.find((o) => !used.has(o.key))?.key || stateOptions[0]?.key;
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
                {stateOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                    {o.custom ? ' (perso)' : ''} ({o.key})
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
                {stateOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                    {o.custom ? ' (perso)' : ''} ({o.key})
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
        disabled={rows.length >= stateOptions.length}
      >
        + Alias
      </button>
    </div>
  );
}
