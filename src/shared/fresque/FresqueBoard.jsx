import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ImageLightbox } from '../components/ImageLightbox.jsx';
import { DialogShell } from '../components/DialogShell.jsx';
import {
  ARROW_COLORS,
  FRESQUE_STEP_DISCOVER,
  FRESQUE_STEP_UNDERSTAND,
  LINK_CATEGORY_MARKS,
  addLink,
  canEnterUnderstand,
  canOpenNextLot,
  cardsInHand,
  checkpointMessage,
  classifyLink,
  evaluateBoard,
  flipCard,
  isLotComplete,
  lotOfStep,
  moveCard,
  nextLotNumber,
  openNextLot,
  outgoingStats,
  placeAllHand,
  placeCard,
  recordCheckpoint,
  removeLink,
  setLevel,
  setShowBands,
  setStep,
  setTutorialDone,
  setViewport,
  stepForLot,
  updateNote,
} from './fresqueCore.js';
import { pctToSvg } from './fresqueGeometry.js';
import { FresqueCreditBar } from './FresqueCreditBar.jsx';
import { FresqueHand } from './FresqueHand.jsx';
import { FresqueLevelMenu, FresqueLevelPicker } from './FresqueLevelMenu.jsx';
import { FresqueStepper, stepLabel } from './FresqueStepper.jsx';
import { FresqueTable, dropPosition } from './FresqueTable.jsx';
import { useFresqueBoardState } from './useFresqueBoardState.js';

const TOAST_MS = 4500;

const SAVE_LABELS = {
  saved: 'Enregistré',
  pending: 'Enregistrement…',
  saving: 'Enregistrement…',
  offline: 'Hors ligne : gardé sur cet appareil',
  error: 'Enregistrement impossible, nouvel essai bientôt',
  conflict: 'Modifiée sur un autre appareil',
};

export function FresqueSaveStatus({ status, readOnly }) {
  if (readOnly) {
    return (
      <span className="fm-fresque-save" data-testid="fm-fresque-save">
        👁 Lecture seule
      </span>
    );
  }
  const icon =
    status === 'saved' ? '✓' : status === 'offline' ? '⚠' : status === 'conflict' ? '⇄' : '…';
  return (
    <span
      className={`fm-fresque-save fm-fresque-save--${status}`}
      data-testid="fm-fresque-save"
      data-status={status}
    >
      <span aria-hidden="true">{icon}</span> {SAVE_LABELS[status] || status}
    </span>
  );
}

function viewportToInitialView(viewport) {
  if (!viewport) return null;
  const { scale, tx, ty } = viewport;
  if (!(Number(scale) > 0) || (Number(scale) === 1 && Number(tx) === 0 && Number(ty) === 0))
    return null;
  return { xp: Number(tx), yp: Number(ty), zoom: Number(scale) };
}

