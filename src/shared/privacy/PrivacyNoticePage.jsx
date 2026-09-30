import { useEffect, useMemo, useState } from 'react';
import { withAppBase } from '../appBase.js';
import { getBuildBrand } from '../brand/brandNames.js';
import { buildPrivacyNotice } from './privacyNoticeContent.js';
import './privacy-notice.css';

/**
 * Réglages publics utiles à la notice, lus sans compte. `GET /api/settings/public` rend la
 * section `privacy` à tous les produits (`lib/publicSettingsScope.js`), plan compris.
 * Un échec n'empêche jamais la lecture : la notice retombe sur ses valeurs par défaut.
 */
async function fetchPrivacySettings() {
  const res = await fetch(withAppBase('/api/settings/public'), {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.settings?.privacy || null;
}

/**
 * Page publique « Vos données » (audit sécurité/RGPD du 30/09/2026, RG1), montée par le
 * `main.jsx` de chaque produit quand l'adresse est `/confidentialite`.
 *
 * @param {object} props
 * @param {'foret'|'gl'|'plan'|'staff'|'enov'} props.product
 * @param {object|null} [props.privacySettings] section `privacy` des réglages publics ; si
 *   absente, la page la demande elle-même au serveur.
 * @param {string} [props.backHref] lien de retour vers l'application.
 */
export function PrivacyNoticePage({ product, privacySettings = null, backHref }) {
  const [fetched, setFetched] = useState(null);
  const settings = privacySettings || fetched;

  useEffect(() => {
    if (privacySettings) return undefined;
    let cancelled = false;
    fetchPrivacySettings()
      .then((value) => {
        if (!cancelled && value) setFetched(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [privacySettings]);

  const notice = useMemo(
    () =>
      buildPrivacyNotice({
        product,
        brand: getBuildBrand(),
        contact: settings?.data_contact || '',
        externalAssetsMode: settings?.external_assets_mode || 'local',
        clearLocalDataOnLogout: settings?.clear_local_data_on_logout !== false,
      }),
    [product, settings],
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = `${notice.title} — ${notice.productName}`;
  }, [notice.title, notice.productName]);

  return (
    <main className={`privacy-notice privacy-notice--${notice.product}`} lang="fr">
      <article className="privacy-notice__card">
        <p className="privacy-notice__eyebrow">{notice.productName}</p>
        <h1 className="privacy-notice__title">{notice.title}</h1>
        <p className="privacy-notice__intro">{notice.intro}</p>
        {notice.highlight ? (
          <p className="privacy-notice__highlight" data-testid="privacy-notice-highlight">
            {notice.highlight}
          </p>
        ) : null}
        {notice.sections.map((section) => (
          <section
            key={section.id}
            className="privacy-notice__section"
            aria-labelledby={`privacy-${section.id}`}
          >
            <h2 id={`privacy-${section.id}`}>{section.title}</h2>
            {section.paragraphs.slice(0, 1).map((text) => (
              <p key={text}>{text}</p>
            ))}
            {section.items.length > 0 ? (
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {section.paragraphs.slice(1).map((text) => (
              <p key={text}>{text}</p>
            ))}
          </section>
        ))}
        <p className="privacy-notice__back">
          <a className="privacy-notice__back-link" href={backHref || withAppBase('/')}>
            ← Retour à {notice.productName}
          </a>
        </p>
      </article>
    </main>
  );
}
