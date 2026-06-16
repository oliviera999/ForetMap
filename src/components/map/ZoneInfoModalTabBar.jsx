import React from 'react';

/**
 * Barre d'onglets présentationnelle de ZoneInfoModal : rend la liste des onglets
 * disponibles et met en évidence l'onglet actif. Composant sans état : la liste
 * des onglets et l'onglet courant restent gérés par ZoneInfoModal.
 */
function ZoneInfoModalTabBar({ tabs, activeTab, onSelect }) {
  return (
    <div
      style={{
        display: 'flex',
        background: 'var(--parchment)',
        borderRadius: 10,
        padding: 3,
        marginBottom: 14,
        gap: 2,
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          style={{
            flex: 1,
            padding: '8px 4px',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontFamily: 'DM Sans,sans-serif',
            fontSize: '.8rem',
            fontWeight: activeTab === t.id ? 700 : 400,
            background: activeTab === t.id ? 'var(--forest)' : 'transparent',
            color: activeTab === t.id ? 'white' : 'var(--soil)',
            transition: 'all .15s',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export { ZoneInfoModalTabBar };
