import { useEffect, useState } from 'react';
import { api, getAuthToken } from '../../services/api';

/**
 * Bouton « Ajouter au carnet » (ForetMap) — réservé aux sessions authentifiées.
 */
export function FmJournalImportButton({
  resourceType,
  resourceRef,
  title,
  learned,
  alreadyImported = false,
  enabled = true,
  onImported,
}) {
  const [state, setState] = useState(alreadyImported ? 'done' : 'idle');
  const [error, setError] = useState('');
  const hasToken = typeof getAuthToken === 'function' && !!getAuthToken();

  useEffect(() => {
    if (alreadyImported) setState((prev) => (prev === 'saving' ? prev : 'done'));
  }, [alreadyImported]);

  if (!enabled || !hasToken) return null;

  if (!learned) {
    return (
      <span className="hint fm-journal-import__hint">
        Marque-le comme appris pour l’ajouter à ton carnet.
      </span>
    );
  }

  if (state === 'done') {
    return <span className="badge fm-journal-import__done">✓ Dans mon carnet</span>;
  }

  async function handleImport() {
    if (state === 'saving') return;
    setState('saving');
    setError('');
    try {
      const res = await api('/api/user-journal/me/imports', 'POST', {
        resourceType,
        resourceRef: String(resourceRef),
        title: title || undefined,
      });
      setState('done');
      onImported?.(res?.import || null);
    } catch (err) {
      setState('idle');
      setError(err.message || 'Import impossible');
    }
  }

  return (
    <span className="fm-journal-import">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={handleImport}
        disabled={state === 'saving'}
        aria-label={title ? `Ajouter « ${title} » au carnet` : 'Ajouter au carnet'}
      >
        {state === 'saving' ? 'Ajout…' : '+ Ajouter au carnet'}
      </button>
      {error ? <span className="auth-error">{error}</span> : null}
    </span>
  );
}
