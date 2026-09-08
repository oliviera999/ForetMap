import { useEffect, useState } from 'react';
import {
  POLICY_FIELDS,
  emptyPolicy,
  validatePoliciesDraft,
} from '../../../utils/moodleAdminReport.js';

/**
 * Éditeur des politiques par cohorte (section 6.2). L'ordre compte : la **première** politique
 * dont le motif correspond à l'`idnumber` est retenue. Le serveur valide et normalise ; ici, on
 * refuse seulement les fautes évidentes (clé vide, motif vide, regex invalide).
 */
export function MoodlePoliciesEditor({ value, onSave, saving }) {
  const [draft, setDraft] = useState(() =>
    Array.isArray(value) ? value.map((p) => ({ ...p })) : [],
  );
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(Array.isArray(value) ? value.map((p) => ({ ...p })) : []);
  }, [value, dirty]);

  const update = (index, name, fieldValue) => {
    setDirty(true);
    setDraft((prev) => prev.map((p, i) => (i === index ? { ...p, [name]: fieldValue } : p)));
  };
  const move = (index, delta) => {
    setDirty(true);
    setDraft((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const remove = (index) => {
    setDirty(true);
    setDraft((prev) => prev.filter((_, i) => i !== index));
  };
  const add = () => {
    setDirty(true);
    setDraft((prev) => [...prev, emptyPolicy()]);
  };

  const error = validatePoliciesDraft(draft);

  const save = async () => {
    if (error) return;
    const normalized = draft.map((p) => ({
      ...p,
      key: String(p.key || '').trim(),
      role: String(p.role || '').trim() || null,
    }));
    await onSave(normalized);
    setDirty(false);
  };

  return (
    <div className="moodle-policies" data-testid="moodle-policies">
      <p className="section-sub" style={{ marginTop: 0 }}>
        Une ligne par famille de cohortes. La première politique dont le motif correspond gagne ;
        une cohorte de l’année sans politique est listée dans le rapport et ignorée.
      </p>
      <div className="moodle-table-wrap">
        <table className="moodle-table">
          <thead>
            <tr>
              <th scope="col">Ordre</th>
              {POLICY_FIELDS.map((f) => (
                <th key={f.name} scope="col">
                  {f.label}
                </th>
              ))}
              <th scope="col"> </th>
            </tr>
          </thead>
          <tbody>
            {draft.map((policy, index) => (
              <tr key={index}>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      aria-label={`Monter la politique ${policy.key || index + 1}`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      aria-label={`Descendre la politique ${policy.key || index + 1}`}
                      disabled={index === draft.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      ↓
                    </button>
                  </div>
                </td>
                {POLICY_FIELDS.map((f) => (
                  <td key={f.name}>
                    {f.type === 'boolean' ? (
                      <input
                        type="checkbox"
                        aria-label={`${f.label} — ${policy.key || index + 1}`}
                        checked={Boolean(policy[f.name])}
                        onChange={(e) => update(index, f.name, e.target.checked)}
                      />
                    ) : f.type === 'select' ? (
                      <select
                        aria-label={`${f.label} — ${policy.key || index + 1}`}
                        value={policy[f.name] || f.options[0]}
                        onChange={(e) => update(index, f.name, e.target.value)}
                      >
                        {f.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        aria-label={`${f.label} — ${policy.key || index + 1}`}
                        value={policy[f.name] ?? ''}
                        onChange={(e) => update(index, f.name, e.target.value)}
                        style={
                          f.name === 'pattern'
                            ? { fontFamily: 'monospace', minWidth: 180 }
                            : undefined
                        }
                      />
                    )}
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => remove(index)}
                    aria-label={`Supprimer la politique ${policy.key || index + 1}`}
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <p className="auth-error">{error}</p>}
      <div className="moodle-actions">
        <button type="button" className="btn btn-secondary" onClick={add}>
          Ajouter une politique
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!dirty || Boolean(error) || saving}
          onClick={save}
        >
          {saving ? 'Enregistrement…' : 'Enregistrer les politiques'}
        </button>
      </div>
    </div>
  );
}
