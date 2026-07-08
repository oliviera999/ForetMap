import React, { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';

// G3 — écran admin du conditionnement par QCM (« marquer appris » soumis à la
// réussite d'une question). CRUD des liens ressource ↔ question sur
// /api/gl/learning-links (permission gl.content.manage). Les réglages globaux
// gating.* se pilotent dans Réglages plateforme (permission gl.settings.manage).

const DATASET_LABELS = { qcm: 'QCM biomes', qcm_lore: 'QCM lore' };
const RESOURCE_TYPE_LABELS = {
  species: 'Fiche espèce',
  glossary: 'Glossaire scientifique',
  lore_glossary: 'Lexique lore',
  tutorial: 'Tutoriel',
  feuillet: 'Feuillet Sélène',
  content_page: 'Page de contenu',
  ecosystem: 'Écosystème',
};
const STATUS_LABELS = { suggested: 'Suggéré', approved: 'Approuvé', rejected: 'Rejeté' };

const EMPTY_CREATE_FORM = {
  question_dataset: 'qcm',
  resource_type: 'species',
  resource_ref: '',
  question_code: '',
  is_gating: true,
  note: '',
};

export function GLLearningLinksPanel() {
  const [gating, setGating] = useState(null);
  const [resourceTypes, setResourceTypes] = useState(Object.keys(RESOURCE_TYPE_LABELS));
  const [links, setLinks] = useState([]);
  const [filters, setFilters] = useState({ questionDataset: '', resourceType: '', status: '' });
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const loadSettings = useCallback(async () => {
    try {
      const res = await apiGL('/api/gl/learning-links/settings');
      setGating(res?.gating || null);
      if (Array.isArray(res?.resource_types) && res.resource_types.length) {
        setResourceTypes(res.resource_types);
      }
    } catch (err) {
      setError(err.message || 'Chargement des réglages impossible');
    }
  }, []);

  const loadLinks = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filters.questionDataset) params.set('questionDataset', filters.questionDataset);
      if (filters.resourceType) params.set('resourceType', filters.resourceType);
      if (filters.status) params.set('status', filters.status);
      const qs = params.toString();
      const res = await apiGL(`/api/gl/learning-links${qs ? `?${qs}` : ''}`);
      setLinks(Array.isArray(res?.links) ? res.links : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement des liens impossible');
    }
  }, [filters]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  async function createLink(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await apiGL('/api/gl/learning-links', 'POST', {
        question_dataset: createForm.question_dataset,
        resource_type: createForm.resource_type,
        resource_ref: createForm.resource_ref.trim(),
        question_code: createForm.question_code.trim().toUpperCase(),
        is_gating: createForm.is_gating,
        note: createForm.note.trim() || null,
        origin: 'manual',
        status: 'approved',
      });
      setInfo('Lien enregistré.');
      setCreateForm({ ...EMPTY_CREATE_FORM, question_dataset: createForm.question_dataset });
      await loadLinks();
    } catch (err) {
      setError(err.message || 'Création impossible');
    } finally {
      setBusy(false);
    }
  }

  async function toggleGatingFlag(link) {
    setBusy(true);
    setError('');
    try {
      await apiGL(`/api/gl/learning-links/${link.id}`, 'PATCH', {
        is_gating: !Number(link.is_gating),
      });
      await loadLinks();
    } catch (err) {
      setError(err.message || 'Mise à jour impossible');
    } finally {
      setBusy(false);
    }
  }

  async function setLinkStatus(link, status) {
    setBusy(true);
    setError('');
    try {
      await apiGL(`/api/gl/learning-links/${link.id}`, 'PATCH', { status });
      await loadLinks();
    } catch (err) {
      setError(err.message || 'Mise à jour impossible');
    } finally {
      setBusy(false);
    }
  }

  async function deleteLink(link) {
    setBusy(true);
    setError('');
    try {
      await apiGL(`/api/gl/learning-links/${link.id}`, 'DELETE');
      setInfo('Lien supprimé.');
      await loadLinks();
    } catch (err) {
      setError(err.message || 'Suppression impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gl-admin-section fade-in">
      <h3>Conditionnement par QCM</h3>
      <p className="gl-hint">
        Relie une ressource pédagogique (espèce, terme du glossaire, tutoriel, feuillet…) à une
        question. Quand le conditionnement est actif, l'élève doit réussir la question avant de
        pouvoir marquer la ressource comme apprise.
      </p>
      {gating ? (
        <p className="gl-hint">
          Conditionnement global :{' '}
          <strong>{gating.enabled ? '✅ actif' : '⏸️ inactif (les liens sont sans effet)'}</strong>
          {' — '}mode par défaut « {gating.defaultMode} », nouvelle tentative après{' '}
          {gating.retryCooldownDays} jour(s). Ces réglages se modifient dans{' '}
          <strong>Réglages plateforme → Conditionnement par QCM</strong> (admin).
        </p>
      ) : null}
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-hint">{info}</p> : null}

      <form onSubmit={createLink} className="gl-admin-form">
        <h4>Ajouter un lien ressource ↔ question</h4>
        <div className="gl-admin-form-grid">
          <label>
            Jeu de questions
            <select
              value={createForm.question_dataset}
              onChange={(e) => setCreateForm({ ...createForm, question_dataset: e.target.value })}
            >
              <option value="qcm">{DATASET_LABELS.qcm}</option>
              <option value="qcm_lore">{DATASET_LABELS.qcm_lore}</option>
            </select>
          </label>
          <label>
            Type de ressource
            <select
              value={createForm.resource_type}
              onChange={(e) => setCreateForm({ ...createForm, resource_type: e.target.value })}
            >
              {resourceTypes.map((t) => (
                <option key={t} value={t}>
                  {RESOURCE_TYPE_LABELS[t] || t}
                </option>
              ))}
            </select>
          </label>
          <label>
            Référence de la ressource
            <input
              type="text"
              value={createForm.resource_ref}
              onChange={(e) => setCreateForm({ ...createForm, resource_ref: e.target.value })}
              placeholder="code espèce / terme / id tutoriel…"
              required
            />
          </label>
          <label>
            Code question
            <input
              type="text"
              value={createForm.question_code}
              onChange={(e) => setCreateForm({ ...createForm, question_code: e.target.value })}
              placeholder="QF001 / LQCM001…"
              required
            />
          </label>
          <label>
            Note (optionnelle)
            <input
              type="text"
              value={createForm.note}
              onChange={(e) => setCreateForm({ ...createForm, note: e.target.value })}
              maxLength={255}
            />
          </label>
          <label className="gl-admin-form-checkbox">
            <input
              type="checkbox"
              checked={createForm.is_gating}
              onChange={(e) => setCreateForm({ ...createForm, is_gating: e.target.checked })}
            />
            <span>Bloquant (la réussite conditionne le « marquer appris »)</span>
          </label>
        </div>
        <button type="submit" className="gl-btn" disabled={busy}>
          Ajouter le lien
        </button>
      </form>

      <div className="gl-admin-filters">
        <label>
          Jeu
          <select
            value={filters.questionDataset}
            onChange={(e) => setFilters({ ...filters, questionDataset: e.target.value })}
          >
            <option value="">Tous</option>
            <option value="qcm">{DATASET_LABELS.qcm}</option>
            <option value="qcm_lore">{DATASET_LABELS.qcm_lore}</option>
          </select>
        </label>
        <label>
          Type
          <select
            value={filters.resourceType}
            onChange={(e) => setFilters({ ...filters, resourceType: e.target.value })}
          >
            <option value="">Tous</option>
            {resourceTypes.map((t) => (
              <option key={t} value={t}>
                {RESOURCE_TYPE_LABELS[t] || t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Statut
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">Tous</option>
            <option value="approved">{STATUS_LABELS.approved}</option>
            <option value="suggested">{STATUS_LABELS.suggested}</option>
            <option value="rejected">{STATUS_LABELS.rejected}</option>
          </select>
        </label>
      </div>

      {links.length === 0 ? (
        <p className="gl-hint">Aucun lien pour ces filtres.</p>
      ) : (
        <div className="gl-admin-table-wrap">
          <table className="gl-admin-table">
            <thead>
              <tr>
                <th>Jeu</th>
                <th>Ressource</th>
                <th>Question</th>
                <th>Bloquant</th>
                <th>Statut</th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id}>
                  <td>{DATASET_LABELS[link.question_dataset] || link.question_dataset}</td>
                  <td>
                    {RESOURCE_TYPE_LABELS[link.resource_type] || link.resource_type}
                    {' — '}
                    <code>{link.resource_ref}</code>
                  </td>
                  <td>
                    <code>{link.question_code}</code>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={!!Number(link.is_gating)}
                      disabled={busy}
                      onChange={() => toggleGatingFlag(link)}
                      aria-label="Bloquant"
                    />
                  </td>
                  <td>
                    <select
                      value={link.status}
                      disabled={busy}
                      onChange={(e) => setLinkStatus(link, e.target.value)}
                      aria-label="Statut du lien"
                    >
                      <option value="approved">{STATUS_LABELS.approved}</option>
                      <option value="suggested">{STATUS_LABELS.suggested}</option>
                      <option value="rejected">{STATUS_LABELS.rejected}</option>
                    </select>
                  </td>
                  <td>{link.note || ''}</td>
                  <td>
                    <button
                      type="button"
                      className="gl-btn gl-btn--danger"
                      disabled={busy}
                      onClick={() => deleteLink(link)}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
