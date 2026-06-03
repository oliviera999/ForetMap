import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogA11y } from '../../hooks/useDialogA11y.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLInput } from './ui/GLInput.jsx';
import {
  buildLocalContributions,
  canEditContributionRow,
  filterSelectableTeams,
  formatPlayerLabel,
  isSpellCastReady,
  needsOtherPlayerConfirm,
  sumContributionTotals,
} from '../utils/glSpellCastRules.js';

const CLOSE_MS = 200;

function ProgressBar({ label, current, required, emoji }) {
  if (!required || required <= 0) return null;
  const pct = Math.min(100, Math.round((current / required) * 100));
  return (
    <div className="gl-spell-cast-progress">
      <div className="gl-spell-cast-progress__label">
        <span>{label}</span>
        <span>
          {current}
          /
          {required}
          {' '}
          {emoji}
        </span>
      </div>
      <div className="gl-spell-cast-progress__track" aria-hidden="true">
        <div className="gl-spell-cast-progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function GLSpellCastWizard({
  open = false,
  onClose,
  spellCode = null,
  spellPreview = null,
  teams = [],
  gameId,
  playerId,
  playerTeamId,
  currentTeamId,
  turnsEnabled = false,
  contributionMode = 'both',
  teamScope = 'any_team',
  isStaff = false,
  spellCast,
  chapterSpells = [],
  onPickSpell,
}) {
  const titleId = useId();
  const [step, setStep] = useState('team');
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [localContribs, setLocalContribs] = useState([]);
  const [isClosing, setIsClosing] = useState(false);
  const [pickSpellCode, setPickSpellCode] = useState(null);
  const closeTimerRef = React.useRef(null);

  const activeSpellCode = spellCode || pickSpellCode;
  const activeSpell = useMemo(() => {
    if (spellPreview?.spell_code && String(spellPreview.spell_code) === String(activeSpellCode)) {
      return spellPreview;
    }
    const fromChapter = (chapterSpells || []).find(
      (s) => String(s.spell_code).toUpperCase() === String(activeSpellCode || '').toUpperCase(),
    );
    return fromChapter || null;
  }, [spellPreview, activeSpellCode, chapterSpells]);

  const selectableTeams = useMemo(
    () => filterSelectableTeams({
      teams,
      teamScope,
      playerTeamId,
      currentTeamId,
      turnsEnabled,
      isStaff,
    }),
    [teams, teamScope, playerTeamId, currentTeamId, turnsEnabled, isStaff],
  );

  const requestClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setIsClosing(false);
      spellCast?.reset?.();
      setStep('team');
      setSelectedTeamId(null);
      setLocalContribs([]);
      setPickSpellCode(null);
      onClose?.();
    }, CLOSE_MS);
  }, [isClosing, onClose, spellCast]);

  const dialogRef = useDialogA11y(() => {
    requestClose();
  });

  useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsClosing(false);
    setStep(activeSpellCode ? 'team' : 'spell');
    if (playerTeamId != null && selectableTeams.some((t) => Number(t.id) === Number(playerTeamId))) {
      setSelectedTeamId(Number(playerTeamId));
    } else if (selectableTeams.length === 1) {
      setSelectedTeamId(Number(selectableTeams[0].id));
    } else {
      setSelectedTeamId(null);
    }
  }, [open, activeSpellCode, playerTeamId, selectableTeams]);

  useEffect(() => {
    if (!spellCast?.draft?.roster) return;
    setLocalContribs(buildLocalContributions(spellCast.draft.roster, spellCast.draft.contributions));
  }, [spellCast?.draft?.id, spellCast?.draft?.contributions, spellCast?.draft?.roster]);

  const totals = useMemo(() => sumContributionTotals(localContribs), [localContribs]);
  const required = spellCast?.draft?.required || { gems: 0, hearts: 0 };
  const ready = isSpellCastReady(totals, required);

  async function handleSelectTeam(teamId) {
    if (!activeSpellCode || !gameId) return;
    setSelectedTeamId(Number(teamId));
    setStep('fund');
    try {
      await spellCast.startDraft({ spellCode: activeSpellCode, teamId: Number(teamId) });
    } catch (_) {
      setStep('team');
    }
  }

  function updateContrib(playerIdTarget, field, rawValue) {
    const n = Math.max(0, Math.floor(Number(rawValue) || 0));
    setLocalContribs((prev) => prev.map((row) => (
      Number(row.playerId) === Number(playerIdTarget)
        ? { ...row, [field]: n }
        : row
    )));
  }

  async function handleContribBlur(playerIdTarget, field, value) {
    const row = localContribs.find((r) => Number(r.playerId) === Number(playerIdTarget));
    if (!row || !spellCast?.draft?.id) return;
    const needsConfirm = needsOtherPlayerConfirm({
      contributionMode,
      actorPlayerId: playerId,
      targetPlayerId: playerIdTarget,
    });
    if (needsConfirm && (Number(value) || 0) > 0) {
      const rosterRow = spellCast.draft.roster?.find((p) => Number(p.playerId) === Number(playerIdTarget));
      const label = formatPlayerLabel(rosterRow);
      const amount = Number(value) || 0;
      const unit = field === 'gems' ? '💎' : '❤️';
      const ok = window.confirm(
        `Utiliser ${amount} ${unit} du solde de ${label} pour ce sortilège ?`,
      );
      if (!ok) {
        setLocalContribs(buildLocalContributions(spellCast.draft.roster, spellCast.draft.contributions));
        return;
      }
    }
    try {
      await spellCast.saveContributions(spellCast.draft.id, [{
        playerId: playerIdTarget,
        gems: field === 'gems' ? value : row.gems,
        hearts: field === 'hearts' ? value : row.hearts,
      }]);
    } catch (_) {
      setLocalContribs(buildLocalContributions(spellCast.draft.roster, spellCast.draft.contributions));
    }
  }

  async function handleLaunch() {
    if (!spellCast?.draft?.id || !ready) return;
    try {
      await spellCast.launch(spellCast.draft.id);
      requestClose();
    } catch (_) {
      // error shown via spellCast.error
    }
  }

  if (!open && !isClosing) return null;

  const showSpellPick = step === 'spell' && !activeSpellCode;
  const spellName = spellCast?.draft?.spell?.nom || activeSpell?.nom || activeSpellCode || 'Sortilège';
  const spellEmoji = spellCast?.draft?.spell?.emoji || activeSpell?.emoji || '✨';

  return createPortal(
    <div
      className={[
        'gl-spell-cast-overlay',
        isClosing ? 'gl-spell-cast-overlay--closing' : '',
      ].filter(Boolean).join(' ')}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={dialogRef}
        className="gl-spell-cast-panel gl-grimoire animate-pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="gl-spell-cast-panel__header">
          <h2 id={titleId}>
            <span aria-hidden="true">{spellEmoji}</span>
            {' '}
            Lancer :
            {spellName}
          </h2>
          <GLButton type="button" variant="ghost" onClick={requestClose}>
            Fermer
          </GLButton>
        </header>

        {spellCast?.error ? (
          <p className="gl-error gl-spell-cast-panel__error">{spellCast.error}</p>
        ) : null}

        {showSpellPick ? (
          <div className="gl-spell-cast-panel__body">
            <p className="gl-hint">Choisissez un sortilège du chapitre :</p>
            <div className="gl-spell-cast-spell-pick">
              {(chapterSpells || []).map((s) => (
                <button
                  key={s.spell_code}
                  type="button"
                  className="gl-spell-tile gl-spell-tile--pick"
                  onClick={() => {
                    setPickSpellCode(String(s.spell_code));
                    onPickSpell?.(String(s.spell_code));
                    setStep('team');
                  }}
                >
                  <span className="gl-spell-tile__emoji" aria-hidden="true">{s.emoji || '✨'}</span>
                  <span className="gl-spell-tile__name">{s.nom || s.spell_code}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 'team' && activeSpellCode ? (
          <div className="gl-spell-cast-panel__body">
            <p className="gl-hint">Quelle équipe lance ce sortilège ?</p>
            {selectableTeams.length === 0 ? (
              <p className="gl-hint">Aucune équipe disponible pour vous dans cette partie.</p>
            ) : (
              <div className="gl-spell-cast-teams">
                {selectableTeams.map((team) => (
                  <GLButton
                    key={team.id}
                    type="button"
                    variant={Number(selectedTeamId) === Number(team.id) ? 'primary' : 'secondary'}
                    disabled={spellCast?.busy}
                    onClick={() => handleSelectTeam(team.id)}
                  >
                    {team.name || `Équipe ${team.id}`}
                  </GLButton>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {step === 'fund' && spellCast?.draft ? (
          <div className="gl-spell-cast-panel__body">
            <ProgressBar
              label="Gemmes"
              current={totals.gems}
              required={required.gems}
              emoji="💎"
            />
            <ProgressBar
              label="Cœurs"
              current={totals.hearts}
              required={required.hearts}
              emoji="❤️"
            />
            <ul className="gl-spell-cast-roster">
              {(spellCast.draft.roster || []).map((player) => {
                const row = localContribs.find((r) => Number(r.playerId) === Number(player.playerId)) || {
                  gems: 0,
                  hearts: 0,
                };
                const editable = canEditContributionRow({
                  contributionMode,
                  actorPlayerId: playerId,
                  targetPlayerId: player.playerId,
                  isStaff,
                });
                return (
                  <li key={player.playerId} className="gl-spell-cast-roster__row">
                    <div className="gl-spell-cast-roster__identity">
                      <strong>{formatPlayerLabel(player)}</strong>
                      <span className="gl-spell-cast-roster__balance">
                        ❤️
                        {player.healthPoints}
                        {' '}
                        · 💎
                        {player.powerPoints}
                      </span>
                    </div>
                    <div className="gl-spell-cast-roster__inputs">
                      {required.gems > 0 ? (
                        <label className="gl-spell-cast-roster__field">
                          <span className="gl-visually-hidden">Gemmes pour</span>
                          <span aria-hidden="true">💎</span>
                          <GLInput
                            type="number"
                            min={0}
                            max={player.powerPoints}
                            disabled={!editable || spellCast.busy}
                            value={row.gems}
                            onChange={(e) => updateContrib(player.playerId, 'gems', e.target.value)}
                            onBlur={(e) => handleContribBlur(player.playerId, 'gems', e.target.value)}
                          />
                        </label>
                      ) : null}
                      {required.hearts > 0 ? (
                        <label className="gl-spell-cast-roster__field">
                          <span className="gl-visually-hidden">Cœurs pour</span>
                          <span aria-hidden="true">❤️</span>
                          <GLInput
                            type="number"
                            min={0}
                            max={player.healthPoints}
                            disabled={!editable || spellCast.busy}
                            value={row.hearts}
                            onChange={(e) => updateContrib(player.playerId, 'hearts', e.target.value)}
                            onBlur={(e) => handleContribBlur(player.playerId, 'hearts', e.target.value)}
                          />
                        </label>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <footer className="gl-spell-cast-panel__footer">
          {step === 'fund' ? (
            <>
              <GLButton
                type="button"
                variant="ghost"
                disabled={spellCast?.busy}
                onClick={() => {
                  spellCast?.cancelDraft?.(spellCast.draft?.id);
                  setStep('team');
                }}
              >
                Annuler le brouillon
              </GLButton>
              <GLButton
                type="button"
                variant="primary"
                disabled={!ready || spellCast?.busy}
                onClick={handleLaunch}
              >
                Lancer le sortilège
              </GLButton>
            </>
          ) : (
            <GLButton type="button" variant="ghost" onClick={requestClose}>
              Fermer
            </GLButton>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
