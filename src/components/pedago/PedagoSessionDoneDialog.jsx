import { useState } from 'react';

import { api } from '../../services/api.js';
import { Button } from '../../shared/ui/Button.jsx';
import { DialogShell } from '../../shared/components/DialogShell.jsx';

/**
 * Note de carnet proposée en fin de séance : liste des étapes + invites de réflexion.
 * @param {{ title?: string, steps?: Array<{ title?: string }> }} session
 */
export function buildPedagoSessionNote(session) {
  const title = `Séance : ${String(session?.title || 'séance').trim()}`.slice(0, 180);
  const stepList = Array.isArray(session?.steps) ? session.steps : [];
  const steps = stepList
    .map((s, i) => `${i + 1}. ${String(s?.title || '').trim() || `Étape ${i + 1}`}`)
    .join('\n');
  const plantIds = [];
  for (const s of stepList) {
    const p = s?.action?.payload || {};
    for (const raw of [p.plantId, p.highlightPlantId]) {
      const id = Number(raw);
      if (Number.isInteger(id) && id > 0 && !plantIds.includes(id)) plantIds.push(id);
    }
  }
  const plantEmbeds = plantIds
    .slice(0, 3)
    .map((id) => `<aside class="journal-embed" data-embed-type="plant" data-ref="${id}"></aside>`);
  const bodyMarkdown = [
    '## Étapes suivies',
    '',
    steps || '_(aucune étape)_',
    '',
    ...(plantEmbeds.length ? ['## Plantes de la séance', '', plantEmbeds.join('\n\n'), ''] : []),
    '## Ce que j’ai observé :',
    '',
    '',
    '## Ce que j’ai appris :',
    '',
    '',
  ].join('\n');
  return { title, bodyMarkdown };
}

/**
 * Fin de séance : félicitation + note préremplie facultative dans le carnet
 * (réutilise la route d’articles du carnet ; rien n’est écrit sans clic).
 * `showRewards` suit l'interrupteur `ui.modules.rewards_enabled` : éteint, la liste des
 * nouveaux badges n'est pas rendue (le serveur n'en attribue d'ailleurs plus).
 */
export function PedagoSessionDoneDialog({
  session,
  canAddToNotebook = false,
  showRewards = true,
  onClose,
  onOpenNotebook = null,
}) {
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState('');

  if (!session) return null;

  async function handleAddNote() {
    if (saving || added) return;
    setSaving(true);
    setError('');
    try {
      await api('/api/user-journal/me/articles', 'POST', buildPedagoSessionNote(session));
      setAdded(true);
    } catch (err) {
      setError(err?.message || 'Ajout au carnet impossible');
    } finally {
      setSaving(false);
    }
  }

  return (
    // Coque commune : fermeture par l'overlay et Échap, piège et restauration du focus
    // (useDialogA11y) — au lieu d'écouteurs posés à la main sur l'élément `dialog`.
    <DialogShell
      onClose={onClose}
      dialogClassName="modal-content pedago-session-done"
      ariaLabelledBy="pedago-session-done-title"
    >
      <div data-testid="pedago-session-done">
        <h2 id="pedago-session-done-title" className="section-title">
          Séance terminée
        </h2>
        <p className="section-sub">
          Bravo, tu as terminé « {session.title} ».
          {canAddToNotebook ? ' Tu peux garder une trace de ce que tu as vu dans ton carnet.' : ''}
        </p>
        {showRewards && Array.isArray(session.newRewards) && session.newRewards.length > 0 && (
          <ul
            className="pedago-rewards pedago-rewards--new"
            aria-label="Nouveaux badges"
            data-testid="pedago-session-new-rewards"
          >
            {session.newRewards.map((r) => (
              <li key={r.key} className="pedago-rewards__item">
                <span aria-hidden="true">{r.emoji}</span> <strong>{r.title}</strong>
                <span className="pedago-rewards__desc"> — {r.description}</span>
              </li>
            ))}
          </ul>
        )}
        {added && (
          <p className="pedago-session-done__ok" role="status">
            Note ajoutée à ton carnet : complète-la quand tu veux.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="pedago-session-done__actions">
          {canAddToNotebook && !added && (
            <Button type="button" variant="primary" onClick={handleAddNote} disabled={saving}>
              {saving ? 'Ajout…' : 'Ajouter une note à mon carnet'}
            </Button>
          )}
          {canAddToNotebook && added && onOpenNotebook && (
            <Button type="button" variant="primary" onClick={onOpenNotebook}>
              Ouvrir mon carnet
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}
