import { useEffect, useState } from 'react';
import { moodleAdminApi } from '../../../services/moodleAdminApi.js';
import { useAppDialogs } from '../../../shared/components/AppDialogsProvider.jsx';

/**
 * Deux outils rares mais nécessaires (sections 8.2 et 11) :
 *  - marquer un compte ou un groupe **hors synchronisation** (`sync_exempt`) ;
 *  - **fusionner** deux comptes (le doublon B est versé dans A puis supprimé) — toujours une
 *    simulation avant l'application, jamais annulable.
 */
export function MoodleToolsCard({ onMessage, onError }) {
  const { confirm } = useAppDialogs();
  const [exempt, setExempt] = useState({ users: [], groups: [] });
  const [exemptType, setExemptType] = useState('user');
  const [exemptId, setExemptId] = useState('');
  const [fromUserId, setFromUserId] = useState('');
  const [intoUserId, setIntoUserId] = useState('');
  const [mergePlan, setMergePlan] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadExempt = async () => {
    try {
      setExempt(await moodleAdminApi.exempt());
    } catch (error) {
      onError?.(error?.message || 'Liste hors synchronisation indisponible');
    }
  };

  useEffect(() => {
    loadExempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleExempt = async (targetType, targetId, value) => {
    setBusy(true);
    try {
      await moodleAdminApi.setExempt({ targetType, targetId, exempt: value });
      onMessage?.(value ? 'Marqué hors synchronisation' : 'Synchronisation rétablie');
      setExemptId('');
      await loadExempt();
    } catch (error) {
      onError?.(error?.message || 'Marquage refusé');
    }
    setBusy(false);
  };

  const planMerge = async () => {
    setBusy(true);
    setMergePlan(null);
    try {
      setMergePlan(await moodleAdminApi.merge({ fromUserId, intoUserId, dryRun: true }));
    } catch (error) {
      onError?.(error?.message || 'Simulation de fusion refusée');
    }
    setBusy(false);
  };

  const applyMerge = async () => {
    const ok = await confirm({
      message: `Fusionner définitivement le compte ${fromUserId} dans ${intoUserId} ? Le compte source sera supprimé ; cette opération n’est pas annulable.`,
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await moodleAdminApi.merge({ fromUserId, intoUserId, dryRun: false });
      onMessage?.(`Fusion effectuée (exécution #${result.runId})`);
      setMergePlan(null);
      setFromUserId('');
      setIntoUserId('');
    } catch (error) {
      onError?.(error?.message || 'Fusion refusée');
    }
    setBusy(false);
  };

  return (
    <div data-testid="moodle-tools">
      <h4>Hors synchronisation</h4>
      <p className="section-sub" style={{ marginTop: 0 }}>
        Un compte ou un groupe marqué n’est jamais écrit ni désactivé par la synchronisation (I-4).
        Coller l’identifiant tel qu’il apparaît dans la gestion des élèves ou des groupes.
      </p>
      <div className="moodle-actions" style={{ marginTop: 0 }}>
        <select
          aria-label="Type de cible"
          value={exemptType}
          onChange={(e) => setExemptType(e.target.value)}
        >
          <option value="user">Compte</option>
          <option value="group">Groupe</option>
        </select>
        <input
          type="text"
          aria-label="Identifiant à marquer"
          placeholder="Identifiant"
          value={exemptId}
          onChange={(e) => setExemptId(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || !exemptId.trim()}
          onClick={() => toggleExempt(exemptType, exemptId.trim(), true)}
        >
          Marquer hors sync
        </button>
      </div>
      <ul className="moodle-exempt-list">
        {(exempt.users || []).map((u) => (
          <li key={`u-${u.userId}`}>
            Compte {u.displayName || u.userId}
            {u.email ? ` <${u.email}>` : ''}{' '}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => toggleExempt('user', u.userId, false)}
            >
              Rétablir
            </button>
          </li>
        ))}
        {(exempt.groups || []).map((g) => (
          <li key={`g-${g.groupId}`}>
            Groupe {g.name || g.groupId}{' '}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => toggleExempt('group', g.groupId, false)}
            >
              Rétablir
            </button>
          </li>
        ))}
        {!exempt.users?.length && !exempt.groups?.length && (
          <li style={{ color: 'var(--ink-soft)' }}>Rien n’est marqué hors synchronisation.</li>
        )}
      </ul>

      <h4>Fusionner deux comptes</h4>
      <p className="section-sub" style={{ marginTop: 0 }}>
        Le compte <strong>source</strong> (doublon) est versé dans le compte <strong>cible</strong>{' '}
        : groupes, tâches, observations, forum, joueur G&L, identités ; les champs vides de la cible
        sont complétés ; la source est supprimée. Simuler d’abord.
      </p>
      <div className="moodle-actions" style={{ marginTop: 0 }}>
        <input
          type="text"
          aria-label="Compte source (doublon)"
          placeholder="Compte source (doublon)"
          value={fromUserId}
          onChange={(e) => setFromUserId(e.target.value.trim())}
        />
        <span aria-hidden="true">→</span>
        <input
          type="text"
          aria-label="Compte cible"
          placeholder="Compte cible"
          value={intoUserId}
          onChange={(e) => setIntoUserId(e.target.value.trim())}
        />
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || !fromUserId || !intoUserId}
          onClick={planMerge}
        >
          Simuler la fusion
        </button>
      </div>
      {mergePlan && (
        <div className="settings-admin-card" data-testid="moodle-merge-plan">
          <p>
            {mergePlan.from?.displayName || fromUserId} →{' '}
            {mergePlan.into?.displayName || intoUserId}
          </p>
          {(mergePlan.blockers || []).length > 0 && (
            <ul className="auth-error">
              {mergePlan.blockers.map((b, i) => (
                <li key={i}>{b.message || b.code}</li>
              ))}
            </ul>
          )}
          <ul>
            {(mergePlan.tables || []).map((t) => (
              <li key={`${t.table}.${t.column}`}>
                {t.table} : {t.rows} ligne(s)
              </li>
            ))}
            {mergePlan.glPlayer && <li>Joueur G&L réattribué</li>}
            {mergePlan.fills &&
              Object.entries(mergePlan.fills)
                .filter(([, v]) => v)
                .map(([k]) => <li key={k}>Champ complété : {k}</li>)}
          </ul>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !mergePlan.canApply}
            onClick={applyMerge}
          >
            Fusionner définitivement
          </button>
        </div>
      )}
    </div>
  );
}
