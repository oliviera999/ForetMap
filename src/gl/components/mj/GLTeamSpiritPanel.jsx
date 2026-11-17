import { useState } from 'react';
import { GLButton } from '../ui/GLButton.jsx';

/** Cartes Team Spirit d'une équipe à chaque séance. */
const CARTES = 6;

/**
 * Bilan Team Spirit de la séance (spec § 11) : une ligne par équipe. Ensemble unifié (M14) : les
 * six cartes sont **gardées par défaut** — le prof ne touche que celles qu'il a retirées pendant
 * la séance. Note facultative (vue du prof seul). Aucune ressource. `onSave(bilans)`.
 */
export function GLTeamSpiritPanel({ teams = [], disabled = false, lumiere = null, onSave }) {
  const [rows, setRows] = useState(() =>
    Object.fromEntries(teams.map((t) => [String(t.id), { retirees: [], note: '' }])),
  );
  const ligne = (teamId) => rows[String(teamId)] || { retirees: [], note: '' };
  const basculer = (teamId, carte) =>
    setRows((prev) => {
      const actuel = prev[String(teamId)] || { retirees: [], note: '' };
      const retirees = actuel.retirees.includes(carte)
        ? actuel.retirees.filter((c) => c !== carte)
        : [...actuel.retirees, carte];
      return { ...prev, [String(teamId)]: { ...actuel, retirees } };
    });
  return (
    <form
      className="gl-team-spirit gl-gameplay-block"
      data-testid="gl-team-spirit"
      onSubmit={(e) => {
        e.preventDefault();
        onSave?.(
          teams.map((t) => ({
            teamId: Number(t.id),
            cartesGardees: CARTES - ligne(t.id).retirees.length,
            note: ligne(t.id).note || null,
          })),
        );
      }}
    >
      <h3>Bilan Team Spirit</h3>
      <p className="gl-hint">
        Les six cartes sont gardées d’office : touchez seulement celles que vous avez retirées.
      </p>
      {teams.map((t) => {
        const { retirees, note } = ligne(t.id);
        return (
          <div key={t.id} className="gl-team-spirit__ligne">
            <span className="gl-team-spirit__equipe">
              {t.name}{' '}
              <small className="gl-hint" data-testid={`gl-team-spirit-total-${t.id}`}>
                {CARTES - retirees.length} / {CARTES} gardées
              </small>
            </span>
            <div className="gl-team-spirit__cartes" role="group" aria-label={`Cartes — ${t.name}`}>
              {Array.from({ length: CARTES }, (_, i) => i + 1).map((carte) => {
                const retiree = retirees.includes(carte);
                return (
                  <button
                    key={carte}
                    type="button"
                    className={`gl-team-spirit__carte${retiree ? ' is-retiree' : ''}`}
                    aria-pressed={retiree}
                    aria-label={`Carte ${carte} retirée — ${t.name}`}
                    disabled={disabled}
                    onClick={() => basculer(t.id, carte)}
                  >
                    {retiree ? 'retirée' : carte}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              placeholder="Note (prof seul)"
              aria-label={`Note — ${t.name}`}
              value={note}
              disabled={disabled}
              onChange={(e) =>
                setRows((prev) => ({
                  ...prev,
                  [String(t.id)]: { ...ligne(t.id), note: e.target.value },
                }))
              }
            />
          </div>
        );
      })}
      {lumiere && lumiere.active !== false ? (
        <p className="gl-hint" data-testid="gl-lumiere-jauge">
          Lumière : {lumiere.total}
          {lumiere.palier ? ` / ${lumiere.palier}` : ''}. Au palier, le voile recule tout seul.
        </p>
      ) : null}
      <GLButton type="submit" disabled={disabled || !teams.length}>
        Enregistrer le bilan
      </GLButton>
    </form>
  );
}
