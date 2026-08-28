import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogA11y } from '../../hooks/useDialogA11y.js';
import { usePrefersReducedMotion } from '../../shared/hooks/usePrefersReducedMotion.js';
import { lockBodyScroll } from '../../utils/body-scroll-lock.js';
import { api } from '../../services/api';
import { GlossaryMarkdown } from '../GlossaryMarkdown.jsx';
import { useGlossaryLinkIndex } from '../../hooks/useGlossaryLinkIndex.js';
import { useGatingSummary } from '../../hooks/useGatingSummary';
import {
  GlossaryTermLearnedAcknowledgeButton,
  fetchLearnedGlossaryCodes,
} from './GlossaryTermLearnedAcknowledge.jsx';

/**
 * Fiche rapide d'un terme du glossaire, affichée **par-dessus** l'écran courant.
 *
 * Raison d'être (audit A1) : jusqu'ici, cliquer un terme auto-lié dans un tutoriel
 * basculait sur l'onglet Glossaire, ce qui démontait la vue Tutoriels et fermait la
 * modale de lecture — l'élève perdait sa fiche et sa position de lecture. Le popover
 * est rendu dans `document.body` via un portail, depuis la racine de l'application :
 * il survit à tout changement d'onglet et se pose au-dessus de la modale de tutoriel
 * (et de son iframe, qui ne peut rien rendre hors d'elle-même).
 *
 * Modèle repris de `src/gl/components/GLGlossaryPopover.jsx` (même monorepo), en
 * thème forêt ForetMap.
 */

/** Durée de l'animation de fermeture, alignée sur `.fm-glossary-popover.is-closing`. */
const CLOSE_MS = 200;

const NIVEAU_LABELS = {
  base: 'Base',
  approfondissement: 'Approfondissement',
  avance: 'Avancé',
};

/** Accent de couleur par catégorie, dans la palette forêt (défaut : vert feuille). */
const CATEGORY_ACCENT = {
  botanique: '#2d6a4f',
  ecologie: '#40916c',
  ecosysteme: '#0d9488',
  sol: '#8d6e4a',
  faune: '#c47f1c',
  flore: '#2f9e44',
  jardinage: '#57783f',
  climat: '#2b7fb8',
  interaction: '#b5651d',
  methode: '#5b6ab0',
};

/** Cache mémoire des fiches déjà chargées (évite un aller-retour par ouverture). */
const detailCache = new Map();

/** Vide le cache mémoire des fiches (tests, et rechargement forcé côté appelant). */
export function clearGlossaryDetailCache() {
  detailCache.clear();
}

function categoryAccent(categorie) {
  return CATEGORY_ACCENT[String(categorie || '').toLowerCase()] || 'var(--leaf, #2d6a4f)';
}

/**
 * Lit un message `foretmap:glossary` émis par l'iframe d'un tutoriel.
 *
 * Contrôle d'origine (audit A10) : un tutoriel de `type = 'link'` est affiché dans une
 * iframe de la **même page**, mais sur une origine tierce. Sans ce filtre, ce site
 * pourrait émettre `{ type: 'foretmap:glossary' }` et piloter la navigation de l'élève.
 * Seuls les tutoriels servis par `GET /api/tutorials/:id/view` — donc de notre origine —
 * sont acceptés.
 *
 * @param {MessageEvent} event
 * @param {string} appOrigin origine de l'application (`window.location.origin`)
 * @returns {string|null} le code du terme, ou `null` si le message est à ignorer
 */
export function readGlossaryTermMessage(event, appOrigin) {
  if (!event || typeof event !== 'object') return null;
  const expected = String(appOrigin || '');
  if (!expected || event.origin !== expected) return null;
  const data = event.data;
  if (!data || typeof data !== 'object' || data.type !== 'foretmap:glossary') return null;
  const code = String(data.code || '').trim();
  return code || null;
}

/**
 * @param {object} props
 * @param {boolean} props.open popover visible
 * @param {string|null} props.glossaryCode code du terme à afficher à l'ouverture
 * @param {() => void} props.onClose fermeture demandée (après animation)
 * @param {(code: string) => void} [props.onOpenFullGlossary] bascule vers l'onglet Glossaire
 * @param {boolean} [props.showFullGlossaryLink] masquer le lien quand on est déjà sur l'onglet
 */
