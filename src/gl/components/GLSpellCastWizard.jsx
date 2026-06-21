import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogA11y } from '../../hooks/useDialogA11y.js';
import { GLButton } from './ui/GLButton.jsx';
import {
  buildLocalContributions,
  filterSelectableTeams,
  formatPlayerLabel,
  formatSpellCost,
  isSpellCastReady,
  needsOtherPlayerConfirm,
  resolveSpellCastInitialStep,
  sumContributionTotals,
  buildContributionsSavePayload,
} from '../utils/glSpellCastRules.js';
import { GLSpellCastRosterSection } from './spell-cast/GLSpellCastRosterSection.jsx';
import { GLSpellCastSpellPicker, GLSpellCastTeamPicker } from './spell-cast/GLSpellCastPickers.jsx';
import { GLSpellCastFooter } from './spell-cast/GLSpellCastFooter.jsx';

const CLOSE_MS = 200;

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
  const [fundLoading, setFundLoading] = useState(false);
  const closeTimerRef = useRef(null);
  const staffDraftStartedRef = useRef(false);

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

  const costLabel = useMemo(() => {
    if (spellCast?.draft?.required) return formatSpellCost(spellCast.draft.required);
    return formatSpellCost(activeSpell);
  }, [spellCast?.draft?.required, activeSpell]);

  const selectableTeams = useMemo(
    () =>
      filterSelectableTeams({
        teams,
        teamScope,
        playerTeamId,
        currentTeamId,
        turnsEnabled,
        isStaff,
      }),
    [teams, teamScope, playerTeamId, currentTeamId, turnsEnabled, isStaff],
  );

  const beginFundDraft = useCallback(
    async ({ spell, teamId }) => {
      if (!spell || !gameId || !spellCast?.startDraft) return;
      setFundLoading(true);
      try {
        const payload = { spellCode: spell };
        if (teamId != null && Number(teamId) > 0) payload.teamId = Number(teamId);
        await spellCast.startDraft(payload);
        setStep('fund');
      } catch (_) {
        if (!isStaff) setStep('team');
        else setStep(activeSpellCode ? 'fund' : 'spell');
      } finally {
        setFundLoading(false);
      }
    },
    [gameId, spellCast, isStaff, activeSpellCode],
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
      setFundLoading(false);
      staffDraftStartedRef.current = false;
      onClose?.();
    }, CLOSE_MS);
  }, [isClosing, onClose, spellCast]);

  const dialogRef = useDialogA11y(() => {
    requestClose();
  });

  useEffect(
    () => () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setIsClosing(false);
    staffDraftStartedRef.current = false;
    setFundLoading(false);
    setStep(resolveSpellCastInitialStep({ isStaff, activeSpellCode }));
    if (
      playerTeamId != null &&
      selectableTeams.some((t) => Number(t.id) === Number(playerTeamId))
    ) {
      setSelectedTeamId(Number(playerTeamId));
    } else if (selectableTeams.length === 1) {
      setSelectedTeamId(Number(selectableTeams[0].id));
    } else if (isStaff && currentTeamId != null) {
      setSelectedTeamId(Number(currentTeamId));
    } else {
      setSelectedTeamId(null);
    }
  }, [open, activeSpellCode, playerTeamId, selectableTeams, isStaff, currentTeamId]);

  useEffect(() => {
    if (!open || !isStaff || !activeSpellCode || !gameId) return;
    if (staffDraftStartedRef.current) return;
    if (
      spellCast?.draft?.spellCode &&
      String(spellCast.draft.spellCode).toUpperCase() === String(activeSpellCode).toUpperCase()
    ) {
      setStep('fund');
      return;
    }
    staffDraftStartedRef.current = true;
    beginFundDraft({ spell: activeSpellCode, teamId: selectedTeamId ?? currentTeamId });
  }, [
    open,
    isStaff,
    activeSpellCode,
    gameId,
    spellCast?.draft?.spellCode,
    beginFundDraft,
    selectedTeamId,
    currentTeamId,
  ]);

  useEffect(() => {
    if (!spellCast?.draft?.roster) return;
    setLocalContribs(
      buildLocalContributions(spellCast.draft.roster, spellCast.draft.contributions),
    );
  }, [spellCast?.draft?.id, spellCast?.draft?.contributions, spellCast?.draft?.roster]);

  const totals = useMemo(() => sumContributionTotals(localContribs), [localContribs]);
  const required = spellCast?.draft?.required || { gems: 0, hearts: 0 };
  const readyLocal = isSpellCastReady(totals, required);

  async function handleSelectTeam(teamId) {
    if (!activeSpellCode || !gameId) return;
    setSelectedTeamId(Number(teamId));
    await beginFundDraft({ spell: activeSpellCode, teamId: Number(teamId) });
  }

  function handlePickSpell(code) {
    setPickSpellCode(code);
    onPickSpell?.(code);
    staffDraftStartedRef.current = false;
    if (isStaff) {
      beginFundDraft({ spell: code, teamId: selectedTeamId ?? currentTeamId });
    } else {
      setStep('team');
    }
  }

  function updateContrib(playerIdTarget, field, rawValue) {
    const n = Math.max(0, Math.floor(Number(rawValue) || 0));
    setLocalContribs((prev) =>
      prev.map((row) =>
        Number(row.playerId) === Number(playerIdTarget) ? { ...row, [field]: n } : row,
      ),
    );
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
      const rosterRow = spellCast.draft.roster?.find(
        (p) => Number(p.playerId) === Number(playerIdTarget),
      );
      const label = formatPlayerLabel(rosterRow);
      const amount = Number(value) || 0;
      const unit = field === 'gems' ? '💎' : '❤️';
      const ok = window.confirm(
        `Utiliser ${amount} ${unit} du solde de ${label} pour ce sortilège ?`,
      );
      if (!ok) {
        setLocalContribs(
          buildLocalContributions(spellCast.draft.roster, spellCast.draft.contributions),
        );
        return;
      }
    }
    try {
      await spellCast.saveContributions(spellCast.draft.id, [
        {
          playerId: playerIdTarget,
          gems: field === 'gems' ? value : row.gems,
          hearts: field === 'hearts' ? value : row.hearts,
        },
      ]);
    } catch (_) {
      setLocalContribs(
        buildLocalContributions(spellCast.draft.roster, spellCast.draft.contributions),
      );
    }
  }

  async function handleLaunch() {
    if (!spellCast?.draft?.id || !readyLocal) return;
    try {
      const payload = buildContributionsSavePayload(spellCast.draft.roster, localContribs);
      const savedDraft = await spellCast.saveContributions(spellCast.draft.id, payload);
      if (!savedDraft?.ready && !isSpellCastReady(savedDraft?.totals, required)) {
        return;
      }
      await spellCast.launch(savedDraft?.id ?? spellCast.draft.id);
      requestClose();
    } catch (_) {
      // error shown via spellCast.error
    }
  }

  function handleCancelDraft() {
    spellCast?.cancelDraft?.(spellCast.draft?.id);
    staffDraftStartedRef.current = false;
    if (isStaff) {
      setStep(activeSpellCode ? 'fund' : 'spell');
      if (activeSpellCode) {
        beginFundDraft({ spell: activeSpellCode, teamId: selectedTeamId ?? currentTeamId });
      }
    } else {
      setStep('team');
    }
  }

  if (!open && !isClosing) return null;

  const showSpellPick = step === 'spell' && !activeSpellCode;
  const showTeamPick = !isStaff && step === 'team' && activeSpellCode;
  const showFund = step === 'fund' && (spellCast?.draft || fundLoading || spellCast?.busy);
  const spellName =
    spellCast?.draft?.spell?.nom || activeSpell?.nom || activeSpellCode || 'Sortilège';
  const spellEmoji = spellCast?.draft?.spell?.emoji || activeSpell?.emoji || '✨';

  return createPortal(
    <div
      className={['gl-spell-cast-overlay', isClosing ? 'gl-spell-cast-overlay--closing' : '']
        .filter(Boolean)
        .join(' ')}
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
          <div>
            <h2 id={titleId}>
              <span aria-hidden="true">{spellEmoji}</span> Lancer :{spellName}
            </h2>
            {costLabel ? (
              <p className="gl-hint gl-spell-cast-panel__cost">Coût : {costLabel}</p>
            ) : null}
            {isStaff ? (
              <p className="gl-hint">Contributions possibles depuis toutes les équipes.</p>
            ) : null}
          </div>
          <GLButton type="button" variant="ghost" onClick={requestClose}>
            Fermer
          </GLButton>
        </header>

        {spellCast?.error ? (
          <p className="gl-error gl-spell-cast-panel__error">{spellCast.error}</p>
        ) : null}

        {showSpellPick ? (
          <GLSpellCastSpellPicker chapterSpells={chapterSpells} onPick={handlePickSpell} />
        ) : null}

        {showTeamPick ? (
          <GLSpellCastTeamPicker
            teams={selectableTeams}
            selectedTeamId={selectedTeamId}
            busy={spellCast?.busy || fundLoading}
            onSelectTeam={handleSelectTeam}
          />
        ) : null}

        {showFund ? (
          <div className="gl-spell-cast-panel__body">
            {fundLoading || (spellCast?.busy && !spellCast?.draft) ? (
              <p className="gl-hint" role="status">
                Chargement des contributeurs…
              </p>
            ) : null}
            {spellCast?.draft ? (
              <GLSpellCastRosterSection
                draft={spellCast.draft}
                required={required}
                totals={totals}
                localContribs={localContribs}
                contributionMode={contributionMode}
                playerId={playerId}
                isStaff={isStaff}
                busy={spellCast.busy}
                onUpdateContrib={updateContrib}
                onContribBlur={handleContribBlur}
              />
            ) : null}
          </div>
        ) : null}

        <GLSpellCastFooter
          step={step}
          busy={spellCast?.busy}
          fundLoading={fundLoading}
          canLaunch={readyLocal && !!spellCast?.draft}
          onCancelDraft={handleCancelDraft}
          onLaunch={handleLaunch}
          onClose={requestClose}
        />
      </div>
    </div>,
    document.body,
  );
}
