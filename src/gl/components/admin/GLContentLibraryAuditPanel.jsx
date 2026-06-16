import React from 'react';
import { GLButton } from '../ui/GLButton.jsx';

/**
 * Section « Audit des conventions » de la bibliothèque de contenus G&L.
 * Composant feuille prop-driven : aucun état interne ni appel réseau ;
 * l'audit est déclenché par `onRun` (parent) et le rapport reçu via `report`.
 *
 * @param {object|null} report rapport d'audit (clés, branchées, suspects, manquants)
 * @param {boolean} busy audit en cours
 * @param {()=>void} onRun lance l'audit
 */
export function GLContentLibraryAuditPanel({ report, busy, onRun }) {
  return (
    <section className="gl-content-library__section">
      <h3>Audit des conventions</h3>
      <p className="gl-hint">
        Vérifie les liaisons par nom de fichier (plateaux, biomes, feuillets, scènes de récit,
        intro, audio) : ressources requises manquantes et clés <code>recit_*</code> mal nommées
        (invisibles en jeu).
      </p>
      <GLButton type="button" disabled={busy} onClick={onRun}>
        {busy ? 'Audit en cours…' : 'Lancer l’audit'}
      </GLButton>
      {report ? (
        <div className="gl-content-library__report">
          <p className="gl-hint">
            {report.keyCount} clé(s) en médiathèque · {report.ok?.length || 0} branchée(s) ·{' '}
            {report.unwired?.length || 0} sans lien code automatique.
          </p>
          {Array.isArray(report.suspectRecitKeys) && report.suspectRecitKeys.length > 0 ? (
            <div>
              <p className="gl-error">
                ⚠ {report.suspectRecitKeys.length} clé(s) récit suspecte(s) — typo probable, ces
                images ne s’affichent dans aucun chapitre :
              </p>
              <ul className="gl-content-library__warnings">
                {report.suspectRecitKeys.map((key) => (
                  <li key={key}>
                    <code>{key}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="gl-success">Aucune clé récit suspecte.</p>
          )}
          {Array.isArray(report.missing) && report.missing.length > 0 ? (
            <div>
              <p className="gl-error">
                ✗ {report.missing.length} ressource(s) requise(s) manquante(s) :
              </p>
              <ul className="gl-content-library__warnings">
                {report.missing.map((row) => (
                  <li key={`${row.category}-${row.ref}`}>
                    [{row.category}] {row.ref} → <code>{row.slug}</code>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="gl-success">Toutes les ressources requises sont présentes.</p>
          )}
          {Array.isArray(report.ok) &&
          report.ok.some((row) => row.category === 'chapitre-recit') ? (
            <p className="gl-hint">
              Scènes de récit branchées :{' '}
              {report.ok
                .filter((row) => row.category === 'chapitre-recit')
                .map((row) => row.ref)
                .join(', ')}{' '}
              — détail par chapitre dans Contenus → Chapitres.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
