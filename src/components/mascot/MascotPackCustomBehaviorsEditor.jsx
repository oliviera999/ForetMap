import React, { useCallback, useMemo } from 'react';
import { buildStateOptions } from '../../utils/visitMascotBehaviorRegistry.js';

/**
 * Éditeur des comportements personnalisés d'un pack mascotte (studio prof) :
 * - `customStates` : états d'animation créés par le prof (clé + libellé) ;
 * - `customTriggers` : déclencheurs pilotés par les données du pack
 *   (`periodic` = ambiant toutes les N s ; `tap` = au clic sur la mascotte).
 *
 * Présentation prop-driven : l'état du pack reste dans le parent (`patchPack`).
 *
 * @param {{
 *   pack: Record<string, unknown>,
 *   patchPack: (partial: Record<string, unknown>) => void,
 * }} props
 */
const CUSTOM_KEY_RE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

function slugifyKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

export default function MascotPackCustomBehaviorsEditor({ pack, patchPack }) {
  const customStates = useMemo(
    () => (Array.isArray(pack.customStates) ? pack.customStates : []),
    [pack.customStates],
  );
  const customTriggers = useMemo(
    () => (Array.isArray(pack.customTriggers) ? pack.customTriggers : []),
    [pack.customTriggers],
  );

  /** Options d'état pour les déclencheurs : canoniques + personnalisés (registre central). */
  const stateOptions = useMemo(() => buildStateOptions(pack), [pack]);

  const patchCustomStates = useCallback(
    (next) => {
      if (next.length) patchPack({ customStates: next });
      else {
        const { customStates: _drop, ...rest } = pack;
        patchPack(rest);
      }
    },
    [pack, patchPack],
  );

  const patchCustomTriggers = useCallback(
    (next) => {
      if (next.length) patchPack({ customTriggers: next });
      else {
        const { customTriggers: _drop, ...rest } = pack;
        patchPack(rest);
      }
    },
    [pack, patchPack],
  );

  const addCustomState = useCallback(() => {
    const used = new Set(customStates.map((s) => s.key));
    let i = customStates.length + 1;
    let key = `etat_${i}`;
    while (used.has(key)) {
      i += 1;
      key = `etat_${i}`;
    }
    patchCustomStates([...customStates, { key, label: `État ${i}` }]);
  }, [customStates, patchCustomStates]);

  const updateCustomState = useCallback(
    (idx, partial) => {
      const next = customStates.map((s, i) => (i === idx ? { ...s, ...partial } : s));
      patchCustomStates(next);
    },
    [customStates, patchCustomStates],
  );

  const removeCustomState = useCallback(
    (idx) => {
      patchCustomStates(customStates.filter((_, i) => i !== idx));
    },
    [customStates, patchCustomStates],
  );

  const addCustomTrigger = useCallback(() => {
    const used = new Set(customTriggers.map((t) => t.key));
    let i = customTriggers.length + 1;
    let key = `comportement_${i}`;
    while (used.has(key)) {
      i += 1;
      key = `comportement_${i}`;
    }
    patchCustomTriggers([
      ...customTriggers,
      {
        key,
        label: `Comportement ${i}`,
        type: 'periodic',
        state: stateOptions[0]?.key || 'idle',
        durationMs: 1200,
        everyMs: 10000,
      },
    ]);
  }, [customTriggers, patchCustomTriggers, stateOptions]);

  const updateCustomTrigger = useCallback(
    (idx, partial) => {
      const next = customTriggers.map((t, i) => (i === idx ? { ...t, ...partial } : t));
      patchCustomTriggers(next);
    },
    [customTriggers, patchCustomTriggers],
  );

  const removeCustomTrigger = useCallback(
    (idx) => {
      patchCustomTriggers(customTriggers.filter((_, i) => i !== idx));
    },
    [customTriggers, patchCustomTriggers],
  );

  return (
    <div className="mascot-pack-custom-behaviors">
      <section className="mascot-pack-custom-behaviors__states">
        <h3 className="mascot-pack-wysiwyg__h">États personnalisés</h3>
        <p className="section-sub" style={{ fontSize: '0.82rem' }}>
          Ajoutez vos propres états d’animation (au-delà de la palette standard). Donnez-leur
          ensuite des images dans la section <strong>États d’animation</strong>. Clé en minuscules
          (lettres/chiffres/tiret/underscore), unique et différente des états standards.
        </p>
        {customStates.map((st, idx) => {
          const keyInvalid = !CUSTOM_KEY_RE.test(String(st.key || ''));
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                alignItems: 'flex-end',
                marginBottom: 8,
              }}
            >
              <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span className="mascot-pack-wysiwyg__label">Clé</span>
                <input
                  className="form-input"
                  style={{ maxWidth: 180, borderColor: keyInvalid ? '#b91c1c' : undefined }}
                  value={st.key || ''}
                  onChange={(ev) => updateCustomState(idx, { key: slugifyKey(ev.target.value) })}
                  placeholder="ex: sort_magique"
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                <span className="mascot-pack-wysiwyg__label">Libellé</span>
                <input
                  className="form-input"
                  value={st.label || ''}
                  onChange={(ev) => updateCustomState(idx, { label: ev.target.value.slice(0, 60) })}
                  placeholder="ex: Sort magique"
                />
              </label>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => removeCustomState(idx)}
              >
                Retirer
              </button>
            </div>
          );
        })}
        <button type="button" className="btn btn-ghost btn-sm" onClick={addCustomState}>
          + État personnalisé
        </button>
      </section>

      <section className="mascot-pack-custom-behaviors__triggers" style={{ marginTop: 18 }}>
        <h3 className="mascot-pack-wysiwyg__h">Déclencheurs personnalisés</h3>
        <p className="section-sub" style={{ fontSize: '0.82rem' }}>
          Créez de nouveaux comportements : <strong>périodique</strong> (la mascotte joue un état de
          temps en temps) ou <strong>au tap</strong> (au clic direct sur la mascotte). Une bulle
          optionnelle peut accompagner le comportement.
        </p>
        {customTriggers.map((trig, idx) => {
          const isPeriodic = trig.type === 'periodic';
          const dialogText = Array.isArray(trig.dialog) ? trig.dialog.join('\n') : '';
          return (
            <div
              key={idx}
              style={{
                border: '1px solid rgba(26,71,49,0.14)',
                borderRadius: 8,
                padding: 10,
                marginBottom: 10,
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="mascot-pack-wysiwyg__label">Clé</span>
                  <input
                    className="form-input"
                    style={{ maxWidth: 170 }}
                    value={trig.key || ''}
                    onChange={(ev) =>
                      updateCustomTrigger(idx, { key: slugifyKey(ev.target.value) })
                    }
                    placeholder="ex: baille"
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <span className="mascot-pack-wysiwyg__label">Libellé</span>
                  <input
                    className="form-input"
                    value={trig.label || ''}
                    onChange={(ev) =>
                      updateCustomTrigger(idx, { label: ev.target.value.slice(0, 60) })
                    }
                    placeholder="ex: Bâille de temps en temps"
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => removeCustomTrigger(idx)}
                >
                  Retirer
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  alignItems: 'flex-end',
                  marginTop: 8,
                }}
              >
                <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="mascot-pack-wysiwyg__label">Type</span>
                  <select
                    className="form-select"
                    value={trig.type || 'periodic'}
                    onChange={(ev) => updateCustomTrigger(idx, { type: ev.target.value })}
                  >
                    <option value="periodic">Périodique (ambiant)</option>
                    <option value="tap">Au tap (clic mascotte)</option>
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="mascot-pack-wysiwyg__label">État joué</span>
                  <select
                    className="form-select"
                    value={trig.state || ''}
                    onChange={(ev) => updateCustomTrigger(idx, { state: ev.target.value })}
                  >
                    {stateOptions.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                        {opt.custom ? ' (perso)' : ''} ({opt.key})
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="mascot-pack-wysiwyg__label">Durée (ms)</span>
                  <input
                    type="number"
                    className="form-input"
                    style={{ maxWidth: 120 }}
                    min={200}
                    max={60000}
                    value={Number(trig.durationMs) || 1000}
                    onChange={(ev) =>
                      updateCustomTrigger(idx, { durationMs: Number(ev.target.value) || 1000 })
                    }
                  />
                </label>
                {isPeriodic ? (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span className="mascot-pack-wysiwyg__label">Intervalle (ms)</span>
                    <input
                      type="number"
                      className="form-input"
                      style={{ maxWidth: 140 }}
                      min={1000}
                      max={600000}
                      step={500}
                      value={Number(trig.everyMs) || 10000}
                      onChange={(ev) =>
                        updateCustomTrigger(idx, { everyMs: Number(ev.target.value) || 10000 })
                      }
                    />
                  </label>
                ) : null}
              </div>

              <label style={{ display: 'block', marginTop: 8 }}>
                <span className="mascot-pack-wysiwyg__label">
                  Bulles (optionnel, une par ligne)
                </span>
                <textarea
                  className="form-input"
                  rows={2}
                  value={dialogText}
                  onChange={(ev) => {
                    const cleaned = ev.target.value
                      .split('\n')
                      .map((l) => l.slice(0, 160).trim())
                      .filter(Boolean)
                      .slice(0, 12);
                    const next = customTriggers.map((t, i) => {
                      if (i !== idx) return t;
                      if (cleaned.length) return { ...t, dialog: cleaned };
                      const { dialog: _drop, ...rest } = t;
                      return rest;
                    });
                    patchCustomTriggers(next);
                  }}
                  placeholder={'Hmm…\nQuelle belle forêt !'}
                />
              </label>
            </div>
          );
        })}
        <button type="button" className="btn btn-ghost btn-sm" onClick={addCustomTrigger}>
          + Déclencheur personnalisé
        </button>
      </section>
    </div>
  );
}
