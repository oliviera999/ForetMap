import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';
import { useGlossaryLinkIndex } from '../../hooks/useGlossaryLinkIndex.js';
import { useGatingSummary } from '../../hooks/useGatingSummary';
import { LearningGatingStateIcon } from '../../shared/components/LearningGatingStateIcon.jsx';
import { fetchLearnedGlossaryCodes } from './GlossaryTermLearnedAcknowledge.jsx';
import { GlossaryTermDetail } from './GlossaryTermDetail.jsx';
import { GlossaryFilters } from './GlossaryFilters.jsx';
import { IconGlossary } from '../../shared/icons.jsx';
import { useCurriculumNotions } from '../../hooks/useCurriculumNotions.js';
import {
  buildNotionOptions,
  notionNiveauOptionsFor,
  notionsForNiveauFilter,
  resolveNotionNiveaux,
} from '../../utils/curriculumNotions.js';
import { useBiodivPedago } from '../../contexts/BiodivPedagoContext.jsx';
import { enumOptions } from '../../shared/enums/enumCore.js';
import { GLOSSARY_NIVEAU_ENUM } from '../../shared/enums/pedagoEnums.js';
import {
  filterGlossaryItemsByDepth,
  hasGlossaryDepthBarrier,
  isGlossaryNiveauWithinDepth,
} from '../../utils/foretmapGlossaryAutolink.js';
import './glossary.css';

/** Profondeur d'un terme : référentiel partagé des ENUM (`glossary_terms.niveau`). */
const NIVEAU_OPTIONS = [{ value: '', label: 'Tous niveaux' }, ...enumOptions(GLOSSARY_NIVEAU_ENUM)];

