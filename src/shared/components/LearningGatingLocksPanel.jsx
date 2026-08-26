import React, { useCallback, useEffect, useMemo, useState } from 'react';

// Écran « lecteurs bloqués » — partagé ForetMap / Gnomes & Licornes.
//
// Constat C4 de l'audit : un élève pouvait rester bloqué plusieurs jours sans que
// personne ne le sache, et sans qu'aucun geste ne permette de le débloquer. Les
// deux produits servent maintenant le même écran ; seuls le client HTTP, les
// chemins et l'identification du lecteur diffèrent, et sont injectés.

const SCOPE_LABELS = { resource: 'Toute la fiche', question: 'Une seule question' };

/** Identité affichable d'un lecteur, quel que soit le produit. */
export function formatLearner(learner) {
  if (!learner) return '—';
  if (learner.display_name) return learner.display_name;
  // GL n'a pas toujours de compte : un invité ou un MJ n'est identifié que par
  // son type et son identifiant de lecteur.
  const type = learner.user_type && learner.user_type !== 'student' ? `${learner.user_type} ` : '';
  return `${type}${learner.user_id || '—'}`.trim();
}

/** Phrase du délai restant, au singulier près. */
export function formatRemaining(lock) {
  if (!lock || lock.expired) return 'Expiré';
  const days = Math.max(1, Number(lock.remaining_days) || 1);
  return days === 1 ? 'encore 1 jour' : `encore ${days} jours`;
}

export function LearningGatingLocksPanel({
  request,
  basePath,
  title = 'Lecteurs bloqués par le contrôle de compréhension',
  /** Corps de la requête de levée, construit depuis la ligne (l'identité diffère par produit). */
  buildReleaseBody,
  classNames = {},
}) {
  const {
    section = 'card pedago-links fade-in',
    hint = 'section-sub',
    error: errorClass = 'pedago-qcm-admin__error',
    tableWrap = 'pedago-links__table-wrap',
    table = 'pedago-links__table',
    button = 'btn-ghost',
  } = classNames;

  const [locks, setLocks] = useState([]);
  const [includeExpired, setIncludeExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const load = useCallback(async () => {
    try {
      const qs = includeExpired ? '?includeExpired=1' : '';
      const res = await request(`${basePath}/locks${qs}`);
      setLocks(Array.isArray(res?.locks) ? res.locks : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement des verrous impossible');
      setLocks([]);
    }
  }, [request, basePath, includeExpired]);

  useEffect(() => {
    load();
  }, [load]);

  const active = useMemo(() => locks.filter((l) => !l.expired), [locks]);

  async function release(lock) {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await request(`${basePath}/locks`, 'DELETE', buildReleaseBody(lock));
      setInfo('Verrou levé — le lecteur peut valider de nouveau.');
      await load();
    } catch (err) {
      setError(err.message || 'Levée impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={section}>
      <h3 className="section-title">{title}</h3>
      <p className={hint}>
        Après trop d&apos;erreurs au contrôle, la validation d&apos;une fiche est bloquée pendant
        quelques jours. Cette liste montre qui est concerné — et permet de lever le blocage.
      </p>

      <label className="pedago-links__policy">
        <input
          type="checkbox"
          checked={includeExpired}
          onChange={(e) => setIncludeExpired(e.target.checked)}
        />
        <span>Afficher aussi les blocages déjà expirés</span>
      </label>

      {error ? <p className={errorClass}>{error}</p> : null}
      {info ? <p className={hint}>{info}</p> : null}

      {locks.length === 0 ? (
        <p className={hint}>
          {includeExpired ? 'Aucun blocage, même expiré.' : 'Personne n’est bloqué actuellement.'}
        </p>
      ) : (
        <>
          <p className={hint}>
            {active.length === 0
              ? 'Aucun blocage en cours.'
              : active.length === 1
                ? '1 lecteur bloqué en ce moment.'
                : `${active.length} lecteurs bloqués en ce moment.`}
          </p>
          <div className={tableWrap}>
            <table className={table}>
              <thead>
                <tr>
                  <th>Lecteur</th>
                  <th>Fiche</th>
                  <th>Portée</th>
                  <th>Erreurs</th>
                  <th>Déblocage</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {locks.map((lock) => (
                  <tr
                    key={`${lock.learner?.user_type}-${lock.learner?.user_id}-${lock.resource_type}-${lock.resource_ref}-${lock.locked_question_code || ''}`}
                  >
                    <td>{formatLearner(lock.learner)}</td>
                    <td>
                      {lock.resource_label || (
                        <code>
                          {lock.resource_type} {lock.resource_ref}
                        </code>
                      )}
                      {lock.wrong_question_code ? (
                        <p className={hint}>
                          Erreur sur <code>{lock.wrong_question_code}</code>
                        </p>
                      ) : null}
                    </td>
                    <td>{SCOPE_LABELS[lock.scope] || lock.scope}</td>
                    <td>{lock.wrong_attempts}</td>
                    <td>{formatRemaining(lock)}</td>
                    <td>
                      {lock.expired ? (
                        <span className={hint}>—</span>
                      ) : (
                        <button
                          type="button"
                          className={button}
                          disabled={busy}
                          onClick={() => release(lock)}
                        >
                          Débloquer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
