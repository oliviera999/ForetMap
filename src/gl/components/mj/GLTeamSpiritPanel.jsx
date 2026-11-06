import { useState } from 'react';
import { GLButton } from '../ui/GLButton.jsx';

/**
 * Bilan Team Spirit de la séance (spec § 11) : une ligne par équipe, cartes gardées 0–6, note
 * facultative (vue du prof seul). Aucune ressource. `onSave(bilans)`.
 */
export function GLTeamSpiritPanel({ teams = [], disabled = false, lumiere = null, onSave }) {
  const [rows, setRows] = useState(() =>
    Object.fromEntries(teams.map((t) => [String(t.id), { cartesGardees: 0, note: '' }])),
  );
  return (
    <form
      className="gl-team-spirit gl-gameplay-block"
      data-testid="gl-team-spirit"
      onSubmit={(e) => {
        e.preventDefault();
        onSave?.(
          teams.map((t) => ({
            teamId: Number(t.id),
            cartesGardees: Number(rows[String(t.id)]?.cartesGardees) || 0,
            note: rows[String(t.id)]?.note || null,
          })),
        );
      }}
    >
      <h3>Bilan Team Spirit</h3>
      {teams.map((t) => (
        <div key={t.id} className="gl-inline-actions">
          <span>{t.name}</span>
          <label>
            Cartes gardées
            <input
              type="number"
              min={0}
              max={6}
              value={rows[String(t.id)]?.cartesGardees ?? 0}
              disabled={disabled}
              aria-label={`Cartes gardées — ${t.name}`}
              onChange={(e) =>
                setRows((prev) => ({
                  ...prev,
                  [String(t.id)]: { ...prev[String(t.id)], cartesGardees: e.target.value },
                }))
              }
            />
          </label>
          <input
            type="text"
            placeholder="Note (prof seul)"
            aria-label={`Note — ${t.name}`}
            value={rows[String(t.id)]?.note ?? ''}
            disabled={disabled}
            onChange={(e) =>
              setRows((prev) => ({
                ...prev,
                [String(t.id)]: { ...prev[String(t.id)], note: e.target.value },
              }))
            }
          />
        </div>
      ))}
      {lumiere ? (
        <p className="gl-hint">
          Lumière : {lumiere.total} carte{lumiere.total > 1 ? 's' : ''} gardée
          {lumiere.total > 1 ? 's' : ''} sur le chapitre.
        </p>
      ) : null}
      <GLButton type="submit" disabled={disabled || !teams.length}>
        Enregistrer le bilan
      </GLButton>
    </form>
  );
}
