import React from 'react';
import { apiGL } from '../../services/apiGL.js';
import { downloadGlFile } from '../../utils/downloadGlFile.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';
import { GLQcmFeedbackBlock } from '../GLQcmFeedbackBlock.jsx';
import { QcmCatalogPanel } from '../../../shared/qcm/QcmCatalogPanel.jsx';

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
  qcmSet = null,
  glossaryLinkItems = [],
  loreGlossaryLinkItems = [],
  onOpenGlossaryTerm,
  onOpenLoreTerm,
  showQuestionList = false,
  enableAdminFilters = false,
  onEditQuestion = null,
}) {
  return (
    <QcmCatalogPanel
      title={title}
      hint={hint}
      scopeQueryKey={scopeQueryKey}
      scopeLabel={scopeLabel}
      scopePlaceholder={scopePlaceholder}
      exportFilterHint={exportFilterHint}
      listMeta={listMeta}
      adminBasePath={adminBasePath}
      questionsListPath={questionsListPath}
      presentPath={presentPath}
      answerPath={answerPath}
      templateFilename={templateFilename}
      exportFilename={exportFilename}
      request={apiGL}
      downloadFile={downloadGlFile}
      FeedbackBlock={GLQcmFeedbackBlock}
      Button={GLButton}
      Field={GLField}
      Input={GLInput}
      Select={GLSelect}
      qcmSet={qcmSet}
      glossaryLinkItems={glossaryLinkItems}
      loreGlossaryLinkItems={loreGlossaryLinkItems}
      onOpenGlossaryTerm={onOpenGlossaryTerm}
      onOpenLoreTerm={onOpenLoreTerm}
      showQuestionList={showQuestionList}
      enableAdminFilters={enableAdminFilters}
      onEditQuestion={onEditQuestion}
    />
  );
}
