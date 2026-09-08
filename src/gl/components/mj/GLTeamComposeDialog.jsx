import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DialogShell } from '../../../shared/components/DialogShell.jsx';
import { apiGL } from '../../services/apiGL.js';
import {
  GL_TEAM_COMPOSE_WARNING_LABELS,
  listAvailableRecipes,
} from '../../utils/glTeamCompositionRecipes.js';
import { GLMascotAvatar } from '../GLMascotAvatar.jsx';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';

const TYPE_LABELS = { gnome: 'Gnome', unicorn: 'Licorne' };

function memberLabel(member) {
  const full = `${member.firstName || ''} ${member.lastName || ''}`.trim();
  if (member.pseudo && full) return `${member.pseudo} — ${full}`;
  return member.pseudo || full || `Joueur #${member.playerId}`;
}

/**
 * Dialogue MJ « Composer automatiquement » (docs/GL_EQUIPES_AUTO_CONCEPTION.md § 10).
 *
 * Deux temps : aperçu (aucune écriture) puis application. Le MJ garde la main : il peut
 * régénérer, changer de recette, déplacer un joueur d'une équipe à l'autre (sélecteur
 * « déplacer vers… », accessible clavier / tactile) et renommer avant d'appliquer.
 * Aucun score individuel n'est reçu ni affiché.
 */
