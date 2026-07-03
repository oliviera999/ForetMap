import React from 'react';

/** Palettes des bandeaux d'app (mêmes valeurs que les anciens styles inline d'App.jsx). */
const TONE_STYLES = {
  warning: { background: '#fef3c7', border: '1px solid #f59e0b', color: '#78350f' },
  info: { background: '#eff6ff', border: '1px solid #93c5fd', color: '#1e3a8a' },
};

/**
 * Bandeau d'alerte transverse de l'app (serveur indisponible, session non validée…).
 * Factorise les styles inline partagés (margin / padding / borderRadius / fontSize)
 * des anciens blocs `serverDown` et `sessionValidationError` d'App.jsx — iso-rendu.
 *
 * @param {object} props
 * @param {'warning'|'info'} [props.tone] Palette du bandeau (défaut : warning).
 * @param {React.ReactNode} props.children Contenu du message.
 * @param {{ label: React.ReactNode, onClick: () => void }} [props.action] Bouton d'action optionnel.
 */
export function NoticeBanner({ tone = 'warning', children, action }) {
  const toneStyle = TONE_STYLES[tone] || TONE_STYLES.warning;
  return (
    <div
      className="fade-in"
      role="alert"
      style={{
        margin: '8px 12px 0',
        padding: '10px 14px',
        borderRadius: 12,
        fontSize: '.9rem',
        ...toneStyle,
      }}
    >
      {children}
      {action && (
        <button
          type="button"
          className="btn btn-sm"
          style={{ marginLeft: 10, verticalAlign: 'middle' }}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
