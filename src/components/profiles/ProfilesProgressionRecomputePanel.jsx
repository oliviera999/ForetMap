import { useState } from 'react';
import { api } from '../../services/api';
import {
  buildRecomputeBody,
  changedRows,
  formatRecomputeRow,
  summarizeRecompute,
} from '../../utils/progressionRecompute.js';

const cardStyle = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  padding: 12,
  marginTop: 12,
};

/**
 * Attribution en masse du profil d'après le nombre de tâches validées.
 *
 * Deux temps volontairement séparés : « Aperçu » (dry run, rien n'est écrit) puis « Appliquer le recalcul ».
 * Un recalcul de parc entier touche des dizaines de comptes — le n3boss voit qui change avant
 * de valider. Le recalcul d'un seul compte se fait depuis la liste d'attribution ci-dessus.
 */
export function ProfilesProgressionRecomputePanel({
  groupOptions = [],
  roleTerms = {},
  loading = false,
  onApplied,
}) {
  const [scope, setScope] = useState('all');
  const [groupId, setGroupId] = useState('');
  const [allowDemotion, setAllowDemotion] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [applied, setApplied] = useState(null);
  const [error, setError] = useState('');

  const studentPlural = roleTerms.studentPlural || 'n3beurs';
  const disabled = busy || loading || (scope === 'group' && !groupId);

  const run = async (dryRun) => {
    setError('');
    setBusy(true);
    try {
      const payload = await api(
        '/api/rbac/progression/recompute',
        'POST',
        buildRecomputeBody({ scope, groupId, allowDemotion, dryRun }),
      );
      if (dryRun) {
        setPreview(payload);
        setApplied(null);
      } else {
        setApplied(payload);
        setPreview(null);
        if (typeof onApplied === 'function') await onApplied(payload);
      }
    } catch (e) {
      setError(e.message || 'Erreur lors du recalcul des profils');
    }
    setBusy(false);
  };

  const shown = applied || preview;
  const rows = shown ? changedRows(shown) : [];

  return (
    <div style={cardStyle} data-testid="progression-recompute-panel">
      <h3 style={{ marginTop: 0 }}>Attribuer les profils d’après les tâches validées</h3>
      <p
        style={{
          margin: '0 0 10px',
          fontSize: 'var(--text-sm)',
          color: 'var(--ink-soft)',
          lineHeight: 'var(--lh-normal)',
        }}
      >
        Aligne le profil principal des {studentPlural} sur le palier correspondant à leur nombre de
        tâches validées (par exemple 60 tâches validées → palier le plus élevé atteint). Seuls les
        comptes rattachés à un groupe n3beur sont concernés ; les profils hors échelle (n3boss,
        admin, MJ…) ne sont jamais modifiés.
      </p>
      <div
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}
      >
        <label style={{ fontSize: 'var(--text-sm)' }}>
          <span style={{ marginRight: 6 }}>Périmètre</span>
          <select
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              setPreview(null);
              setApplied(null);
            }}
            disabled={busy}
            aria-label="Périmètre du recalcul des profils"
          >
            <option value="all">Tous les {studentPlural}</option>
            <option value="group">Un groupe</option>
          </select>
        </label>
        {scope === 'group' && (
          <select
            value={groupId}
            onChange={(e) => {
              setGroupId(e.target.value);
              setPreview(null);
              setApplied(null);
            }}
            disabled={busy}
            aria-label="Groupe à recalculer"
          >
            <option value="">Choisir un groupe…</option>
            {groupOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          fontSize: 'var(--text-sm)',
          marginBottom: 10,
          cursor: busy ? 'default' : 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={allowDemotion}
          onChange={(e) => {
            setAllowDemotion(e.target.checked);
            setPreview(null);
            setApplied(null);
          }}
          disabled={busy}
          style={{ marginTop: 3 }}
        />
        <span>
          Aligner strictement : autoriser aussi la <strong>baisse</strong> de palier quand le profil
          attribué dépasse le nombre de tâches validées. Décoché (défaut) : montée seule, aucun
          palier acquis n’est perdu.
        </span>
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => run(true)}
          disabled={disabled}
        >
          Aperçu
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => run(false)}
          disabled={disabled}
        >
          Appliquer le recalcul
        </button>
      </div>
      {error && (
        <p style={{ margin: '10px 0 0', fontSize: 'var(--text-sm)', color: 'var(--ink-danger)' }}>
          {error}
        </p>
      )}
      {shown && (
        <div style={{ marginTop: 10 }} data-testid="progression-recompute-result">
          <p style={{ margin: '0 0 6px', fontSize: 'var(--text-sm)' }}>
            {summarizeRecompute(shown)}
          </p>
          {rows.length > 0 && (
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                maxHeight: 220,
                overflow: 'auto',
                fontSize: 'var(--text-sm)',
                color: 'var(--ink-soft)',
              }}
            >
              {rows.map((row) => (
                <li key={row.userId}>{formatRecomputeRow(row)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
