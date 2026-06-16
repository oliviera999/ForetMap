import React from 'react';

/** Toast fixe en bas d’écran (ancre + panneau animé séparés). */
export function FixedToast({ children, className = '', role = 'status', ariaLive = 'polite' }) {
  if (children == null || children === '') return null;
  return (
    <div className="fm-toast-anchor" role="presentation">
      <div
        className={`fm-toast ${className}`.trim()}
        role={role}
        aria-live={ariaLive}
        aria-atomic="true"
      >
        {children}
      </div>
    </div>
  );
}
