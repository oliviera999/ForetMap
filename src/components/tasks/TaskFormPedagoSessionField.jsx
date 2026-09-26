import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { usePublicSettings } from '../../contexts/PublicSettingsContext.jsx';

/**
 * Séance pédagogique liée à une tâche (optionnelle) : affiche « Lancer la séance » sur la
 * carte de tâche. Le lien ne valide jamais la tâche automatiquement.
 *
 * Module `ui.modules.pedago_sessions_enabled` éteint : le champ reste proposé au professeur
 * (le formulaire de tâche est un écran de gestion), avec un avertissement — le bouton n'apparaît
 * pas côté élève tant que le module est éteint. La liste vient de l'API, ouverte au seul
 * gestionnaire des séances (`plants.manage`) quand le module est éteint : sans ce droit elle
 * reste vide, et le lien déjà posé est conservé tel quel à l'enregistrement.
 */
export function TaskFormPedagoSessionField({ value = '', onChange }) {
  const publicSettings = usePublicSettings();
  const enabled = publicSettings?.modules?.pedago_sessions_enabled !== false;
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
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

  const known = sessions.some((s) => String(s.id) === String(value));

  return (
    <div className="field">
      <label htmlFor="task-form-pedago-session">Séance pédagogique liée</label>
      <select id="task-form-pedago-session" value={value || ''} onChange={onChange}>
        <option value="">Aucune</option>
        {value && !known ? (
          <option value={value}>
            {enabled ? 'Séance actuelle (non publiée)' : 'Séance actuelle'}
          </option>
        ) : null}
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
      {!enabled ? (
        <p className="muted small" data-testid="task-form-pedago-session-off">
          Séances désactivées pour les élèves : le bouton n’apparaîtra sur la tâche qu’au rallumage
          du module.
        </p>
      ) : null}
    </div>
  );
}
