import React from 'react';
import { getVisitMascotCatalog } from '../../utils/visitMascotCatalog.js';

export function GLMascotsAdminView() {
  const catalog = getVisitMascotCatalog();
  return (
    <section className="gl-panel">
      <h2>Gestion mascottes</h2>
      <p>Catalogue disponible pour l&apos;assignation aux equipes.</p>
      <ul className="gl-mascot-list">
        {catalog.map((item) => (
          <li key={item.id}>
            <strong>{item.label}</strong> — <code>{item.id}</code> ({item.renderer})
          </li>
        ))}
      </ul>
    </section>
  );
}
