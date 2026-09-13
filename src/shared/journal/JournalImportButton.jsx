import { useEffect, useState } from 'react';
import { Button } from '../ui/Button.jsx';

/**
 * Bouton « Ajouter au carnet » d'un élément du site (fiche espèce, terme, tutoriel…).
 * L'import n'est possible qu'une fois l'élément marqué appris / lu / découvert (contrôlé
 * côté serveur, mais on guide aussi l'utilisateur ici). Composant unique pour ForetMap et
 * G&L : le produit fournit sa garde de session (`canImport`), son adaptateur et ses textes.
 *
 * @param {object} props
 * @param {string} props.resourceType
 * @param {string|number} props.resourceRef code / slug / id stable de la ressource
 * @param {string} [props.title] libellé figé (le serveur retombe sur le titre BDD sinon)
 * @param {boolean} props.learned l'élément est-il déjà acquis ?
 * @param {boolean} [props.alreadyImported=false] déjà présent dans le carnet ?
 * @param {boolean} [props.enabled=true] module carnet actif ?
 * @param {boolean} props.canImport session autorisée à importer (compte connecté / joueur G&L)
 * @param {(imported: object|null) => void} [props.onImported]
 * @param {import('./journalAdapter.js').JournalAdapter} props.adapter
 * @param {object} props.ui habillage produit (`importClassPrefix`, `badgeClassName`, `hintClassName`, `errorClassName`, `Button`, `buttonProps`)
 * @param {{ hint: string, done: string, add: string, saving?: string, ariaLabel: (title?: string) => string }} props.texts
 */
export function JournalImportButton({
  resourceType,
  resourceRef,
  title,
  learned,
  alreadyImported = false,
  enabled = true,
  canImport,
  onImported,
  adapter,
  ui,
  texts,
}) {
  const [state, setState] = useState(alreadyImported ? 'done' : 'idle');
  const [error, setError] = useState('');
  const p = ui.importClassPrefix || `${ui.classPrefix}-import`;
  const Btn = ui.Button || Button;
  const btnProps = { type: 'button', variant: 'secondary', ...(ui.buttonProps || {}) };

  // L'info « déjà importé » peut arriver après le montage (chargement asynchrone) :
  // on bascule alors le bouton en état final sans écraser un import en cours.
  useEffect(() => {
    if (alreadyImported) setState((prev) => (prev === 'saving' ? prev : 'done'));
  }, [alreadyImported]);

  if (!enabled || !canImport) return null;

  if (!learned) {
    return <span className={`${ui.hintClassName || ''} ${p}__hint`.trim()}>{texts.hint}</span>;
  }

  if (state === 'done') {
    return <span className={`${ui.badgeClassName || ''} ${p}__done`.trim()}>{texts.done}</span>;
  }

  async function handleImport() {
    if (state === 'saving') return;
    setState('saving');
    setError('');
    try {
      const res = await adapter.importResource({
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
    <span className={p}>
      <Btn
        {...btnProps}
        onClick={handleImport}
        disabled={state === 'saving'}
        aria-label={texts.ariaLabel(title)}
      >
        {state === 'saving' ? texts.saving || 'Ajout…' : texts.add}
      </Btn>
      {error ? (
        <span className={`${ui.errorClassName || ''} ${p}__error`.trim()}>{error}</span>
      ) : null}
    </span>
  );
}
