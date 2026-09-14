import { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import {
  formatCategoryIdsSetting,
  parseCategoryIdsSetting,
} from '../../utils/categoryIdsSetting.js';

/**
 * Multi-sélection de catégories de lieux (ids stockés en chaîne `;`-séparée).
 */
export function CategoryIdsMultiSelect({
  label,
  value,
  onSave,
  disabled = false,
  hint = '',
  testId = 'category-ids-multi-select',
}) {
  const [categories, setCategories] = useState([]);
  const [loadErr, setLoadErr] = useState('');
  const selected = useMemo(() => new Set(parseCategoryIdsSetting(value)), [value]);

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

  const toggle = (id) => {
    if (disabled) return;
    const next = new Set(selected);
    const key = String(id);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSave?.(formatCategoryIdsSetting(next));
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
        {categories.map((cat) => {
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
        {!categories.length && !loadErr ? (
          <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
            Aucune catégorie définie.
          </span>
        ) : null}
      </div>
    </div>
  );
}
