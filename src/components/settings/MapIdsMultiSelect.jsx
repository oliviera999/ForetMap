import { useEffect, useRef, useState } from 'react';

import {
  createLatestWriteQueue,
  formatCategoryIdsSetting,
  parseCategoryIdsSetting,
} from '../../utils/categoryIdsSetting.js';

/**
 * Multi-sélection de cartes (ids stockés en chaîne `;`-séparée), sur le modèle de
 * `RoleSlugsMultiSelect` : cases à cocher, écriture immédiate, dernière valeur gagne.
 *
 * Sert à déclarer les plans qu'un produit propose au changement
 * (`ui.<surface>.selectable_map_ids`). La sérialisation est celle des listes d'identifiants
 * déjà en place (`src/utils/categoryIdsSetting.js`) — même format côté serveur.
 *
 * La carte d'accueil du plan n'a pas à être cochée : le serveur l'ajoute toujours à la liste
 * proposée (`lib/planContent.js`). La cocher ne fait pas de mal pour autant.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {unknown} props.value valeur du réglage (`'a;b'`).
 * @param {(next: string) => Promise<void>|void} props.onSave
 * @param {Array<{ id: string, label?: string, is_active?: number|boolean }>} [props.maps]
 * @param {boolean} [props.disabled]
 * @param {string} [props.hint]
 * @param {string} [props.testId]
 */
export function MapIdsMultiSelect({
  label,
  value,
  onSave,
  maps = [],
  disabled = false,
  hint = '',
  testId = 'map-ids-multi-select',
}) {
  const [selected, setSelected] = useState(() => new Set(parseCategoryIdsSetting(value)));
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const dirtyRef = useRef(false);
  const queueRef = useRef(null);
  if (!queueRef.current) {
    queueRef.current = createLatestWriteQueue(
      async (next) => {
        await onSaveRef.current?.(next);
      },
      {
        onIdle: () => {
          dirtyRef.current = false;
        },
      },
    );
  }

  useEffect(() => {
    if (dirtyRef.current) return;
    setSelected(new Set(parseCategoryIdsSetting(value)));
  }, [value]);

  const toggle = (mapId) => {
    if (disabled) return;
    const next = new Set(selectedRef.current);
    const key = String(mapId);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selectedRef.current = next;
    dirtyRef.current = true;
    setSelected(next);
    queueRef.current.push(formatCategoryIdsSetting(next));
  };

  const options = Array.isArray(maps) ? maps : [];

  return (
    <div className="field" data-testid={testId}>
      <span style={{ display: 'block', marginBottom: 6 }}>{label}</span>
      {hint ? (
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 'var(--text-sm)' }}>
          {hint}
        </p>
      ) : null}
      {options.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Aucune carte à proposer.
        </p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {options.map((entry) => {
            const id = String(entry.id);
            const checked = selected.has(id);
            // Une carte inactive n'est jamais servie au lecteur (`lib/planContent.js`) : la
            // laisser cochable sans le dire ferait croire à un plan publié.
            const inactive = entry.is_active === 0 || entry.is_active === false;
            return (
              <label
                key={id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  minHeight: 44,
                  padding: '4px 10px',
                  borderRadius: 8,
                  border: `1px solid ${checked ? 'var(--leaf)' : 'var(--line-muted)'}`,
                  background: checked ? 'color-mix(in srgb, var(--leaf) 12%, white)' : 'white',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: inactive ? 0.6 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(id)}
                />
                <span>
                  {entry.label || id}
                  {inactive ? ' (inactive)' : ''}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
