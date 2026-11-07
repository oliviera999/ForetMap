import { useCallback, useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GLButton } from '../ui/GLButton.jsx';

/**
 * Contenus → Chapitres : carte « Catalogues Tenir à deux » (`data/gl/tenir/*.json`).
 * Comptes par table, écart entre l'empreinte du dépôt et celle mémorisée en base, bouton
 * « Synchroniser » (import tolérant) et rapport lisible du dernier chargement.
 * API : `GET /api/gl/admin/tenir/catalogues`, `POST /api/gl/admin/tenir/catalogues/sync`.
 */

const LIBELLES = {
  'reglages-defaut': 'Réglages par défaut',
  sorts: 'Sorts (grimoire v2)',
  'chasse-zones': 'Zones de chasse',
  'questions-lecture': 'Questions de lecture',
  peripeties: 'Péripéties',
  titres: 'Titres',
  missions: 'Missions',
  badges: 'Badges',
  'olu-lignes': "Lignes d'Olu",
  parures: 'Parures',
  'passeur-plateau4': 'Pages du Passeur',
};

const STATUTS = {
  synchronise: 'synchronisé',
  refuse: 'refusé',
  dry_run: 'vérifié (sans écriture)',
  a_jour: 'à jour',
  absent: 'fichier absent',
};

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('fr-FR');
}

function RapportFichier({ fichier }) {
  const errors = Array.isArray(fichier.errors) ? fichier.errors : [];
  const warnings = Array.isArray(fichier.warnings) ? fichier.warnings : [];
  return (
    <li>
      <strong>{LIBELLES[fichier.fichier] || fichier.fichier}</strong> :{' '}
      {STATUTS[fichier.status] || fichier.status}
      {fichier.status === 'synchronise' ||
      fichier.status === 'dry_run' ||
      fichier.status === 'refuse'
        ? ` — ${fichier.count ?? 0} lignes, ${fichier.upserted ?? 0} écrites, ${fichier.desactives ?? 0} désactivées, ${fichier.ecartees ?? 0} écartées`
        : null}
      {errors.length || warnings.length ? (
        <ul className="gl-tenir-catalogues__messages">
          {errors.map((e) => (
            <li key={`e-${e}`} className="gl-error">
              {e}
            </li>
          ))}
          {warnings.map((w) => (
            <li key={`w-${w}`} className="gl-hint">
              {w}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function GLTenirCataloguesCard() {
  const [etat, setEtat] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dernier, setDernier] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGL('/api/gl/admin/tenir/catalogues');
      setEtat(data && typeof data === 'object' ? data : null);
      setError('');
    } catch (err) {
      setError(err?.message || 'Catalogues indisponibles');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const synchroniser = useCallback(
    async (dryRun) => {
      setBusy(true);
      setError('');
      try {
        const result = await apiGL('/api/gl/admin/tenir/catalogues/sync', 'POST', { dryRun });
        setDernier(result && typeof result === 'object' ? result : null);
        await load();
      } catch (err) {
        setError(err?.message || 'Synchronisation impossible');
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const fichiers = Array.isArray(etat?.fichiers) ? etat.fichiers : [];
  const ecarts = Array.isArray(etat?.ecarts) ? etat.ecarts : [];
  const rapport = dernier || etat?.rapport || null;

  return (
    <section className="gl-tenir-catalogues" data-testid="gl-tenir-catalogues">
      <h3>Catalogues Tenir à deux</h3>
      <p className="gl-hint">
        Fichiers <code>data/gl/tenir/*.json</code> chargés en base au démarrage dès qu'ils changent.
        Une ligne invalide est écartée et rapportée, les autres sont écrites ; aucun état de partie
        n'est touché.
      </p>
      {error ? <p className="gl-error">{error}</p> : null}
      {etat?.syncDesactivee ? (
        <p className="gl-hint">
          Synchronisation automatique désactivée sur ce serveur (<code>GL_TENIR_SYNC=0</code>) : le
          bouton ci-dessous reste disponible.
        </p>
      ) : null}
      <div className="fm-table-wrap gl-admin-table-wrap">
        <table className="fm-table fm-table--zebra gl-admin-table">
          <thead>
            <tr>
              <th>Fichier</th>
              <th>Table</th>
              <th>Lignes actives</th>
              <th>Dépôt</th>
              <th>Base</th>
              <th>État</th>
            </tr>
          </thead>
          <tbody>
            {fichiers.map((f) => (
              <tr key={f.fichier} data-testid={`gl-tenir-catalogue-${f.fichier}`}>
                <td>{LIBELLES[f.fichier] || f.fichier}</td>
                <td>{f.table ? <code>{f.table}</code> : '—'}</td>
                <td>{f.count == null ? '—' : f.count}</td>
                <td>
                  <code>{f.hashDepot || '—'}</code>
                </td>
                <td>
                  <code>{f.hashBase || '—'}</code>
                </td>
                <td>{!f.present ? 'absent' : f.aJour ? 'à jour' : 'à synchroniser'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="gl-hint">
        {ecarts.length
          ? `${ecarts.length} fichier${ecarts.length > 1 ? 's' : ''} à synchroniser : ${ecarts.map((e) => LIBELLES[e] || e).join(', ')}.`
          : 'Tous les catalogues sont à jour.'}
      </p>
      <div className="gl-inline-actions">
        <GLButton type="button" onClick={() => synchroniser(false)} disabled={busy}>
          Synchroniser
        </GLButton>
        <GLButton type="button" variant="ghost" onClick={() => synchroniser(true)} disabled={busy}>
          Vérifier sans écrire
        </GLButton>
      </div>
      {rapport ? (
        <details className="plant-more" open={Boolean(dernier)}>
          <summary>
            Rapport {rapport.dryRun ? 'de vérification' : 'de synchronisation'}
            {rapport.at ? ` du ${formatDate(rapport.at)}` : ''}
          </summary>
          <ul className="gl-tenir-catalogues__rapport">
            {(Array.isArray(rapport.files) ? rapport.files : [])
              .filter((f) => f.status !== 'a_jour')
              .map((f) => (
                <RapportFichier key={f.fichier} fichier={f} />
              ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