/** Étape Découvrir : carte titre (recto / règle au verso), niveau, tutoriel passable. */
function FresqueDiscover({ model, publicBase, state, readOnly, onLevel, onOpenImage, onStart }) {
  const [flipped, setFlipped] = useState(false);
  const [tutorialIndex, setTutorialIndex] = useState(state.tutorialDone ? -1 : 0);
  const titre = model.deck.specialCards.titre;
  const tutorial = model.hints.tutorial || [];
  const started = Object.keys(state.cards).length > 0 || state.lotReached > model.lots[0].number;
  const firstLot = model.lots[0]?.number ?? 1;
  return (
    <div className="fm-fresque-discover" data-testid="fm-fresque-discover">
      <div>
        <button
          type="button"
          className={`fm-fresque-discover__card${flipped ? ' fm-fresque-card--flipped' : ''}`}
          onClick={() => setFlipped((v) => !v)}
          onDoubleClick={() => onOpenImage(titre, flipped ? 1 : 0)}
          aria-label={`${titre.alt} — toucher pour ${flipped ? 'voir le recto' : 'lire la règle au verso'}`}
          aria-pressed={flipped ? 'true' : 'false'}
          data-testid="fm-fresque-title-card"
        >
          <div className="fm-fresque-card__inner">
            <div className="fm-fresque-card__face fm-fresque-card__face--recto">
              <img src={`${publicBase}${titre.recto}`} alt="" draggable="false" />
            </div>
            <div className="fm-fresque-card__face fm-fresque-card__face--verso">
              <img src={`${publicBase}${titre.verso}`} alt="" draggable="false" />
            </div>
          </div>
        </button>
        <div className="fm-fresque-hand__actions" style={{ marginTop: 8 }}>
          <button type="button" className="fm-fresque-btn" onClick={() => setFlipped((v) => !v)}>
            {flipped ? 'Voir le recto' : 'Lire la règle (verso)'}
          </button>
          <button
            type="button"
            className="fm-fresque-btn fm-fresque-btn--ghost"
            onClick={() => onOpenImage(titre, flipped ? 1 : 0)}
          >
            Agrandir
          </button>
        </div>
      </div>
      <div className="fm-fresque-discover__panel">
        <h2>{model.deck.title}</h2>
        <p>
          {model.deck.audience} · {model.deck.cards.length} cartes en {model.lots.length} lots.
        </p>
        {!readOnly ? (
          <>
            <h3>Choisis ton niveau</h3>
            <FresqueLevelPicker
              level={state.level}
              levels={model.hints.levels}
              onChange={onLevel}
            />
            {tutorialIndex >= 0 && tutorial.length ? (
              <div
                className="fm-fresque-tutorial"
                role="region"
                aria-label="Tutoriel des gestes"
                data-testid="fm-fresque-tutorial"
              >
                <div className="fm-fresque-tutorial__bubble" aria-live="polite">
                  {tutorialIndex + 1}/{tutorial.length} — {tutorial[tutorialIndex].text}
                </div>
                <div className="fm-fresque-tutorial__nav">
                  <button
                    type="button"
                    className="fm-fresque-btn"
                    disabled={tutorialIndex === 0}
                    onClick={() => setTutorialIndex((i) => Math.max(0, i - 1))}
                  >
                    ← Précédent
                  </button>
                  {tutorialIndex < tutorial.length - 1 ? (
                    <button
                      type="button"
                      className="fm-fresque-btn"
                      onClick={() => setTutorialIndex((i) => i + 1)}
                    >
                      Suivant →
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="fm-fresque-btn fm-fresque-btn--ghost"
                    onClick={() => setTutorialIndex(-1)}
                  >
                    Passer le tutoriel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="fm-fresque-btn fm-fresque-btn--ghost"
                onClick={() => setTutorialIndex(0)}
              >
                Revoir le tutoriel des gestes
              </button>
            )}
            <button
              type="button"
              className="fm-fresque-btn fm-fresque-btn--primary"
              onClick={onStart}
              data-testid="fm-fresque-start"
            >
              {started ? 'Reprendre ma fresque' : `Commencer le lot ${firstLot}`}
            </button>
          </>
        ) : (
          <p>Plateau en lecture seule.</p>
        )}
      </div>
    </div>
  );
}

/**
 * Plateau d'une fresque : étapes, niveaux, table, main, barre de crédit, sauvegarde stricte
 * (miroir local + enregistrement différé + conflit). Générique : `model` vient du cœur,
 * `api` et `getAuthToken` sont injectés, les classes CSS sont préfixées `fm-fresque-`.
 *
 * @param {object} props
 * @param {object} props.model `buildDeckModel(deck, correction, hints)`
 * @param {string} props.publicBase préfixe public des images (`/fresques/<deckId>/`)
 * @param {object} props.board plateau sérialisé par l'API (avec `state`)
 * @param {(path, method?, body?) => Promise<object>} props.api
 * @param {() => string|null} [props.getAuthToken]
 * @param {boolean} [props.readOnly]
 * @param {(boardId: string, onChanged: (payload) => void) => (() => void)} [props.subscribeBoard]
 * @param {(rewards: object[]) => void} [props.onRewards]
 * @param {(message: string) => void} [props.onToast]
 * @param {import('react').ReactNode} [props.headerExtra]
 */
export function FresqueBoard({
  model,
  publicBase,
  board,
  api,
  getAuthToken = null,
  readOnly = false,
  subscribeBoard = null,
  onRewards = null,
  onCompleted = null,
  headerExtra = null,
}) {
  const { state, update, status, conflict, resolveConflict, applyRemoteChange, flush } =
    useFresqueBoardState({ api, getAuthToken, board, readOnly, onRewards, onCompleted });

  const tableApiRef = useRef(null);
  const [selectedCardId, setSelectedCardId] = useState(null);
  const [linkSourceId, setLinkSourceId] = useState(null);
  const [armedHandCardId, setArmedHandCardId] = useState(null);
  const [previewLine, setPreviewLine] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [toast, setToast] = useState(null);
  const [announce, setAnnounce] = useState('');
  const [popover, setPopover] = useState(null);
  const [linkPicker, setLinkPicker] = useState(null);
  const [checkpoint, setCheckpoint] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    if (!subscribeBoard || !board?.id) return undefined;
    return subscribeBoard(board.id, applyRemoteChange) || undefined;
  }, [subscribeBoard, board?.id, applyRemoteChange]);

  const showToast = useCallback((text, mark = null) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(text ? { text, mark } : null);
    if (text) toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => toastTimer.current && clearTimeout(toastTimer.current), []);

  const level = state.level;
  const isEclaireur = level === 'eclaireur';
  const isExpert = level === 'expert';
  const inUnderstand = state.step === FRESQUE_STEP_UNDERSTAND;
  const correctionShown = inUnderstand && Boolean(state.correction?.viewedAt);
  const hand = useMemo(() => cardsInHand(model, state), [model, state]);
  const evaluation = useMemo(
    () => (isEclaireur || correctionShown ? evaluateBoard(model, state) : null),
    [isEclaireur, correctionShown, model, state],
  );
  const linkCategories = useMemo(() => {
    if (!evaluation) return null;
    const map = {};
    for (const l of evaluation.links) map[l.id] = l.category;
    return map;
  }, [evaluation]);
  const chips = useMemo(
    () => (isEclaireur ? outgoingStats(model, state) : null),
    [isEclaireur, model, state],
  );
  const arrowColorHex = ARROW_COLORS.find((c) => c.id === state.creative?.arrowColor)?.hex || null;
  const currentLot = lotOfStep(state.step);
  const nextLot = nextLotNumber(model, state);
  const canNext = canOpenNextLot(model, state);
  const canUnderstand = canEnterUnderstand(model, state);

  // ----- Étapes, niveau -----------------------------------------------------------------------
  const goToStep = useCallback(
    (step) => {
      update((s) => setStep(model, s, step));
      setLinkSourceId(null);
      setArmedHandCardId(null);
      void flush();
    },
    [flush, model, update],
  );
  const startFromDiscover = useCallback(() => {
    update((s) => {
      let next = setTutorialDone(s, true);
      const target = s.lotReached ? stepForLot(s.lotReached) : stepForLot(model.lots[0].number);
      next = setStep(model, next, target);
      return next;
    });
    void flush();
  }, [flush, model, update]);
  const changeLevel = useCallback(
    (lvl) => {
      update((s) => setLevel(s, lvl));
      const def = model.hints.levels?.[lvl];
      if (def) showToast(`Niveau ${def.label} : ${def.summary}`);
    },
    [model, showToast, update],
  );

  // ----- Cartes -------------------------------------------------------------------------------
  const placeAt = useCallback(
    (cardId, p) => {
      if (!p) return;
      const pos = dropPosition(p);
      update((s) => placeCard(model, s, cardId, { x: pos.x, y: pos.y }));
      setArmedHandCardId(null);
      setSelectedCardId(cardId);
      setAnnounce(`Carte « ${model.cardsById[cardId]?.title} » posée sur la table`);
    },
    [model, update],
  );
  const onHandDrop = useCallback(
    (cardId, clientX, clientY) => {
      const tapi = tableApiRef.current;
      const container = tapi?.getContainer?.();
      if (!tapi || !container) return;
      const r = container.getBoundingClientRect();
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return;
      placeAt(cardId, tapi.toImagePct(clientX, clientY));
    },
    [placeAt],
  );
  const onArmHandCard = useCallback(
    (cardId, opts = {}) => {
      setLinkSourceId(null);
      setArmedHandCardId((prev) => (prev === cardId ? null : cardId));
      if (opts.keyboard) {
        // Clavier : pose immédiate sur une place libre (la table n'a pas de curseur).
        update((s) => placeAllHandOne(model, s, cardId));
        setArmedHandCardId(null);
      }
    },
    [model, update],
  );
  const onPlaceAll = useCallback(() => {
    update((s) => placeAllHand(model, s));
    setArmedHandCardId(null);
    setAnnounce('Toutes les cartes de la main sont posées');
  }, [model, update]);
  const onTapBackground = useCallback(
    (p, armed) => {
      setPopover(null);
      if (armed) {
        placeAt(armed, p);
        return;
      }
      setLinkSourceId(null);
      setSelectedCardId(null);
      setPreviewLine(null);
    },
    [placeAt],
  );

  const createLink = useCallback(
    (from, to) => {
      const result = classifyLink(model, from, to, state);
      if (result.refused) {
        showToast(result.text, result.mark?.icon || '!');
        return;
      }
      update((s) => addLink(model, s, from, to, { color: s.creative?.arrowColor || null }).state);
      const fromTitle = model.cardsById[from]?.title;
      const toTitle = model.cardsById[to]?.title;
      setAnnounce(`Flèche tracée de « ${fromTitle} » vers « ${toTitle} »`);
      if (isEclaireur) showToast(result.text, result.mark?.icon || null);
      setLinkSourceId(null);
      setPreviewLine(null);
      setLinkPicker(null);
    },
    [isEclaireur, model, showToast, state, update],
  );
  const onCardTap = useCallback(
    (cardId) => {
      setPopover(null);
      if (linkSourceId) {
        if (linkSourceId === cardId) {
          setLinkSourceId(null);
          return;
        }
        createLink(linkSourceId, cardId);
        return;
      }
      setSelectedCardId(cardId);
      update((s) => flipCard(model, s, cardId));
    },
    [createLink, linkSourceId, model, update],
  );
  const onCardFlip = useCallback(
    (cardId) => update((s) => flipCard(model, s, cardId)),
    [model, update],
  );
  const onCardMove = useCallback(
    (cardId, x, y) => update((s) => moveCard(model, s, cardId, x, y)),
    [model, update],
  );
  const openCardImage = useCallback(
    (card, index = 0) => {
      setLightbox({
        gallery: [
          { src: `${publicBase}${card.recto}`, caption: card.alt?.recto || card.alt || card.title },
          { src: `${publicBase}${card.verso}`, caption: card.alt?.verso || card.alt || card.title },
        ],
        index,
      });
    },
    [publicBase],
  );
  const onCardOpen = useCallback(
    (cardId) => {
      const card = model.cardsById[cardId];
      if (card) openCardImage(card, state.cards[cardId]?.flipped ? 1 : 0);
    },
    [model, openCardImage, state.cards],
  );
  const onLinkButton = useCallback(
    (cardId, opts = {}) => {
      setPopover(null);
      setArmedHandCardId(null);
      if (linkSourceId === cardId) {
        setLinkSourceId(null);
        setLinkPicker(null);
        return;
      }
      setLinkSourceId(cardId);
      if (opts.keyboard) setLinkPicker({ from: cardId });
      setAnnounce(`Choisis la carte que « ${model.cardsById[cardId]?.title} » provoque`);
    },
    [linkSourceId, model],
  );
  const onLinkDragEnd = useCallback(
    (from, targetId, info = {}) => {
      if (info.preview) {
        const fromPos = state.cards[from];
        if (fromPos) {
          const a = pctToSvg(fromPos.x + 5.5, fromPos.y + 6);
          const b = pctToSvg(info.preview.xp, info.preview.yp);
          setPreviewLine({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        }
        return;
      }
      setPreviewLine(null);
      if (targetId && targetId !== from) createLink(from, targetId);
      else setLinkSourceId(null);
    },
    [createLink, state.cards],
  );
  const onLinkTap = useCallback(
    (link, pos) => {
      const category = linkCategories?.[link.id] || null;
      const text = category ? classifyLink(model, link.from, link.to).text : '';
      setPopover({ kind: 'link', link, category, text, x: pos.clientX, y: pos.clientY });
    },
    [linkCategories, model],
  );
  const onLinkDelete = useCallback(
    (link) => {
      update((s) => removeLink(s, link.id));
      setPopover(null);
      setAnnounce('Flèche retirée');
    },
    [update],
  );
  const onNoteMove = useCallback(
    (noteId, x, y) => update((s) => updateNote(s, noteId, { x, y })),
    [update],
  );
  const onNoteTap = useCallback((note) => setPopover({ kind: 'note', note, x: null, y: null }), []);

  const onViewportCommit = useCallback(
    (snap) => update((s) => setViewport(s, { scale: snap.zoom, tx: snap.xp, ty: snap.yp })),
    [update],
  );

  // ----- Lots, point d'étape ------------------------------------------------------------------
  const openLot = useCallback(() => {
    const n = nextLotNumber(model, state);
    update((s) => openNextLot(model, s));
    if (n) showToast(model.hints.lotIntros?.[String(n)] || `Lot ${n} ouvert`);
    void flush();
  }, [flush, model, showToast, state, update]);
  const doCheckpoint = useCallback(() => {
    if (isExpert) {
      setCheckpoint({ expert: true });
      return;
    }
    const msg = checkpointMessage(model, state);
    update((s) => recordCheckpoint(model, s).state);
    setCheckpoint({ ...msg });
  }, [isExpert, model, state, update]);

  const lotIntro = currentLot ? model.hints.lotIntros?.[String(currentLot)] || '' : '';
  const initialView = useMemo(
    () => viewportToInitialView(board?.state?.viewport),
    [board?.state?.viewport],
  );
  const missingPreview = useMemo(() => {
    if (!correctionShown) return [];
    const keys = new Set(state.correction.revealedMissing || []);
    return (evaluation?.missing || []).filter((l) => keys.has(`${l.from}>${l.to}`));
  }, [correctionShown, evaluation, state.correction.revealedMissing]);

  const handActions = (
    <>
      {!readOnly && !inUnderstand ? (
        <button
          type="button"
          className="fm-fresque-btn"
          onClick={doCheckpoint}
          data-testid="fm-fresque-checkpoint"
        >
          Point d’étape
        </button>
      ) : null}
      {!readOnly && canNext ? (
        <button
          type="button"
          className="fm-fresque-btn fm-fresque-btn--primary"
          onClick={openLot}
          data-testid="fm-fresque-next-lot"
        >
          Ouvrir le lot {nextLot}
        </button>
      ) : null}
      {!readOnly && !canNext && canUnderstand && !inUnderstand ? (
        <button
          type="button"
          className="fm-fresque-btn fm-fresque-btn--primary"
          onClick={() => goToStep(FRESQUE_STEP_UNDERSTAND)}
          data-testid="fm-fresque-go-understand"
        >
          Comprendre
        </button>
      ) : null}
      {!readOnly && !isEclaireur && model.guideBands.length ? (
        <label className="fm-fresque-btn fm-fresque-btn--ghost">
          <input
            type="checkbox"
            checked={state.showBands === true}
            onChange={(e) => update((s) => setShowBands(s, e.target.checked))}
            data-testid="fm-fresque-toggle-bands"
          />{' '}
          Afficher les bandes
        </label>
      ) : null}
    </>
  );

  return (
    <section
      className="fm-fresque"
      aria-label={model.deck.title}
      data-testid="fm-fresque-board"
      data-level={level}
      data-step={state.step}
    >
      <div className="fm-fresque-topbar">
        <FresqueStepper model={model} state={state} onGoTo={goToStep} disabled={readOnly} />
        <FresqueLevelMenu
          level={level}
          levels={model.hints.levels}
          onChange={changeLevel}
          disabled={readOnly}
        />
        <FresqueSaveStatus status={status} readOnly={readOnly} />
        {headerExtra}
      </div>

      {state.step === FRESQUE_STEP_DISCOVER ? (
        <FresqueDiscover
          model={model}
          publicBase={publicBase}
          state={state}
          readOnly={readOnly}
          onLevel={changeLevel}
          onOpenImage={openCardImage}
          onStart={startFromDiscover}
        />
      ) : (
        <>
          <FresqueTable
            model={model}
            publicBase={publicBase}
            state={state}
            readOnly={readOnly}
            showBands={isEclaireur || (level === 'explorateur' && state.showBands === true)}
            selectedCardId={selectedCardId}
            linkSourceId={linkSourceId}
            armedHandCardId={armedHandCardId}
            chips={chips}
            linkCategories={linkCategories}
            showMarks={Boolean(linkCategories)}
            missingPreview={missingPreview}
            previewLine={previewLine}
            selectedLinkId={popover?.kind === 'link' ? popover.link.id : null}
            arrowColorHex={arrowColorHex}
            tableApiRef={tableApiRef}
            initialView={initialView}
            onViewportCommit={onViewportCommit}
            onTapBackground={onTapBackground}
            onCardTap={onCardTap}
            onCardFlip={onCardFlip}
            onCardMove={onCardMove}
            onCardOpen={onCardOpen}
            onCardFocus={setSelectedCardId}
            onLinkButton={onLinkButton}
            onLinkDragEnd={onLinkDragEnd}
            onLinkTap={onLinkTap}
            onLinkDelete={onLinkDelete}
            onNoteMove={onNoteMove}
            onNoteTap={onNoteTap}
            emptyMessage={
              hand.length
                ? 'Glisse une carte de ta main sur la table, ou touche-la puis touche la table.'
                : null
            }
          />
          <FresqueHand
            model={model}
            publicBase={publicBase}
            cardIds={hand}
            armedCardId={armedHandCardId}
            intro={inUnderstand ? model.hints.completion?.notePrompt || '' : lotIntro}
            readOnly={readOnly}
            onArm={onArmHandCard}
            onDrop={onHandDrop}
            onPlaceAll={onPlaceAll}
            actions={handActions}
          />
        </>
      )}

      <FresqueCreditBar
        attribution={model.deck.attribution}
        onOpenNotice={() =>
          setLightbox({
            gallery: [
              {
                src: `${publicBase}${model.deck.attribution.noticeImage}`,
                caption: model.deck.specialCards.licence?.alt || 'Crédits',
              },
            ],
            index: 0,
          })
        }
      />

      <div
        className="fm-fresque-sr"
        aria-live="polite"
        role="status"
        data-testid="fm-fresque-announce"
      >
        {announce}
      </div>
      {toast ? (
        <div
          className="fm-fresque-toast"
          role="status"
          aria-live="polite"
          data-testid="fm-fresque-toast"
        >
          {toast.mark ? (
            <span className="fm-fresque-toast__mark" aria-hidden="true">
              {toast.mark}
            </span>
          ) : null}
          <span>{toast.text}</span>
          <button
            type="button"
            className="fm-fresque-btn fm-fresque-btn--ghost"
            style={{ color: '#fff' }}
            onClick={() => setToast(null)}
            aria-label="Fermer le message"
          >
            ✕
          </button>
        </div>
      ) : null}

      {popover?.kind === 'link' ? (
        <div
          className="fm-fresque-popover"
          role="dialog"
          aria-label="Flèche"
          style={{
            left: Math.max(
              8,
              Math.min(
                popover.x - 80,
                (typeof window !== 'undefined' ? window.innerWidth : 800) - 300,
              ),
            ),
            top: Math.max(8, popover.y - 90),
          }}
          data-testid="fm-fresque-link-popover"
        >
          <p>
            <strong>{model.cardsById[popover.link.from]?.title}</strong> →{' '}
            <strong>{model.cardsById[popover.link.to]?.title}</strong>
          </p>
          {popover.category ? (
            <p>
              <span aria-hidden="true">{LINK_CATEGORY_MARKS[popover.category]?.icon} </span>
              {LINK_CATEGORY_MARKS[popover.category]?.label} — {popover.text}
            </p>
          ) : null}
          <div className="fm-fresque-popover__row">
            {!readOnly ? (
              <button
                type="button"
                className="fm-fresque-btn"
                onClick={() => onLinkDelete(popover.link)}
                data-testid="fm-fresque-link-remove"
              >
                Retirer
              </button>
            ) : null}
            <button
              type="button"
              className="fm-fresque-btn fm-fresque-btn--ghost"
              onClick={() => setPopover(null)}
            >
              Fermer
            </button>
          </div>
        </div>
      ) : null}

      {linkPicker ? (
        <DialogShell
          open
          onClose={() => {
            setLinkPicker(null);
            setLinkSourceId(null);
          }}
          dialogClassName="fm-fresque-dialog"
          ariaLabel="Relier à une carte"
        >
          <h2>« {model.cardsById[linkPicker.from]?.title} » provoque…</h2>
          <div className="fm-fresque-levels">
            {Object.keys(state.cards)
              .filter((id) => id !== linkPicker.from)
              .map((id) => (
                <button
                  key={id}
                  type="button"
                  className="fm-fresque-level__option"
                  onClick={() => createLink(linkPicker.from, id)}
                  data-testid={`fm-fresque-pick-target-${id}`}
                >
                  <strong>
                    {model.cardsById[id].number}. {model.cardsById[id].title}
                  </strong>
                </button>
              ))}
          </div>
          <div className="fm-fresque-dialog__actions">
            <button
              type="button"
              className="fm-fresque-btn"
              onClick={() => {
                setLinkPicker(null);
                setLinkSourceId(null);
              }}
            >
              Annuler
            </button>
          </div>
        </DialogShell>
      ) : null}

      {checkpoint ? (
        <DialogShell
          open
          onClose={() => setCheckpoint(null)}
          dialogClassName="fm-fresque-dialog"
          ariaLabel="Point d’étape"
        >
          <h2>Point d’étape — {stepLabel(state.step)}</h2>
          {checkpoint.expert ? (
            <p>
              Lot terminé ?{' '}
              {isLotComplete(model, state)
                ? model.hints.checkpoint?.nextLot
                : 'Il reste des cartes à poser.'}
            </p>
          ) : (
            <p data-testid="fm-fresque-checkpoint-text">{checkpoint.text}</p>
          )}
          <div className="fm-fresque-dialog__actions">
            {canNext ? (
              <button
                type="button"
                className="fm-fresque-btn fm-fresque-btn--primary"
                onClick={() => {
                  setCheckpoint(null);
                  openLot();
                }}
              >
                Ouvrir le lot {nextLot}
              </button>
            ) : null}
            <button type="button" className="fm-fresque-btn" onClick={() => setCheckpoint(null)}>
              Continuer
            </button>
          </div>
        </DialogShell>
      ) : null}

      {conflict ? (
        <DialogShell
          open
          onClose={() => {}}
          closeOnOverlay={false}
          dialogClassName="fm-fresque-dialog"
          ariaLabel="Conflit d’enregistrement"
        >
          <h2>Ta fresque a été modifiée sur un autre appareil</h2>
          <p>
            Tu peux reprendre la version enregistrée, ou garder celle-ci (elle remplacera l’autre).
          </p>
          <div className="fm-fresque-dialog__actions">
            <button
              type="button"
              className="fm-fresque-btn fm-fresque-btn--primary"
              onClick={() => resolveConflict('reload')}
              data-testid="fm-fresque-conflict-reload"
            >
              Reprendre la version enregistrée
            </button>
            <button
              type="button"
              className="fm-fresque-btn"
              onClick={() => resolveConflict('keep')}
              data-testid="fm-fresque-conflict-keep"
            >
              Garder celle-ci
            </button>
          </div>
        </DialogShell>
      ) : null}

      {lightbox ? (
        <ImageLightbox
          src={lightbox.gallery[0].src}
          caption={lightbox.gallery[0].caption}
          gallery={lightbox.gallery}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </section>
  );
}

/** Pose une seule carte de la main sur une place libre (clavier). */
function placeAllHandOne(model, state, cardId) {
  const others = cardsInHand(model, state).filter((id) => id !== cardId);
  const placed = placeAllHand(model, state);
  // On ne garde que la carte demandée : les autres restent en main.
  const cards = { ...placed.cards };
  for (const id of others) delete cards[id];
  return { ...placed, cards };
}
