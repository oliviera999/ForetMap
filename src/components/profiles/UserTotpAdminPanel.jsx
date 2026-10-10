import { useCallback, useEffect, useState } from 'react';

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Fiche d'un compte (administration) — double authentification : état et réinitialisation
 * (téléphone perdu, activation douteuse), avec confirmation en place. La réinitialisation
 * ferme toutes les sessions du compte ; il reconfigurera son application à la prochaine
 * connexion. Rien n'est affiché pour un compte ni concerné ni enrôlé.
 *
 * @param {object} props
 * @param {string} props.userId
 * @param {(path: string, method?: string, body?: object) => Promise<object>} props.request
 */
export function UserTotpAdminPanel({ userId, request }) {
  const [status, setStatus] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    try {
      setStatus(await request(`/api/auth/totp/users/${encodeURIComponent(String(userId))}`));
    } catch (_) {
      setStatus(null);
    }
  }, [request, userId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!status || (!status.subject && !status.enrolled)) return null;

  const reset = async () => {
    setErr('');
    setBusy(true);
    try {
      await request(`/api/auth/totp/users/${encodeURIComponent(String(userId))}/reset`, 'POST', {});
      setInfo('Double authentification réinitialisée : le compte la configurera de nouveau.');
      setConfirming(false);
      await load();
    } catch (e) {
      setErr(e?.message || 'Réinitialisation impossible');
    }
    setBusy(false);
  };

  return (
    <div className="profiles-user-totp" data-testid="user-totp-admin" style={{ marginTop: 12 }}>
      <p style={{ margin: 0, fontWeight: 600 }}>Double authentification</p>
      <p style={{ margin: '4px 0' }}>
        {status.enrolled
          ? `Active depuis le ${formatDate(status.enabledAt)} — ${status.backupCodesRemaining} codes de secours restants.`
          : 'Non activée.'}
      </p>
      {info && <div className="auth-success">{info}</div>}
      {err && (
        <div className="auth-error" role="alert">
          {err}
        </div>
      )}
      {status.enrolled &&
        (confirming ? (
          <div className="profiles-user-danger__confirm" role="alertdialog">
            <p>
              Le compte devra configurer de nouveau son application à sa prochaine connexion ;
              toutes ses sessions seront fermées. L’action est inscrite au journal de sécurité.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={reset}
                disabled={busy}
              >
                {busy ? '…' : 'Confirmer la réinitialisation'}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirming(false)}
                disabled={busy}
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setConfirming(true)}
          >
            Réinitialiser la double authentification
          </button>
        ))}
    </div>
  );
}
