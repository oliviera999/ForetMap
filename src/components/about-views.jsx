import React from 'react';
import { useHelp } from '../hooks/useHelp';
import { getContentText } from '../utils/content';

function AboutView({ appVersion, publicSettings = null, isTeacher = false }) {
  const { resetHelp, metrics, resetHelpMetrics } = useHelp({ publicSettings, isTeacher });
  const aboutTitle = getContentText(publicSettings, 'about.title', 'ℹ️ À propos');
  const aboutSubtitle = getContentText(publicSettings, 'about.subtitle', 'Informations du projet ForetMap');
  const aboutPurposeTitle = getContentText(publicSettings, 'about.purpose_title', "Objet de l'application");
  const aboutPurposeBody = getContentText(publicSettings, 'about.purpose_body', 'ForetMap aide les élèves et les enseignants du Lycée Lyautey à organiser les activités de la forêt comestible: suivi des zones, de la biodiversité, des tâches et des observations.');
  const aboutDocsTitle = getContentText(publicSettings, 'about.docs_title', 'Documentation');
  const aboutRepoTitle = getContentText(publicSettings, 'about.repo_title', 'Dépôt GitHub');
  const aboutHelpTitle = getContentText(publicSettings, 'about.help_title', 'Aide contextuelle');
  const aboutHelpBody = getContentText(publicSettings, 'about.help_body', 'Si les bulles d aide ont ete masquées, tu peux les reactiver ici.');
  const aboutHelpReenableLabel = getContentText(publicSettings, 'about.help_reenable_cta', 'Reactiver toutes les aides');
  const aboutHelpResetMetricsLabel = getContentText(publicSettings, 'about.help_reset_metrics_cta', 'Reinitialiser les compteurs d aide');
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
      <h2 className="section-title">{aboutTitle}</h2>
      <p className="section-sub">{aboutSubtitle}</p>

      <div className="about-grid">
        <div className="about-card">
          <h3>{aboutPurposeTitle}</h3>
          <p>
            {aboutPurposeBody}
          </p>
          <div className="about-meta">
            <span className="about-chip">Version: {appVersion || 'indisponible'}</span>
            <span className="about-chip">Auteur: Mohammed El Farrai</span>
            <span className="about-chip">Contributeur: oliviera999</span>
          </div>
        </div>

        <div className="about-card">
          <h3>{aboutDocsTitle}</h3>
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
          <h3>{aboutRepoTitle}</h3>
          <a className="about-link" href="https://github.com/oliviera999/ForetMap" target="_blank" rel="noopener noreferrer">
            <strong>github.com/oliviera999/ForetMap</strong><br />
            <small>Code source complet du projet</small>
          </a>
        </div>

        <div className="about-card">
          <h3>{aboutHelpTitle}</h3>
          <p>
            {aboutHelpBody}
          </p>
          <div className="about-meta">
            <span className="about-chip">Ouvertures panneau aide: {Number(metrics?.panelOpenCount || 0)}</span>
            <span className="about-chip">Masquages "Ne plus afficher": {Number(metrics?.panelDismissCount || 0)}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={resetHelp}>
              {aboutHelpReenableLabel}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={resetHelpMetrics}>
              {aboutHelpResetMetricsLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { AboutView };
