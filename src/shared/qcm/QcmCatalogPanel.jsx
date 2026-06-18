import React, { useCallback, useEffect, useState } from 'react';
import { fileToDataUrl } from '../../utils/fileToDataUrl.js';
import { buildExportQuery, buildQuestionsListQuery } from './qcmCatalogPanelQuery.js';
import { QcmPreviewModal } from './QcmPreviewModal.jsx';

/**
 * Panneau catalogue QCM paramétrable (import XLSX, export, liste, aperçu).
 */
export function QcmCatalogPanel({
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
  request,
  downloadFile,
  FeedbackBlock,
  Button,
  Field,
  Input,
  Select,
  classNames = {},
}) {
  const {
    section = 'gl-admin-section fade-in',
    hint: hintClass = 'gl-hint',
    error: errorClass = 'gl-error',
    actions = 'gl-inline-actions',
    form = 'gl-admin-form',
    checkboxRow = 'gl-checkbox-row',
    report = 'gl-import-report',
    divider = 'gl-divider',
    filters = 'gl-qcm__filters',
    list = 'gl-qcm-admin-list',
    row = 'gl-qcm-admin-row',
  } = classNames;

  const [file, setFile] = useState(null);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [importReport, setImportReport] = useState(null);
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
      await downloadFile(path, filename);
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
      const data = await request(`${adminBasePath}/stats`);
      setStats(data);
    } catch (_) {
      setStats(null);
    }
  }

  const loadList = useCallback(async () => {
    try {
      const query = buildQuestionsListQuery({ scopeQueryKey, scopeSlug, categorieSlug, search });
      const data = await request(`${questionsListPath}?${query}`);
      setItems(Array.isArray(data?.items) ? data.items : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement questions impossible');
      setItems([]);
    }
  }, [scopeSlug, categorieSlug, search, scopeQueryKey, questionsListPath, request]);

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
    setImportReport(null);
    try {
      const fileDataBase64 = await fileToDataUrl(file);
      const result = await request(`${adminBasePath}/import`, 'POST', {
        fileName: file.name,
        fileDataBase64,
        dryRun,
      });
      setImportReport(result?.report || null);
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
      const data = await request(presentPath(code));
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
      const data = await request(answerPath(previewCode), 'POST', {
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
    <section className={section}>
      <h3>{title}</h3>
      <p className={hintClass}>{hint}</p>
      {error ? <p className={errorClass}>{error}</p> : null}
      {info ? <p className={hintClass}>{info}</p> : null}
      {stats ? (
        <p className={hintClass}>
          Catalogue actuel : <strong>{stats.total || 0}</strong> question(s) actives — liens
          glossaire : <strong>{stats.glossaryLinks || 0}</strong>
        </p>
      ) : null}

      <div className={actions}>
        <Button type="button" variant="secondary" onClick={downloadTemplate} disabled={loading}>
          Modèle XLSX
        </Button>
        <Field label="Export">
          <Select value={exportStatut} onChange={(e) => setExportStatut(e.target.value)}>
            <option value="actif">Questions actives</option>
            <option value="all">Tous les statuts</option>
          </Select>
        </Field>
        <Button type="button" variant="secondary" onClick={downloadExport} disabled={loading}>
          Exporter le catalogue
        </Button>
      </div>
      <p className={hintClass}>{exportFilterHint}</p>

      <form className={form} onSubmit={runImport}>
        <Field label="Fichier XLSX">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </Field>
        <label className={checkboxRow}>
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
          Simulation (dry-run)
        </label>
        <Button type="submit" disabled={loading}>
          {loading ? 'Import…' : dryRun ? 'Simuler' : 'Importer'}
        </Button>
      </form>

      {importReport ? (
        <pre className={report}>{JSON.stringify(importReport, null, 2)}</pre>
      ) : null}

      <hr className={divider} />

      <h4>Aperçu questions</h4>
      <div className={filters}>
        <Field label={scopeLabel}>
          <Input
            value={scopeSlug}
            onChange={(e) => setScopeSlug(e.target.value)}
            placeholder={scopePlaceholder}
          />
        </Field>
        <Field label="Catégorie slug">
          <Input
            value={categorieSlug}
            onChange={(e) => setCategorieSlug(e.target.value)}
            placeholder="vivant_classification"
          />
        </Field>
        <Field label="Recherche">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="trame…"
          />
        </Field>
      </div>

      <div className={list}>
        {items.slice(0, 30).map((item) => (
          <div key={item.question_code} className={row}>
            <div>
              <strong>{item.question_code}</strong>{' '}
              <span className={hintClass}>{listMeta(item)}</span>
              <p>{item.question}</p>
            </div>
            <Button type="button" onClick={() => openPreview(item.question_code)}>
              Présenter
            </Button>
          </div>
        ))}
        {items.length > 30 ? (
          <p className={hintClass}>
            Affichage limité aux 30 premières questions filtrées ({items.length} au total).
          </p>
        ) : null}
      </div>

      <QcmPreviewModal
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
        FeedbackBlock={FeedbackBlock}
        Button={Button}
        classNames={classNames.previewModal}
      />
    </section>
  );
}
