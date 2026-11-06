import { useEffect, useState } from 'react';
import { api } from '../../services/api.js';
import { DialogShell } from '../DialogShell';
import { useDialogA11y } from '../../shared/platform/useDialogA11y';
import { MyRewardsPanel } from './MyRewardsPanel.jsx';

/**
 * Fiche « badges d'un élève » (personnel) : les badges, paliers et progression d'un élève, en
 * consultation (`GET /api/rewards/students/:id`, même périmètre que ses inscriptions). Aucune
 * célébration, rien n'est marqué vu : c'est la fiche de l'élève, pas sa boîte aux lettres.
 */
export function RewardsStudentSheet({ studentId, studentName = '', onClose }) {
  const dialogRef = useDialogA11y(onClose);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    api(`/api/rewards/students/${encodeURIComponent(studentId)}`)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Badges indisponibles');
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const label = `Badges${studentName ? ` de ${studentName}` : ''}`;
  return (
    <DialogShell
      open
      onClose={onClose}
      overlayClassName="modal-overlay"
      dialogClassName="modal fade-in rewards-sheet"
      ariaLabel={label}
      closeOnOverlay
      dialogRef={dialogRef}
    >
      <div data-testid="rewards-student-sheet">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {!data && !error && <p className="section-sub">Chargement…</p>}
        {data && (
          <MyRewardsPanel
            data={data}
            readOnly
            title={label}
            headingLevel={3}
            testId="rewards-student-panel"
          />
        )}
        <div className="rewards-sheet__actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </DialogShell>
  );
}

/** Bouton « Voir ses badges » qui ouvre la fiche ; rien si `enabled` est faux. */
export function RewardsSheetButton({
  studentId,
  studentName,
  enabled = false,
  className = 'btn btn-ghost btn-sm',
  children = null,
}) {
  const [open, setOpen] = useState(false);
  if (!enabled || !studentId) return null;
  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
        aria-label={`Voir les badges${studentName ? ` de ${studentName}` : ''}`}
      >
        {children || (
          <>
            <span aria-hidden="true">🎖️</span> Badges
          </>
        )}
      </button>
      {open && (
        <RewardsStudentSheet
          studentId={studentId}
          studentName={studentName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
