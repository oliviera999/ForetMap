import { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { useAppDialogs } from '../../../shared/components/AppDialogsProvider.jsx';
import { GLButton } from '../ui/GLButton.jsx';
import { absoluteClassLinkUrl } from '../../utils/glTeamSession.js';

/** `ABCD-EFGH` : le code se dicte et se recopie par moitiés. */
export function formatClassCode(code) {
  const s = String(code || '');
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
}

function heure(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return '';
  }
}

/**
 * Console du prof (« Tenir à deux », lot 2) : « QR de la classe » — feuille A4 imprimable une
 * fois pour l'année (QR, code à huit caractères, nom de la classe) — et, par équipe, les
 * tablettes connectées aujourd'hui avec « Déconnecter ».
 */
export function GLClassLinkPanel({ game, teams = [], refreshKey = 0 }) {
  const { confirm } = useAppDialogs();
  const classId = game?.class_id != null ? Number(game.class_id) : null;
  const gameId = game?.id != null ? Number(game.id) : null;
  const [link, setLink] = useState(null);
  const [qr, setQr] = useState('');
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadSessions = useCallback(async () => {
    if (!gameId) return;
    try {
      const data = await apiGL(`/api/gl/games/${gameId}/tenir/sessions`);
      setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
    } catch (_) {
      // La liste est un confort : une lecture en échec ne gêne pas le tour.
    }
  }, [gameId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions, refreshKey]);

  const show = useCallback(
    async (path, method = 'GET') => {
      if (!classId) return;
      setBusy(true);
      setError('');
      try {
        const data = await apiGL(`/api/gl/classes/${classId}/${path}`, method);
        const url = absoluteClassLinkUrl(data.url);
        setLink({ ...data, url });
        setOpen(true);
        // `qrcode` (MIT, https://github.com/soldair/node-qrcode) : déjà au dépôt, chargé à la
        // demande pour ne pas alourdir la console.
        const { default: QRCode } = await import('qrcode');
        setQr(await QRCode.toDataURL(url, { margin: 1, width: 640 }));
        await loadSessions();
      } catch (err) {
        setError(err.message || 'Lien de classe indisponible');
      } finally {
        setBusy(false);
      }
    },
    [classId, loadSessions],
  );

  const regenerer = useCallback(async () => {
    const ok = await confirm({
      title: 'Régénérer le QR de la classe ?',
      message:
        'L’ancienne feuille ne marchera plus et toutes les tablettes de la classe seront déconnectées. À faire seulement si la feuille a circulé hors de la classe.',
      confirmLabel: 'Régénérer',
    });
    if (ok) await show('lien/regenerer', 'POST');
  }, [confirm, show]);

  const deconnecter = useCallback(
    async (sessionId) => {
      setBusy(true);
      try {
        await apiGL(`/api/gl/games/${gameId}/tenir/sessions/${sessionId}`, 'DELETE');
      } catch (err) {
        setError(err.message || 'Déconnexion impossible');
      } finally {
        setBusy(false);
        await loadSessions();
      }
    },
    [gameId, loadSessions],
  );

  if (!classId) return null;
  const parEquipe = teams.map((t) => ({
    team: t,
    sessions: sessions.filter((s) => Number(s.teamId) === Number(t.id)),
  }));
  const connectees = parEquipe.filter((e) => e.sessions.length);

  return (
    <section className="gl-class-link-panel" data-testid="gl-class-link-panel">
      <div className="gl-inline-actions">
        <GLButton
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => (open ? setOpen(false) : show('lien'))}
          data-testid="gl-class-link-qr"
        >
          {open ? 'Fermer le QR de la classe' : 'QR de la classe'}
        </GLButton>
        <span className="gl-hint" data-testid="gl-class-link-sessions-count">
          {connectees.length
            ? `Tablettes connectées : ${connectees.length} équipe${connectees.length > 1 ? 's' : ''} sur ${teams.length}`
            : 'Aucune tablette d’équipe connectée'}
        </span>
      </div>
      {error ? <p className="gl-error-banner">{error}</p> : null}
      {connectees.length ? (
        <ul className="gl-class-link-panel__sessions">
          {parEquipe.map(({ team, sessions: list }) =>
            list.map((s) => (
              <li key={s.id}>
                <strong>{team.name}</strong>
                <span className="gl-hint">
                  {' '}
                  · ouverte à {heure(s.createdAt)}
                  {s.lastSeenAt ? ` · vue à ${heure(s.lastSeenAt)}` : ''}
                </span>{' '}
                <GLButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => deconnecter(s.id)}
                >
                  Déconnecter
                </GLButton>
              </li>
            )),
          )}
        </ul>
      ) : null}
      {open && link ? (
        <div className="gl-class-link-sheet" data-testid="gl-class-link-sheet">
          <h2>{link.className}</h2>
          <p className="gl-class-link-sheet__consigne">
            Scannez ce code avec la tablette, puis touchez la mascotte de votre équipe.
          </p>
          {qr ? <img src={qr} alt="QR de la classe" className="gl-class-link-sheet__qr" /> : null}
          <p className="gl-class-link-sheet__code">
            Code de la classe : <strong>{formatClassCode(link.code)}</strong>
          </p>
          <p className="gl-hint gl-class-link-sheet__url">{link.url}</p>
          <div className="gl-inline-actions gl-class-link-sheet__actions">
            <GLButton type="button" onClick={() => window.print()}>
              Imprimer
            </GLButton>
            <GLButton type="button" variant="ghost" disabled={busy} onClick={regenerer}>
              Régénérer…
            </GLButton>
          </div>
        </div>
      ) : null}
    </section>
  );
}
