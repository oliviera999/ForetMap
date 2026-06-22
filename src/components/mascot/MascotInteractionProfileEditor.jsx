import React from 'react';
import { VISIT_MASCOT_STATE } from '../../utils/visitMascotState.js';
import { STATE_LABELS } from '../../constants/mascotStateLabels.js';
import {
  VISIT_MASCOT_INTERACTION_EVENT_KEYS,
  VISIT_MASCOT_INTERACTION_LABELS,
  DEFAULT_VISIT_MASCOT_INTERACTION_PROFILE,
} from '../../utils/visitMascotInteractionEvents.js';

/**
 * Onglet « Comportements visite » : édition du profil d'interaction d'un pack v2
 * (mode none/happy/transient par événement, état et durée). Présentation pure :
 * l'état du pack et les mutations restent dans le parent.
 * @param {{
 *   pack: Record<string, unknown>,
 *   onUpgradeToV2: () => void,
 *   onPatchRule: (key: string, partial: Record<string, unknown>) => void,
 *   onTestBehavior?: (key: string) => void,
 * }} props
 */
export default function MascotInteractionProfileEditor({
  pack,
  onUpgradeToV2,
  onPatchRule,
  onTestBehavior,
}) {
  return (
    <div>
      <p className="section-sub" style={{ fontSize: '0.82rem', marginBottom: 10 }}>
        Réactions de la mascotte sur la carte (pack v2). Les valeurs par défaut reproduisent le
        comportement historique.
      </p>
      {Number(pack.mascotPackVersion) !== 2 ? (
        <button type="button" className="btn btn-primary btn-sm" onClick={onUpgradeToV2}>
          Passer ce pack en version 2 (profil d’interaction)
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {VISIT_MASCOT_INTERACTION_EVENT_KEYS.map((key) => {
            const def = DEFAULT_VISIT_MASCOT_INTERACTION_PROFILE[key] || { mode: 'none' };
            const prof =
              pack.interactionProfile && typeof pack.interactionProfile === 'object'
                ? pack.interactionProfile[key]
                : null;
            const mode = prof?.mode || def.mode || 'none';
            return (
              <div
                key={key}
                style={{ border: '1px solid rgba(26,71,49,0.12)', borderRadius: 8, padding: 10 }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <strong style={{ fontSize: '0.88rem' }}>
                    {VISIT_MASCOT_INTERACTION_LABELS[key] || key}
                  </strong>
                  {onTestBehavior ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => onTestBehavior(key)}
                      aria-label={`Tester ${VISIT_MASCOT_INTERACTION_LABELS[key] || key}`}
                    >
                      ▶ Tester
                    </button>
                  ) : null}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  <label>
                    Mode{' '}
                    <select
                      className="form-select"
                      value={mode}
                      onChange={(e) => {
                        const m = e.target.value;
                        if (m === 'none') onPatchRule(key, { mode: 'none' });
                        else if (m === 'happy') onPatchRule(key, { mode: 'happy' });
                        else
                          onPatchRule(key, {
                            mode: 'transient',
                            state: def.mode === 'transient' ? def.state : 'idle',
                            durationMs: def.mode === 'transient' ? def.durationMs : 1500,
                          });
                      }}
                    >
                      <option value="transient">Animation (transitoire)</option>
                      <option value="happy">Joyeux (overlay court)</option>
                      <option value="none">Désactivé</option>
                    </select>
                  </label>
                  {mode === 'transient' ? (
                    <>
                      <label>
                        État{' '}
                        <select
                          className="form-select"
                          value={String(
                            prof?.state ||
                              (def.mode === 'transient' ? def.state : 'idle') ||
                              'idle',
                          )}
                          onChange={(e) =>
                            onPatchRule(key, {
                              mode: 'transient',
                              state: e.target.value,
                              durationMs: prof?.durationMs ?? def.durationMs,
                            })
                          }
                        >
                          {Object.values(VISIT_MASCOT_STATE).map((st) => (
                            <option key={st} value={st}>
                              {STATE_LABELS[st] || st} ({st})
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
                          style={{ width: 100 }}
                          value={
                            prof?.durationMs != null
                              ? Number(prof.durationMs)
                              : def.durationMs != null
                                ? Number(def.durationMs)
                                : ''
                          }
                          placeholder="1500"
                          onChange={(e) =>
                            onPatchRule(key, {
                              mode: 'transient',
                              state: prof?.state || (def.mode === 'transient' ? def.state : 'idle'),
                              durationMs:
                                e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
