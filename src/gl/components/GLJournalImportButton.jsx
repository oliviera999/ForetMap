import React, { useEffect, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { GLButton } from './ui/GLButton.jsx';

// L'import dans le carnet est réservé aux joueurs GL (pas aux invités/MJ).
function isGlPlayerSession() {
  try {
    const raw = localStorage.getItem('gl_session');
    if (!raw) return false;
    return JSON.parse(raw)?.auth?.userType === 'gl_player';
  } catch {
    return false;
  }
}

/**
 * Bouton « Importer dans mon journal » d'un élément du site.
 * L'import n'est possible qu'une fois l'élément marqué appris/lu/découvert
 * (contrôlé côté serveur, mais on guide aussi l'utilisateur ici).
 *
 * @param {string} resourceType - 'species' | 'glossary' | 'tutorial' | 'lore_glossary' | 'feuillet' | 'content_page' | 'ecosystem'
 * @param {string|number} resourceRef - code/slug/id stable de la ressource
 * @param {string} [title] - libellé figé (le serveur retombe sur le titre BDD sinon)
 * @param {boolean} learned - l'élément est-il déjà acquis par le joueur ?
 * @param {boolean} [alreadyImported] - déjà présent dans le carnet ?
 * @param {boolean} [enabled=true] - module carnet actif ?
 */
export function GLJournalImportButton({
  resourceType,
  resourceRef,
  title,
  learned,
  alreadyImported = false,
  enabled = true,
  onImported,
}) {
  const [state, setState] = useState(alreadyImported ? 'done' : 'idle');
  const [error, setError] = useState('');

  // L'info « déjà importé » peut arriver après le montage (chargement asynchrone) :
  // on bascule alors le bouton en état final sans écraser un import en cours.
  useEffect(() => {
    if (alreadyImported) setState((prev) => (prev === 'saving' ? prev : 'done'));
  }, [alreadyImported]);

  if (!enabled || !isGlPlayerSession()) return null;

  if (!learned) {
    return (
      <span className="gl-hint gl-journal-import__hint">
        Marque-le comme appris (parfois après un court quiz) pour l’ajouter à ton journal.
      </span>
    );
  }

  if (state === 'done') {
    return <span className="gl-badge gl-journal-import__done">✓ Dans mon journal</span>;
  }

  async function handleImport() {
    if (state === 'saving') return;
    setState('saving');
    setError('');
    try {
      const res = await apiGL('/api/gl/player-journal/me/imports', 'POST', {
        resourceType,
        resourceRef: String(resourceRef),
        title: title || undefined,
      });
      setState('done');
      onImported?.(res?.import || null);
    } catch (err) {
      setState('idle');
      setError(err.message || 'Import impossible');
    }
  }

  return (
    <span className="gl-journal-import">
      <GLButton
        type="button"
        variant="secondary"
        onClick={handleImport}
        disabled={state === 'saving'}
        aria-label={title ? `Ajouter « ${title} » à mon journal` : 'Ajouter à mon journal'}
      >
        {state === 'saving' ? 'Ajout…' : '+ Ajouter à mon journal'}
      </GLButton>
      {error ? <span className="gl-error gl-journal-import__error">{error}</span> : null}
    </span>
  );
}
