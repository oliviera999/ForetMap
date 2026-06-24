import React, { useMemo, useState } from 'react';
import { VISIT_MASCOT_STATE } from '../../utils/visitMascotState.js';
import { STATE_LABELS } from '../../constants/mascotStateLabels.js';
import {
  VISIT_MASCOT_INTERACTION_EVENT_KEYS,
  VISIT_MASCOT_INTERACTION_LABELS,
  DEFAULT_VISIT_MASCOT_INTERACTION_PROFILE,
} from '../../utils/visitMascotInteractionEvents.js';

/**
 * Modale : appliquer une règle d’interaction à plusieurs événements visite.
 */
export default function MascotPackInteractionBulkDialog({
  open,
  onClose,
  packVersion = 1,
  defaultTargetState = 'idle',
  onUpgradeToV2,
  onApply,
}) {
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [mode, setMode] = useState('transient');
  const [state, setState] = useState(defaultTargetState);
  const [durationMs, setDurationMs] = useState(1500);

  const needsV2 = Number(packVersion) !== 2;

  const toggleKey = (key, checked) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const selectAllKeys = () => {
    setSelectedKeys(new Set(VISIT_MASCOT_INTERACTION_EVENT_KEYS));
  };

  const clearKeys = () => setSelectedKeys(new Set());

  const selectedList = useMemo(() => [...selectedKeys], [selectedKeys]);

  if (!open) return null;

  const handleApply = () => {
    if (selectedList.length === 0) return;
    const partial =
      mode === 'none'
        ? { mode: 'none' }
        : mode === 'happy'
          ? { mode: 'happy' }
          : {
              mode: 'transient',
              state,
              durationMs: Math.min(60_000, Math.max(300, Number(durationMs) || 1500)),
            };
    onApply?.(selectedList, partial);
    onClose?.();
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal-content mascot-pack-interaction-bulk-dialog"
        role="dialog"
        aria-labelledby="mascot-interaction-bulk-title"
        aria-modal="true"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h3 id="mascot-interaction-bulk-title" className="mascot-pack-wysiwyg__h">
          Comportements visite (lot)
        </h3>
        <p className="section-sub" style={{ fontSize: '0.82rem' }}>
          Choisissez les événements à configurer avec le même mode et le même état d’animation.
        </p>

        {needsV2 ? (
          <div style={{ marginBottom: 12 }}>
            <p className="section-sub" style={{ fontSize: '0.82rem' }}>
              Ce pack est en version 1 — passez en v2 pour enregistrer un profil d’interaction.
            </p>
            <button type="button" className="btn btn-primary btn-sm" onClick={onUpgradeToV2}>
              Passer en version 2
            </button>
          </div>
        ) : null}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={selectAllKeys}>
            Tous les événements
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={clearKeys}>
            Aucun
          </button>
        </div>

        <ul className="mascot-pack-interaction-bulk-dialog__keys">
          {VISIT_MASCOT_INTERACTION_EVENT_KEYS.map((key) => {
            const def = DEFAULT_VISIT_MASCOT_INTERACTION_PROFILE[key] || { mode: 'none' };
            return (
              <li key={key}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={selectedKeys.has(key)}
                    onChange={(ev) => toggleKey(key, ev.target.checked)}
                  />
                  <span>
                    {VISIT_MASCOT_INTERACTION_LABELS[key] || key}
                    <span className="section-sub" style={{ fontSize: '0.72rem', marginLeft: 6 }}>
                      (déf. {def.mode})
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <div
          style={{
            marginTop: 12,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <label>
            Mode{' '}
            <select className="form-select" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="transient">Animation (transitoire)</option>
              <option value="happy">Joyeux</option>
              <option value="none">Désactivé</option>
            </select>
          </label>
          {mode === 'transient' ? (
            <>
              <label>
                État{' '}
                <select
                  className="form-select"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                >
                  {Object.values(VISIT_MASCOT_STATE).map((st) => (
                    <option key={st} value={st}>
                      {STATE_LABELS[st] || st}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Durée ms{' '}
                <input
                  className="form-input"
                  type="number"
                  min={300}
                  max={60000}
                  style={{ width: 96 }}
                  value={durationMs}
                  onChange={(e) => setDurationMs(Number(e.target.value) || 1500)}
                />
              </label>
            </>
          ) : null}
        </div>

        <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={needsV2 || selectedList.length === 0}
            onClick={handleApply}
          >
            Appliquer ({selectedList.length})
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
