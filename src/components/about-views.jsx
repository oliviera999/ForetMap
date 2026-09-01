import { useState } from 'react';
import { useHelp } from '../hooks/useHelp';
import { getContentText } from '../utils/content';
import { usePublicSettings } from '../contexts/PublicSettingsContext.jsx';
import { getAuthToken, withAppBase } from '../services/api';

/**
 * Rapports d'audit interne, servis par des routes protégées par `admin.settings.read`
 * (`server.js`). Un `<a href>` ordinaire ne peut pas les ouvrir : la navigation du
 * navigateur n'emporte aucun en-tête `Authorization`, et le jeton vit dans le stockage
 * local, pas dans un cookie — le lien retournait donc `401 {"error":"Token requis"}`
 * pour tout le monde, administrateur compris. On les récupère avec le jeton et on les
 * affiche sur place.
 */
const SITE_ISSUES_DOCS = [
  {
    label: 'SITE_ISSUES',
    href: '/api/site-issues',
    desc: 'Rapport markdown des problèmes connus du site',
  },
  {
    label: 'SITE_ISSUES JSON',
    href: '/api/site-issues.json',
    desc: 'Version JSON du rapport de suivi QA',
  },
];

function AboutView({ appVersion, isTeacher = false, canReadSiteIssues = false }) {
  const publicSettings = usePublicSettings();
  // Rapport d'audit affiché en place (pas d'onglet : voir SITE_ISSUES_DOCS).
  const [siteIssuesDoc, setSiteIssuesDoc] = useState(null);
  const [siteIssuesError, setSiteIssuesError] = useState('');
  const [siteIssuesLoading, setSiteIssuesLoading] = useState('');

  async function openSiteIssuesDoc(entry) {
    setSiteIssuesError('');
    setSiteIssuesLoading(entry.label);
    try {
      const token = getAuthToken();
      const res = await fetch(withAppBase(entry.href), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        throw new Error(
          res.status === 401 || res.status === 403
            ? 'Accès refusé : ce rapport demande le droit de lecture des réglages. Si la session a expiré, reconnecte-toi.'
            : `Lecture impossible (HTTP ${res.status}).`,
        );
      }
      // `res.text()` couvre les deux formats servis (markdown et JSON brut).
      setSiteIssuesDoc({ label: entry.label, text: await res.text() });
    } catch (err) {
      setSiteIssuesDoc(null);
      setSiteIssuesError(err?.message || 'Lecture impossible.');
    } finally {
      setSiteIssuesLoading('');
    }
  }
  const { resetHelp, metrics, resetHelpMetrics } = useHelp({ publicSettings, isTeacher });
  const aboutTitle = getContentText(publicSettings, 'about.title', 'ℹ️ À propos');
  const aboutSubtitle = getContentText(
    publicSettings,
    'about.subtitle',
    'Informations du projet ForetMap',
  );
  const aboutPurposeTitle = getContentText(
    publicSettings,
    'about.purpose_title',
    "Objet de l'application",
  );
  const aboutPurposeBody = getContentText(
    publicSettings,
    'about.purpose_body',
    'ForetMap aide les n3beurs et les n3boss du Lycée Lyautey à organiser les activités de la forêt comestible: suivi des zones, de la biodiversité, des tâches et des observations.',
  );
  const aboutDocsTitle = getContentText(publicSettings, 'about.docs_title', 'Documentation');
  const aboutSiteIssuesTitle = getContentText(
    publicSettings,
    'about.site_issues_title',
    'Audit interne (réservé aux administrateurs)',
  );
  const aboutHelpTitle = getContentText(publicSettings, 'about.help_title', 'Aide contextuelle');
  const aboutHelpBody = getContentText(
    publicSettings,
    'about.help_body',
    'Si les bulles d aide ont ete masquées, tu peux les reactiver ici.',
  );
  const aboutHelpReenableLabel = getContentText(
    publicSettings,
    'about.help_reenable_cta',
    'Reactiver toutes les aides',
  );
  const aboutHelpResetMetricsLabel = getContentText(
    publicSettings,
    'about.help_reset_metrics_cta',
    'Reinitialiser les compteurs d aide',
  );
  const docsLinks = [
    { label: 'CHANGELOG', href: '/CHANGELOG.md', desc: 'Historique des modifications publiées' },
    { label: 'README', href: '/README.md', desc: 'Présentation du projet et installation' },
    { label: 'API', href: '/docs/API.md', desc: 'Routes backend et formats JSON' },
    {
      label: 'LOCAL_DEV',
      href: '/docs/LOCAL_DEV.md',
      desc: 'Mise en place locale (Docker + tests)',
    },
    { label: 'EVOLUTION', href: '/docs/EVOLUTION.md', desc: "Feuille de route d'évolution" },
    { label: 'VERSIONING', href: '/docs/VERSIONING.md', desc: 'Règles de versionnage SemVer' },
  ];

  return (
    <div className="fade-in">
      <h2 className="section-title">{aboutTitle}</h2>
      <p className="section-sub">{aboutSubtitle}</p>

      <div className="about-grid">
        <div className="about-card">
          <h3>{aboutPurposeTitle}</h3>
          <p>{aboutPurposeBody}</p>
          <div className="about-meta">
            <span className="about-chip">Version: {appVersion || 'indisponible'}</span>
            <span className="about-chip">Auteur: Mohammed El Farrai</span>
            <span className="about-chip">Contributeur : Olivier Arnould-Laurent</span>
          </div>
        </div>

        <div className="about-card">
          <h3>{aboutDocsTitle}</h3>
          <div className="about-links">
            {docsLinks.map((link) => (
              <a
                key={link.label}
                className="about-link"
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                <strong>{link.label}</strong>
                <br />
                <small>{link.desc}</small>
              </a>
            ))}
          </div>

          {/* Réservé aux détenteurs de `admin.settings.read` : ces rapports recensent des
              faiblesses connues du site et n'ont rien à faire sous les yeux d'un élève. */}
          {canReadSiteIssues && (
            <div style={{ marginTop: 12 }}>
              <h4 style={{ margin: '0 0 6px', fontSize: 'var(--text-sm)', color: 'var(--leaf)' }}>
                {aboutSiteIssuesTitle}
              </h4>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {SITE_ISSUES_DOCS.map((entry) => (
                  <button
                    key={entry.label}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => openSiteIssuesDoc(entry)}
                    disabled={siteIssuesLoading === entry.label}
                    title={entry.desc}
                  >
                    {siteIssuesLoading === entry.label ? 'Chargement…' : entry.label}
                  </button>
                ))}
                {siteIssuesDoc && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSiteIssuesDoc(null)}
                  >
                    Fermer
                  </button>
                )}
              </div>
              {siteIssuesError && (
                <p
                  role="alert"
                  style={{ marginTop: 8, fontSize: 'var(--text-sm)', color: '#a4161a' }}
                >
                  {siteIssuesError}
                </p>
              )}
              {siteIssuesDoc && (
                <pre
                  aria-label={siteIssuesDoc.label}
                  style={{
                    marginTop: 8,
                    maxHeight: 320,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 'var(--text-xs)',
                    background: 'var(--surface-soft)',
                    color: 'var(--forest)',
                    padding: 8,
                    borderRadius: 8,
                  }}
                >
                  {siteIssuesDoc.text}
                </pre>
              )}
            </div>
          )}
        </div>

        <div className="about-card">
          <h3>{aboutHelpTitle}</h3>
          <p>{aboutHelpBody}</p>
          <div className="about-meta">
            <span className="about-chip">
              Ouvertures panneau aide: {Number(metrics?.panelOpenCount || 0)}
            </span>
            <span className="about-chip">
              Masquages "Ne plus afficher": {Number(metrics?.panelDismissCount || 0)}
            </span>
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
