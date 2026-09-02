import { useState } from 'react';

/**
 * Accordéon d'écran admin (audit UI, D-3) — replie les grands blocs des consoles
 * denses en mémorisant l'état ouvert/fermé par section dans `localStorage`
 * (clé `foretmap.adminSection.<id>`), pour retrouver l'écran tel qu'on l'a laissé.
 *
 * Style : réutilise `.plant-more` (accordéons des fiches biodiversité, src/index.css)
 * complété par `.admin-section` (shared-controls.css : titre plus marqué, marge).
 *
 * @param {object} props
 * @param {string} props.id identifiant stable de la section (suffixe de la clé localStorage)
 * @param {import('react').ReactNode} props.title libellé du `<summary>`
 * @param {boolean} [props.defaultOpen] état initial quand rien n'est mémorisé
 * @param {boolean} [props.forceOpen] rend la section ouverte de force (ex. recherche active),
 *   sans persister — l'état mémorisé reprend la main quand la contrainte tombe
 * @param {import('react').ReactNode} props.children contenu replié
 */
function AdminSection({ id, title, defaultOpen = false, forceOpen = false, children }) {
  const storageKey = `foretmap.adminSection.${id}`;

  const [open, setOpen] = useState(() => {
    // localStorage peut être indisponible (navigation privée, quotas) : on retombe
    // silencieusement sur le défaut fourni par l'appelant.
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === '1') return true;
      if (stored === '0') return false;
    } catch {
      /* stockage indisponible : défaut */
    }
    return defaultOpen;
  });

  const handleToggle = (e) => {
    const next = e.currentTarget.open;
    if (forceOpen) {
      // Section contrôlée ouverte (recherche active) : on annule toute fermeture
      // native sans rien persister.
      if (!next) e.currentTarget.open = true;
      return;
    }
    setOpen(next);
    try {
      window.localStorage.setItem(storageKey, next ? '1' : '0');
    } catch {
      /* stockage indisponible : état non persisté */
    }
  };

  return (
    <details className="plant-more admin-section" open={forceOpen || open} onToggle={handleToggle}>
      <summary>{title}</summary>
      <div className="admin-section__body">{children}</div>
    </details>
  );
}

export { AdminSection };