export function GLTeamComposeDialog({
  open,
  onClose,
  gameId,
  gameName = '',
  onApplied,
  profileRecipesEnabled = false,
  scoringEnabled = false,
}) {
  const [recipe, setRecipe] = useState('random');
  const [teamSize, setTeamSize] = useState('4');
  const [teamCount, setTeamCount] = useState('');
  const [seed, setSeed] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [proposal, setProposal] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef(0);

  const recipes = useMemo(
    () => listAvailableRecipes({ profileRecipesEnabled, scoringEnabled }),
    [profileRecipesEnabled, scoringEnabled],
  );

  const runPreview = useCallback(
    async (overrides = {}) => {
      if (!gameId) return;
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      setLoading(true);
      setError('');
      const body = {
        recipe: overrides.recipe ?? recipe,
        includeInactive: overrides.includeInactive ?? includeInactive,
      };
      const nextSeed = overrides.seed !== undefined ? overrides.seed : seed;
      if (nextSeed) body.seed = nextSeed;
      const count = Number(overrides.teamCount ?? teamCount);
      if (Number.isFinite(count) && count > 0) body.teamCount = count;
      else {
        const size = Number(overrides.teamSize ?? teamSize);
        if (Number.isFinite(size) && size > 0) body.teamSize = size;
      }
      try {
        const data = await apiGL(`/api/gl/games/${gameId}/teams/compose/preview`, 'POST', body);
        if (requestRef.current !== requestId) return;
        setProposal(data);
        setTeams(
          (data?.teams || []).map((team) => ({
            ...team,
            members: [...(team.members || [])],
          })),
        );
        setSeed(data?.seed || '');
        if (data?.recipe && data.recipe !== body.recipe) setRecipe(data.recipe);
      } catch (err) {
        if (requestRef.current !== requestId) return;
        setProposal(null);
        setTeams([]);
        setError(err?.message || 'Aperçu impossible');
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    },
    [gameId, includeInactive, recipe, seed, teamCount, teamSize],
  );

  // Ouverture : aperçu immédiat avec les réglages par défaut.
  useEffect(() => {
    if (!open) return;
    setProposal(null);
    setTeams([]);
    setError('');
    setReplaceExisting(false);
    setSeed('');
    runPreview({ seed: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- volontairement au seul basculement d'ouverture
  }, [open, gameId]);

  const selectRecipe = (id) => {
    setRecipe(id);
    runPreview({ recipe: id, seed: '' });
  };

  const regenerate = () => runPreview({ seed: '' });

  const movePlayer = (playerId, fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    setTeams((prev) => {
      const next = prev.map((team) => ({ ...team, members: [...team.members] }));
      const source = next[fromIndex];
      const target = next[toIndex];
      if (!source || !target) return prev;
      const idx = source.members.findIndex((m) => m.playerId === playerId);
      if (idx < 0) return prev;
      const [member] = source.members.splice(idx, 1);
      target.members.push(member);
      return next;
    });
  };

  const renameTeam = (index, name) => {
    setTeams((prev) => prev.map((team, i) => (i === index ? { ...team, name } : team)));
  };

  const existingCount = proposal?.existingTeams?.length || 0;
  const emptyTeams = teams.filter((team) => team.members.length === 0);
  const canApply =
    !!proposal &&
    !loading &&
    !applying &&
    teams.length > 0 &&
    emptyTeams.length === 0 &&
    teams.every((team) => String(team.name || '').trim()) &&
    (existingCount === 0 || replaceExisting);

  const apply = async () => {
    if (!canApply) return;
    setApplying(true);
    setError('');
    try {
      await apiGL(`/api/gl/games/${gameId}/teams/compose/apply`, 'POST', {
        recipe: proposal.recipe,
        seed: proposal.seed,
        replaceExisting: existingCount > 0 ? replaceExisting : false,
        teams: teams.map((team) => ({
          name: String(team.name || '').trim(),
          type: team.type,
          color: team.color,
          mascotId: team.mascotId,
          memberIds: team.members.map((m) => m.playerId),
        })),
      });
      await onApplied?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Application impossible');
    } finally {
      setApplying(false);
    }
  };

  if (!open) return null;

  return (
    <DialogShell
      open={open}
      onClose={applying ? undefined : onClose}
      overlayClassName="fm-modal-overlay"
      dialogClassName="fm-modal-panel gl-compose-modal-body animate-pop"
      ariaLabelledBy="gl-compose-title"
    >
      <div className="gl-profile-modal-head">
        <h2 id="gl-compose-title">Composer les équipes automatiquement</h2>
        <GLButton type="button" variant="secondary" onClick={onClose} disabled={applying}>
          Fermer
        </GLButton>
      </div>
      {gameName ? (
        <p className="gl-hint">Partie « {gameName} » — aucune écriture avant « Appliquer ».</p>
      ) : null}

      <section className="gl-compose-section" aria-labelledby="gl-compose-recipes-title">
        <h3 id="gl-compose-recipes-title">Recette</h3>
        <div className="gl-compose-recipes" role="radiogroup" aria-label="Recette de composition">
          {recipes.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={recipe === item.id}
              className={`gl-compose-recipe-card${recipe === item.id ? ' is-selected' : ''}`}
              onClick={() => selectRecipe(item.id)}
              disabled={loading || applying || item.disabled}
              title={item.disabledReason || item.detail}
              data-testid={`gl-compose-recipe-${item.id}`}
            >
              <strong>{item.label}</strong>
              <span>{item.summary}</span>
              {item.disabled ? <em className="gl-hint">{item.disabledReason}</em> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="gl-compose-section gl-compose-settings" aria-label="Réglages">
        <GLField label="Taille visée par équipe" hint="Ignorée si un nombre d’équipes est saisi.">
          <GLInput
            type="number"
            min="1"
            max="12"
            value={teamSize}
            onChange={(event) => setTeamSize(event.target.value)}
            onBlur={() => runPreview({ seed: '' })}
            disabled={recipe === 'carry_over'}
            aria-label="Taille visée par équipe"
          />
        </GLField>
        <GLField label="Nombre d’équipes (facultatif)">
          <GLInput
            type="number"
            min="1"
            max="13"
            value={teamCount}
            onChange={(event) => setTeamCount(event.target.value)}
            onBlur={() => runPreview({ seed: '' })}
            placeholder="auto"
            disabled={recipe === 'carry_over'}
            aria-label="Nombre d’équipes"
          />
        </GLField>
        <GLField label="Graine du tirage" hint="Même graine = même résultat.">
          <GLInput
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            onBlur={() => runPreview({ seed })}
            aria-label="Graine du tirage"
          />
        </GLField>
        <label className="gl-compose-check">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(event) => {
              setIncludeInactive(event.target.checked);
              runPreview({ includeInactive: event.target.checked, seed: '' });
            }}
          />
          <span>Inclure les joueurs inactifs</span>
        </label>
        <div className="gl-inline-actions">
          <GLButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={regenerate}
            disabled={loading || applying}
            loading={loading}
          >
            Régénérer
          </GLButton>
        </div>
      </section>

      {error ? (
        <p className="gl-error" role="alert">
          {error}
        </p>
      ) : null}

      {proposal ? (
        <section className="gl-compose-section" aria-labelledby="gl-compose-preview-title">
          <h3 id="gl-compose-preview-title">
            Aperçu — {teams.length} équipe{teams.length > 1 ? 's' : ''},{' '}
            {proposal.stats?.players ?? 0} joueur{(proposal.stats?.players ?? 0) > 1 ? 's' : ''}
          </h3>
          {Array.isArray(proposal.explain) && proposal.explain.length ? (
            <ul className="gl-compose-explain">
              {proposal.explain.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          {Array.isArray(proposal.warnings) && proposal.warnings.length ? (
            <ul className="gl-compose-warnings" aria-label="Avertissements">
              {proposal.warnings.map((warn) => (
                <li key={warn.code} className="gl-hint">
                  {GL_TEAM_COMPOSE_WARNING_LABELS[warn.code] || warn.message || warn.code}
                </li>
              ))}
            </ul>
          ) : null}
          {proposal.excluded?.length ? (
            <p className="gl-hint">
              Laissés de côté (inactifs) :{' '}
              {proposal.excluded.map((p) => p.pseudo || `#${p.playerId}`).join(', ')}
            </p>
          ) : null}

          <div className="gl-compose-teams">
            {teams.map((team, index) => (
              <article
                key={`${team.index ?? index}-${team.mascotId || ''}`}
                className="gl-compose-team-card"
                style={{ borderColor: team.color || undefined }}
                data-testid={`gl-compose-team-${index}`}
              >
                <header className="gl-compose-team-head">
                  <GLMascotAvatar mascotId={team.mascotId} size={40} fallbackType={team.type} />
                  <div className="gl-compose-team-title">
                    <GLInput
                      value={team.name || ''}
                      onChange={(event) => renameTeam(index, event.target.value)}
                      aria-label={`Nom de l’équipe ${index + 1}`}
                    />
                    <span className={`gl-badge gl-badge--info`}>
                      {TYPE_LABELS[team.type] || team.type}
                    </span>
                  </div>
                </header>
                <ul className="gl-compose-members">
                  {team.members.map((member) => (
                    <li key={member.playerId} className="gl-compose-member">
                      <span className="gl-compose-member-name">{memberLabel(member)}</span>
                      {teams.length > 1 ? (
                        <GLSelect
                          value={String(index)}
                          onChange={(event) =>
                            movePlayer(member.playerId, index, Number(event.target.value))
                          }
                          aria-label={`Déplacer ${member.pseudo || member.playerId} vers…`}
                          disabled={applying}
                        >
                          {teams.map((other, otherIndex) => (
                            <option key={otherIndex} value={String(otherIndex)}>
                              {otherIndex === index ? `Reste : ${other.name}` : `→ ${other.name}`}
                            </option>
                          ))}
                        </GLSelect>
                      ) : null}
                    </li>
                  ))}
                  {team.members.length === 0 ? (
                    <li className="gl-error">Équipe vide : déplacez un joueur ou régénérez.</li>
                  ) : null}
                </ul>
                <footer className="gl-hint">
                  {team.members.length} joueur{team.members.length > 1 ? 's' : ''}
                  {typeof team.newPairs === 'number' && proposal.stats?.historyGames > 0
                    ? ` · ${team.newPairs} binôme${team.newPairs > 1 ? 's' : ''} inédit${team.newPairs > 1 ? 's' : ''}`
                    : ''}
                </footer>
              </article>
            ))}
          </div>

          {existingCount > 0 ? (
            <label className="gl-compose-check gl-compose-check--warn">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(event) => setReplaceExisting(event.target.checked)}
              />
              <span>
                Remplacer les {existingCount} équipe{existingCount > 1 ? 's' : ''} existante
                {existingCount > 1 ? 's' : ''} de cette partie (et leurs affectations)
              </span>
            </label>
          ) : null}
        </section>
      ) : loading ? (
        <p className="gl-hint" role="status">
          Calcul de l’aperçu…
        </p>
      ) : null}

      <div className="gl-inline-actions gl-compose-footer">
        <GLButton type="button" variant="secondary" onClick={onClose} disabled={applying}>
          Annuler
        </GLButton>
        <GLButton type="button" onClick={apply} disabled={!canApply} loading={applying}>
          Appliquer
        </GLButton>
      </div>
    </DialogShell>
  );
}

export default GLTeamComposeDialog;
