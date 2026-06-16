import React, { useEffect, useState } from 'react';
import { apiGL } from '../../services/apiGL.js';
import { GLButton } from '../ui/GLButton.jsx';

/**
 * Scènes de récit conventionnelles d'un chapitre (médiathèque `recit_0N-chapN_*`) :
 * aperçu de ce qui s'affiche dans l'Histoire, et édition des métas (légende,
 * ordre, couverture) sans renommer les fichiers.
 */
export function GLChapterScenesAdminPanel({ plateauNumber, onInfo, onError }) {
  const chapterNumber = Number(plateauNumber);
  const hasChapter = Number.isInteger(chapterNumber) && chapterNumber >= 0 && chapterNumber <= 5;
  const [scenes, setScenes] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState(null);

  async function loadScenes() {
    if (!hasChapter) return;
    setLoading(true);
    try {
      const data = await apiGL(
        `/api/gl/admin/media-library/chapter-scenes?chapter=${chapterNumber}`,
      );
      const list = Array.isArray(data?.scenes) ? data.scenes : [];
      setScenes(list);
      setDrafts(
        Object.fromEntries(
          list.map((scene) => [
            scene.stableKey,
            {
              caption: scene.caption || '',
              order: scene.order != null ? String(scene.order) : '',
            },
          ]),
        ),
      );
    } catch (err) {
      onError?.(err.message || 'Chargement des scènes impossible');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadScenes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterNumber]);

  if (!hasChapter) {
    return (
      <p className="gl-hint">
        Définissez le plateau narratif du chapitre pour relier ses scènes de récit (fichiers
        médiathèque <code>GL_recit_0N-chapN_*</code>).
      </p>
    );
  }

  async function saveScene(stableKey, patch) {
    setSavingKey(stableKey);
    try {
      await apiGL('/api/gl/admin/media-library/scene-meta', 'PATCH', {
        stable_key: stableKey,
        ...patch,
      });
      onInfo?.('Scène mise à jour');
      await loadScenes();
    } catch (err) {
      onError?.(err.message || 'Mise à jour de la scène impossible');
    } finally {
      setSavingKey(null);
    }
  }

  function setDraft(stableKey, patch) {
    setDrafts((prev) => ({ ...prev, [stableKey]: { ...prev[stableKey], ...patch } }));
  }

  return (
    <div className="gl-chapter-scenes-admin">
      <p className="gl-hint">
        Scènes détectées par convention{' '}
        <code>
          GL_recit_0{chapterNumber}-{chapterNumber === 0 ? 'prologue' : `chap${chapterNumber}`}_*
        </code>{' '}
        (plateau {chapterNumber || 'prologue'}). Elles s’affichent dans l’Histoire dans l’ordre
        ci-dessous (champ « Ordre », sinon ordre alphabétique des clés). La scène « couverture »
        illustre la Biocénose et sert de repli au fond de plateau. Dans le texte de l’Histoire,{' '}
        <code>![légende](scene:N)</code> intercale la N-ième scène à cet endroit.
      </p>
      {loading ? <p className="gl-hint">Chargement…</p> : null}
      {!loading && scenes.length === 0 ? (
        <p className="gl-hint">
          Aucune scène en médiathèque pour ce chapitre. Déposez des images nommées{' '}
          <code>
            GL_recit_0{chapterNumber}-{chapterNumber === 0 ? 'prologue' : `chap${chapterNumber}`}
            _&lt;titre&gt;.png
          </code>{' '}
          via Contenus → Bibliothèque.
        </p>
      ) : null}
      {scenes.length > 0 ? (
        <ul className="gl-chapter-scenes-admin__list">
          {scenes.map((scene, index) => {
            const draft = drafts[scene.stableKey] || { caption: '', order: '' };
            const dirty =
              draft.caption !== (scene.caption || '') ||
              draft.order !== (scene.order != null ? String(scene.order) : '');
            return (
              <li key={scene.stableKey} className="gl-chapter-scenes-admin__item">
                <img
                  src={scene.url}
                  alt={scene.caption || scene.stableKey}
                  loading="lazy"
                  width={96}
                  style={{ maxWidth: 96, borderRadius: 6 }}
                />
                <div className="gl-chapter-scenes-admin__fields">
                  <strong>
                    #{index + 1} · <code>{scene.stableKey}</code>
                    {scene.cover ? ' · couverture' : ''}
                  </strong>
                  <label>
                    Légende (alt + figcaption)
                    <input
                      value={draft.caption}
                      placeholder="Scène du récit"
                      onChange={(event) =>
                        setDraft(scene.stableKey, { caption: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Ordre
                    <input
                      type="number"
                      value={draft.order}
                      placeholder="auto"
                      style={{ width: 90 }}
                      onChange={(event) => setDraft(scene.stableKey, { order: event.target.value })}
                    />
                  </label>
                  <span className="gl-inline-actions">
                    <GLButton
                      type="button"
                      size="sm"
                      disabled={!dirty || savingKey === scene.stableKey}
                      onClick={() =>
                        saveScene(scene.stableKey, {
                          caption: draft.caption.trim() || null,
                          order: draft.order.trim() === '' ? null : Number(draft.order),
                        })
                      }
                    >
                      Enregistrer
                    </GLButton>
                    {!scene.cover ? (
                      <GLButton
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={savingKey === scene.stableKey}
                        onClick={() => saveScene(scene.stableKey, { cover: true })}
                      >
                        Définir couverture
                      </GLButton>
                    ) : (
                      <GLButton
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={savingKey === scene.stableKey}
                        onClick={() => saveScene(scene.stableKey, { cover: false })}
                      >
                        Retirer couverture
                      </GLButton>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
