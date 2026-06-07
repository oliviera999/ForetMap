import React from 'react';
import { GLQcmCatalogPanel } from './GLQcmCatalogPanel.jsx';

export function GLQcmLoreImportPanel() {
  return (
    <GLQcmCatalogPanel
      title="Import QCM lore (XLSX)"
      hint={(
        <>
          Fichier attendu : feuilles <code>chapitres</code>, <code>categories</code> et <code>questions</code>
          {' '}
          (voir <code>data/gl/README.md</code>).
        </>
      )}
      scopeQueryKey="chapitreSlug"
      scopeLabel="Chapitre lore"
      scopePlaceholder="tous"
      exportFilterHint="L’export utilise les filtres chapitre / catégorie ci-dessous s’ils sont renseignés."
      listMeta={(item) => `(${item.chapitre_slug} / ${item.categorie_slug} / ${item.tier_lore || 'recit'})`}
      adminBasePath="/api/gl/lore/admin/qcm"
      questionsListPath="/api/gl/lore/qcm/questions"
      presentPath={(code) => `/api/gl/lore/qcm/questions/${encodeURIComponent(code)}/present`}
      answerPath={(code) => `/api/gl/lore/qcm/questions/${encodeURIComponent(code)}/answer`}
      templateFilename="foretmap-gl-modele-qcm-lore.xlsx"
      exportFilename="foretmap-gl-export-qcm-lore.xlsx"
    />
  );
}
