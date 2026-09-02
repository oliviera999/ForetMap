import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../services/api';
import { GlossaryMarkdown } from '../GlossaryMarkdown.jsx';
import { useGlossaryLinkIndex } from '../../hooks/useGlossaryLinkIndex.js';
import { useGatingSummary } from '../../hooks/useGatingSummary';
import { LearningGatingStateIcon } from '../../shared/components/LearningGatingStateIcon.jsx';
import {
  GlossaryTermLearnedAcknowledgeButton,
  fetchLearnedGlossaryCodes,
} from './GlossaryTermLearnedAcknowledge.jsx';
import { IconGlossary } from '../../shared/icons.jsx';

const NIVEAU_OPTIONS = [
  { value: '', label: 'Tous niveaux' },
  { value: 'base', label: 'Base' },
  { value: 'approfondissement', label: 'Approfondissement' },
  { value: 'avance', label: 'Avancé' },
];

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
  const listedCodes = useMemo(() => items.map((i) => i?.glossary_code).filter(Boolean), [items]);
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
  }, [search, niveau, categorie]);

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

  const selectTerm = useCallback(
    (code) => {
      setActiveCode(code);
      onSelectedCodeChange?.(code);
    },
    [onSelectedCodeChange],
  );

  return (
    <div className="pedago-view pedago-glossary">
      <header className="pedago-view__head">
        <h2 className="section-title">
          <IconGlossary size={20} /> Glossaire
        </h2>
        <p className="section-sub">Termes scientifiques du vivant et du jardinage.</p>
      </header>

      <div className="pedago-filters card">
        <label className="pedago-filter-field">
          <span>Recherche</span>
          <input
            type="search"
            className="form-input"
            placeholder="Mot-clé…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="pedago-filter-field">
          <span>Niveau</span>
          <select
            className="form-select"
            value={niveau}
            onChange={(e) => setNiveau(e.target.value)}
          >
            {NIVEAU_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pedago-filter-field">
          <span>Catégorie</span>
          <select
            className="form-select"
            value={categorie}
            onChange={(e) => setCategorie(e.target.value)}
          >
            {categorieOptions.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p className="pedago-error">{error}</p> : null}

      <div className="pedago-glossary__layout">
        <aside className="pedago-glossary__list card">
          <h3 className="pedago-panel-title">Termes ({items.length})</h3>
          {loading ? <p className="section-sub">Chargement…</p> : null}
          {!loading && items.length === 0 ? (
            <p className="section-sub">Aucun terme trouvé.</p>
          ) : (
            <ul className="pedago-term-list">
              {items.map((item) => (
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
            <>
              <h3 className="pedago-panel-title">{detail.terme}</h3>
              <div className="task-meta" style={{ marginBottom: 10 }}>
                {detail.categorie ? <span className="task-chip">{detail.categorie}</span> : null}
                {detail.niveau ? <span className="task-chip">{detail.niveau}</span> : null}
                <GlossaryTermLearnedAcknowledgeButton
                  glossaryCode={detail.glossary_code || activeCode}
                  termLabel={detail.terme}
                  isLearned={learnedCodes.has(String(detail.glossary_code || activeCode))}
                  gatingSummary={
                    gatingSummaries.get(String(detail.glossary_code || activeCode)) || null
                  }
                  onAcknowledged={(code) => {
                    setLearnedCodes((prev) => new Set(prev).add(String(code)));
                    refreshGating();
                  }}
                  onForceLogout={onForceLogout}
                />
              </div>
              {detail.definition_courte ? (
                <p className="plant-row-desc">{detail.definition_courte}</p>
              ) : null}
              {detail.definition_complete ? (
                <GlossaryMarkdown
                  className="plant-row-desc"
                  glossaryItems={autolinkItems}
                  onOpenGlossaryTerm={selectTerm}
                >
                  {detail.definition_complete}
                </GlossaryMarkdown>
              ) : null}
              {detail.exemple ? (
                <div className="plant-meta-item" style={{ marginTop: 12 }}>
                  <div className="plant-meta-label">Exemple</div>
                  <GlossaryMarkdown
                    className="plant-meta-value"
                    glossaryItems={autolinkItems}
                    onOpenGlossaryTerm={selectTerm}
                  >
                    {detail.exemple}
                  </GlossaryMarkdown>
                </div>
              ) : null}
              {detail.etymologie ? (
                <div className="plant-meta-item" style={{ marginTop: 8 }}>
                  <div className="plant-meta-label">Étymologie</div>
                  <GlossaryMarkdown
                    className="plant-meta-value"
                    glossaryItems={autolinkItems}
                    onOpenGlossaryTerm={selectTerm}
                  >
                    {detail.etymologie}
                  </GlossaryMarkdown>
                </div>
              ) : null}

              {detail.incomingRelations?.length > 0 ? (
                <div className="pedago-remediation" style={{ marginTop: 16 }}>
                  <strong>Voir aussi</strong>
                  <div className="pedago-chip-row">
                    {detail.incomingRelations.map((term) => (
                      <button
                        key={`in-${term.glossary_code}`}
                        type="button"
                        className="pedago-chip-btn"
                        onClick={() => selectTerm(term.glossary_code)}
                      >
                        {term.terme}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {detail.relatedTerms?.length > 0 ? (
                <div className="pedago-remediation" style={{ marginTop: 16 }}>
                  <strong>Termes liés</strong>
                  <div className="pedago-chip-row">
                    {detail.relatedTerms.map((term) => (
                      <button
                        key={term.glossary_code}
                        type="button"
                        className="pedago-chip-btn"
                        onClick={() => selectTerm(term.glossary_code)}
                      >
                        {term.terme}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {detail.linkedPlants?.length > 0 ? (
                <div className="pedago-remediation" style={{ marginTop: 16 }}>
                  <strong>Espèces liées</strong>
                  <div className="pedago-chip-row">
                    {detail.linkedPlants.map((plant) => (
                      <button
                        key={plant.id}
                        type="button"
                        className="pedago-chip-btn"
                        onClick={() => onOpenPlant?.(plant.id)}
                      >
                        {plant.emoji ? `${plant.emoji} ` : ''}
                        {plant.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {detail.linkedTutorials?.length > 0 ? (
                <div className="pedago-remediation" style={{ marginTop: 16 }}>
                  <strong>Tutoriels liés</strong>
                  <ul className="pedago-link-list">
                    {detail.linkedTutorials.map((tu) => (
                      <li key={tu.id}>{tu.title}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {detail.linkedQuizQuestions?.length > 0 ? (
                <div className="pedago-remediation" style={{ marginTop: 16 }}>
                  <strong>Questions quiz</strong>
                  <div className="pedago-chip-row">
                    {detail.linkedQuizQuestions.map((q) => (
                      <button
                        key={q.question_code}
                        type="button"
                        className="pedago-chip-btn"
                        onClick={() => onOpenQuizQuestion?.(q.question_code)}
                      >
                        {q.question_code}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p className="section-sub">Fiche indisponible.</p>
          )}
        </section>
      </div>
    </div>
  );
}
