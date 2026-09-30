import { useState } from 'react';
import { withAppBase } from '../../shared/appBase.js';
import { downloadAuthedFile } from '../../shared/downloadAuthedFile.js';
import { personalDataExportFilename } from '../../shared/personalDataExport.js';
import { getGlToken } from '../services/apiGL.js';
import { GLButton } from './ui/GLButton.jsx';
import { GLSurface } from './ui/GLSurface.jsx';
import { PrivacyNoticeLink } from '../../shared/privacy/PrivacyNoticeLink.jsx';

/** Téléchargement de l'archive des données personnelles du joueur (droit d'accès RGPD). */
export function GLPersonalDataExportPanel() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function download() {
    setBusy(true);
    setError('');
    try {
      await downloadAuthedFile(
        '/api/gl/auth/me/export',
        personalDataExportFilename('mes-donnees-gl'),
        {
          resolveUrl: withAppBase,
          getToken: getGlToken,
          messages: {
            unauthorized: 'Session expirée — reconnectez-vous.',
            forbidden: 'Export réservé aux joueurs connectés.',
            notFound: 'Export indisponible sur ce serveur.',
          },
        },
      );
    } catch (err) {
      setError(err.message || 'Export impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <GLSurface className="gl-form fade-in" variant="flat">
      <h3>Mes données</h3>
      <p className="gl-hint">
        Téléchargez une archive avec tout ce que le jeu garde sur vous : fiche joueur, journal,
        messages, réponses aux QCM et images.
      </p>
      {error ? <p className="gl-error">{error}</p> : null}
      <GLButton type="button" variant="secondary" loading={busy} onClick={download}>
        {busy ? 'Préparation…' : 'Télécharger mes données'}
      </GLButton>
      <p className="gl-hint">
        Qui voit quoi, combien de temps, vos droits : <PrivacyNoticeLink />
      </p>
    </GLSurface>
  );
}
