import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';
import {
  createLatestWriteQueue,
  formatCategoryIdsSetting,
  parseCategoryIdsSetting,
} from '../../utils/categoryIdsSetting.js';

/**
 * La catégorie apparaît-elle sur la surface demandée ?
 * @param {{ surfaces?: unknown, is_active?: boolean }} cat
 * @param {string} surface
 */
function categoryMatchesSurface(cat, surface) {
  if (!surface) return true;
  const list = Array.isArray(cat?.surfaces) ? cat.surfaces : [];
  return list.map(String).includes(String(surface));
}

/**
 * Multi-sélection de catégories de lieux (ids stockés en chaîne `;`-séparée).
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.value
 * @param {(next: string) => Promise<unknown>|unknown} props.onSave
 * @param {boolean} [props.disabled]
 * @param {string} [props.hint]
 * @param {string} [props.testId]
 * @param {string} [props.requireSurface] ex. `plan` / `staff` — n'affiche que ces catégories
 * @param {Iterable<string>|null} [props.excludeIds] ids déjà pris ailleurs (exclusion mutuelle)
 */
export function CategoryIdsMultiSelect({
  label,
  value,
  onSave,
  disabled = false,
  hint = '',
  testId = 'category-ids-multi-select',
  requireSurface = '',
  excludeIds = null,
}) {
  const [categories, setCategories] = useState([]);
  const [loadErr, setLoadErr] = useState('');
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

  const excluded = useMemo(() => {
    const set = new Set();
    for (const id of excludeIds || []) {
      const s = String(id || '').trim();
      if (s) set.add(s);
    }
    return set;
  }, [excludeIds]);

  useEffect(() => {
    if (dirtyRef.current) return;
    setSelected(new Set(parseCategoryIdsSetting(value)));
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api('/api/map-categories/manage');
        const rows = Array.isArray(data)
          ? data
          : Array.isArray(data?.categories)
            ? data.categories
            : [];
        if (!cancelled) {
          setCategories(rows);
          setLoadErr('');
        }
      } catch (e) {
        if (!cancelled) setLoadErr(e?.message || 'Impossible de charger les catégories');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = useMemo(() => {
    return (categories || []).filter((cat) => {
      if (cat && cat.is_active === false) return false;
      if (!categoryMatchesSurface(cat, requireSurface)) return false;
      const id = String(cat.id);
      // Déjà sélectionné : rester visible même si désormais exclu (pour pouvoir décocher).
      if (selected.has(id)) return true;
      if (excluded.has(id)) return false;
      return true;
    });
  }, [categories, requireSurface, excluded, selected]);

  const toggle = (id) => {
    if (disabled) return;
    const next = new Set(selectedRef.current);
    const key = String(id);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selectedRef.current = next;
    dirtyRef.current = true;
    setSelected(next);
    queueRef.current.push(formatCategoryIdsSetting(next));
  };

  return (
    <div className="field" data-testid={testId}>
      <span style={{ display: 'block', marginBottom: 6 }}>{label}</span>
      {hint ? (
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 'var(--text-sm)' }}>
          {hint}
        </p>
      ) : null}
      {loadErr ? <p className="auth-error">{loadErr}</p> : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {shown.map((cat) => {
          const id = String(cat.id);
          const checked = selected.has(id);
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
                border: `1px solid ${checked ? 'var(--leaf)' : 'var(--line, #d1d5db)'}`,
                background: checked ? 'color-mix(in srgb, var(--leaf) 12%, white)' : 'white',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(id)}
              />
              <span>
                {cat.emoji ? `${cat.emoji} ` : ''}
                {cat.label || id}
              </span>
            </label>
          );
        })}
        {!shown.length && !loadErr ? (
          <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            Aucune catégorie définie.
          </span>
        ) : null}
      </div>
    </div>
  );
}
