import React from 'react';
import { api } from '../../../services/api.js';
import { downloadApiFile } from '../../../utils/downloadApiFile.js';
import { PedagoQcmFeedbackBlock } from '../PedagoQcmFeedbackBlock.jsx';
import { QcmCatalogPanel } from '../../../shared/qcm/QcmCatalogPanel.jsx';

function FmButton({ type = 'button', variant, onClick, disabled, children }) {
  const className =
    variant === 'ghost' ? 'btn-ghost' : variant === 'secondary' ? 'btn-ghost' : 'btn-primary';
  return (
    <button type={type} className={className} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function FmField({ label, children }) {
  return (
    <label className="pedago-filter-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function FmInput(props) {
  return <input className="form-input" {...props} />;
}

function FmSelect({ children, ...props }) {
  return (
    <select className="form-select" {...props}>
      {children}
    </select>
  );
}

const FM_QCM_CLASS_NAMES = {
  section: 'card pedago-qcm-admin fade-in',
  hint: 'section-sub',
  error: 'section-sub pedago-qcm-admin__error',
  actions: 'pedago-qcm-admin__actions',
  form: 'pedago-qcm-admin__form',
  checkboxRow: 'pedago-qcm-admin__checkbox',
  report: 'pedago-qcm-admin__report',
  divider: 'pedago-qcm-admin__divider',
  filters: 'pedago-filters',
  list: 'pedago-qcm-admin__list',
  row: 'pedago-qcm-admin__row',
  previewModal: {
    root: 'pedago-qcm-admin__preview',
    body: 'pedago-qcm-admin__preview-body',
    question: 'pedago-quiz__question',
    choices: 'pedago-quiz__choices',
    choice: 'pedago-quiz__choice',
    actions: 'pedago-quiz__actions',
    hint: 'section-sub',
    error: 'section-sub pedago-qcm-admin__error',
  },
};

export function FMQuizCatalogPanel({ showQuestionList = true, onEditQuestion = null }) {
  return (
    <QcmCatalogPanel
      title="Catalogue Quiz (QCM)"
      hint={
        <>
          Import et export XLSX du catalogue par défaut (feuilles <code>categories</code> et{' '}
          <code>questions</code>). Utilisez la section « Édition des questions » ci-dessous pour
          parcourir, filtrer et modifier les fiches.
        </>
      }
      scopeQueryKey="theme"
      scopeLabel="Thème"
      scopePlaceholder="sciences"
      exportFilterHint="L’export utilise les filtres thème / catégorie ci-dessous s’ils sont renseignés."
      listMeta={(item) => `(${item.theme || '—'} / ${item.categorie_slug})`}
      adminBasePath="/api/quiz/admin"
      questionsListPath="/api/quiz/admin/questions"
      presentPath={(code) => `/api/quiz/questions/${encodeURIComponent(code)}/present`}
      answerPath={(code) => `/api/quiz/questions/${encodeURIComponent(code)}/answer`}
      templateFilename="foretmap-modele-qcm.xlsx"
      exportFilename="foretmap-export-qcm.xlsx"
      showQuestionList={showQuestionList}
      enableAdminFilters={showQuestionList}
      onEditQuestion={onEditQuestion}
      request={api}
      downloadFile={downloadApiFile}
      FeedbackBlock={PedagoQcmFeedbackBlock}
      Button={FmButton}
      Field={FmField}
      Input={FmInput}
      Select={FmSelect}
      classNames={FM_QCM_CLASS_NAMES}
    />
  );
}
