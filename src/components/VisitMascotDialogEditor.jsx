import React, { useCallback, useMemo, useState } from 'react';
import {
  DEFAULT_VISIT_MASCOT_DIALOG_PROFILE,
  VISIT_MASCOT_DIALOG_EVENT_KEYS,
  VISIT_MASCOT_DIALOG_LABELS,
  VISIT_MASCOT_DIALOG_RUNTIME_ACTIVE_KEYS,
  sanitizeDialogLines,
  sanitizeDialogProfile,
} from '../utils/visitMascotDialogEvents.js';
import {
  getEffectiveDialogProfile,
  pickRandomDialogLine,
} from '../utils/visitMascotDialogApply.js';

/**
 * @param {{
 *   profile: Record<string, string[]>,
 *   onProfileChange: (next: Record<string, string[]>) => void,
 *   inheritedContext?: {
 *     mascotId?: string,
 *     extraCatalogEntries?: unknown[],
 *     globalDefaults?: Record<string, string[]>|null,
 *     catalogOverrides?: Record<string, Record<string, string[]>>|null,
 *   },
 *   allowInheritToggle?: boolean,
 *   previewClassName?: string,
 *   customTriggers?: Array<{ key: string, label?: string, dialog?: string[] }>,
 * }} props
 */
export default function VisitMascotDialogEditor({
  profile,
  onProfileChange,
  inheritedContext = null,
  allowInheritToggle = false,
  previewClassName = 'visit-map-mascot-dialog',
  customTriggers = [],
}) {
  const [previewEventKey, setPreviewEventKey] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [previewVisible, setPreviewVisible] = useState(false);

  const safeProfile = useMemo(() => sanitizeDialogProfile(profile), [profile]);

  const effectiveProfile = useMemo(() => {
    if (!inheritedContext) {
      return getEffectiveDialogProfile({
        globalDefaults: safeProfile,
      });
    }
    return getEffectiveDialogProfile({
      mascotId: inheritedContext.mascotId,
      extraCatalogEntries: inheritedContext.extraCatalogEntries || [],
      globalDefaults: inheritedContext.globalDefaults,
      catalogOverrides: inheritedContext.catalogOverrides,
    });
  }, [inheritedContext, safeProfile]);

  const patchEventLines = useCallback(
    (eventKey, lines) => {
      const next = { ...safeProfile };
      const cleaned = sanitizeDialogLines(lines);
      if (cleaned.length === 0) {
        delete next[eventKey];
      } else {
        next[eventKey] = cleaned;
      }
      onProfileChange(next);
    },
    [onProfileChange, safeProfile],
  );

  const setInherit = useCallback(
    (eventKey, inherit) => {
      const next = { ...safeProfile };
      if (inherit) {
        delete next[eventKey];
      } else {
        const fallback = effectiveProfile[eventKey] ||
          DEFAULT_VISIT_MASCOT_DIALOG_PROFILE[eventKey] || [''];
        next[eventKey] = [...fallback];
      }
      onProfileChange(next);
    },
    [effectiveProfile, onProfileChange, safeProfile],
  );

  const resetEventToDefaults = useCallback(
    (eventKey) => {
      const defaults = DEFAULT_VISIT_MASCOT_DIALOG_PROFILE[eventKey];
      if (!Array.isArray(defaults) || defaults.length === 0) {
        patchEventLines(eventKey, []);
        return;
      }
      patchEventLines(eventKey, [...defaults]);
    },
    [patchEventLines],
  );

  const runPreview = useCallback(
    (eventKey) => {
      const lines =
        allowInheritToggle && !safeProfile[eventKey]
          ? effectiveProfile[eventKey] || []
          : safeProfile[eventKey] || effectiveProfile[eventKey] || [];
      const text = pickRandomDialogLine(lines);
      if (!text) return;
      setPreviewEventKey(eventKey);
      setPreviewText(text);
      setPreviewVisible(true);
      window.setTimeout(() => setPreviewVisible(false), 2600);
    },
    [allowInheritToggle, effectiveProfile, safeProfile],
  );

  return (
    <div className="visit-mascot-dialog-editor">
      {previewVisible && previewText ? (
        <div style={{ marginBottom: 12, position: 'relative', minHeight: 48 }}>
          <div className={previewClassName} role="status" aria-live="polite">
            {previewText}
          </div>
          <p className="section-sub" style={{ fontSize: '0.72rem', marginTop: 4 }}>
            Aperçu — {VISIT_MASCOT_DIALOG_LABELS[previewEventKey] || previewEventKey}
          </p>
        </div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {VISIT_MASCOT_DIALOG_EVENT_KEYS.map((eventKey) => {
          const isRuntimeActive = VISIT_MASCOT_DIALOG_RUNTIME_ACTIVE_KEYS.includes(eventKey);
          const hasOverride = Object.prototype.hasOwnProperty.call(safeProfile, eventKey);
          const lines = hasOverride
            ? safeProfile[eventKey] || []
            : effectiveProfile[eventKey] || [];
          const inheritedLines =
            effectiveProfile[eventKey] || DEFAULT_VISIT_MASCOT_DIALOG_PROFILE[eventKey] || [];
          return (
            <section
              key={eventKey}
              style={{
                border: '1px solid rgba(26,71,49,0.12)',
                borderRadius: 8,
                padding: 10,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <strong style={{ fontSize: '0.88rem' }}>
                  {VISIT_MASCOT_DIALOG_LABELS[eventKey] || eventKey}
                </strong>
                <code style={{ fontSize: '0.72rem', opacity: 0.8 }}>{eventKey}</code>
                <span
                  style={{
                    fontSize: '0.68rem',
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: isRuntimeActive ? 'rgba(26,71,49,0.12)' : 'rgba(0,0,0,0.06)',
                    color: isRuntimeActive ? 'var(--forest, #1a4731)' : 'inherit',
                  }}
                >
                  {isRuntimeActive ? 'Actif au runtime' : 'Réservé'}
                </span>
                {allowInheritToggle ? (
                  <label style={{ fontSize: '0.78rem', marginLeft: 'auto' }}>
                    <input
                      type="checkbox"
                      checked={!hasOverride}
                      onChange={(ev) => setInherit(eventKey, ev.target.checked)}
                    />{' '}
                    Hériter des défauts
                  </label>
                ) : null}
              </div>
              {allowInheritToggle && !hasOverride ? (
                <p className="section-sub" style={{ fontSize: '0.78rem', marginTop: 0 }}>
                  Messages effectifs hérités :{' '}
                  {(inheritedLines.length > 0 ? inheritedLines : ['—']).join(' · ')}
                </p>
              ) : (
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: '0 0 8px',
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  {(lines.length > 0 ? lines : ['']).map((line, idx) => (
                    <li
                      key={`${eventKey}-${idx}`}
                      style={{ display: 'flex', gap: 6, alignItems: 'center' }}
                    >
                      <input
                        className="form-input"
                        type="text"
                        maxLength={160}
                        value={line}
                        disabled={allowInheritToggle && !hasOverride}
                        placeholder="Texte de bulle…"
                        onChange={(ev) => {
                          const nextLines = [...lines];
                          nextLines[idx] = ev.target.value;
                          patchEventLines(eventKey, nextLines);
                        }}
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={allowInheritToggle && !hasOverride}
                        aria-label="Supprimer cette ligne"
                        onClick={() => {
                          const nextLines = lines.filter((_, i) => i !== idx);
                          patchEventLines(eventKey, nextLines);
                        }}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {!allowInheritToggle || hasOverride ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => patchEventLines(eventKey, [...lines, ''])}
                  >
                    Ajouter une ligne
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => resetEventToDefaults(eventKey)}
                >
                  Réinitialiser ForetMap
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => runPreview(eventKey)}
                >
                  Aperçu bulle
                </button>
              </div>
            </section>
          );
        })}
      </div>

      {Array.isArray(customTriggers) && customTriggers.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <h4 className="mascot-pack-wysiwyg__h" style={{ marginBottom: 6 }}>
            Bulles des comportements personnalisés
          </h4>
          <p className="section-sub" style={{ fontSize: '0.78rem', marginTop: 0 }}>
            Bulles jouées par vos déclencheurs personnalisés (priorité sur les bulles définies dans
            l’éditeur de comportements).
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {customTriggers
              .filter((trig) => trig && trig.key)
              .map((trig) => {
                const key = String(trig.key);
                const hasOverride = Object.prototype.hasOwnProperty.call(safeProfile, key);
                const inlineLines = Array.isArray(trig.dialog) ? trig.dialog : [];
                const lines = hasOverride ? safeProfile[key] || [] : inlineLines;
                return (
                  <section
                    key={key}
                    style={{
                      border: '1px solid rgba(26,71,49,0.12)',
                      borderRadius: 8,
                      padding: 10,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                        alignItems: 'center',
                        marginBottom: 8,
                      }}
                    >
                      <strong style={{ fontSize: '0.88rem' }}>{trig.label || key}</strong>
                      <code style={{ fontSize: '0.72rem', opacity: 0.8 }}>{key}</code>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'rgba(26,71,49,0.12)',
                          color: 'var(--forest, #1a4731)',
                        }}
                      >
                        {trig.type === 'tap' ? 'Au tap' : 'Périodique'}
                      </span>
                    </div>
                    <ul
                      style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: '0 0 8px',
                        display: 'grid',
                        gap: 6,
                      }}
                    >
                      {(lines.length > 0 ? lines : ['']).map((line, idx) => (
                        <li
                          key={`${key}-${idx}`}
                          style={{ display: 'flex', gap: 6, alignItems: 'center' }}
                        >
                          <input
                            className="form-input"
                            type="text"
                            maxLength={160}
                            value={line}
                            placeholder="Texte de bulle…"
                            onChange={(ev) => {
                              const nextLines = [...lines];
                              nextLines[idx] = ev.target.value;
                              patchEventLines(key, nextLines);
                            }}
                            style={{ flex: 1 }}
                          />
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            aria-label="Supprimer cette ligne"
                            onClick={() =>
                              patchEventLines(
                                key,
                                lines.filter((_, i) => i !== idx),
                              )
                            }
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => patchEventLines(key, [...lines, ''])}
                      >
                        Ajouter une ligne
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => runPreview(key)}
                      >
                        Aperçu bulle
                      </button>
                    </div>
                  </section>
                );
              })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
