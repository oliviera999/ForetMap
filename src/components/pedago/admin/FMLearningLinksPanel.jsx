import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../services/api.js';

// Écran de rattachement « ressource ↔ questions » (professeur, permission plants.manage).
//
// Le conditionnement des lectures existait côté serveur mais restait inatteignable :
// aucun écran ne permettait de relier une question à un contenu, donc l'interrupteur
// global n'avait aucun effet visible. Cet écran comble ce manque, et ajoute
// l'appariement automatique par le contenu (POST /api/learning-links/suggest).
//
// Organisé par ressource — c'est ainsi que le professeur raisonne (« que doit savoir
// un élève qui a lu cette fiche ? »), et non par question.
//
// Il ne servait que les TUTORIELS : fiches espèces et termes de glossaire n'avaient
// aucun point d'entrée, alors que le moteur d'appariement les couvre. Les trois types
// sont désormais accessibles, et l'écran dit quand un type n'a pas de validation de
// lecture — un lien bloquant y resterait sans effet.

const RESOURCE_TABS = [
  { type: 'tutorial', label: 'Tutoriels', one: 'tutoriel' },
  { type: 'plant', label: 'Fiches espèces', one: 'fiche espèce' },
  { type: 'glossary', label: 'Glossaire', one: 'terme' },
];

const STATUS_LABELS = { approved: 'Approuvé', suggested: 'Proposé', rejected: 'Rejeté' };
const MODE_LABELS = {
  inherit: 'Réglage du site',
  off: 'Aucune question exigée',
  any: 'Une bonne réponse suffit',
  all: 'Toutes les questions',
  threshold: 'Un nombre minimum',
};