export function GlossaryPopover({
  open = false,
  glossaryCode = null,
  onClose,
  onOpenFullGlossary = null,
  showFullGlossaryLink = true,
  /** Déconnexion forcée si le compte a été supprimé pendant la session. */
  onForceLogout = null,
}) {
  const titleId = useId();
  const [activeCode, setActiveCode] = useState(null);
  const [detail, setDetail] = useState(null);
  // Le glossaire était purement consultatif : rien ne disait ce qui avait déjà été
  // travaillé, et le conditionnement n'avait aucun geste auquel se rattacher.
  const [learnedCodes, setLearnedCodes] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const requestClose = useCallback(() => {
    if (isClosing) return;
    if (prefersReducedMotion) {
      onClose?.();
      return;
    }
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setIsClosing(false);
      onClose?.();
    }, CLOSE_MS);
  }, [isClosing, onClose, prefersReducedMotion]);

  const dialogRef = useDialogA11y(requestClose);

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
    setActiveCode(String(glossaryCode || '').trim() || null);
  }, [open, glossaryCode]);

  // Termes déjà appris : chargés à l'ouverture, pas à chaque terme consulté.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    (async () => {
      const codes = await fetchLearnedGlossaryCodes();
      if (!cancelled) setLearnedCodes(new Set(codes));
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const gatingRefs = useMemo(() => (activeCode ? [activeCode] : []), [activeCode]);
  const { summaries: gatingSummaries, refresh: refreshGating } = useGatingSummary(
    'glossary',
    gatingRefs,
  );

  useEffect(() => {
    if (!open || !activeCode) {
      setDetail(null);
      setError('');
      setLoading(false);
      return undefined;
    }

    const cached = detailCache.get(activeCode);
    if (cached) {
      setDetail(cached);
      setError('');
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    setDetail(null);

    api(`/api/glossary/terms/${encodeURIComponent(activeCode)}`)
      .then((data) => {
        if (cancelled) return;
        detailCache.set(activeCode, data);
        setDetail(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Fiche introuvable');
        setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, activeCode]);

  // Verrou de défilement mutualisé (compteur partagé) : cohabite avec la modale de
  // tutoriel, qui peut elle aussi être ouverte en dessous.
  useEffect(() => {
    if (!open && !isClosing) return undefined;
    return lockBodyScroll();
  }, [open, isClosing]);

  // Auto-liens dans la définition elle-même : index partagé, **privé du terme
  // affiché** pour ne pas l'auto-lier vers lui-même. Le clic reste dans le
  // popover (`openRelatedTerm`), il n'en ouvre pas un second par-dessus.
  const glossaryIndex = useGlossaryLinkIndex({ enabled: open || isClosing });
  const autolinkItems = useMemo(
    () => glossaryIndex.filter((item) => item?.glossary_code !== activeCode),
    [glossaryIndex, activeCode],
  );

  /** Navigation d'un terme voisin à l'autre, sans jamais fermer le popover. */
  const openRelatedTerm = useCallback(
    (code) => {
      const next = String(code || '').trim();
      if (!next) return;
      setActiveCode((current) => (next === current ? current : next));
    },
    [setActiveCode],
  );

  function openFullGlossary() {
    const code = activeCode;
    onClose?.();
    if (code) onOpenFullGlossary?.(code);
  }

  if ((!open && !isClosing) || typeof document === 'undefined' || !document.body) {
    return null;
  }

  const relatedTerms = Array.isArray(detail?.relatedTerms) ? detail.relatedTerms : [];
  const incomingRelations = Array.isArray(detail?.incomingRelations)
    ? detail.incomingRelations
    : [];
  const linkedPlants = Array.isArray(detail?.linkedPlants) ? detail.linkedPlants : [];
  const linkedTutorials = Array.isArray(detail?.linkedTutorials) ? detail.linkedTutorials : [];
  const hasDetail = Boolean(detail && !error);
  const overlayClass = `fm-glossary-popover${isClosing ? ' is-closing' : ''}`;

  return createPortal(
    <div
      className={overlayClass}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`fm-glossary-popover__panel${prefersReducedMotion ? '' : ' animate-pop'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{ '--fm-glossary-accent': categoryAccent(detail?.categorie) }}
      >
        <div className="fm-glossary-popover__strip" aria-hidden="true" />

        <header className="fm-glossary-popover__header">
          <h3 id={titleId} className="fm-glossary-popover__title">
            {hasDetail ? detail.terme : '📖 Glossaire'}
          </h3>
          <button
            type="button"
            className="fm-glossary-popover__close"
            onClick={requestClose}
            aria-label="Fermer la fiche du glossaire"
          >
            ✕
          </button>
        </header>

        {error ? (
          <p className="pedago-error fm-glossary-popover__error" role="alert">
            {error}
          </p>
        ) : null}

        {loading && !hasDetail && !error ? (
          <div className="fm-glossary-popover__body" aria-live="polite">
            <p className="section-sub">Chargement de la fiche…</p>
            <div className="fm-glossary-popover__skeleton" />
            <div className="fm-glossary-popover__skeleton fm-glossary-popover__skeleton--short" />
            <div className="fm-glossary-popover__skeleton" />
          </div>
        ) : null}

        {hasDetail ? (
          <div key={activeCode} className="fm-glossary-popover__content fade-in">
            {detail.categorie || detail.niveau ? (
              <div className="fm-glossary-popover__badges">
                {detail.categorie ? (
                  <span className="task-chip fm-glossary-popover__badge-cat">
                    {detail.categorie}
                  </span>
                ) : null}
                {detail.niveau ? (
                  <span className="task-chip">{NIVEAU_LABELS[detail.niveau] || detail.niveau}</span>
                ) : null}
              </div>
            ) : null}

            <div className="fm-glossary-popover__body">
              {detail.definition_courte ? (
                <GlossaryMarkdown
                  className="fm-glossary-popover__lead"
                  glossaryItems={autolinkItems}
                  onOpenGlossaryTerm={openRelatedTerm}
                >
                  {detail.definition_courte}
                </GlossaryMarkdown>
              ) : null}
              {detail.definition_complete ? (
                <GlossaryMarkdown
                  className="fm-glossary-popover__text"
                  glossaryItems={autolinkItems}
                  onOpenGlossaryTerm={openRelatedTerm}
                >
                  {detail.definition_complete}
                </GlossaryMarkdown>
              ) : null}
              {detail.exemple ? (
                <div className="fm-glossary-popover__meta">
                  <div className="plant-meta-label">Exemple</div>
                  <GlossaryMarkdown
                    className="fm-glossary-popover__text"
                    glossaryItems={autolinkItems}
                    onOpenGlossaryTerm={openRelatedTerm}
                  >
                    {detail.exemple}
                  </GlossaryMarkdown>
                </div>
              ) : null}
              {detail.etymologie ? (
                <div className="fm-glossary-popover__meta">
                  <div className="plant-meta-label">Étymologie</div>
                  <GlossaryMarkdown
                    className="fm-glossary-popover__text"
                    glossaryItems={autolinkItems}
                    onOpenGlossaryTerm={openRelatedTerm}
                  >
                    {detail.etymologie}
                  </GlossaryMarkdown>
                </div>
              ) : null}

              {linkedPlants.length > 0 ? (
                <div className="fm-glossary-popover__meta">
                  <div className="plant-meta-label">Espèces liées</div>
                  <div className="pedago-chip-row">
                    {linkedPlants.map((plant) => (
                      <span key={plant.id} className="task-chip">
                        {plant.emoji ? `${plant.emoji} ` : ''}
                        {plant.name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {linkedTutorials.length > 0 ? (
                <div className="fm-glossary-popover__meta">
                  <div className="plant-meta-label">Tutoriels liés</div>
                  <div className="pedago-chip-row">
                    {linkedTutorials.map((tuto) => (
                      <span key={tuto.id} className="task-chip">
                        {tuto.title}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {relatedTerms.length > 0 || incomingRelations.length > 0 ? (
              <div className="fm-glossary-popover__related">
                <h4 className="fm-glossary-popover__related-title">Termes liés</h4>
                <div className="pedago-chip-row">
                  {relatedTerms.map((term) => (
                    <button
                      key={`out-${term.glossary_code}`}
                      type="button"
                      className="pedago-chip-btn fm-glossary-popover__chip"
                      onClick={() => openRelatedTerm(term.glossary_code)}
                    >
                      {term.terme}
                    </button>
                  ))}
                  {incomingRelations.map((term) => (
                    <button
                      key={`in-${term.glossary_code}`}
                      type="button"
                      className="pedago-chip-btn fm-glossary-popover__chip"
                      onClick={() => openRelatedTerm(term.glossary_code)}
                    >
                      {term.terme}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <footer className="fm-glossary-popover__footer">
          {hasDetail ? (
            <GlossaryTermLearnedAcknowledgeButton
              glossaryCode={activeCode}
              termLabel={detail.terme}
              isLearned={learnedCodes.has(String(activeCode))}
              gatingSummary={gatingSummaries.get(String(activeCode)) || null}
              onAcknowledged={(code) => {
                setLearnedCodes((prev) => new Set(prev).add(String(code)));
                refreshGating();
              }}
              onForceLogout={onForceLogout}
            />
          ) : null}
          {showFullGlossaryLink && onOpenFullGlossary ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={openFullGlossary}>
              Voir la fiche complète
            </button>
          ) : null}
          <button type="button" className="btn btn-secondary btn-sm" onClick={requestClose}>
            Fermer
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
