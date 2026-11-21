import { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveExternalImageUrl } from '../../shared/privacy/externalAssets.js';
import { api } from '../../services/api';
import { useData } from '../../contexts/DataContext.jsx';
import {
  IconAdd,
  IconBiodiv,
  IconDelete,
  IconEdit,
  IconSearch,
  IconTuto,
} from '../../shared/icons.jsx';
import { IdKeySchemaView } from './IdKeySchemaView.jsx';
import { isLeadUsable } from '../../utils/idKeySchemaLayout.js';
import { ModuleLearnerOffBanner } from './ModuleLearnerOffBanner.jsx';
import { ID_KEY_TOOL_ENUM, QUESTION_NIVEAU_ENUM } from '../../shared/enums/pedagoEnums.js';
import {
  isLeadImageCreditMissing,
  leadImageCreditLine,
  resolveLeadOutcome,
} from '../../shared/idKeyLeadCore.js';
import { TutorialPreviewModal, tutorialPreviewPayload } from '../TutorialPreviewModal.jsx';
import './idKeys.css';
import { IdKeyArrival, arrivalFromLead } from './IdKeyArrival.jsx';
import {
  IdKeyLeadEditor,
  draftToPayload,
  emptyLeadDraft,
  leadToDraft,
} from './IdKeyLeadEditor.jsx';

const READER_MODE_KEY = 'foretmap.id-keys.readerMode';

function readStoredReaderMode() {
  try {
    const raw = window.localStorage.getItem(READER_MODE_KEY);
    return raw === 'schema' ? 'schema' : 'questions';
  } catch (_) {
    return 'questions';
  }
}

function storeReaderMode(mode) {
  try {
    window.localStorage.setItem(READER_MODE_KEY, mode);
  } catch (_) {
    /* navigation privée / quota */
  }
}

