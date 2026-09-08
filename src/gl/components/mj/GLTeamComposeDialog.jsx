import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DialogShell } from '../../../shared/components/DialogShell.jsx';
import { apiGL } from '../../services/apiGL.js';
import {
  GL_PAIRING_LOCK_KINDS,
  GL_TEAM_COMPOSE_WARNING_LABELS,
  GL_TEAM_POLICY_BY_ID,
  listAvailableRecipes,
  listWeightSliders,
} from '../../utils/glTeamCompositionRecipes.js';
import { GLMascotAvatar } from '../GLMascotAvatar.jsx';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';

const TYPE_LABELS = { gnome: 'Gnome', unicorn: 'Licorne' };
const START_WITH_OPTIONS = [
  { value: '', label: 'Automatique (rotation)' },
  { value: 'gnome', label: 'Gnome' },
  { value: 'unicorn', label: 'Licorne' },
];

function memberLabel(member) {
  const full = `${member.firstName || ''} ${member.lastName || ''}`.trim();
  if (member.pseudo && full) return `${member.pseudo} — ${full}`;
  return member.pseudo || full || `Joueur #${member.playerId}`;
}

function shortLabel(member) {
  return member?.pseudo || `${member?.firstName || ''} ${member?.lastName || ''}`.trim() || '?';
}

/** Épingles (Map joueur → équipe) → corps attendu par le serveur. */
function pinsToBody(pins) {
  return [...pins.entries()].map(([playerId, slot]) => ({ playerId, slot }));
}

