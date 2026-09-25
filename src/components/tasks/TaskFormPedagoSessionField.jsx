import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { usePublicSettings } from '../../contexts/PublicSettingsContext.jsx';

/**
 * Séance pédagogique liée à une tâche (optionnelle) : affiche « Lancer la séance » sur la
 * carte de tâche. Le lien ne valide jamais la tâche automatiquement.
 *
 * Module `ui.modules.pedago_sessions_enabled` éteint : le champ disparaît (l'API répondrait
 * 503). Le lien déjà posé sur une tâche reste dans le formulaire et n'est donc pas effacé à
 * l'enregistrement : il ressert tel quel si le module est rallumé.
 */
export function TaskFormPedagoSessionField({ value = '', onChange }) {
  const publicSettings = usePublicSettings();
  const enabled = publicSettings?.modules?.pedago_sessions_enabled !== false;
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await api('/api/pedago-sessions');
        if (!cancelled) setSessions(Array.isArray(res?.items) ? res.items : []);
      } catch {
        if (!cancelled) setSessions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  if (!enabled) return null;

  const known = sessions.some((s) => String(s.id) === String(value));

  return (
    <div className="field">
      <label htmlFor="task-form-pedago-session">Séance pédagogique liée</label>
      <select id="task-form-pedago-session" value={value || ''} onChange={onChange}>
        <option value="">Aucune</option>
        {value && !known ? <option value={value}>Séance actuelle (non publiée)</option> : null}
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
      </select>
      <p className="muted small">
        Ajoute un bouton « Lancer la séance » sur la tâche. Terminer la séance ne valide pas la
        tâche.
      </p>
    </div>
  );
}
