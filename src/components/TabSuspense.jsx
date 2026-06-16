import React, { Suspense } from 'react';

/** Fallback commun pour les onglets chargés en lazy. */
export function TabSuspense({ children }) {
  return (
    <Suspense
      fallback={
        <div className="loader tab-loading" style={{ minHeight: '40vh', padding: '24px 16px' }}>
          <div className="loader-leaf">🌿</div>
          <p className="section-sub">Chargement…</p>
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
