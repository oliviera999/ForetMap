import React from 'react';
import { getRoleTerms } from '../utils/n3-terminology';
import { useHelp } from '../hooks/useHelp';

function AboutView({ appVersion, isN3Affiliated = false, publicSettings = null, isTeacher = false }) {
  const roleTerms = getRoleTerms(isN3Affiliated);
  const { resetHelp, metrics, resetHelpMetrics } = useHelp({ publicSettings, isTeacher });
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
            ForetMap aide les {roleTerms.studentPlural} et les {roleTerms.teacherPlural} du Lycée Lyautey à organiser les activités de la forêt
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

        <div className="about-card">
          <h3>Aide contextuelle</h3>
          <p>
            Si les bulles d aide ont ete masquées, tu peux les reactiver ici.
          </p>
          <div className="about-meta">
            <span className="about-chip">Ouvertures panneau aide: {Number(metrics?.panelOpenCount || 0)}</span>
            <span className="about-chip">Masquages "Ne plus afficher": {Number(metrics?.panelDismissCount || 0)}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={resetHelp}>
              Reactiver toutes les aides
            </button>
            <button className="btn btn-ghost btn-sm" onClick={resetHelpMetrics}>
              Reinitialiser les compteurs d aide
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { AboutView };
