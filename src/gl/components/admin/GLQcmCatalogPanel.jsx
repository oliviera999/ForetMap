import React, { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { downloadGlFile } from '../../utils/downloadGlFile.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';
import { GLQcmFeedbackBlock } from '../GLQcmFeedbackBlock.jsx';
import { hasQcmAnswerFeedback } from '../../utils/glQcmDisplay.js';

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
    reader.readAsDataURL(file);
  });
}

export function GLQcmCatalogPanel({
  title,
  hint,
  scopeQueryKey,
  scopeLabel,
  scopePlaceholder,
  exportFilterHint,
  listMeta,
  adminBasePath,
  questionsListPath,
  presentPath,
  answerPath,
  templateFilename,
  exportFilename,
}) {
  const [file, setFile] = useState(null);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [report, setReport] = useState(null);
  const [stats, setStats] = useState(null);
  const [scopeSlug, setScopeSlug] = useState('');
  const [categorieSlug, setCategorieSlug] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [previewCode, setPreviewCode] = useState(null);
  const [presentation, setPresentation] = useState(null);
  const [presentLoading, setPresentLoading] = useState(false);
  const [answerLoading, setAnswerLoading] = useState(false);
  const [selectedChoiceId, setSelectedChoiceId] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [exportStatut, setExportStatut] = useState('actif');

  async function runDownload(path, filename, successMessage) {
    setLoading(true);
    setError('');
    setInfo('');
    try {
      await downloadGlFile(path, filename);
      setInfo(successMessage);
    } catch (err) {
      setError(err.message || 'Erreur de téléchargement');
    } finally {
      setLoading(false);
    }
  }

  function downloadTemplate() {
    return runDownload(
      `${adminBasePath}/import/template`,
      templateFilename,
      'Modèle XLSX téléchargé.'
    );
  }

  function downloadExport() {
    const params = new URLSearchParams();
    if (exportStatut === 'all') params.set('statut', 'all');
    if (scopeSlug.trim()) params.set(scopeQueryKey, scopeSlug.trim());
    if (categorieSlug.trim()) params.set('categorieSlug', categorieSlug.trim());
    const query = params.toString();
    return runDownload(
      `${adminBasePath}/export${query ? `?${query}` : ''}`,
      exportFilename,
      'Export XLSX généré.'
    );
  }

  async function loadStats() {
    try {
      const data = await apiGL(`${adminBasePath}/stats`);
      setStats(data);
    } catch (_) {
      setStats(null);
    }
  }

  const loadList = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (scopeSlug.trim()) params.set(scopeQueryKey, scopeSlug.trim());
      if (categorieSlug.trim()) params.set('categorieSlug', categorieSlug.trim());
      if (search.trim()) params.set('q', search.trim());
      const data = await apiGL(`${questionsListPath}?${params.toString()}`);
      setItems(Array.isArray(data?.items) ? data.items : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement questions impossible');
      setItems([]);
    }
  }, [scopeSlug, categorieSlug, search, scopeQueryKey, questionsListPath]);

  useEffect(() => {
    loadStats();
  }, [adminBasePath]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  async function runImport(event) {
    event.preventDefault();
    if (!file) {
      setError('Sélectionnez un fichier XLSX');
      return;
    }
    setLoading(true);
    setError('');
    setInfo('');
    setReport(null);
    try {
      const fileDataBase64 = await fileToDataUrl(file);
      const result = await apiGL(`${adminBasePath}/import`, 'POST', {
        fileName: file.name,
        fileDataBase64,
        dryRun,
      });
      setReport(result?.report || null);
      setInfo(dryRun ? 'Simulation terminée.' : 'Import terminé.');
      if (!dryRun) {
        await loadStats();
        await loadList();
      }
    } catch (err) {
      setError(err.message || 'Import impossible');
    } finally {
      setLoading(false);
    }
  }

  async function openPreview(code) {
    setPreviewCode(code);
    setPresentation(null);
    setSelectedChoiceId(null);
    setFeedback(null);
    setPresentLoading(true);
    try {
      const data = await apiGL(presentPath(code));
      setPresentation(data);
    } catch (err) {
      setFeedback({ error: err.message || 'Présentation impossible' });
    } finally {
      setPresentLoading(false);
    }
  }

  async function reloadPresentation() {
    if (!previewCode) return;
    await openPreview(previewCode);
  }

  async function submitPreviewAnswer() {
    if (!previewCode || !presentation?.presentationToken || selectedChoiceId == null) return;
    setAnswerLoading(true);
    setFeedback(null);
    try {
      const data = await apiGL(answerPath(previewCode), 'POST', {
        presentationToken: presentation.presentationToken,
        choiceId: selectedChoiceId,
      });
      setFeedback(data);
    } catch (err) {
      setFeedback({ error: err.message || 'Validation impossible' });
    } finally {
      setAnswerLoading(false);
    }
  }

  return (
    <section className="gl-admin-section fade-in">
      <h3>{title}</h3>
      <p className="gl-hint">{hint}</p>
      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <p className="gl-hint">{info}</p> : null}
      {stats ? (
        <p className="gl-hint">
          Catalogue actuel :
          {' '}
          <strong>{stats.total || 0}</strong>
          {' '}
          question(s) actives — liens glossaire :
          {' '}
          <strong>{stats.glossaryLinks || 0}</strong>
        </p>
      ) : null}

      <div className="gl-inline-actions">
        <GLButton type="button" variant="secondary" onClick={downloadTemplate} disabled={loading}>
          Modèle XLSX
        </GLButton>
        <GLField label="Export">
          <GLSelect value={exportStatut} onChange={(e) => setExportStatut(e.target.value)}>
            <option value="actif">Questions actives</option>
            <option value="all">Tous les statuts</option>
          </GLSelect>
        </GLField>
        <GLButton type="button" variant="secondary" onClick={downloadExport} disabled={loading}>
          Exporter le catalogue
        </GLButton>
      </div>
      <p className="gl-hint">{exportFilterHint}</p>

      <form className="gl-admin-form" onSubmit={runImport}>
        <GLField label="Fichier XLSX">
          <input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </GLField>
        <label className="gl-checkbox-row">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Simulation (dry-run)
        </label>
        <GLButton type="submit" disabled={loading}>
          {loading ? 'Import…' : dryRun ? 'Simuler' : 'Importer'}
        </GLButton>
      </form>

      {report ? (
        <pre className="gl-import-report">{JSON.stringify(report, null, 2)}</pre>
      ) : null}

      <hr className="gl-divider" />

      <h4>Aperçu questions</h4>
      <div className="gl-qcm__filters">
        <GLField label={scopeLabel}>
          <GLInput
            value={scopeSlug}
            onChange={(e) => setScopeSlug(e.target.value)}
            placeholder={scopePlaceholder}
          />
        </GLField>
        <GLField label="Catégorie slug">
          <GLInput value={categorieSlug} onChange={(e) => setCategorieSlug(e.target.value)} placeholder="cosmologie" />
        </GLField>
        <GLField label="Recherche">
          <GLInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="trame…" />
        </GLField>
      </div>

      <div className="gl-qcm-admin-list">
        {items.slice(0, 30).map((item) => (
          <div key={item.question_code} className="gl-qcm-admin-row">
            <div>
              <strong>{item.question_code}</strong>
              {' '}
              <span className="gl-hint">{listMeta(item)}</span>
              <p>{item.question}</p>
            </div>
            <GLButton type="button" onClick={() => openPreview(item.question_code)}>
              Présenter
            </GLButton>
          </div>
        ))}
        {items.length > 30 ? (
          <p className="gl-hint">Affichage limité aux 30 premières questions filtrées ({items.length} au total).</p>
        ) : null}
      </div>

      {previewCode ? (
        <div className="gl-qcm-modal gl-qcm-modal--inline" role="dialog" aria-label="Aperçu QCM">
          <div className="gl-qcm-modal__body">
            <h4>Aperçu — {previewCode}</h4>
            {presentLoading ? <p className="gl-hint">Chargement…</p> : null}
            {hasQcmAnswerFeedback(feedback) ? (
              <>
                <GLQcmFeedbackBlock result={feedback} />
                <div className="gl-inline-actions">
                  <GLButton type="button" onClick={reloadPresentation}>Nouvelle présentation</GLButton>
                  <GLButton type="button" variant="ghost" onClick={() => { setPreviewCode(null); setFeedback(null); }}>
                    Fermer
                  </GLButton>
                </div>
              </>
            ) : (
              <>
                {presentation?.question ? <p className="gl-qcm-modal__question">{presentation.question}</p> : null}
                {presentation?.choices?.length ? (
                  <div className="gl-qcm-modal__choices">
                    {presentation.choices.map((choice) => (
                      <label key={choice.id} className="gl-qcm-choice">
                        <input
                          type="radio"
                          name="preview-choice"
                          checked={selectedChoiceId === choice.id}
                          onChange={() => setSelectedChoiceId(choice.id)}
                        />
                        <span>{choice.text}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
                <div className="gl-inline-actions">
                  <GLButton type="button" onClick={reloadPresentation}>Re-mélanger</GLButton>
                  <GLButton
                    type="button"
                    onClick={submitPreviewAnswer}
                    disabled={answerLoading || selectedChoiceId == null}
                  >
                    Valider
                  </GLButton>
                  <GLButton type="button" variant="ghost" onClick={() => setPreviewCode(null)}>Fermer</GLButton>
                </div>
                {feedback?.error ? <p className="gl-error">{feedback.error}</p> : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