/** Confiance en pourcentage, pour un tableau lisible. */
function formatConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n * 100)} %`;
}

export function FMLearningLinksPanel() {
  const [config, setConfig] = useState(null);
  const [resourceType, setResourceType] = useState('tutorial');
  const [markable, setMarkable] = useState(true);
  const [resources, setResources] = useState([]);
  const [selectedRef, setSelectedRef] = useState('');
  const [links, setLinks] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [questionSearch, setQuestionSearch] = useState('');
  const [questionToAdd, setQuestionToAdd] = useState('');
  const [suggestions, setSuggestions] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const questionsByCode = useMemo(() => {
    const map = new Map();
    for (const q of questions) map.set(q.question_code, q);
    return map;
  }, [questions]);

  const selected = useMemo(
    () => resources.find((r) => r.ref === selectedRef) || null,
    [resources, selectedRef],
  );

  const loadResources = useCallback(async () => {
    try {
      const res = await api(
        `/api/learning-links/resources?type=${encodeURIComponent(resourceType)}`,
      );
      const list = Array.isArray(res?.resources) ? res.resources : [];
      setResources(list);
      setMarkable(res?.markable !== false);
      // La ressource retenue doit appartenir au type courant : garder l'ancienne
      // référence en changeant d'onglet afficherait les liens d'une autre ressource.
      setSelectedRef((current) =>
        current && list.some((r) => r.ref === current) ? current : list[0]?.ref || '',
      );
    } catch (err) {
      setError(err.message || 'Chargement des ressources impossible');
    }
  }, [resourceType]);

  const loadLinks = useCallback(async () => {
    if (!selectedRef) {
      setLinks([]);
      return;
    }
    try {
      const params = new URLSearchParams({
        resourceType,
        resourceRef: String(selectedRef),
      });
      const res = await api(`/api/learning-links?${params.toString()}`);
      setLinks(Array.isArray(res?.links) ? res.links : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement des rattachements impossible');
    }
  }, [selectedRef, resourceType]);

  const loadPolicy = useCallback(async () => {
    if (!selectedRef) {
      setPolicy(null);
      return;
    }
    try {
      const params = new URLSearchParams({
        resourceType,
        resourceRef: String(selectedRef),
      });
      const res = await api(`/api/learning-links/policy?${params.toString()}`);
      setPolicy(res || null);
    } catch (_) {
      setPolicy(null); // une politique illisible ne doit pas bloquer l'écran
    }
  }, [selectedRef, resourceType]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api('/api/learning-links/config');
        setConfig(res?.gating || null);
      } catch (_) {
        setConfig(null);
      }
    })();
    loadResources();
    (async () => {
      try {
        const res = await api('/api/quiz/admin/questions?statut=actif&sort=code');
        setQuestions(Array.isArray(res?.items) ? res.items : []);
      } catch (_) {
        setQuestions([]);
      }
    })();
  }, [loadResources]);

  useEffect(() => {
    loadLinks();
    loadPolicy();
    setSuggestions(null);
  }, [loadLinks, loadPolicy]);

  const linkedCodes = useMemo(() => new Set(links.map((l) => l.question_code)), [links]);

  const questionOptions = useMemo(() => {
    const needle = questionSearch.trim().toLowerCase();
    return questions
      .filter((q) => !linkedCodes.has(q.question_code))
      .filter((q) => {
        if (!needle) return true;
        return (
          q.question_code.toLowerCase().includes(needle) ||
          String(q.question || '')
            .toLowerCase()
            .includes(needle)
        );
      })
      .slice(0, 200);
  }, [questions, linkedCodes, questionSearch]);

  async function run(action, successMessage) {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await action();
      if (successMessage) setInfo(successMessage);
      await loadLinks();
      await loadResources();
    } catch (err) {
      setError(err.message || 'Opération impossible');
    } finally {
      setBusy(false);
    }
  }

  function addLink(event) {
    event.preventDefault();
    if (!questionToAdd || !selectedRef) return;
    return run(async () => {
      await api('/api/learning-links', 'POST', {
        resource_type: resourceType,
        resource_ref: String(selectedRef),
        question_code: questionToAdd,
        // Un type sans validation de lecture n'accepte que des liens documentaires :
        // le serveur refuserait un lien bloquant, autant ne pas le proposer.
        is_gating: markable,
        origin: 'manual',
        status: 'approved',
      });
      setQuestionToAdd('');
    }, 'Question rattachée.');
  }

  async function requestSuggestions(apply) {
    setSuggesting(true);
    setError('');
    setInfo('');
    try {
      const res = await api('/api/learning-links/suggest', 'POST', {
        apply,
        resourceTypes: [resourceType],
        resourceRefs: selectedRef ? [String(selectedRef)] : undefined,
      });
      setSuggestions(res || null);
      if (apply) {
        setInfo(
          `${res?.inserted || 0} rattachement(s) proposé(s) enregistré(s) — à approuver ci-dessous.`,
        );
        await loadLinks();
        await loadResources();
        setSuggestions(null);
      }
    } catch (err) {
      setError(err.message || 'Appariement automatique impossible');
    } finally {
      setSuggesting(false);
    }
  }

  /** Approuve d'un geste toutes les propositions de la ressource courante. */
  function approveAllSuggested() {
    return run(
      () =>
        api('/api/learning-links/review', 'POST', {
          action: 'approve',
          resourceType,
          resourceRef: String(selectedRef),
        }),
      'Propositions approuvées.',
    );
  }

  function savePolicy(patch) {
    return run(async () => {
      const current = policy?.policy || {};
      await api('/api/learning-links/policy', 'PUT', {
        resource_type: resourceType,
        resource_ref: String(selectedRef),
        mode: patch.mode ?? current.mode ?? 'inherit',
        required_correct: patch.required_correct ?? current.required_correct ?? 1,
        enabled: patch.enabled ?? (current.enabled == null ? 1 : current.enabled),
      });
      await loadPolicy();
    }, 'Exigence enregistrée.');
  }

  const gatingOff = config && !config.enabled;
  const tab = RESOURCE_TABS.find((t) => t.type === resourceType) || RESOURCE_TABS[0];
  const suggestedCount = links.filter((l) => l.status === 'suggested').length;

  // Où en est-on VRAIMENT ? L'écran ne le disait pas : un professeur pouvait créer
  // des dizaines de liens sans jamais voir qu'aucun n'était bloquant, ni que
  // l'interrupteur était éteint. Trois nombres suffisent à le dire.
  const totals = resources.reduce(
    (acc, r) => ({
      gating: acc.gating + (Number(r.gating_count) || 0),
      suggested: acc.suggested + (Number(r.suggested_count) || 0),
      covered: acc.covered + (Number(r.gating_count) > 0 ? 1 : 0),
    }),
    { gating: 0, suggested: 0, covered: 0 },
  );
  const armed = !gatingOff && totals.gating > 0;

  return (
    <section className="card pedago-links fade-in">
      <h3 className="section-title">Rattacher des questions aux contenus</h3>
      <p className="section-sub">
        Relie une question du Quiz à un contenu. Quand le contrôle de compréhension est actif,
        l&apos;élève doit réussir la ou les questions rattachées avant de pouvoir confirmer sa
        lecture.
      </p>

      <div className="pedago-links__tabs" role="tablist" aria-label="Type de contenu">
        {RESOURCE_TABS.map((t) => (
          <button
            key={t.type}
            type="button"
            role="tab"
            aria-selected={t.type === resourceType}
            className={`btn btn-sm ${t.type === resourceType ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setResourceType(t.type)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* État du dispositif, en une ligne : sans elle, rien ne distinguait « pas encore
          configuré » de « configuré mais éteint », ni de « configuré et actif ». */}
      <p className="section-sub pedago-links__state" role="status">
        {gatingOff ? '⏸️ ' : armed ? '✅ ' : '⚠️ '}
        Contrôle de compréhension <strong>{gatingOff ? 'désactivé' : 'activé'}</strong> sur le site
        · {totals.gating} question(s) bloquante(s) sur {totals.covered} {tab.one}
        {totals.covered > 1 ? 's' : ''} — {resources.length} au total
        {totals.suggested > 0 ? ` · ${totals.suggested} proposition(s) à approuver` : ''}
      </p>

      {gatingOff ? (
        <p className="section-sub pedago-links__warning" role="status">
          ⏸️ Le contrôle de compréhension est <strong>désactivé sur le site</strong> : ces
          rattachements sont enregistrés mais restent sans effet pour les élèves. Il s&apos;active
          dans <strong>Réglages → Validation des lectures</strong>.
        </p>
      ) : totals.gating === 0 ? (
        <p className="section-sub pedago-links__warning" role="status">
          ⚠️ L&apos;interrupteur est allumé, mais <strong>aucun lien n&apos;est bloquant</strong>{' '}
          pour ce type : les élèves ne verront aucune question. Un lien ne conditionne une
          validation que s&apos;il est <strong>approuvé</strong> ET coché <strong>bloquant</strong>.
        </p>
      ) : null}
      {!markable ? (
        <p className="section-sub pedago-links__warning" role="status">
          ℹ️ Ce type n&apos;a pas de validation de lecture dans ForetMap : les liens y sont
          <strong> documentaires</strong> (ils disent quelle question parle de quel contenu) et ne
          peuvent pas être rendus bloquants.
        </p>
      ) : null}
      {error ? <p className="pedago-qcm-admin__error">{error}</p> : null}
      {info ? <p className="section-sub">{info}</p> : null}

      <div className="pedago-links__grid">
        <div className="pedago-links__aside">
          <h4>{tab.label}</h4>
          <div className="pedago-links__list">
            {resources.map((r) => (
              <button
                key={r.ref}
                type="button"
                className={`pedago-links__item${r.ref === selectedRef ? ' is-selected' : ''}`}
                onClick={() => setSelectedRef(r.ref)}
              >
                <strong>{r.label}</strong>
                <span className="section-sub">
                  {r.gating_count} question(s) bloquante(s)
                  {r.suggested_count > 0 ? ` · ${r.suggested_count} à valider` : ''}
                  {!r.is_active ? ' · masqué' : ''}
                </span>
              </button>
            ))}
            {resources.length === 0 ? (
              <p className="section-sub">Aucun contenu de ce type.</p>
            ) : null}
          </div>
        </div>

        <div className="pedago-links__main">
          {!selected ? (
            <p className="section-sub">Choisissez un {tab.one} à gauche.</p>
          ) : (
            <>
              <h4>{selected.label}</h4>

              <div className="pedago-links__policy">
                <label className="pedago-filter-field">
                  <span>Exigence pour ce tutoriel</span>
                  <select
                    className="form-select"
                    value={policy?.policy?.mode || 'inherit'}
                    disabled={busy}
                    onChange={(e) => savePolicy({ mode: e.target.value, enabled: 1 })}
                  >
                    {Object.entries(MODE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                {policy?.effective ? (
                  <p className="section-sub">
                    Appliqué :{' '}
                    <strong>{MODE_LABELS[policy.effective.mode] || policy.effective.mode}</strong>
                    {policy.effective.mode === 'threshold'
                      ? ` (${policy.effective.requiredCorrect})`
                      : ''}
                  </p>
                ) : null}
              </div>

              <form className="pedago-links__add" onSubmit={addLink}>
                <label className="pedago-filter-field">
                  <span>Chercher une question</span>
                  <input
                    className="form-input"
                    value={questionSearch}
                    onChange={(e) => setQuestionSearch(e.target.value)}
                    placeholder="compost, QF0012…"
                  />
                </label>
                <label className="pedago-filter-field pedago-links__picker">
                  <span>Question à rattacher</span>
                  <select
                    className="form-select"
                    value={questionToAdd}
                    onChange={(e) => setQuestionToAdd(e.target.value)}
                  >
                    <option value="">— Choisir —</option>
                    {questionOptions.map((q) => (
                      <option key={q.question_code} value={q.question_code}>
                        {q.question_code} — {String(q.question || '').slice(0, 90)}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="btn-primary" disabled={busy || !questionToAdd}>
                  Rattacher
                </button>
              </form>

              <div className="pedago-links__auto">
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={suggesting || busy}
                  onClick={() => requestSuggestions(false)}
                >
                  {suggesting ? 'Analyse…' : 'Proposer des rattachements (par le contenu)'}
                </button>
                {suggestions ? (
                  <div className="pedago-links__suggestions">
                    <p className="section-sub">
                      {suggestions.candidates?.length || 0} proposition(s) —{' '}
                      {suggestions.stats?.editorial_candidates || 0} reprise(s) des « questions
                      liées » déjà saisies, {suggestions.stats?.textual_candidates || 0} par
                      rapprochement de contenu. Rien n&apos;est encore enregistré.
                    </p>
                    {(suggestions.candidates || []).length > 0 ? (
                      <>
                        <ul className="pedago-links__suggestion-list">
                          {(suggestions.candidates || []).slice(0, 25).map((c) => (
                            <li key={`${c.resource_ref}-${c.question_code}`}>
                              <code>{c.question_code}</code> → <strong>{c.resource_label}</strong>{' '}
                              <span className="section-sub">
                                {formatConfidence(c.confidence)} · {c.reason}
                              </span>
                              <p className="section-sub">
                                {questionsByCode.get(c.question_code)?.question || ''}
                              </p>
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={suggesting || busy}
                          onClick={() => requestSuggestions(true)}
                        >
                          Enregistrer ces propositions (à approuver ensuite)
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
                {/* Sans ce bouton, quarante propositions demandaient quarante changements
                    de liste déroulante : le rattachement automatique ne débouchait sur
                    rien. Approuver n'est pas conditionner — le caractère bloquant reste
                    coché ligne par ligne, ci-dessous. */}
                {suggestedCount > 0 ? (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={busy || suggesting}
                    onClick={approveAllSuggested}
                  >
                    Approuver les {suggestedCount} proposition(s) de ce {tab.one}
                  </button>
                ) : null}
              </div>

              {links.length === 0 ? (
                <p className="section-sub">Aucune question rattachée à ce {tab.one}.</p>
              ) : (
                <div className="pedago-links__table-wrap">
                  <table className="pedago-links__table">
                    <thead>
                      <tr>
                        <th>Question</th>
                        <th>Bloquante</th>
                        <th>Statut</th>
                        <th>Origine</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {links.map((link) => (
                        <tr key={link.id}>
                          <td>
                            <code>{link.question_code}</code>
                            <p className="section-sub">
                              {questionsByCode.get(link.question_code)?.question || ''}
                            </p>
                            {link.note ? <p className="section-sub">{link.note}</p> : null}
                          </td>
                          <td>
                            <input
                              type="checkbox"
                              checked={!!Number(link.is_gating)}
                              // Type sans validation de lecture : la case serait un leurre,
                              // le serveur refuse de toute façon un lien bloquant.
                              disabled={busy || !markable}
                              title={
                                markable
                                  ? undefined
                                  : 'Ce type n’a pas de validation de lecture : le lien reste documentaire.'
                              }
                              aria-label={`Bloquante pour ${link.question_code}`}
                              onChange={() =>
                                run(() =>
                                  api(`/api/learning-links/${link.id}`, 'PATCH', {
                                    is_gating: !Number(link.is_gating),
                                  }),
                                )
                              }
                            />
                          </td>
                          <td>
                            <select
                              className="form-select"
                              value={link.status}
                              disabled={busy}
                              aria-label={`Statut de ${link.question_code}`}
                              onChange={(e) =>
                                run(() =>
                                  api(`/api/learning-links/${link.id}`, 'PATCH', {
                                    status: e.target.value,
                                  }),
                                )
                              }
                            >
                              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="section-sub">
                            {link.origin}
                            {link.confidence != null
                              ? ` · ${formatConfidence(link.confidence)}`
                              : ''}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn-ghost"
                              disabled={busy}
                              onClick={() =>
                                run(
                                  () => api(`/api/learning-links/${link.id}`, 'DELETE'),
                                  'Rattachement supprimé.',
                                )
                              }
                            >
                              Retirer
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
