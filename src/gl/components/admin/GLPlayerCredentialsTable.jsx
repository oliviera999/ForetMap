import { useState } from 'react';
import { GLButton } from '../ui/GLButton.jsx';
import {
  buildCredentialsCsv,
  countDistributablePasswords,
  credentialStatusLabel,
} from '../../utils/glPlayerCredentials.js';

function downloadTextFile(filename, content) {
  if (typeof window === 'undefined' || typeof URL?.createObjectURL !== 'function') return;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Identifiants créés (pseudo + mot de passe en clair), affichés UNE fois après une création ou
 * un import : c'est le seul moment où le staff peut les récupérer pour les distribuer.
 *
 * @param {Array<object>} props.credentials entrées `{ pseudo, firstName, lastName, className, password, generated, reusedExisting }`
 * @param {string} [props.filename] nom du CSV téléchargé
 */
export function GLPlayerCredentialsTable({ credentials, filename = 'identifiants-joueurs.csv' }) {
  const [copied, setCopied] = useState(false);
  const rows = Array.isArray(credentials) ? credentials : [];
  if (rows.length === 0) return null;
  const distributable = countDistributablePasswords(rows);

  async function copyAll() {
    const text = rows
      .filter((c) => c.password)
      .map((c) => `${c.pseudo}\t${c.password}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (_) {
      setCopied(false);
    }
  }

  return (
    <section className="gl-admin-credentials" aria-label="Identifiants à distribuer">
      <p className="gl-warning">
        <strong>À noter maintenant :</strong> ces mots de passe ne sont affichés qu’une seule fois
        et ne sont stockés nulle part en clair. Les élèves devront changer un mot de passe généré à
        leur première connexion.
      </p>
      <div className="gl-inline-actions">
        <GLButton
          type="button"
          variant="secondary"
          onClick={() => downloadTextFile(filename, buildCredentialsCsv(rows))}
        >
          Télécharger (CSV)
        </GLButton>
        <GLButton
          type="button"
          variant="secondary"
          onClick={copyAll}
          disabled={distributable === 0}
        >
          {copied ? 'Copié !' : 'Copier pseudo + mot de passe'}
        </GLButton>
        <span className="gl-hint">
          {distributable} mot{distributable > 1 ? 's' : ''} de passe à distribuer
        </span>
      </div>
      <div className="gl-table-scroll">
        <table className="gl-admin-credentials__table">
          <thead>
            <tr>
              <th>Élève</th>
              <th>Classe</th>
              <th>Pseudo</th>
              <th>Mot de passe</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <tr key={`${entry.row ?? ''}-${entry.pseudo}`}>
                <td>{`${entry.firstName || ''} ${entry.lastName || ''}`.trim() || '—'}</td>
                <td>{entry.className || '—'}</td>
                <td>
                  <code>{entry.pseudo}</code>
                </td>
                <td>{entry.password ? <code>{entry.password}</code> : <span>—</span>}</td>
                <td>{credentialStatusLabel(entry)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
