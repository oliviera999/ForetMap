import { useCallback, useEffect, useState } from 'react';
import { apiGL, apiGLAvecJeton } from '../../services/apiGL.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLMascotAvatar } from '../GLMascotAvatar.jsx';
import { buildTeamSession, normalizeClassCode } from '../../utils/glTeamSession.js';

const PEUPLES = { gnome: 'Gnomes', unicorn: 'Licornes' };
/** Relecture de la demande pendant l'attente (ms) : comptée par appareil, jamais par adresse. */
const RELECTURE_DEMANDE_MS = 3000;
const FINS_DE_DEMANDE = {
  refusee: 'Cette tablette n’a pas été acceptée. Demandez à votre équipe ou au prof.',
  expiree: 'Personne n’a répondu à temps : touchez de nouveau la mascotte de votre équipe.',
};

/**
 * « J'ai le code de la classe » (« Tenir à deux », lot 2) : la tablette scanne le QR de la
 * classe (`initialToken`, lu dans l'adresse) ou saisit le code à huit caractères, puis **touche
 * la mascotte de son équipe**. Aucun nom d'élève, aucun mot de passe.
 *
 * Sessions d'équipe protégées (ensemble unifié, M13) : toucher la mascotte **demande** à
 * rejoindre l'équipe. Un appareil déjà dans l'équipe, ou le prof, accepte ; sans réponse, la
 * demande expire seule au bout de deux minutes et l'écran revient au choix de l'équipe.
 *
 * `onSession({ token, auth })` reçoit la session d'équipe ; `onCancel` revient à la connexion.
 */
export function GLClassLinkEntry({ initialToken = null, notice = '', onSession, onCancel = null }) {
  const [code, setCode] = useState('');
  const [opened, setOpened] = useState(null);
  const [by, setBy] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /** Demande en attente : `{ session, teamName }` (le jeton n'est gardé qu'ici, en mémoire). */
  const [attente, setAttente] = useState(null);

  const open = useCallback(async (credential) => {
    setBusy(true);
    setError('');
    try {
      const data = await apiGL('/api/gl/class-link/open', 'POST', credential);
      setOpened(data);
      setBy(credential);
    } catch (err) {
      setOpened(null);
      setError(err.message || 'Code de classe non reconnu');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (initialToken) open({ token: initialToken });
  }, [initialToken, open]);

  const choose = useCallback(
    async (teamId) => {
      if (!by) return;
      setBusy(true);
      setError('');
      try {
        const data = await apiGL('/api/gl/class-link/session', 'POST', { ...by, teamId });
        const session = buildTeamSession(data);
        if (!session) throw new Error('Session d’équipe indisponible');
        if (data.enAttente) {
          setAttente({
            session,
            teamName: data.teamName || '',
            // Échéance locale : la demande expire seule, même si la relecture n'aboutit pas.
            expireMs: (Number(data.demandeExpireDansSecondes) || 120) * 1000,
          });
        } else onSession?.(session);
      } catch (err) {
        setError(err.message || 'Session d’équipe indisponible');
      } finally {
        setBusy(false);
      }
    },
    [by, onSession],
  );

  // Tant que la demande attend, l'écran relit où elle en est ; chaque issue a sa sortie.
  useEffect(() => {
    if (!attente) return undefined;
    let actif = true;
    const relire = async () => {
      try {
        const etat = await apiGLAvecJeton('/api/gl/class-link/demande', attente.session.token);
        if (!actif) return;
        if (etat?.statut === 'acceptee') {
          setAttente(null);
          onSession?.(attente.session);
        } else if (FINS_DE_DEMANDE[etat?.statut]) {
          setAttente(null);
          setError(FINS_DE_DEMANDE[etat.statut]);
        }
      } catch (_) {
        // Réseau hésitant : la relecture suivante réessaie ; la demande expire seule.
      }
    };
    relire();
    const timer = setInterval(relire, RELECTURE_DEMANDE_MS);
    // Sans réponse du serveur à l'échéance (réseau hésitant), l'écran revient de lui-même au
    // choix de l'équipe : aucune tablette ne reste « en attente » sans sortie.
    const echeance = setTimeout(
      () => {
        if (!actif) return;
        setAttente(null);
        setError(FINS_DE_DEMANDE.expiree);
      },
      (attente.expireMs || 120000) + 2 * RELECTURE_DEMANDE_MS,
    );
    return () => {
      actif = false;
      clearInterval(timer);
      clearTimeout(echeance);
    };
  }, [attente, onSession]);

  const canon = normalizeClassCode(code);
  return (
    <section className="gl-class-link" data-testid="gl-class-link">
      <h2>{opened ? 'Votre équipe' : 'J’ai le code de la classe'}</h2>
      {notice ? (
        <p className="gl-hint" role="status">
          {notice}
        </p>
      ) : null}
      {!opened ? (
        <form
          className="gl-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (canon.length === 8) open({ code: canon });
          }}
        >
          <label className="gl-class-link__code">
            <span>Code de la classe (8 caractères, sur la feuille du prof)</span>
            <input
              value={code}
              onChange={(event) => setCode(normalizeClassCode(event.target.value))}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={9}
              data-testid="gl-class-link-code"
            />
          </label>
          <GLButton type="submit" variant="primary" disabled={busy || canon.length !== 8}>
            Continuer
          </GLButton>
          <p className="gl-hint">
            Avec l’appareil photo de la tablette, scannez plutôt le QR de la classe.
          </p>
        </form>
      ) : attente ? (
        <div className="gl-class-link__attente" data-testid="gl-class-link-attente">
          <p role="status">
            <strong>{attente.teamName || 'Votre équipe'} : en attente.</strong> Un appareil de
            l’équipe, ou le prof, accepte cette tablette. Rien d’autre à faire.
          </p>
          <GLButton type="button" variant="ghost" onClick={() => setAttente(null)}>
            Changer d’équipe
          </GLButton>
        </div>
      ) : (
        <div className="gl-class-link__teams">
          <p>
            <strong>{opened.className}</strong>
            {opened.game ? ` · ${opened.game.name}` : ''}
          </p>
          {opened.game ? (
            <>
              <p>Touchez la mascotte de votre équipe.</p>
              <ul className="gl-class-link__grid">
                {opened.teams.map((team) => (
                  <li key={team.teamId}>
                    <button
                      type="button"
                      className={`gl-class-link__team gl-class-link__team--${team.type}`}
                      style={team.color ? { '--gl-team-color': team.color } : undefined}
                      disabled={busy}
                      onClick={() => choose(team.teamId)}
                      data-testid={`gl-class-link-team-${team.teamId}`}
                    >
                      <GLMascotAvatar
                        mascotId={team.mascotId}
                        size={72}
                        fallbackType={team.type}
                        fallbackPrimaryColor={team.color || undefined}
                        fallbackLabel={team.name}
                      />
                      <strong>{team.name}</strong>
                      <span className="gl-hint">{PEUPLES[team.type] || ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p role="status">Aucune partie n’est en cours pour cette classe. Attendez le prof.</p>
          )}
          <GLButton
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => (by ? open(by) : null)}
          >
            Actualiser
          </GLButton>
        </div>
      )}
      {error ? <p className="gl-error">{error}</p> : null}
      {onCancel ? (
        <GLButton type="button" variant="ghost" className="gl-btn--full" onClick={onCancel}>
          Retour à la connexion
        </GLButton>
      ) : null}
    </section>
  );
}
