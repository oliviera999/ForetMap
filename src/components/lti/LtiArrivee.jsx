import { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { TAB_STORAGE_KEY } from '../../constants/app-runtime';
import { safeLocalStorageSetItem } from '../../shared/platform/browserStorage.js';
import {
  destinationsFromTicket,
  parseTicketFromHash,
  tabForLanding,
  redirectTo,
} from '../../utils/ltiArrivee.js';

/**
 * Page d'arrivée après un lancement LTI 1.3 : échange le ticket contre une session
 * produit, puis dépose le jeton via `#oauth=` (même mécanisme que Google).
 */
export function LtiArrivee() {
  const ticket = useMemo(
    () => parseTicketFromHash(typeof window !== 'undefined' ? window.location.hash : ''),
    [],
  );
  const destinations = useMemo(() => destinationsFromTicket(ticket), [ticket]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async (destinationId) => {
    if (!ticket || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await api('/api/lti/session', 'POST', {
        ticket,
        destinationId,
      });
      const tab = tabForLanding(result.landing);
      if (tab) safeLocalStorageSetItem(TAB_STORAGE_KEY, tab);
      if (result.redirectUrl) {
        redirectTo(result.redirectUrl);
        return;
      }
      setError('Session ouverte mais redirection manquante.');
    } catch (err) {
      setError(err?.message || 'Entrée depuis le cours refusée');
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!ticket) {
      setError('Lien d’arrivée incomplet ou expiré.');
      return;
    }
    if (destinations.length === 1) {
      go(destinations[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket]);

  if (!ticket) {
    return (
      <main className="lti-arrivee" data-testid="lti-arrivee">
        <h1>Entrée depuis le cours</h1>
        <p role="alert">{error || 'Lien d’arrivée incomplet ou expiré.'}</p>
      </main>
    );
  }

  if (destinations.length <= 1) {
    return (
      <main className="lti-arrivee" data-testid="lti-arrivee">
        <h1>Entrée depuis le cours</h1>
        {error ? <p role="alert">{error}</p> : <p>Ouverture de la session…</p>}
      </main>
    );
  }

  return (
    <main className="lti-arrivee" data-testid="lti-arrivee">
      <h1>Où voulez-vous aller ?</h1>
      {error ? <p role="alert">{error}</p> : null}
      <p>Vous arrivez depuis un cours Moodle. Choisissez l’application.</p>
      <div className="lti-arrivee__choices">
        {destinations.map((d) => (
          <button
            key={d.id}
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => go(d.id)}
          >
            {d.label || d.landing}
          </button>
        ))}
      </div>
    </main>
  );
}
