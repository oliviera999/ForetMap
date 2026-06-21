import React from 'react';
import { GLQcmCatalogPanel } from './GLQcmCatalogPanel.jsx';

export function GLQcmImportPanel({ glossaryLinkItems = [], onOpenGlossaryTerm }) {
  return (
    <GLQcmCatalogPanel
      title="Import QCM biomes (XLSX)"
      hint={
        <>
          Fichier attendu : feuilles <code>categories</code> et <code>questions</code> (voir{' '}
          <code>data/gl/README.md</code>).
        </>
      }
      scopeQueryKey="biomeSlug"
      scopeLabel="Biome slug"
      scopePlaceholder="sahara"
      exportFilterHint="L’export utilise les filtres biome / catégorie ci-dessous s’ils sont renseignés."
      listMeta={(item) => `(${item.biome_slug} / ${item.categorie_slug})`}
      adminBasePath="/api/gl/admin/qcm"
      questionsListPath="/api/gl/admin/qcm/questions"
      presentPath={(code) => `/api/gl/qcm/questions/${encodeURIComponent(code)}/present`}
      answerPath={(code) => `/api/gl/qcm/questions/${encodeURIComponent(code)}/answer`}
      templateFilename="foretmap-gl-modele-qcm.xlsx"
      exportFilename="foretmap-gl-export-qcm.xlsx"
      qcmSet="biome"
      glossaryLinkItems={glossaryLinkItems}
      onOpenGlossaryTerm={onOpenGlossaryTerm}
    />
  );
}
