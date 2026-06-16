import React, { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { downloadGlFile } from '../../utils/downloadGlFile.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';
import { GLQcmPreviewModal } from './GLQcmPreviewModal.jsx';
import { fileToDataUrl } from '../../../utils/fileToDataUrl.js';
import { buildExportQuery, buildQuestionsListQuery } from '../../utils/glQcmCatalogPanel.js';

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
      'Modèle XLSX téléchargé.',
    );
  }

  function downloadExport() {
    const query = buildExportQuery({ exportStatut, scopeQueryKey, scopeSlug, categorieSlug });
    return runDownload(
      `${adminBasePath}/export${query ? `?${query}` : ''}`,
      exportFilename,
      'Export XLSX généré.',
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
      const query = buildQuestionsListQuery({ scopeQueryKey, scopeSlug, categorieSlug, search });
      const data = await apiGL(`${questionsListPath}?${query}`);
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
          Catalogue actuel : <strong>{stats.total || 0}</strong> question(s) actives — liens
          glossaire : <strong>{stats.glossaryLinks || 0}</strong>
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
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </GLField>
        <label className="gl-checkbox-row">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Simulation (dry-run)
        </label>
        <GLButton type="submit" disabled={loading}>
          {loading ? 'Import…' : dryRun ? 'Simuler' : 'Importer'}
        </GLButton>
      </form>

      {report ? <pre className="gl-import-report">{JSON.stringify(report, null, 2)}</pre> : null}

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
          <GLInput
            value={categorieSlug}
            onChange={(e) => setCategorieSlug(e.target.value)}
            placeholder="cosmologie"
          />
        </GLField>
        <GLField label="Recherche">
          <GLInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="trame…"
          />
        </GLField>
      </div>

      <div className="gl-qcm-admin-list">
        {items.slice(0, 30).map((item) => (
          <div key={item.question_code} className="gl-qcm-admin-row">
            <div>
              <strong>{item.question_code}</strong>{' '}
              <span className="gl-hint">{listMeta(item)}</span>
              <p>{item.question}</p>
            </div>
            <GLButton type="button" onClick={() => openPreview(item.question_code)}>
              Présenter
            </GLButton>
          </div>
        ))}
        {items.length > 30 ? (
          <p className="gl-hint">
            Affichage limité aux 30 premières questions filtrées ({items.length} au total).
          </p>
        ) : null}
      </div>

      <GLQcmPreviewModal
        previewCode={previewCode}
        presentLoading={presentLoading}
        answerLoading={answerLoading}
        presentation={presentation}
        feedback={feedback}
        selectedChoiceId={selectedChoiceId}
        onReload={reloadPresentation}
        onSelectChoice={setSelectedChoiceId}
        onSubmitAnswer={submitPreviewAnswer}
        onClose={() => setPreviewCode(null)}
        onCloseFromFeedback={() => {
          setPreviewCode(null);
          setFeedback(null);
        }}
      />
    </section>
  );
}
