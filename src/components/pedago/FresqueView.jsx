import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api, getAuthToken } from '../../services/api.js';
import { usePublicSettings } from '../../contexts/PublicSettingsContext.jsx';
import { useAppDialogs } from '../../shared/components/AppDialogsProvider.jsx';
import { HelpPanel } from '../HelpPanel.jsx';
import { useHelp } from '../../hooks/useHelp.js';
import { resolveHelpPanelSection } from '../../utils/helpResolve.js';
import { buildDeckModel } from '../../shared/fresque/fresqueCore.js';
import { FresqueBoard } from '../../shared/fresque/FresqueBoard.jsx';
import { ModuleLearnerOffBanner } from './ModuleLearnerOffBanner.jsx';
import { FresqueTeacherPanel } from './FresqueTeacherPanel.jsx';

/**
 * Onglet « Fresque » de ForetMap : choix du jeu (un seul aujourd'hui : La Fresque du Climat,
 * version Enfant), du plateau personnel ou d'équipe, puis le plateau partagé `FresqueBoard`
 * avec l'appel réseau injecté. Le prof dispose d'une vue de suivi en lecture seule
 * (`FresqueTeacherPanel`, lot 6).
 */
export function FresqueView({
  isTeacher = false,
  canFollow = false,
  moduleOffForLearners = false,
  initialDeckId = null,
  entryNonce = null,
  subscribeBoard = null,
}) {
  const [decks, setDecks] = useState(null);
  const [deckId, setDeckId] = useState(initialDeckId);
  const [detail, setDetail] = useState(null);
  const [mine, setMine] = useState({ boards: [], teams: [] });
  const [owner, setOwner] = useState('user');
  const [board, setBoard] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(canFollow ? 'follow' : 'play');
  const [rewardBanner, setRewardBanner] = useState(null);
  const [restartNotice, setRestartNotice] = useState('');
  /**
   * Plateau que NOUS venons d'archiver : le signal en écho et l'enregistrement encore en vol
   * ne doivent pas réafficher l'avis ni recharger la table.
   */
  const ignoredArchiveIdRef = useRef(null);
  // Une séance (`open_fresque`) peut demander un jeu précis : on s'y rend à chaque demande.
  useEffect(() => {
    if (initialDeckId) {
      setDeckId(initialDeckId);
      setMode('play');
    }
  }, [initialDeckId, entryNonce]);
  const publicSettings = usePublicSettings();
  // OLU : narrateur des réglages publics, passé au plateau partagé (qui ne lit pas les contextes).
  const narrator = publicSettings?.content?.help?.narrator || null;
  const { isHelpEnabled, hasSeenSection, markSectionSeen, trackPanelOpen, trackPanelDismiss } =
    useHelp({ publicSettings, isTeacher });
  const helpFresque = resolveHelpPanelSection('fresque', publicSettings);
  const { confirm } = useAppDialogs();
  // « Ajouter à mon carnet » : réutilise la création d'article + l'envoi d'image du carnet
  // (`POST /api/user-journal/me/articles`, puis `/assets`), si le module carnet est allumé.
  const journalEnabled = publicSettings?.modules?.observations_enabled !== false;
  const exportToJournal = useCallback(async ({ dataUrl, title }) => {
    const created = await api('/api/user-journal/me/articles', 'POST', {
      title: `Fresque : ${title}`.slice(0, 180),
      bodyMarkdown: [
        '## Ma fresque',
        '',
        'Image exportée depuis l’activité Fresque du Climat.',
        '',
        '## Ce que je retiens :',
        '',
        '',
      ].join('\n'),
    });
    const articleId = created?.article?.id;
    if (!articleId) throw new Error('Article du carnet non créé');
    await api(`/api/user-journal/me/articles/${articleId}/assets`, 'POST', { imageData: dataUrl });
  }, []);
  const restartBoard = useCallback(async () => {
    if (!board?.id) return;
    const ok = await confirm({
      message: 'Recommencer une nouvelle fresque ? L’ancienne reste consultable par ton prof.',
      confirmLabel: 'Recommencer',
    });
    if (!ok) return;
    ignoredArchiveIdRef.current = board.id;
    const res = await api(`/api/fresques/boards/${board.id}/restart`, 'POST', {});
    setBoard(res.board);
    setRestartNotice('');
  }, [board?.id, confirm]);
  const onBoardArchived = useCallback(
    async (info) => {
      const archivedId = info?.boardId ? String(info.boardId) : '';
      if (archivedId && ignoredArchiveIdRef.current === archivedId) return;
      const nextId = info?.nextBoardId ? String(info.nextBoardId) : '';
      if (nextId && nextId === board?.id) return;
      setError('');
      try {
        if (nextId) {
          const res = await api(`/api/fresques/boards/${encodeURIComponent(nextId)}`);
          if (res?.board?.id && res.board.id !== board?.id) {
            setRestartNotice(
              'Cette fresque a été recommencée. Voici la nouvelle table : ce qui n’était pas encore enregistré sur l’ancienne n’a pas été recopié.',
            );
            setBoard(res.board);
            return;
          }
        }
        if (!deckId) return;
        const body =
          owner === 'user'
            ? { deckId, ownerType: 'user' }
            : { deckId, ownerType: 'team', groupId: owner };
        const res = await api('/api/fresques/boards', 'POST', body);
        if (res?.board?.id && res.board.id !== board?.id) {
          setRestartNotice(
            'Cette fresque a été recommencée. Voici la nouvelle table : ce qui n’était pas encore enregistré sur l’ancienne n’a pas été recopié.',
          );
          setBoard(res.board);
        }
      } catch {
        setError('Cette fresque a été recommencée. Rouvre-la.');
      }
    },
    [board?.id, deckId, owner],
  );

  useEffect(() => {
    let cancelled = false;
    api('/api/fresques/decks')
      .then((d) => {
        if (cancelled) return;
        const list = Array.isArray(d?.decks) ? d.decks : [];
        setDecks(list);
        setDeckId((prev) => prev || (list.length === 1 ? list[0].id : null));
      })
      .catch((err) => !cancelled && setError(err?.message || 'Chargement impossible'));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!deckId) return undefined;
    let cancelled = false;
    setDetail(null);
    setBoard(null);
    Promise.all([
      api(`/api/fresques/decks/${encodeURIComponent(deckId)}`),
      api(`/api/fresques/boards/mine?deckId=${encodeURIComponent(deckId)}`),
    ])
      .then(([d, m]) => {
        if (cancelled) return;
        setDetail({
          publicBase: d.publicBase,
          model: buildDeckModel(d.deck, d.correction, d.hints),
          attribution: d.deck.attribution,
        });
        setMine({ boards: m?.boards || [], teams: m?.teams || [] });
      })
      .catch((err) => !cancelled && setError(err?.message || 'Chargement impossible'));
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  const openBoard = useCallback(
    async (ownerChoice) => {
      if (!deckId) return;
      setBusy(true);
      setError('');
      try {
        const body =
          ownerChoice === 'user'
            ? { deckId, ownerType: 'user' }
            : { deckId, ownerType: 'team', groupId: ownerChoice };
        const res = await api('/api/fresques/boards', 'POST', body);
        setBoard(res.board);
        setOwner(ownerChoice);
        setMode('play');
      } catch (err) {
        setError(err?.message || 'Ouverture impossible');
      } finally {
        setBusy(false);
      }
    },
    [deckId],
  );

  const onRewards = useCallback((rewards) => {
    if (Array.isArray(rewards) && rewards.length) setRewardBanner(rewards);
  }, []);

  const teams = mine.teams || [];
  const deckSummary = useMemo(() => decks?.find((d) => d.id === deckId) || null, [decks, deckId]);

  if (error && !board) {
    return (
      <div className="fm-panel" data-testid="fm-fresque-view">
        <p role="alert">{error}</p>
      </div>
    );
  }
  if (!decks) return <p className="section-sub">Chargement de la fresque…</p>;
  if (!decks.length) return <p className="section-sub">Aucun jeu de fresque n’est installé.</p>;

  return (
    <div className="fm-fresque-view" data-testid="fm-fresque-view">
      {moduleOffForLearners ? <ModuleLearnerOffBanner moduleLabel="Fresques" /> : null}
      {isHelpEnabled ? (
        <div className="fm-fresque-view__help">
          <HelpPanel
            sectionId="fresque"
            title={helpFresque.title}
            entries={helpFresque.items}
            isTeacher={isTeacher}
            isPulsing={!hasSeenSection('fresque')}
            onMarkSeen={markSectionSeen}
            onOpen={trackPanelOpen}
            onDismiss={trackPanelDismiss}
          />
        </div>
      ) : null}
      {canFollow ? (
        <div
          className="fm-fresque-hand__actions"
          style={{ marginBottom: 8 }}
          role="tablist"
          aria-label="Fresque"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'follow' ? 'true' : 'false'}
            className={`fm-fresque-btn${mode === 'follow' ? ' fm-fresque-btn--primary' : ''}`}
            onClick={() => setMode('follow')}
            data-testid="fm-fresque-mode-follow"
          >
            Suivi des élèves
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'play' ? 'true' : 'false'}
            className={`fm-fresque-btn${mode === 'play' ? ' fm-fresque-btn--primary' : ''}`}
            onClick={() => setMode('play')}
            data-testid="fm-fresque-mode-play"
          >
            Essayer la fresque
          </button>
        </div>
      ) : null}
      {mode === 'follow' && canFollow ? (
        <FresqueTeacherPanel
          deckId={deckId}
          model={detail?.model || null}
          publicBase={detail?.publicBase || ''}
          levels={detail?.model?.hints?.levels || null}
        />
      ) : null}
      {mode === 'play' ? (
        <>
          {decks.length > 1 && !board ? (
            <div className="fm-fresque-levels" role="radiogroup" aria-label="Jeu de cartes">
              {decks.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={d.id === deckId ? 'true' : 'false'}
                  className="fm-fresque-level__option"
                  onClick={() => setDeckId(d.id)}
                >
                  <strong>{d.title}</strong>
                  <small>{d.audience}</small>
                </button>
              ))}
            </div>
          ) : null}
          {deckId && detail && !board ? (
            <div className="fm-panel" data-testid="fm-fresque-picker">
              <h2 style={{ marginTop: 0 }}>{deckSummary?.title}</h2>
              <p className="section-sub">
                {deckSummary?.audience} · {deckSummary?.cardCount} cartes, {deckSummary?.lotCount}{' '}
                lots. {detail.attribution?.creditLine}
              </p>
              <div className="fm-fresque-hand__actions">
                <button
                  type="button"
                  className="fm-fresque-btn fm-fresque-btn--primary"
                  disabled={busy}
                  onClick={() => openBoard('user')}
                  data-testid="fm-fresque-open-mine"
                >
                  {mine.boards.some((b) => b.ownerType === 'user')
                    ? 'Reprendre ma fresque'
                    : 'Commencer ma fresque'}
                </button>
                {teams.map((team) => (
                  <button
                    key={team.id}
                    type="button"
                    className="fm-fresque-btn"
                    disabled={busy}
                    onClick={() => openBoard(team.id)}
                    data-testid={`fm-fresque-open-team-${team.id}`}
                  >
                    Fresque de l’équipe {team.name}
                  </button>
                ))}
              </div>
              {isTeacher ? (
                <p className="section-sub">
                  Le plateau que vous ouvrez ici est le vôtre (démonstration).
                </p>
              ) : null}
            </div>
          ) : null}
          {deckId && !detail && !error ? <p className="section-sub">Chargement du jeu…</p> : null}
          {board && detail ? (
            <>
              {restartNotice ? (
                <p className="fm-panel" role="status" data-testid="fm-fresque-restart-notice">
                  {restartNotice}
                </p>
              ) : null}
              {rewardBanner ? (
                <div className="fm-panel" role="status" data-testid="fm-fresque-reward-banner">
                  {rewardBanner.map((r) => (
                    <span key={r.key}>
                      {r.emoji} Badge obtenu : <strong>{r.title}</strong> — {r.description}{' '}
                    </span>
                  ))}
                  <button
                    type="button"
                    className="fm-fresque-btn fm-fresque-btn--ghost"
                    onClick={() => setRewardBanner(null)}
                  >
                    Fermer
                  </button>
                </div>
              ) : null}
              <FresqueBoard
                key={board.id}
                model={detail.model}
                publicBase={detail.publicBase}
                board={board}
                api={api}
                getAuthToken={getAuthToken}
                readOnly={board.readOnly === true}
                subscribeBoard={subscribeBoard}
                onRewards={onRewards}
                onExportToJournal={journalEnabled && !isTeacher ? exportToJournal : null}
                onRestart={board.readOnly ? null : restartBoard}
                onBoardArchived={onBoardArchived}
                narrator={narrator}
                headerExtra={
                  <button
                    type="button"
                    className="fm-fresque-btn fm-fresque-btn--ghost"
                    onClick={() => {
                      setBoard(null);
                      api(`/api/fresques/boards/mine?deckId=${encodeURIComponent(deckId)}`)
                        .then((m) => setMine({ boards: m?.boards || [], teams: m?.teams || [] }))
                        .catch(() => {});
                    }}
                    data-testid="fm-fresque-change-board"
                  >
                    {owner === 'user' ? 'Ma fresque' : 'Fresque d’équipe'} ▾
                  </button>
                }
              />
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
