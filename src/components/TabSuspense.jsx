import { Suspense } from 'react';
import { IconLeaf } from '../shared/icons.jsx';
import { ScreenLoadBoundary } from '../shared/components/ScreenLoadBoundary.jsx';

/** Fallback commun pour les onglets chargés en lazy. */
export function TabSuspense({ children }) {
  return (
    <ScreenLoadBoundary>
      <Suspense
        fallback={
          <div className="loader tab-loading" style={{ minHeight: '40vh', padding: '24px 16px' }}>
            <div className="loader-leaf">
              <IconLeaf size={48} />
            </div>
            <p className="section-sub">Chargement…</p>
          </div>
        }
      >
        {children}
      </Suspense>
    </ScreenLoadBoundary>
  );
}
