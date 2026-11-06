import { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import { DialogShell } from '../DialogShell';
import { useDialogA11y } from '../../shared/platform/useDialogA11y';

const NOTE_MAX = 280;

/**
 * Fenêtre « Décerner un badge » (permission `rewards.award`) : type de badge manuel (catalogue
 * du serveur), mot obligatoire (280 caractères au plus), puis `POST /api/rewards/award`.
 */
export function RewardAwardDialog({ studentId, studentName = '', onClose, onAwarded }) {
  const dialogRef = useDialogA11y(onClose);
  const [types, setTypes] = useState([]);
  const [type, setType] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api('/api/rewards/me')
      .then((data) => {
        if (cancelled) return;
        const manual = (data?.catalogue || []).filter((e) => e.source === 'manual');
        setTypes(manual);
        if (manual[0]) setType(manual[0].key.split('.').slice(1).join('.'));
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Catalogue des badges indisponible');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    const text = note.trim();
    if (!text) return setError('Écrivez un mot pour l’élève');
    setSaving(true);
    setError('');
    try {
      const res = await api('/api/rewards/award', 'POST', { studentId, type, note: text });
      onAwarded?.(res?.reward || null);
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Badge non décerné');
      setSaving(false);
    }
    return undefined;
  };

  return (
    <DialogShell
      open
      onClose={onClose}
      overlayClassName="modal-overlay"
      dialogClassName="modal fade-in"
      ariaLabel="Décerner un badge"
      closeOnOverlay
      dialogRef={dialogRef}
    >
      <h3>Décerner un badge{studentName ? ` à ${studentName}` : ''}</h3>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <fieldset className="task-taxo-field">
        <legend>Badge</legend>
        <div className="task-taxo-grid" role="group" aria-label="Type de badge">
          {types.map((t) => {
            const key = t.key.split('.').slice(1).join('.');
            return (
              <button
                key={t.key}
                type="button"
                className={`task-taxo-option${type === key ? ' task-taxo-option--selected' : ''}`}
                aria-pressed={type === key}
                onClick={() => setType(key)}
                title={t.description}
              >
                <span aria-hidden="true">{t.emoji}</span> {t.title}
              </button>
            );
          })}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="reward-award-note">Mot pour l’élève *</label>
        <textarea
          id="reward-award-note"
          value={note}
          maxLength={NOTE_MAX}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ex. : Merci d’avoir guidé les parents pendant la journée verte."
        />
        <p className="task-taxo-hint">
          {note.length}/{NOTE_MAX}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={submit}
          disabled={saving || !type}
        >
          {saving ? 'Envoi…' : 'Décerner'}
        </button>
      </div>
    </DialogShell>
  );
}

/** Bouton « Décerner un badge » qui ouvre la fenêtre ; rien si `enabled` est faux. */
export function RewardAwardButton({
  studentId,
  studentName,
  enabled = false,
  onAwarded,
  className = 'btn btn-ghost btn-sm',
}) {
  const [open, setOpen] = useState(false);
  if (!enabled || !studentId) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <span aria-hidden="true">🏅</span> Décerner un badge
      </button>
      {open && (
        <RewardAwardDialog
          studentId={studentId}
          studentName={studentName}
          onClose={() => setOpen(false)}
          onAwarded={onAwarded}
        />
      )}
    </>
  );
}
