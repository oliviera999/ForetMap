import { useEffect, useRef, useState } from 'react';

import { FORETMAP_AUDIENCE_ROLE_OPTIONS } from '../../shared/ui/LocationAudienceFields.jsx';
import {
  createLatestWriteQueue,
  formatRoleSlugsSetting,
  parseRoleSlugsSetting,
} from '../../utils/roleSlugsSetting.js';

/**
 * Multi-sélection de profils (slugs stockés en chaîne `;`-séparée).
 *
 * @param {object} props
 * @param {string} props.label
 * @param {unknown} props.value
 * @param {(next: string) => Promise<void>|void} props.onSave
 * @param {boolean} [props.disabled]
 * @param {string} [props.hint]
 * @param {string} [props.testId]
 * @param {Array<{ slug: string, label?: string, display_name?: string }>} [props.roles]
 */
export function RoleSlugsMultiSelect({
  label,
  value,
  onSave,
  disabled = false,
  hint = '',
  testId = 'role-slugs-multi-select',
  roles = FORETMAP_AUDIENCE_ROLE_OPTIONS,
}) {
  const options = Array.isArray(roles) && roles.length > 0 ? roles : FORETMAP_AUDIENCE_ROLE_OPTIONS;
  const [selected, setSelected] = useState(() => new Set(parseRoleSlugsSetting(value)));
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
    setSelected(new Set(parseRoleSlugsSetting(value)));
  }, [value]);

  const toggle = (slug) => {
    if (disabled) return;
    const next = new Set(selectedRef.current);
    const key = String(slug);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selectedRef.current = next;
    dirtyRef.current = true;
    setSelected(next);
    queueRef.current.push(formatRoleSlugsSetting(next));
  };

  return (
    <div className="field" data-testid={testId}>
      <span style={{ display: 'block', marginBottom: 6 }}>{label}</span>
      {hint ? (
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 'var(--text-sm)' }}>
          {hint}
        </p>
      ) : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {options.map((role) => {
          const slug = String(role.slug);
          const checked = selected.has(slug);
          return (
            <label
              key={slug}
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
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(slug)}
              />
              <span>{role.label || role.display_name || slug}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
