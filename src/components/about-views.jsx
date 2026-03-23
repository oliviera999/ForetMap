import React from 'react';

function AboutView({ appVersion }) {
  const docsLinks = [
    { label: 'CHANGELOG', href: '/CHANGELOG.md', desc: 'Historique des modifications publiées' },
    { label: 'README', href: '/README.md', desc: 'Présentation du projet et installation' },
    { label: 'API', href: '/docs/API.md', desc: 'Routes backend et formats JSON' },
    { label: 'LOCAL_DEV', href: '/docs/LOCAL_DEV.md', desc: 'Mise en place locale (Docker + tests)' },
    { label: 'EVOLUTION', href: '/docs/EVOLUTION.md', desc: 'Feuille de route d\'évolution' },
    { label: 'VERSIONING', href: '/docs/VERSIONING.md', desc: 'Règles de versionnage SemVer' },
  ];

  return (
    <div className="fade-in">
      <h2 className="section-title">ℹ️ À propos</h2>
      <p className="section-sub">Informations du projet ForetMap</p>

      <div className="about-grid">
        <div className="about-card">
          <h3>Objet de l'application</h3>
          <p>
            ForetMap aide les élèves et les professeurs du Lycée Lyautey à organiser les activités de la forêt
            comestible: suivi des zones, de la biodiversité, des tâches et des observations.
          </p>
          <div className="about-meta">
            <span className="about-chip">Version: {appVersion || 'indisponible'}</span>
            <span className="about-chip">Auteur: Mohammed El Farrai</span>
            <span className="about-chip">Contributeur: oliviera999</span>
          </div>
        </div>

        <div className="about-card">
          <h3>Documentation</h3>
          <div className="about-links">
            {docsLinks.map(link => (
              <a key={link.label} className="about-link" href={link.href} target="_blank" rel="noopener noreferrer">
                <strong>{link.label}</strong><br />
                <small>{link.desc}</small>
              </a>
            ))}
          </div>
        </div>

        <div className="about-card">
          <h3>Dépôt GitHub</h3>
          <a className="about-link" href="https://github.com/oliviera999/ForetMap" target="_blank" rel="noopener noreferrer">
            <strong>github.com/oliviera999/ForetMap</strong><br />
            <small>Code source complet du projet</small>
          </a>
        </div>
      </div>
    </div>
  );
}

export { AboutView };