export function GlossaryView({
  onOpenPlant,
  onOpenQuizQuestion,
  selectedCode = null,
  onSelectedCodeChange = null,
  /** Déconnexion forcée si le compte a été supprimé pendant la session. */
  onForceLogout = null,
}) {
  const [search, setSearch] = useState('');
  const [niveau, setNiveau] = useState('');
  const [categorie, setCategorie] = useState('');
  // Notion du programme (migration 273) : distincte du « niveau » du terme, qui dit sa
  // profondeur (base / approfondissement / avancé) et non la classe où il est travaillé.
  const [notionNiveau, setNotionNiveau] = useState('');
  const [notionId, setNotionId] = useState('');
  // Niveaux du programme visibles pour ce public (étape d'affichage, resserrée à la classe).
  const { curriculumNiveaux, palierRule } = useBiodivPedago();
  // Barrière de vocabulaire douce (chantier collège, flux C2) : la liste montre par défaut
  // les termes du palier (`glossary_depth_max`) ; « Pour aller plus loin » retire le filtre.
  // Rien n'est caché définitivement : la fiche d'un terme reste toujours ouverte.
  const depthMax = palierRule('glossary_depth_max');
  const depthBarrier = hasGlossaryDepthBarrier(depthMax);
  const [goFurther, setGoFurther] = useState(false);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeCode, setActiveCode] = useState(selectedCode || '');
  // Termes déjà appris, et contrôle de compréhension attaché à chacun : le glossaire
  // était purement consultatif, rien ne distinguait un terme travaillé d'un terme
  // jamais ouvert.
  const [learnedCodes, setLearnedCodes] = useState(() => new Set());
  // Choisir explicitement une profondeur vaut demande : la barrière ne s'applique qu'à la
  // vue par défaut (« Tous niveaux »).
  const depthFilterOn = depthBarrier && !goFurther && !niveau;
  const visibleItems = useMemo(
    () => (depthFilterOn ? filterGlossaryItemsByDepth(items, depthMax) : items),
    [depthFilterOn, items, depthMax],
  );
  const hiddenCount = items.length - visibleItems.length;
  const listedCodes = useMemo(
    () => visibleItems.map((i) => i?.glossary_code).filter(Boolean),
    [visibleItems],
  );
  const { summaries: gatingSummaries, refresh: refreshGating } = useGatingSummary(
    'glossary',
    listedCodes,
  );
  /** Invalide une réponse de liste périmée (changement de filtre pendant le fetch). */
  const loadTermsSeqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const codes = await fetchLearnedGlossaryCodes();
      if (!cancelled) setLearnedCodes(new Set(codes));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedCode) setActiveCode(selectedCode);
  }, [selectedCode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api('/api/glossary/categories');
        if (!cancelled) setCategories(Array.isArray(data?.categories) ? data.categories : []);
      } catch (_) {
        if (!cancelled) setCategories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadTerms = useCallback(async () => {
    const seq = ++loadTermsSeqRef.current;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      const q = search.trim();
      if (q) params.set('q', q);
      if (niveau) params.set('niveau', niveau);
      if (categorie) params.set('categorie', categorie);
      const niveaux = resolveNotionNiveaux(notionNiveau, curriculumNiveaux);
      if (notionId) params.set('notionId', notionId);
      else if (niveaux) params.set('notionNiveau', niveaux.join(','));
      const qs = params.toString();
      const data = await api(`/api/glossary/terms${qs ? `?${qs}` : ''}`);
      if (seq !== loadTermsSeqRef.current) return;
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (err) {
      if (seq !== loadTermsSeqRef.current) return;
      setError(err.message || 'Chargement impossible');
      setItems([]);
    } finally {
      if (seq === loadTermsSeqRef.current) setLoading(false);
    }
  }, [search, niveau, categorie, notionId, notionNiveau, curriculumNiveaux]);

  useEffect(() => {
    const timer = setTimeout(loadTerms, search.trim() ? 280 : 0);
    return () => {
      clearTimeout(timer);
      loadTermsSeqRef.current += 1;
    };
  }, [loadTerms, search]);

  const loadDetail = useCallback(async (code) => {
    if (!code) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setError('');
    try {
      const data = await api(`/api/glossary/terms/${encodeURIComponent(code)}`);
      setDetail(data);
    } catch (err) {
      setError(err.message || 'Terme introuvable');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeCode) loadDetail(activeCode);
    else setDetail(null);
  }, [activeCode, loadDetail]);

  // Auto-liens : index partagé des termes actifs, **privé du terme affiché** pour
  // ne pas auto-lier une fiche vers elle-même. Dans cet onglet, le clic navigue
  // dans la vue (`selectTerm`), il n'ouvre pas de popover par-dessus.
  const glossaryIndex = useGlossaryLinkIndex();
  const autolinkItems = useMemo(
    () => glossaryIndex.filter((item) => item?.glossary_code !== activeCode),
    [glossaryIndex, activeCode],
  );

  const categorieOptions = useMemo(
    () => [
      { value: '', label: 'Toutes catégories' },
      ...categories.map((c) => ({ value: c, label: c })),
    ],
    [categories],
  );

  const notions = useCurriculumNotions();
  const curriculumNiveauOptions = useMemo(
    () => notionNiveauOptionsFor(curriculumNiveaux, notionNiveau),
    [curriculumNiveaux, notionNiveau],
  );
  const visibleNotions = useMemo(
    () => notionsForNiveauFilter(notions, notionNiveau, curriculumNiveaux),
    [notions, notionNiveau, curriculumNiveaux],
  );
  const notionOptions = useMemo(
    () => buildNotionOptions(visibleNotions, { countKey: 'glossary_count' }),
    [visibleNotions],
  );

  useEffect(() => {
    if (!notionId) return;
    if (!visibleNotions.some((n) => n.id === notionId)) setNotionId('');
  }, [visibleNotions, notionId]);

  const selectTerm = useCallback(
    (code) => {
      setActiveCode(code);
      onSelectedCodeChange?.(code);
    },
    [onSelectedCodeChange],
  );

  const acknowledgeTerm = useCallback(
    (code) => {
      setLearnedCodes((prev) => new Set(prev).add(String(code)));
      refreshGating();
    },
    [refreshGating],
  );

  return (
    <div className="pedago-view pedago-glossary">
      <header className="pedago-view__head">
        <h2 className="section-title">
          <IconGlossary size={20} /> Glossaire
        </h2>
        <p className="section-sub">Termes scientifiques du vivant et du jardinage.</p>
      </header>

      <GlossaryFilters
        search={{ value: search, onChange: setSearch }}
        niveau={{ value: niveau, onChange: setNiveau, options: NIVEAU_OPTIONS }}
        categorie={{ value: categorie, onChange: setCategorie, options: categorieOptions }}
        notionNiveau={{
          value: notionNiveau,
          onChange: setNotionNiveau,
          options: curriculumNiveauOptions,
        }}
        notion={{ value: notionId, onChange: setNotionId, options: notionOptions }}
      />

      {error ? <p className="pedago-error">{error}</p> : null}

      <div className="pedago-glossary__layout">
        <aside className="pedago-glossary__list card">
          <h3 className="pedago-panel-title">Termes ({visibleItems.length})</h3>
          {depthBarrier && !niveau && (hiddenCount > 0 || goFurther) ? (
            <div className="fm-glossary-depth">
              <p className="fm-glossary-depth__text" aria-live="polite">
                {goFurther
                  ? 'Tous les termes sont affichés, y compris les plus avancés.'
                  : `${hiddenCount} terme${hiddenCount > 1 ? 's' : ''} plus avancé${hiddenCount > 1 ? 's' : ''} ${hiddenCount > 1 ? 'sont rangés' : 'est rangé'} à part.`}
              </p>
              <button
                type="button"
                className="btn btn-ghost btn-sm fm-glossary-depth__toggle"
                aria-pressed={goFurther}
                onClick={() => setGoFurther((value) => !value)}
              >
                {goFurther ? 'Revenir aux termes essentiels' : 'Pour aller plus loin'}
              </button>
            </div>
          ) : null}
          {loading ? <p className="section-sub">Chargement…</p> : null}
          {!loading && visibleItems.length === 0 ? (
            <p className="section-sub">Aucun terme trouvé.</p>
          ) : (
            <ul className="pedago-term-list">
              {visibleItems.map((item) => (
                <li key={item.glossary_code}>
                  <button
                    type="button"
                    className={`pedago-term-btn${activeCode === item.glossary_code ? ' active' : ''}`}
                    onClick={() => selectTerm(item.glossary_code)}
                  >
                    <strong>{item.terme}</strong>
                    <LearningGatingStateIcon
                      summary={gatingSummaries.get(String(item.glossary_code)) || null}
                      done={learnedCodes.has(String(item.glossary_code))}
                    />
                    {item.categorie ? (
                      <span className="task-chip pedago-term-btn__chip">{item.categorie}</span>
                    ) : null}
                    {item.definition_courte ? (
                      <span className="pedago-term-btn__hint">{item.definition_courte}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="pedago-glossary__detail card">
          {!activeCode ? (
            <p className="section-sub">Sélectionne un terme pour afficher sa définition.</p>
          ) : detailLoading ? (
            <p className="section-sub">Chargement de la fiche…</p>
          ) : detail ? (
            <GlossaryTermDetail
              detail={detail}
              activeCode={activeCode}
              autolinkItems={autolinkItems}
              onSelectTerm={selectTerm}
              learnedCodes={learnedCodes}
              gatingSummaries={gatingSummaries}
              onAcknowledged={acknowledgeTerm}
              onForceLogout={onForceLogout}
              onOpenPlant={onOpenPlant}
              onOpenQuizQuestion={onOpenQuizQuestion}
              beyondPalier={depthBarrier && !isGlossaryNiveauWithinDepth(detail.niveau, depthMax)}
            />
          ) : (
            <p className="section-sub">Fiche indisponible.</p>
          )}
        </section>
      </div>
    </div>
  );
}