/**
 * Dialogue MJ « Composer automatiquement » (docs/GL_EQUIPES_AUTO_CONCEPTION.md § 10).
 *
 * Deux temps : aperçu (aucune écriture) puis application. Le MJ garde la main : il peut
 * régénérer, changer de recette, déplacer un joueur d'une équipe à l'autre (sélecteur
 * « déplacer vers… », accessible clavier / tactile), épingler un joueur dans son équipe pour
 * les régénérations suivantes, gérer les verrous de la classe et renommer avant d'appliquer.
 * Sans recette choisie, la politique d'équipes de la classe décide.
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
  // `null` = laisser la politique de la classe choisir (le serveur renvoie la recette effective).
  const [recipe, setRecipe] = useState(null);
  const [teamSize, setTeamSize] = useState('');
  const [teamCount, setTeamCount] = useState('');
  const [seed, setSeed] = useState('');
  const [startWith, setStartWith] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [proposal, setProposal] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  // Surcharges de poids saisies par le MJ (« Poids avancés ») ; vide = presets serveur.
  const [weightsOverride, setWeightsOverride] = useState({});
  // Épingles volatiles : joueur → index d'équipe conservé aux régénérations (jamais persistées).
  const [pins, setPins] = useState(() => new Map());
  // Verrous de la classe (persistés côté serveur, gérés ici par le MJ).
  const [locks, setLocks] = useState([]);
  const [locksError, setLocksError] = useState('');
  const [lockDraft, setLockDraft] = useState({ a: '', b: '', kind: 'apart' });
  const [lockBusy, setLockBusy] = useState(false);
  const requestRef = useRef(0);

  const recipes = useMemo(
    () => listAvailableRecipes({ profileRecipesEnabled, scoringEnabled }),
    [profileRecipesEnabled, scoringEnabled],
  );
  const sliders = useMemo(() => listWeightSliders(recipe), [recipe]);
  const classId = proposal?.classId ?? null;

  const runPreview = useCallback(
    async (overrides = {}) => {
      if (!gameId) return;
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      setLoading(true);
      setError('');
      const body = {
        includeInactive: overrides.includeInactive ?? includeInactive,
      };
      const nextRecipe = overrides.recipe !== undefined ? overrides.recipe : recipe;
      if (nextRecipe) body.recipe = nextRecipe;
      const weights = overrides.weightsOverride ?? weightsOverride;
      if (weights && Object.keys(weights).length > 0) body.weightsOverride = weights;
      const nextSeed = overrides.seed !== undefined ? overrides.seed : seed;
      if (nextSeed) body.seed = nextSeed;
      const nextStart = overrides.startWith !== undefined ? overrides.startWith : startWith;
      if (nextStart) body.startWith = nextStart;
      const nextPins = overrides.pins ?? pins;
      if (nextPins.size > 0) body.pins = pinsToBody(nextPins);
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
        if (data?.recipe && data.recipe !== nextRecipe) setRecipe(data.recipe);
      } catch (err) {
        if (requestRef.current !== requestId) return;
        setProposal(null);
        setTeams([]);
        setError(err?.message || 'Aperçu impossible');
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    },
    [gameId, includeInactive, pins, recipe, seed, startWith, teamCount, teamSize, weightsOverride],
  );

  const loadLocks = useCallback(async (targetClassId) => {
    if (!targetClassId) return;
    setLocksError('');
    try {
      const data = await apiGL(`/api/gl/admin/classes/${targetClassId}/pairing-locks`, 'GET');
      setLocks(Array.isArray(data?.locks) ? data.locks : []);
    } catch (err) {
      setLocks([]);
      setLocksError(err?.message || 'Verrous indisponibles');
    }
  }, []);

  // Ouverture : aperçu immédiat avec les réglages par défaut (politique de la classe).
  useEffect(() => {
    if (!open) return;
    setProposal(null);
    setTeams([]);
    setError('');
    setReplaceExisting(false);
    setSeed('');
    setRecipe(null);
    setStartWith('');
    setWeightsOverride({});
    setPins(new Map());
    setLocks([]);
    setLockDraft({ a: '', b: '', kind: 'apart' });
    runPreview({ seed: '', recipe: null, startWith: '', weightsOverride: {}, pins: new Map() });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- volontairement au seul basculement d'ouverture
  }, [open, gameId]);

  // La classe n'est connue qu'après le premier aperçu : on charge alors ses verrous.
  useEffect(() => {
    if (open && classId) loadLocks(classId);
  }, [open, classId, loadLocks]);

  const selectRecipe = (id) => {
    setRecipe(id);
    // Les poids sont propres à une recette : changer de recette revient aux presets.
    setWeightsOverride({});
    runPreview({ recipe: id, seed: '', weightsOverride: {} });
  };

  const regenerate = () => runPreview({ seed: '' });

  const setWeight = (key, value) => {
    const next = { ...weightsOverride, [key]: Number(value) };
    setWeightsOverride(next);
    runPreview({ seed, weightsOverride: next });
  };

  const resetWeights = () => {
    setWeightsOverride({});
    runPreview({ seed, weightsOverride: {} });
  };

  // Changer le nombre d'équipes rend les épingles caduques (index d'équipe).
  const changeTeamShape = () => {
    const cleared = new Map();
    setPins(cleared);
    runPreview({ seed: '', pins: cleared });
  };

  const togglePin = (playerId, teamIndex) => {
    setPins((prev) => {
      const next = new Map(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.set(playerId, teamIndex);
      return next;
    });
  };

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
    // Un déplacement manuel vaut épingle : il survit aux régénérations.
    setPins((prev) => new Map(prev).set(playerId, toIndex));
  };

  const poolMembers = useMemo(() => {
    const list = teams.flatMap((team) => team.members);
    return list.sort((a, b) => shortLabel(a).localeCompare(shortLabel(b), 'fr'));
  }, [teams]);
  const memberById = useMemo(
    () => new Map(poolMembers.map((m) => [Number(m.playerId), m])),
    [poolMembers],
  );

  const submitLock = async (event) => {
    event.preventDefault();
    if (!classId || lockBusy) return;
    const a = Number(lockDraft.a);
    const b = Number(lockDraft.b);
    if (!a || !b || a === b) {
      setLocksError('Choisissez deux joueurs différents.');
      return;
    }
    setLockBusy(true);
    setLocksError('');
    try {
      await apiGL(`/api/gl/admin/classes/${classId}/pairing-locks`, 'POST', {
        playerAId: a,
        playerBId: b,
        kind: lockDraft.kind,
      });
      setLockDraft({ a: '', b: '', kind: lockDraft.kind });
      await loadLocks(classId);
      runPreview({ seed });
    } catch (err) {
      setLocksError(err?.message || 'Verrou impossible');
    } finally {
      setLockBusy(false);
    }
  };

  const removeLock = async (lockId) => {
    if (!classId || lockBusy) return;
    setLockBusy(true);
    setLocksError('');
    try {
      await apiGL(`/api/gl/admin/classes/${classId}/pairing-locks/${lockId}`, 'DELETE');
      await loadLocks(classId);
      runPreview({ seed });
    } catch (err) {
      setLocksError(err?.message || 'Suppression impossible');
    } finally {
      setLockBusy(false);
    }
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
        {proposal?.recipeSource === 'policy' && proposal.classPolicy ? (
          <p className="gl-hint" data-testid="gl-compose-policy-hint">
            Choisie d’après la politique de la classe («{' '}
            {GL_TEAM_POLICY_BY_ID[proposal.classPolicy]?.label || proposal.classPolicy} ») ; cliquez
            une carte pour forcer une autre recette.
          </p>
        ) : null}
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
            onBlur={changeTeamShape}
            placeholder={
              proposal?.classTeamSizeDefault
                ? `classe : ${proposal.classTeamSizeDefault}`
                : 'classe'
            }
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
            onBlur={changeTeamShape}
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
        <GLField label="Peuple de la première équipe" hint="Les suivantes alternent.">
          <GLSelect
            value={startWith}
            onChange={(event) => {
              setStartWith(event.target.value);
              runPreview({ startWith: event.target.value, seed });
            }}
            disabled={recipe === 'carry_over' || loading || applying}
            aria-label="Peuple de la première équipe"
          >
            {START_WITH_OPTIONS.map((option) => (
              <option key={option.value || 'auto'} value={option.value}>
                {option.label}
              </option>
            ))}
          </GLSelect>
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

      {sliders.length > 0 ? (
        <details
          className="gl-compose-section gl-compose-advanced"
          data-testid="gl-compose-advanced"
        >
          <summary>Poids avancés</summary>
          <p className="gl-hint">
            Réglages fins de la recette. Les valeurs par défaut conviennent dans la grande majorité
            des cas ; le serveur borne toute valeur saisie.
          </p>
          <div className="gl-compose-sliders">
            {sliders.map((slider) => {
              const value = weightsOverride[slider.key] ?? slider.defaultValue;
              const inputId = `gl-compose-weight-${slider.key}`;
              return (
                <div key={slider.key} className="gl-compose-slider">
                  <label htmlFor={inputId}>
                    {slider.label} <span className="gl-hint">({value})</span>
                  </label>
                  <input
                    id={inputId}
                    type="range"
                    min={slider.min}
                    max={slider.max}
                    step={slider.step}
                    value={value}
                    onChange={(event) => setWeight(slider.key, event.target.value)}
                    disabled={loading || applying}
                    aria-describedby={`${inputId}-hint`}
                  />
                  <small id={`${inputId}-hint`} className="gl-hint">
                    {slider.hint}
                  </small>
                </div>
              );
            })}
          </div>
          <GLButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={resetWeights}
            disabled={loading || applying || Object.keys(weightsOverride).length === 0}
          >
            Revenir aux poids par défaut
          </GLButton>
        </details>
      ) : null}

      {proposal && classId ? (
        <details
          className="gl-compose-section gl-compose-advanced"
          data-testid="gl-compose-constraints"
        >
          <summary>
            Contraintes de la classe
            {locks.length ? ` (${locks.length} verrou${locks.length > 1 ? 's' : ''})` : ''}
            {pins.size ? ` · ${pins.size} épingle${pins.size > 1 ? 's' : ''}` : ''}
          </summary>
          <p className="gl-hint">
            Les verrous valent pour toutes les parties de la classe ; les épingles ne valent que
            pour cet aperçu. Ni les uns ni les autres ne sont visibles des joueurs.
          </p>
          {locks.length ? (
            <ul className="gl-compose-locks" aria-label="Verrous de la classe">
              {locks.map((lock) => (
                <li key={lock.id} className="gl-compose-member">
                  <span className="gl-compose-member-name">
                    <strong>
                      {GL_PAIRING_LOCK_KINDS.find((k) => k.id === lock.kind)?.label || lock.kind}
                    </strong>{' '}
                    : {lock.players.map((p) => shortLabel(p)).join(' & ')}
                  </span>
                  <GLButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => removeLock(lock.id)}
                    disabled={lockBusy || applying}
                    aria-label={`Retirer le verrou ${lock.players.map((p) => shortLabel(p)).join(' et ')}`}
                  >
                    Retirer
                  </GLButton>
                </li>
              ))}
            </ul>
          ) : (
            <p className="gl-hint">Aucun verrou pour cette classe.</p>
          )}
          <form className="gl-compose-lock-form" onSubmit={submitLock}>
            <GLSelect
              value={lockDraft.a}
              onChange={(event) => setLockDraft((d) => ({ ...d, a: event.target.value }))}
              aria-label="Premier joueur du verrou"
              disabled={lockBusy}
            >
              <option value="">Joueur…</option>
              {poolMembers.map((m) => (
                <option key={m.playerId} value={String(m.playerId)}>
                  {shortLabel(m)}
                </option>
              ))}
            </GLSelect>
            <GLSelect
              value={lockDraft.kind}
              onChange={(event) => setLockDraft((d) => ({ ...d, kind: event.target.value }))}
              aria-label="Type de verrou"
              disabled={lockBusy}
            >
              {GL_PAIRING_LOCK_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label.toLowerCase()}
                </option>
              ))}
            </GLSelect>
            <GLSelect
              value={lockDraft.b}
              onChange={(event) => setLockDraft((d) => ({ ...d, b: event.target.value }))}
              aria-label="Second joueur du verrou"
              disabled={lockBusy}
            >
              <option value="">Joueur…</option>
              {poolMembers.map((m) => (
                <option key={m.playerId} value={String(m.playerId)}>
                  {shortLabel(m)}
                </option>
              ))}
            </GLSelect>
            <GLButton
              type="submit"
              size="sm"
              disabled={lockBusy || applying || !lockDraft.a || !lockDraft.b}
              loading={lockBusy}
            >
              Ajouter le verrou
            </GLButton>
          </form>
          {locksError ? (
            <p className="gl-error" role="alert">
              {locksError}
            </p>
          ) : null}
          {pins.size ? (
            <p className="gl-hint">
              Épinglés :{' '}
              {[...pins.keys()]
                .map((id) => shortLabel(memberById.get(Number(id))) || `#${id}`)
                .join(', ')}
              .{' '}
              <button
                type="button"
                className="gl-link-button"
                onClick={() => {
                  const cleared = new Map();
                  setPins(cleared);
                  runPreview({ seed, pins: cleared });
                }}
                disabled={loading || applying}
              >
                Tout désépingler
              </button>
            </p>
          ) : null}
        </details>
      ) : null}

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
                      <button
                        type="button"
                        className={`gl-compose-pin${pins.has(member.playerId) ? ' is-pinned' : ''}`}
                        aria-pressed={pins.has(member.playerId)}
                        aria-label={`${pins.has(member.playerId) ? 'Désépingler' : 'Épingler'} ${member.pseudo || member.playerId}`}
                        title={
                          pins.has(member.playerId)
                            ? 'Épinglé : reste dans cette équipe aux prochaines régénérations'
                            : 'Épingler dans cette équipe pour les prochaines régénérations'
                        }
                        onClick={() => togglePin(member.playerId, index)}
                        disabled={applying}
                      >
                        <span aria-hidden="true">📌</span>
                      </button>
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
