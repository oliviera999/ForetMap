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
 *
 * Sessions d'équipe protégées (ensemble unifié, M13) : une tablette qui touche la mascotte de
 * son équipe **demande** à entrer. La première tablette de chaque équipe est acceptée ici —
 * « Tout accepter » en début de séance, ou une par une ; les suivantes peuvent l'être par un
 * appareil déjà dans l'équipe. Sans réponse, une demande expire seule au bout de deux minutes.
 *
 * Écrans de séance (K6) : le panneau tient sur **une ligne** (« 4 tablettes connectées ✓ »,
 * « 1 tablette attend ») et se déplie au toucher ; il se déplie tout seul tant qu'une tablette
 * attend d'entrer, pour que « Accepter » soit sous la main.
 */

/** Résumé d'une ligne : tablettes qui attendent d'abord, sinon tablettes connectées. */
export function resumeDesTablettes({ sessions = 0, demandes = 0, equipes = 0, total = 0 } = {}) {
  if (demandes > 0) {
    return demandes > 1 ? `${demandes} tablettes attendent` : '1 tablette attend';
  }
  if (!sessions) return 'Aucune tablette connectée';
  const connectees = sessions > 1 ? `${sessions} tablettes connectées` : '1 tablette connectée';
  if (total > 0 && equipes >= total) return `${connectees} ✓`;
  return `${connectees} · ${equipes} équipe${equipes > 1 ? 's' : ''} sur ${total}`;
}

export function GLClassLinkPanel({ game, teams = [], refreshKey = 0 }) {
  const { confirm } = useAppDialogs();
  const classId = game?.class_id != null ? Number(game.class_id) : null;
  const gameId = game?.id != null ? Number(game.id) : null;
  const [link, setLink] = useState(null);
  const [qr, setQr] = useState('');
  const [open, setOpen] = useState(false);
  const [deplie, setDeplie] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [demandes, setDemandes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadSessions = useCallback(async () => {
    if (!gameId) return;
    try {
      const data = await apiGL(`/api/gl/games/${gameId}/tenir/sessions`);
      setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
      setDemandes(Array.isArray(data?.demandes) ? data.demandes : []);
    } catch (_) {
      // La liste est un confort : une lecture en échec ne gêne pas le tour.
    }
  }, [gameId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions, refreshKey]);

  // Une demande d'appareil expire seule au bout de deux minutes : la liste se relit à
  // l'échéance de la plus proche.
  const prochaineEcheance = demandes.length
    ? Math.min(...demandes.map((d) => Number(d.resteSecondes) || 0))
    : null;
  useEffect(() => {
    if (prochaineEcheance == null) return undefined;
    const timer = setTimeout(loadSessions, (prochaineEcheance + 1) * 1000);
    return () => clearTimeout(timer);
  }, [prochaineEcheance, demandes, loadSessions]);

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

  /** Réponse à une ou à toutes les demandes d'appareil : `accepter`, `refuser`, `accepter-tout`. */
  const repondre = useCallback(
    async (chemin) => {
      setBusy(true);
      setError('');
      try {
        await apiGL(`/api/gl/games/${gameId}/tenir/sessions/${chemin}`, 'POST', {});
      } catch (err) {
        setError(err.message || 'Réponse impossible');
      } finally {
        setBusy(false);
        await loadSessions();
      }
    },
    [gameId, loadSessions],
  );

  if (!classId) return null;
  const nomDEquipe = (teamId) =>
    teams.find((t) => Number(t.id) === Number(teamId))?.name || 'Équipe';
  const parEquipe = teams.map((t) => ({
    team: t,
    sessions: sessions.filter((s) => Number(s.teamId) === Number(t.id)),
  }));
  const connectees = parEquipe.filter((e) => e.sessions.length);

  // Une tablette qui attend déplie le panneau d'office ; la feuille du QR ouverte aussi. Une
  // erreur aussi : un refus du serveur (demande échue…) ne doit pas disparaître avec le repli.
  const ouvert = deplie || demandes.length > 0 || open || !!error;

  return (
    <section
      className={`gl-class-link-panel${ouvert ? ' is-deplie' : ''}`}
      data-testid="gl-class-link-panel"
    >
      <button
        type="button"
        className={`gl-class-link-panel__resume${demandes.length ? ' is-attente' : ''}`}
        aria-expanded={ouvert}
        aria-controls={ouvert ? 'gl-class-link-detail' : undefined}
        data-testid="gl-class-link-resume"
        // Tant qu'une tablette attend (ou que la feuille du QR est ouverte), le détail reste là.
        onClick={() => {
          setDeplie(!ouvert);
          // Replier, c'est aussi avoir lu l'erreur.
          if (ouvert) setError('');
        }}
      >
        <span className="gl-class-link-panel__chevron" aria-hidden="true">
          {ouvert ? '▾' : '▸'}
        </span>
        <span data-testid="gl-class-link-sessions-count">
          {resumeDesTablettes({
            sessions: sessions.length,
            demandes: demandes.length,
            equipes: connectees.length,
            total: teams.length,
          })}
        </span>
      </button>
      {ouvert ? (
        <div id="gl-class-link-detail" data-testid="gl-class-link-detail">
          {error ? <p className="gl-error-banner">{error}</p> : null}
          {demandes.length ? (
            <div data-testid="gl-class-link-demandes">
              <p role="status">
                <strong>
                  {demandes.length > 1
                    ? `${demandes.length} tablettes demandent à entrer.`
                    : 'Une tablette demande à entrer.'}
                </strong>{' '}
                <GLButton
                  type="button"
                  disabled={busy}
                  onClick={() => repondre('accepter-tout')}
                  data-testid="gl-class-link-accepter-tout"
                >
                  Tout accepter
                </GLButton>
              </p>
              <ul className="gl-class-link-panel__demandes">
                {demandes.map((d) => (
                  <li key={d.id}>
                    <strong>{nomDEquipe(d.teamId)}</strong>{' '}
                    <GLButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => repondre(`${d.id}/accepter`)}
                    >
                      Accepter
                    </GLButton>{' '}
                    <GLButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => repondre(`${d.id}/refuser`)}
                    >
                      Refuser
                    </GLButton>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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
          </div>
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
              {qr ? (
                <img src={qr} alt="QR de la classe" className="gl-class-link-sheet__qr" />
              ) : null}
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
        </div>
      ) : null}
    </section>
  );
}
