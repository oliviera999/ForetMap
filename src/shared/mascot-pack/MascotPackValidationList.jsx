import React from 'react';

/**
 * Liste d’erreurs de validation pack (visite ou GL).
 * @param {{ issueLines?: string[], className?: string, title?: string }} props
 */
export function MascotPackValidationList({
  issueLines = [],
  className = 'mascot-pack-validation-list',
  title = 'Erreurs de validation',
}) {
  if (!Array.isArray(issueLines) || issueLines.length === 0) return null;
  return (
    <div className={className} role="alert" style={{ marginTop: 8 }}>
      <strong>{title}</strong>
      <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
        {issueLines.map((line) => (
          <li key={line} style={{ fontSize: '0.9rem' }}>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
