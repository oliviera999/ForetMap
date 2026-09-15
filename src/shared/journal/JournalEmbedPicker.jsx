import { useState } from 'react';
import { DialogShell } from '../components/DialogShell.jsx';
import { Button } from '../ui/Button.jsx';

/**
 * Dialogue « Insérer un élément » du carnet : un type d'encart, une référence, insertion
 * dans l'article. Composant unique pour ForetMap et G&L ; le produit fournit son registre de
 * types (`types`) et son habillage (`ui`). Le champ de saisie découle du type choisi :
 *
 * @typedef {object} JournalEmbedType
 * @property {string} value type d'encart (`plant`, `spell`, `module_stub`…)
 * @property {string} label libellé de l'option
 * @property {'text'|'number'|'select'|'none'} [input='text'] `none` : référence fixe, sans champ
 * @property {string} [fieldLabel] libellé du champ de saisie
 * @property {string} [placeholder]
 * @property {{ value: string, label: string }[]} [options] choix d'un `select`
 * @property {string} [defaultRef] référence retenue quand le champ est vide (`select`, `none`)
 * @property {(context: object) => string[]} [suggestions] valeurs proposées en `datalist`
 * @property {string} [hint] texte explicatif affiché sous le type
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} [props.onClose]
 * @param {(type: string, ref: string) => void} [props.onInsert]
 * @param {JournalEmbedType[]} props.types
 * @param {object} [props.context] données produit passées aux `suggestions` (sorts du chapitre…)
 * @param {string} [props.title='Insérer un élément']
 * @param {object} props.ui habillage produit (`FM_JOURNAL_UI` / `GL_JOURNAL_UI`)
 */
export function JournalEmbedPicker({
  open,
  onClose,
  onInsert,
  types,
  context = null,
  title = 'Insérer un élément',
  ui,
}) {
  const [embedType, setEmbedType] = useState(() => types[0]?.value || '');
  const [embedRef, setEmbedRef] = useState('');
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

  function handleInsert() {
    if (!current) return;
    let ref = String(embedRef || '').trim();
    if (input === 'none') ref = String(current.defaultRef || '');
    else if (input === 'select' && !ref) ref = String(current.defaultRef || '');
    if (!ref) return;
    onInsert?.(current.value, ref);
    setEmbedRef('');
    onClose?.();
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
        <Btn {...primaryProps} onClick={handleInsert}>
          Insérer
        </Btn>
      </div>
    </DialogShell>
  );
}

/** Champ par défaut : `<label>` englobant, libellé puis contrôle (habillage ForetMap). */
function DefaultField({ label, className = '', children }) {
  return (
    <label className={className}>
      {label}
      {children}
    </label>
  );
}
