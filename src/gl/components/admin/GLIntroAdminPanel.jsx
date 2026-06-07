import React, { useEffect, useState } from 'react';

import { MediaLibraryMenu } from '../../../components/MediaLibraryMenu.jsx';
import { withAppBase } from '../../../services/api.js';
import { apiGL } from '../../services/apiGL.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLTextarea } from '../ui/GLTextarea.jsx';

const VOICE_LABELS = {
  copiste: 'Le copiste',
  selene: 'Sélène',
  passeur: 'Le passeur',
};

function emptyDraft() {
  return {
    enabled: true,
    opening: { kicker: '', titleHtml: '', credit: '', button: '', foot: '' },
    finale: { button: '' },
    audio: { loopKey: '', finalKey: '' },
    scenes: [],
  };
}

export function GLIntroAdminPanel() {
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function load() {
    setError('');
    const data = await apiGL('/api/gl/admin/content/intro');
    setDraft(data || emptyDraft());
  }

  useEffect(() => {
    load().catch((err) => setError(err.message || 'Chargement impossible'));
  }, []);

  function updateScene(sceneId, patch) {
    setDraft((prev) => ({
      ...prev,
      scenes: prev.scenes.map((scene) => (scene.id === sceneId ? { ...scene, ...patch } : scene)),
    }));
  }

  async function save() {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await apiGL('/api/gl/admin/content/intro', 'PUT', draft);
      setInfo('Intro enregistrée.');
      await load();
    } catch (err) {
      setError(err.message || 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  }

  async function resetDefaults() {
    if (!window.confirm('Réinitialiser tous les textes et clés média depuis le modèle par défaut ?')) return;
    setBusy(true);
    setError('');
    try {
      await apiGL('/api/gl/admin/content/intro/reset', 'POST');
      setInfo('Intro réinitialisée.');
      await load();
    } catch (err) {
      setError(err.message || 'Réinitialisation impossible');
    } finally {
      setBusy(false);
    }
  }

  function openPreview() {
    window.open(withAppBase('/gl/intro/index.html'), '_blank', 'noopener,noreferrer');
  }

  const mediaApi = {
    fetchItems: () => apiGL('/api/gl/admin/media-library'),
    uploadDataUrl: (mediaData) => apiGL('/api/gl/admin/media-library', 'POST', { media_data: mediaData }),
    removeItem: (relativePath) => apiGL('/api/gl/admin/media-library', 'DELETE', { relativePath }),
  };

  return (
    <div className="gl-intro-admin">
      <p className="gl-hint">
        Textes et médias de l&apos;intro cinématique (écran avant connexion). Les images et pistes audio
        utilisent des clés stables de la bibliothèque média (ex. <code>GL_intro_01_la-boite</code>).
      </p>

      {error ? <p className="gl-error">{error}</p> : null}
      {info ? <div className="gl-success-banner">{info}</div> : null}

      <div className="gl-intro-admin__toolbar">
        <GLButton type="button" variant="primary" onClick={save} loading={busy}>
          Enregistrer
        </GLButton>
        <GLButton type="button" variant="ghost" onClick={openPreview} disabled={busy}>
          Aperçu
        </GLButton>
        <GLButton type="button" variant="ghost" onClick={resetDefaults} disabled={busy}>
          Réinitialiser
        </GLButton>
      </div>

      <GLField label="Intro active (contenu)">
        <label className="gl-checkbox-row">
          <input
            type="checkbox"
            checked={draft.enabled !== false}
            onChange={(event) => setDraft((prev) => ({ ...prev, enabled: event.target.checked }))}
          />
          <span>Contenu intro publié (désactiver masque l&apos;intro même si le module est actif)</span>
        </label>
      </GLField>

      <section className="gl-intro-admin__section">
        <h3>Écran d&apos;ouverture</h3>
        <GLField label="Surtitre">
          <GLInput
            value={draft.opening?.kicker || ''}
            onChange={(event) => setDraft((prev) => ({
              ...prev,
              opening: { ...prev.opening, kicker: event.target.value },
            }))}
          />
        </GLField>
        <GLField label="Titre (HTML autorisé)">
          <GLInput
            value={draft.opening?.titleHtml || ''}
            onChange={(event) => setDraft((prev) => ({
              ...prev,
              opening: { ...prev.opening, titleHtml: event.target.value },
            }))}
          />
        </GLField>
        <GLField label="Crédit">
          <GLInput
            value={draft.opening?.credit || ''}
            onChange={(event) => setDraft((prev) => ({
              ...prev,
              opening: { ...prev.opening, credit: event.target.value },
            }))}
          />
        </GLField>
        <GLField label="Bouton">
          <GLInput
            value={draft.opening?.button || ''}
            onChange={(event) => setDraft((prev) => ({
              ...prev,
              opening: { ...prev.opening, button: event.target.value },
            }))}
          />
        </GLField>
      </section>

      <section className="gl-intro-admin__section">
        <h3>Audio</h3>
        <GLField label="Clé média — boucle (scènes 1 à 8)">
          <GLInput
            value={draft.audio?.loopKey || ''}
            onChange={(event) => setDraft((prev) => ({
              ...prev,
              audio: { ...prev.audio, loopKey: event.target.value },
            }))}
          />
        </GLField>
        <GLField label="Clé média — cue final (scène 9)">
          <GLInput
            value={draft.audio?.finalKey || ''}
            onChange={(event) => setDraft((prev) => ({
              ...prev,
              audio: { ...prev.audio, finalKey: event.target.value },
            }))}
          />
        </GLField>
        <MediaLibraryMenu
          title="Bibliothèque — audio intro"
          layout="gallery"
          fetchItems={mediaApi.fetchItems}
          uploadDataUrl={mediaApi.uploadDataUrl}
          removeItem={mediaApi.removeItem}
          onPickUrl={() => {}}
          manageHint="Copiez la clé stable affichée dans la galerie après import."
        />
      </section>

      <section className="gl-intro-admin__section">
        <h3>Scènes</h3>
        {(draft.scenes || []).map((scene, index) => (
          <details key={scene.id} className="gl-intro-admin__scene" open={index === 0}>
            <summary>
              {index + 1}. {scene.id}
              {' '}
              <span className="gl-hint">({VOICE_LABELS[scene.voice] || scene.voice})</span>
            </summary>
            <GLField label="Kicker">
              <GLInput
                value={scene.kicker || ''}
                onChange={(event) => updateScene(scene.id, { kicker: event.target.value })}
              />
            </GLField>
            <GLField label="Texte">
              <GLTextarea
                rows={3}
                value={scene.text || ''}
                onChange={(event) => updateScene(scene.id, { text: event.target.value })}
              />
            </GLField>
            <GLField label="Clé image (bibliothèque)">
              <GLInput
                value={scene.imageKey || ''}
                onChange={(event) => updateScene(scene.id, { imageKey: event.target.value })}
              />
            </GLField>
          </details>
        ))}
        <MediaLibraryMenu
          title="Bibliothèque — images intro"
          layout="gallery"
          fetchItems={mediaApi.fetchItems}
          uploadDataUrl={mediaApi.uploadDataUrl}
          removeItem={mediaApi.removeItem}
          onPickUrl={() => {}}
          manageHint="Importez GL_intro_*.png puis recopiez la clé stable dans la scène."
        />
      </section>

      <section className="gl-intro-admin__section">
        <h3>Finale</h3>
        <GLField label="Bouton CTA">
          <GLInput
            value={draft.finale?.button || ''}
            onChange={(event) => setDraft((prev) => ({
              ...prev,
              finale: { ...prev.finale, button: event.target.value },
            }))}
          />
        </GLField>
      </section>
    </div>
  );
}
