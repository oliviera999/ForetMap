import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

function normalizeValues(values) {
  if (!Array.isArray(values)) return [];
  return values.map((v) => String(v)).filter(Boolean);
}

export function GLMultiCheckDropdown({
  label,
  options = [],
  selectedValues = [],
  onChange,
  emptyLabel = 'Aucun filtre',
  allSelectedLabel = 'Tous',
  disabled = false,
  hint = '',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const panelId = useId();
  const selected = useMemo(() => normalizeValues(selectedValues), [selectedValues]);

  useEffect(() => {
    if (!open) return undefined;
    function onDocPointer(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const summary = useMemo(() => {
    if (options.length === 0) return '—';
    if (selected.length === 0) return emptyLabel;
    if (selected.length === options.length) return allSelectedLabel;
    if (selected.length === 1) {
      const match = options.find((o) => o.value === selected[0]);
      return match?.label || selected[0];
    }
    return `${selected.length} sélectionné(s)`;
  }, [options, selected, emptyLabel, allSelectedLabel]);

  function toggleValue(value) {
    const v = String(value);
    const has = selected.includes(v);
    const next = has ? selected.filter((item) => item !== v) : [...selected, v];
    onChange?.(next);
  }

  function selectAll() {
    onChange?.(options.map((o) => o.value));
  }

  function clearAll() {
    onChange?.([]);
  }

  return (
    <div className="gl-multi-check-dropdown" ref={rootRef}>
      <span className="gl-multi-check-dropdown__label">{label}</span>
      {hint ? <span className="gl-hint gl-multi-check-dropdown__hint">{hint}</span> : null}
      <button
        type="button"
        className="gl-multi-check-dropdown__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled || options.length === 0}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="gl-multi-check-dropdown__summary">{summary}</span>
        <span className="gl-multi-check-dropdown__chevron" aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      {open ? (
        <div id={panelId} className="gl-multi-check-dropdown__panel" role="listbox" aria-multiselectable="true">
          <div className="gl-multi-check-dropdown__toolbar">
            <button type="button" onClick={selectAll}>Tout cocher</button>
            <button type="button" onClick={clearAll}>Tout décocher</button>
          </div>
          <ul className="gl-multi-check-dropdown__options">
            {options.map((option) => {
              const value = String(option.value);
              const checked = selected.includes(value);
              return (
                <li key={value}>
                  <label className="gl-multi-check-dropdown__option">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleValue(value)}
                    />
                    <span className="gl-multi-check-dropdown__option-label">{option.label}</span>
                    {option.hint ? (
                      <span className="gl-multi-check-dropdown__option-hint">{option.hint}</span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