/** Récapitulatif des propositions choisies : la justification attendue de l'élève. */
function TrailRecap({ trail, title = 'Chemin parcouru' }) {
  if (!trail.length) return null;
  return (
    <div className="id-key-trail" aria-live="polite">
      <strong>{title} :</strong>
      <ol>
        {trail.map((step) => (
          <li key={step.leadId}>{step.statement || 'Proposition sans énoncé'}</li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Avant la première question : matériel, tutoriels à lire et consigne de sécurité. Le bloc
 * « Avant de commencer » (avec ses tutoriels) n'existe que si la clé demande du matériel ;
 * sans matériel, seule la consigne de sécurité est rappelée.
 */
function KitNotice({ keyBundle, onOpenTutorial }) {
  const tools = Array.isArray(keyBundle?.tool_required) ? keyBundle.tool_required : [];
  if (!tools.length && !keyBundle?.safety_note) return null;
  const tutorials = tools.length && Array.isArray(keyBundle.tutorials) ? keyBundle.tutorials : [];
  return (
    <div className="id-key-reader__kit">
      {tools.length ? (
        <>
          <h4 className="id-key-reader__kit-title">Avant de commencer</h4>
          <p>
            <strong>Matériel :</strong>{' '}
            {tools.map((t) => ID_KEY_TOOL_ENUM.labels[t] || t).join(', ')}
          </p>
        </>
      ) : null}
      {tutorials.length ? (
        <>
          <p>
            <strong>À lire avant :</strong>
          </p>
          <ul className="id-key-reader__tutorials">
            {tutorials.map((tuto) => (
              <li key={tuto.id}>
                <button type="button" className="btn" onClick={() => onOpenTutorial?.(tuto)}>
                  <IconTuto size={16} /> {tuto.title}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {keyBundle.safety_note ? (
        <p>
          <strong>Sécurité :</strong> {keyBundle.safety_note}
        </p>
      ) : null}
    </div>
  );
}

/** Vignette d'une proposition, son crédit dessous. */
function LeadImage({ lead }) {
  if (!lead.image_url) return null;
  const credit = leadImageCreditLine(lead);
  return (
    <span className="id-key-lead-figure">
      <img src={resolveExternalImageUrl(lead.image_url)} alt="" className="id-key-lead-img" />
      {credit ? <small className="id-key-lead-credit">Photo : {credit}</small> : null}
    </span>
  );
}

function ReaderPanel({ keyBundle, onOpenPlant, onOpenKey, onBack, canManage = false }) {
  /** Propositions choisies, dans l'ordre : on sait ainsi *pourquoi* on est arrivé ici. */
  const [trail, setTrail] = useState([]);
  const [readerMode, setReaderMode] = useState(readStoredReaderMode);
  /** Schéma : espèces masquées tant qu'elles ne sont pas atteintes (sinon il donne les réponses). */
  const [revealPlants, setRevealPlants] = useState(false);
  /** Tutoriel « avant de commencer » ouvert en aperçu. */
  const [previewTutorial, setPreviewTutorial] = useState(null);
  const couplets = useMemo(() => keyBundle?.couplets || [], [keyBundle]);
  const coupletIds = useMemo(() => new Set(couplets.map((c) => Number(c.id))), [couplets]);
  const startCouplet = useMemo(
    () => couplets.find((c) => Number(c.number) === 1) || couplets[0],
    [couplets],
  );
  const lastStep = trail.length ? trail[trail.length - 1] : null;
  const arrival = lastStep?.arrival || null;
  const history = useMemo(
    () => trail.filter((step) => step.nextCoupletId != null).map((step) => step.nextCoupletId),
    [trail],
  );
  const currentId = history.length ? history[history.length - 1] : startCouplet?.id;
  const current = couplets.find((c) => Number(c.id) === Number(currentId));

  const setMode = useCallback((mode) => {
    setReaderMode(mode);
    storeReaderMode(mode);
  }, []);

  const chooseLead = useCallback(
    (lead) => {
      if (!isLeadUsable(lead, coupletIds)) return;
      const outcome = resolveLeadOutcome(lead);
      const step = {
        leadId: Number(lead.id),
        statement: lead.statement || '',
        nextCoupletId: outcome === 'couplet' ? Number(lead.next_couplet_id) : null,
        arrival: outcome === 'couplet' ? null : arrivalFromLead(lead, outcome),
      };
      setTrail((t) => [...t, step]);
    },
    [coupletIds],
  );

  const stepBack = useCallback(() => setTrail((t) => t.slice(0, -1)), []);
  const restart = useCallback(() => setTrail([]), []);

  if (!keyBundle) return null;
  if (arrival) {
    return (
      <div className="id-key-reader">
        <IdKeyArrival arrival={arrival} onOpenPlant={onOpenPlant} onOpenKey={onOpenKey} />
        <TrailRecap trail={trail} title="Caractères observés" />
        <div className="id-key-reader__nav">
          <button type="button" className="btn" onClick={stepBack}>
            Retour
          </button>
          <button type="button" className="btn" onClick={restart}>
            Recommencer
          </button>
          <button type="button" className="btn" onClick={onBack}>
            Retour à la liste
          </button>
        </div>
      </div>
    );
  }

  if (!current) {
    return <p className="form-error">Cette clé n’a pas encore de couplet de départ.</p>;
  }

  return (
    <div className="id-key-reader">
      <h3>
        {keyBundle.title}
        {keyBundle.scope_label ? ` — ${keyBundle.scope_label}` : ''}
      </h3>
      <div className="id-key-reader__modes" role="group" aria-label="Mode de lecture">
        <button
          type="button"
          className={readerMode === 'questions' ? 'btn btn-primary' : 'btn'}
          aria-pressed={readerMode === 'questions'}
          onClick={() => setMode('questions')}
        >
          Questions
        </button>
        <button
          type="button"
          className={readerMode === 'schema' ? 'btn btn-primary' : 'btn'}
          aria-pressed={readerMode === 'schema'}
          onClick={() => setMode('schema')}
        >
          Schéma
        </button>
      </div>
      {trail.length === 0 ? (
        <KitNotice
          keyBundle={keyBundle}
          onOpenTutorial={(tuto) => setPreviewTutorial(tutorialPreviewPayload(tuto))}
        />
      ) : null}
      <TrailRecap trail={trail} />
      {readerMode === 'schema' ? (
        <>
          <p className="muted">
            Couplet {current.number} — schéma de la clé (branche active depuis le couplet entouré).
          </p>
          {canManage ? (
            <button
              type="button"
              className="btn btn-sm"
              aria-pressed={revealPlants}
              onClick={() => setRevealPlants((on) => !on)}
            >
              {revealPlants ? 'Masquer les espèces' : 'Montrer toutes les espèces'}
            </button>
          ) : null}
          <IdKeySchemaView
            keyBundle={keyBundle}
            currentCoupletId={currentId}
            history={history}
            pathLeadIds={trail.map((step) => step.leadId)}
            onChooseLead={chooseLead}
            onOpenPlant={onOpenPlant}
            revealPlants={revealPlants}
            authorMode={canManage}
          />
        </>
      ) : (
        <>
          <p className="muted">
            Couplet {current.number} — choisissez le caractère observé (sans manipuler).
          </p>
          <ul className="id-key-leads">
            {(current.leads || []).map((lead) => {
              const usable = isLeadUsable(lead, coupletIds);
              return (
                <li key={lead.id}>
                  <button
                    type="button"
                    className="btn id-key-lead-btn"
                    disabled={!usable}
                    onClick={() => chooseLead(lead)}
                  >
                    <LeadImage lead={lead} />
                    <span>
                      {lead.statement}
                      {lead.hint ? <small className="id-key-lead-hint">{lead.hint}</small> : null}
                    </span>
                    {!usable ? <span className="muted"> (à compléter)</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div className="id-key-reader__nav">
        <button type="button" className="btn" disabled={trail.length === 0} onClick={stepBack}>
          Retour
        </button>
        <button type="button" className="btn" onClick={onBack}>
          Quitter
        </button>
      </div>
      <TutorialPreviewModal tutorial={previewTutorial} onClose={() => setPreviewTutorial(null)} />
    </div>
  );
}

function metaFromBundle(keyBundle) {
  return {
    title: keyBundle.title || '',
    description: keyBundle.description || '',
    scope_label: keyBundle.scope_label || '',
    niveau: keyBundle.niveau || 'college',
    tool_required: Array.isArray(keyBundle.tool_required) ? keyBundle.tool_required : [],
    safety_note: keyBundle.safety_note || '',
    allows_multiple_paths: Boolean(keyBundle.allows_multiple_paths),
    tutorial_ids: Array.isArray(keyBundle.tutorial_ids) ? keyBundle.tutorial_ids : [],
    is_published: Boolean(keyBundle.is_published),
  };
}

/** Tutoriels « avant de commencer » d'une clé : liste ordonnée, ajout, retrait, déplacement. */
function KeyTutorialsField({ ids, onChange, tutorials, hasTools }) {
  const byId = new Map(tutorials.map((t) => [Number(t.id), t]));
  const available = tutorials.filter((t) => !ids.includes(Number(t.id)) && t.is_active !== false);
  const move = (index, delta) => {
    const next = [...ids];
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved);
    onChange(next);
  };
  return (
    <fieldset className="id-key-editor__tutorials">
      <legend>Tutoriels « Avant de commencer »</legend>
      {ids.length ? (
        <ol className="id-key-editor__tutorial-list">
          {ids.map((id, index) => {
            const tuto = byId.get(Number(id));
            const title = tuto?.title || `Tutoriel #${id}`;
            return (
              <li key={id}>
                <span className="id-key-editor__tutorial-title">
                  {title}
                  {tuto?.is_active === false ? ' (archivé, masqué aux élèves)' : ''}
                </span>
                <button
                  type="button"
                  className="btn btn-sm"
                  aria-label={`Monter ${title}`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  aria-label={`Descendre ${title}`}
                  disabled={index === ids.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  aria-label={`Retirer ${title}`}
                  onClick={() => onChange(ids.filter((x) => x !== id))}
                >
                  <IconDelete size={14} />
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted">Aucun tutoriel lié.</p>
      )}
      <label>
        Ajouter un tutoriel
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...ids, Number(e.target.value)]);
          }}
        >
          <option value="">—</option>
          {available.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </label>
      {ids.length && !hasTools ? (
        <p className="muted">
          Les élèves ne voient ces tutoriels que si la clé demande du matériel : coche-le ci-dessus.
        </p>
      ) : null}
    </fieldset>
  );
}

function EditorPanel({ keyBundle, onReload, plants, keys }) {
  const [meta, setMeta] = useState(() => metaFromBundle(keyBundle));
  const [clades, setClades] = useState([]);
  const [tutorialCatalog, setTutorialCatalog] = useState([]);
  const [selectedCoupletId, setSelectedCoupletId] = useState(keyBundle.couplets?.[0]?.id || null);
  const [leadsDraft, setLeadsDraft] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMeta(metaFromBundle(keyBundle));
  }, [keyBundle]);

  useEffect(() => {
    let alive = true;
    api('/api/clades')
      .then((data) => {
        if (alive) setClades(Array.isArray(data?.items) ? data.items : []);
      })
      .catch(() => {
        if (alive) setClades([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    api('/api/tutorials')
      .then((data) => {
        if (alive) setTutorialCatalog(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (alive) setTutorialCatalog([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  /** Catalogue des tutoriels actifs, complété par ceux déjà liés (archivés compris). */
  const tutorialChoices = useMemo(() => {
    const known = new Set(tutorialCatalog.map((t) => Number(t.id)));
    const linkedOnly = (keyBundle.tutorials || []).filter((t) => !known.has(Number(t.id)));
    return [...tutorialCatalog, ...linkedOnly];
  }, [tutorialCatalog, keyBundle.tutorials]);

  const missingCredits = useMemo(
    () =>
      (keyBundle.couplets || []).flatMap((c) =>
        (c.leads || []).filter(isLeadImageCreditMissing).map(() => c.number),
      ),
    [keyBundle.couplets],
  );

  useEffect(() => {
    const couplet = (keyBundle.couplets || []).find(
      (c) => Number(c.id) === Number(selectedCoupletId),
    );
    setLeadsDraft((couplet?.leads || []).map(leadToDraft));
  }, [keyBundle, selectedCoupletId]);

  const saveMeta = async () => {
    setSaving(true);
    setError('');
    try {
      await api(`/api/id-keys/${keyBundle.id}`, 'PUT', meta);
      await onReload();
    } catch (err) {
      setError(err?.message || 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const addCouplet = async () => {
    setError('');
    try {
      const created = await api(`/api/id-keys/${keyBundle.id}/couplets`, 'POST', {});
      await onReload();
      setSelectedCoupletId(created.id);
    } catch (err) {
      setError(err?.message || 'Ajout de couplet impossible');
    }
  };

  const saveLeads = async () => {
    setSaving(true);
    setError('');
    try {
      await api(`/api/id-keys/${keyBundle.id}/couplets/${selectedCoupletId}/leads`, 'PUT', {
        leads: leadsDraft.map(draftToPayload),
      });
      await onReload();
    } catch (err) {
      setError(err?.message || 'Enregistrement des propositions impossible');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="id-key-editor">
      <h3>Éditer — {keyBundle.slug}</h3>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="id-key-editor__meta">
        <label>
          Titre
          <input
            value={meta.title}
            onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))}
          />
        </label>
        <label>
          Périmètre
          <input
            value={meta.scope_label}
            onChange={(e) => setMeta((m) => ({ ...m, scope_label: e.target.value }))}
            placeholder="Ex. Arbres du lycée"
          />
        </label>
        <label>
          Niveau
          <select
            value={meta.niveau}
            onChange={(e) => setMeta((m) => ({ ...m, niveau: e.target.value }))}
          >
            {QUESTION_NIVEAU_ENUM.values.map((value) => (
              <option key={value} value={value}>
                {QUESTION_NIVEAU_ENUM.labels[value]}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="id-key-editor__tools">
          <legend>Matériel nécessaire</legend>
          {ID_KEY_TOOL_ENUM.values.map((tool) => (
            <label key={tool} className="id-key-editor__check">
              <input
                type="checkbox"
                checked={meta.tool_required.includes(tool)}
                onChange={(e) =>
                  setMeta((m) => ({
                    ...m,
                    tool_required: e.target.checked
                      ? [...m.tool_required, tool]
                      : m.tool_required.filter((t) => t !== tool),
                  }))
                }
              />
              {ID_KEY_TOOL_ENUM.labels[tool]}
            </label>
          ))}
        </fieldset>
        <label>
          Consigne de sécurité
          <textarea
            value={meta.safety_note}
            onChange={(e) => setMeta((m) => ({ ...m, safety_note: e.target.value }))}
            rows={2}
            placeholder="Ex. Observer sans toucher ni cueillir."
          />
        </label>
        <KeyTutorialsField
          ids={meta.tutorial_ids}
          onChange={(tutorial_ids) => setMeta((m) => ({ ...m, tutorial_ids }))}
          tutorials={tutorialChoices}
          hasTools={meta.tool_required.length > 0}
        />
        <label className="id-key-editor__check">
          <input
            type="checkbox"
            checked={meta.allows_multiple_paths}
            onChange={(e) => setMeta((m) => ({ ...m, allows_multiple_paths: e.target.checked }))}
          />
          Plusieurs chemins vers une même espèce sont voulus (ne plus le signaler à l’audit)
        </label>
        <label className="id-key-editor__check">
          <input
            type="checkbox"
            checked={meta.is_published}
            onChange={(e) => setMeta((m) => ({ ...m, is_published: e.target.checked }))}
          />
          Publiée
        </label>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={saveMeta}>
          Enregistrer la clé
        </button>
      </div>

      <div className="id-key-editor__couplets">
        <h4>Couplets</h4>
        {missingCredits.length ? (
          <p className="id-key-editor__credit-missing" role="status">
            Crédit manquant : {missingCredits.length} image{missingCredits.length > 1 ? 's' : ''}{' '}
            sans auteur (couplet{new Set(missingCredits).size > 1 ? 's' : ''}{' '}
            {[...new Set(missingCredits)].join(', ')}).
          </p>
        ) : null}
        <div className="id-key-editor__couplet-tabs">
          {(keyBundle.couplets || []).map((c) => (
            <button
              key={c.id}
              type="button"
              className={Number(c.id) === Number(selectedCoupletId) ? 'btn btn-primary' : 'btn'}
              onClick={() => setSelectedCoupletId(c.id)}
            >
              #{c.number}
            </button>
          ))}
          <button type="button" className="btn" onClick={addCouplet}>
            <IconAdd size={14} /> Couplet
          </button>
        </div>

        <p className="muted">
          Chaque proposition mène à une seule issue : un autre couplet, une espèce, un groupe
          d’espèces trop proches pour être séparées, ou un grand groupe. Un résultat peut renvoyer à
          une autre clé « pour aller plus loin ». Décrire un caractère observable, sans invitation à
          manipuler.
        </p>
        {leadsDraft.map((lead, idx) => (
          <IdKeyLeadEditor
            key={lead.id ?? `new-${idx}`}
            draft={lead}
            onChange={(next) => setLeadsDraft((rows) => rows.map((r, i) => (i === idx ? next : r)))}
            onRemove={() => setLeadsDraft((rows) => rows.filter((_, i) => i !== idx))}
            couplets={keyBundle.couplets}
            selectedCoupletId={selectedCoupletId}
            plants={plants}
            clades={clades}
            keys={keys}
            currentKeyId={keyBundle.id}
          />
        ))}
        <div className="id-key-editor__lead-actions">
          <button
            type="button"
            className="btn"
            onClick={() => setLeadsDraft((rows) => [...rows, emptyLeadDraft()])}
          >
            <IconAdd size={14} /> Proposition
          </button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={saveLeads}>
            Enregistrer les propositions
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Lecteur élève (une question à la fois) + éditeur pour `id_keys.manage`.
 * @param {object} props
 * @param {boolean} [props.canManage]
 * @param {(plantId: number|string) => void} [props.onOpenPlant]
 * @param {string|number|null} [props.initialKey] — id ou slug à ouvrir au montage / changement
 */
export function IdKeysView({
  canManage = false,
  onOpenPlant = null,
  initialKey = null,
  /** Module éteint pour les élèves, vue ouverte au gestionnaire : bandeau d'avertissement. */
  moduleOffForLearners = false,
}) {
  const { plants = [] } = useData() || {};
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(null);
  const [mode, setMode] = useState('read'); // read | edit | list
  const [error, setError] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newTitle, setNewTitle] = useState('');

  const loadList = useCallback(async () => {
    const data = await api(canManage ? '/api/id-keys?all=1' : '/api/id-keys');
    setItems(Array.isArray(data?.items) ? data.items : []);
  }, [canManage]);

  useEffect(() => {
    loadList().catch(() => setItems([]));
  }, [loadList]);

  const openKey = useCallback(async (idOrSlug, nextMode = 'read') => {
    setError('');
    try {
      const data = await api(`/api/id-keys/${encodeURIComponent(idOrSlug)}`);
      setActive(data);
      setMode(nextMode);
    } catch (err) {
      setError(err?.message || 'Chargement impossible');
    }
  }, []);

  useEffect(() => {
    const raw = initialKey != null ? String(initialKey).trim() : '';
    if (!raw) return;
    openKey(raw, 'read');
  }, [initialKey, openKey]);

  const createKey = async () => {
    setError('');
    try {
      const data = await api('/api/id-keys', 'POST', { slug: newSlug, title: newTitle });
      setNewSlug('');
      setNewTitle('');
      await loadList();
      setActive(data);
      setMode('edit');
    } catch (err) {
      setError(err?.message || 'Création impossible');
    }
  };

  const reloadActive = async () => {
    if (!active?.id) return;
    const data = await api(`/api/id-keys/${active.id}`);
    setActive(data);
    await loadList();
  };

  return (
    <div className="id-keys-view fade-in">
      <header className="id-keys-view__header">
        <h2>
          <IconSearch size={22} /> Clés d’identification
        </h2>
        <p>
          Mode Questions (une fourche à la fois) ou Schéma (arbre de la clé) — caractères
          observables seulement, jusqu’à la fiche espèce.
        </p>
      </header>
      {moduleOffForLearners ? <ModuleLearnerOffBanner moduleLabel="Clés d’identification" /> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {mode === 'list' || !active ? (
        <section>
          <ul className="id-keys-list">
            {items.map((item) => (
              <li key={item.id}>
                <button type="button" className="btn" onClick={() => openKey(item.id, 'read')}>
                  <IconBiodiv size={16} /> {item.title}
                  {!item.is_published ? ' (brouillon)' : ''}
                </button>
                {canManage ? (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => openKey(item.id, 'edit')}
                  >
                    <IconEdit size={14} /> Éditer
                  </button>
                ) : null}
              </li>
            ))}
            {items.length === 0 ? (
              <li className="muted">Aucune clé publiée pour l’instant.</li>
            ) : null}
          </ul>
          {canManage ? (
            <div className="id-keys-create">
              <h3>Nouvelle clé</h3>
              <input
                placeholder="slug"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
              />
              <input
                placeholder="Titre"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
              <button type="button" className="btn btn-primary" onClick={createKey}>
                <IconAdd size={14} /> Créer
              </button>
            </div>
          ) : null}
        </section>
      ) : mode === 'edit' && canManage ? (
        <>
          <button type="button" className="btn" onClick={() => setActive(null)}>
            ← Liste
          </button>
          <EditorPanel keyBundle={active} onReload={reloadActive} plants={plants} keys={items} />
        </>
      ) : (
        <ReaderPanel
          keyBundle={active}
          onOpenPlant={onOpenPlant}
          onOpenKey={(idOrSlug) => openKey(idOrSlug, 'read')}
          onBack={() => setActive(null)}
          canManage={canManage}
        />
      )}
    </div>
  );
}
