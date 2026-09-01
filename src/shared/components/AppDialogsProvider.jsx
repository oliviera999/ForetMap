import { createContext, useCallback, useContext, useId, useMemo, useRef, useState } from 'react';
import { DialogShell } from './DialogShell.jsx';
import { TimedToast } from './TimedToast.jsx';

/**
 * Dialogues applicatifs communs (audit homogénéité UI, D-1) — remplacent les
 * `window.confirm/prompt/alert` natifs : thème de l'application, non bloquants pour le
 * thread (le natif gelait animations, polling et Socket.IO), fiables en PWA/WebView
 * (où `confirm()` peut être supprimé silencieusement), et testables.
 *
 * API (promesses, signature proche du natif pour une migration mécanique) :
 *   const { confirm, prompt, notify } = useAppDialogs();
 *   if (!(await confirm({ message: 'Supprimer ?', danger: true }))) return;
 *   const titre = await prompt({ message: 'Titre de la zone', required: true }); // null = annulé
 *   notify('Erreur enregistrement'); // toast auto-dismiss, non bloquant
 */

/** Repli hors provider (tests unitaires montés sans shell) : primitives natives. */
const NATIVE_FALLBACK = {
  confirm: async (opts) => window.confirm(String(opts?.message ?? '')),
  prompt: async (opts) => window.prompt(String(opts?.message ?? ''), opts?.defaultValue ?? ''),
  notify: (msg) => window.alert(String(msg ?? '')),
};

const AppDialogsContext = createContext(NATIVE_FALLBACK);

export function useAppDialogs() {
  return useContext(AppDialogsContext);
}

function ConfirmDialog({ request, onResolve }) {
  const {
    message,
    title = 'Confirmation',
    confirmLabel,
    cancelLabel = 'Annuler',
    danger = false,
  } = request;
  return (
    <DialogShell
      open
      onClose={() => onResolve(false)}
      ariaLabel={title}
      dialogClassName="log-modal fade-in app-dialog app-dialog--confirm"
    >
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p className="app-dialog__message">{message}</p>
      <div className="app-dialog__actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onResolve(false)}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}`}
          autoFocus
          onClick={() => onResolve(true)}
        >
          {confirmLabel || (danger ? 'Supprimer' : 'Confirmer')}
        </button>
      </div>
    </DialogShell>
  );
}

function PromptDialog({ request, onResolve }) {
  const {
    message,
    title = 'Saisie',
    confirmLabel = 'Valider',
    cancelLabel = 'Annuler',
    defaultValue = '',
    placeholder = '',
    required = false,
    maxLength,
  } = request;
  const inputId = useId();
  const [value, setValue] = useState(String(defaultValue ?? ''));
  const canSubmit = !required || value.trim().length > 0;
  const submit = () => {
    if (!canSubmit) return;
    onResolve(value);
  };
  return (
    <DialogShell
      open
      onClose={() => onResolve(null)}
      ariaLabel={title}
      dialogClassName="log-modal fade-in app-dialog app-dialog--prompt"
    >
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="field">
          <label htmlFor={inputId}>{message}</label>
          <input
            id={inputId}
            autoFocus
            value={value}
            placeholder={placeholder}
            maxLength={maxLength}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <div className="app-dialog__actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onResolve(null)}>
            {cancelLabel}
          </button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!canSubmit}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

export function AppDialogsProvider({ children }) {
  const [current, setCurrent] = useState(null);
  const [toast, setToast] = useState(null);
  const queueRef = useRef([]);

  const enqueue = useCallback((kind, opts) => {
    return new Promise((resolve) => {
      const request = { kind, opts: opts && typeof opts === 'object' ? opts : { message: opts } };
      const entry = { ...request, resolve };
      setCurrent((cur) => {
        if (cur) {
          queueRef.current.push(entry);
          return cur;
        }
        return entry;
      });
    });
  }, []);

  const resolveCurrent = useCallback((result) => {
    setCurrent((cur) => {
      cur?.resolve(result);
      return queueRef.current.shift() || null;
    });
  }, []);

  const confirm = useCallback((opts) => enqueue('confirm', opts), [enqueue]);
  const prompt = useCallback((opts) => enqueue('prompt', opts), [enqueue]);
  const notify = useCallback((msg) => {
    setToast(String(msg ?? '') || null);
  }, []);
  const clearToast = useCallback(() => setToast(null), []);

  const contextValue = useMemo(() => ({ confirm, prompt, notify }), [confirm, prompt, notify]);

  return (
    <AppDialogsContext.Provider value={contextValue}>
      {children}
      {current?.kind === 'confirm' && (
        <ConfirmDialog request={current.opts} onResolve={resolveCurrent} />
      )}
      {current?.kind === 'prompt' && (
        <PromptDialog
          key={queueRef.current.length}
          request={current.opts}
          onResolve={resolveCurrent}
        />
      )}
      {toast && <TimedToast msg={toast} onDone={clearToast} />}
    </AppDialogsContext.Provider>
  );
}
