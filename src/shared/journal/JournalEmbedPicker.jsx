import { useEffect, useState } from 'react';
import { DialogShell } from '../components/DialogShell.jsx';
import { Button } from '../ui/Button.jsx';

/**
 * Dialogue « Insérer un élément » : recherche par titre (input=search) ou saisie manuelle.
 *
 * @typedef {object} JournalEmbedType
 * @property {string} value
 * @property {string} label
 * @property {'text'|'number'|'select'|'none'|'search'} [input='text']
 * @property {string} [fieldLabel]
 * @property {string} [placeholder]
 * @property {{ value: string, label: string }[]} [options]
 * @property {string} [defaultRef]
 * @property {(context: object) => string[]} [suggestions]
 * @property {string} [hint]
 */

export function JournalEmbedPicker({
  open,
  onClose,
  onInsert,
  types,
  context = null,
  title = 'Insérer un élément',
  ui,
  searchEmbeds = null,
}) {
  const [embedType, setEmbedType] = useState(() => types[0]?.value || '');
  const [embedRef, setEmbedRef] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const p = ui.classPrefix;
  const Btn = ui.Button || Button;
  const Field = ui.Field || DefaultField;
  const Select = ui.Select || 'select';
  const secondaryProps = { type: 'button', variant: 'secondary', ...(ui.modalButtonProps || {}) };
  const primaryProps = { type: 'button', variant: 'primary', ...(ui.primaryButtonProps || {}) };
  const current = types.find((t) => t.value === embedType) || types[0] || null;
  const input = current?.input || 'text';
  const listId = `${p}-embed-suggestions`;
  const suggestions =
    current && typeof current.suggestions === 'function' ? current.suggestions(context) || [] : [];

  useEffect(() => {
    if (!open || input !== 'search' || typeof searchEmbeds !== 'function') {
      setResults([]);
      return undefined;
    }
    const q = query.trim();
    if (q.length < 1) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearching(true);
      Promise.resolve(searchEmbeds(embedType, q))
        .then((res) => {
          if (!cancelled) setResults(Array.isArray(res?.results) ? res.results : []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, input, query, embedType, searchEmbeds]);

  function handleInsert() {
    if (!current) return;
    let ref = String(embedRef || '').trim();
    if (input === 'none') ref = String(current.defaultRef || '');
    else if (input === 'select' && !ref) ref = String(current.defaultRef || '');
    if (!ref) return;
    onInsert?.(current.value, ref);
    setEmbedRef('');
    setQuery('');
    setResults([]);
    onClose?.();
  }

  function pickResult(item) {
    setEmbedRef(String(item.ref));
    setQuery(String(item.title || item.ref));
  }

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      overlayClassName={`fm-modal-overlay ${p}-embed-picker`}
      dialogClassName={`fm-modal-panel animate-pop ${p}-embed-picker__body`}
      ariaLabelledBy={`${p}-embed-title`}
    >
      <header className={ui.modalHeadClassName || ''}>
        <h2 id={`${p}-embed-title`}>{title}</h2>
        <Btn {...secondaryProps} onClick={onClose} aria-label="Fermer">
          ✕
        </Btn>
      </header>
      <div>
        <Field label="Type d’élément" className={ui.fieldClassName}>
          <Select
            value={embedType}
            onChange={(e) => {
              setEmbedType(e.target.value);
              setEmbedRef('');
              setQuery('');
              setResults([]);
            }}
          >
            {types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        {current && input === 'select' ? (
          <Field label={current.fieldLabel || 'Référence'} className={ui.fieldClassName}>
            <Select
              value={embedRef || current.defaultRef || ''}
              onChange={(e) => setEmbedRef(e.target.value)}
            >
              {(current.options || []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {current && input === 'search' ? (
          <Field label={current.fieldLabel || 'Rechercher'} className={ui.fieldClassName}>
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setEmbedRef('');
              }}
              placeholder={current.placeholder || 'Tape un nom…'}
              aria-label={current.fieldLabel || 'Rechercher'}
            />
            {searching ? <p className={ui.hintClassName || ''}>Recherche…</p> : null}
            {results.length > 0 ? (
              <ul
                className={`${p}-embed-search-results`}
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: '8px 0 0',
                  display: 'grid',
                  gap: 4,
                }}
              >
                {results.map((item) => (
                  <li key={`${item.type}-${item.ref}`}>
                    <Btn
                      {...secondaryProps}
                      onClick={() => pickResult(item)}
                      aria-pressed={embedRef === String(item.ref)}
                    >
                      {item.title || item.ref}
                    </Btn>
                  </li>
                ))}
              </ul>
            ) : null}
            {embedRef ? (
              <p className={ui.hintClassName || ''} style={{ marginTop: 6 }}>
                Sélection : {query || embedRef}
              </p>
            ) : null}
          </Field>
        ) : null}
        {current && (input === 'text' || input === 'number') ? (
          <Field label={current.fieldLabel || 'Référence'} className={ui.fieldClassName}>
            <input
              type={input}
              min={input === 'number' ? '1' : undefined}
              list={suggestions.length ? listId : undefined}
              value={embedRef}
              onChange={(e) => setEmbedRef(e.target.value)}
              placeholder={current.placeholder || ''}
            />
            {suggestions.length ? (
              <datalist id={listId}>
                {suggestions.map((code) => (
                  <option key={code} value={code} />
                ))}
              </datalist>
            ) : null}
          </Field>
        ) : null}
        {current?.hint ? <p className={ui.hintClassName || ''}>{current.hint}</p> : null}
      </div>
      <div className={ui.modalActionsClassName || ''}>
        <Btn {...secondaryProps} onClick={onClose}>
          Annuler
        </Btn>
        <Btn {...primaryProps} onClick={handleInsert} disabled={input === 'search' && !embedRef}>
          Insérer
        </Btn>
      </div>
    </DialogShell>
  );
}

function DefaultField({ label, className = '', children }) {
  return (
    <label className={className}>
      {label}
      {children}
    </label>
  );
}
