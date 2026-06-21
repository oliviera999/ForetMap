import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { AutoSaveStatus } from '../../shared/components/AutoSaveStatus.jsx';
import { useDebouncedAutoSave } from '../../shared/hooks/useDebouncedAutoSave.js';
import { GLProfileAvatar } from './GLProfileAvatar.jsx';
import { GLPasswordChangeForm } from './GLPasswordChangeForm.jsx';
import { GLForetmapLinkPanel } from './GLForetmapLinkPanel.jsx';
import { GLButton } from './ui/GLButton.jsx';
import { GLField } from './ui/GLField.jsx';
import { GLInput } from './ui/GLInput.jsx';
import { GLTextarea } from './ui/GLTextarea.jsx';

export function GLProfileEditor({ auth, profile, config, onSessionUpdated, onReloadProfile }) {
  const isAdmin = auth?.userType === 'gl_admin';
  const [pseudo, setPseudo] = useState(profile?.pseudo || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [description, setDescription] = useState(profile?.description || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [avatarData, setAvatarData] = useState(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    setPseudo(profile?.pseudo || '');
    setEmail(profile?.email || '');
    setDisplayName(profile?.display_name || '');
    setDescription(profile?.description || '');
    setAvatarData(null);
    setRemoveAvatar(false);
  }, [profile]);

  const roleLabel = useMemo(() => {
    const role = String(auth?.roleSlug || '');
    if (role === 'gl_admin') return 'Administrateur GL';
    if (role === 'gl_mj') return 'Maitre du jeu';
    return 'Joueur';
  }, [auth]);

  async function saveProfile() {
    setBusy(true);
    setError('');
    setOk('');
    try {
      const payload = {
        currentPassword,
        description: description.trim() || null,
      };
      if (isAdmin) {
        payload.displayName = displayName.trim() || null;
      } else {
        payload.pseudo = pseudo.trim() || null;
        payload.email = email.trim().toLowerCase() || null;
      }
      if (avatarData) payload.avatarData = avatarData;
      if (removeAvatar) payload.removeAvatar = true;
      const data = await apiGL('/api/gl/auth/me/profile', 'PATCH', payload);
      setCurrentPassword('');
      setAvatarData(null);
      setRemoveAvatar(false);
      setOk('Profil mis a jour.');
      onSessionUpdated?.(data);
      await onReloadProfile?.();
      return {
        pseudo,
        email,
        displayName,
        description,
        avatarData: null,
        removeAvatar: false,
        currentPassword: '',
      };
    } catch (err) {
      setError(err.message || 'Mise a jour impossible');
      throw err;
    } finally {
      setBusy(false);
    }
  }

  const profileDraft = useMemo(
    () => ({
      pseudo,
      email,
      displayName,
      description,
      avatarData,
      removeAvatar,
      currentPassword,
    }),
    [pseudo, email, displayName, description, avatarData, removeAvatar, currentPassword],
  );

  const { status: saveStatus, error: saveError } = useDebouncedAutoSave({
    value: profileDraft,
    resetKey: profile?.id,
    enabled: Boolean(String(currentPassword || '').trim()),
    onSave: saveProfile,
  });

  if (!profile) {
    return (
      <section className="gl-panel">
        <p className="gl-hint">Chargement du profil...</p>
      </section>
    );
  }

  return (
    <div className="gl-profile-layout">
      <section className="gl-panel">
        <h2>Mon profil</h2>
        <p className="gl-hint">
          Role actuel : <strong>{roleLabel}</strong>
        </p>
        {error ? <p className="gl-error">{error}</p> : null}
        {saveError ? <p className="gl-error">{saveError}</p> : null}
        {ok ? <p className="gl-profile-ok">{ok}</p> : null}
        <AutoSaveStatus status={saveStatus} className="gl-hint" />
        <p className="gl-hint">
          Saisissez votre mot de passe actuel : les modifications sont enregistrées automatiquement.
        </p>
        <form className="gl-form" onSubmit={(event) => event.preventDefault()}>
          <GLProfileAvatar
            profile={profile}
            auth={auth}
            avatarData={avatarData}
            onAvatarData={setAvatarData}
            removeAvatar={removeAvatar}
            onRemoveAvatar={setRemoveAvatar}
            onError={setError}
            busy={busy}
          />
          {isAdmin ? (
            <GLField label="Nom affiche">
              <GLInput
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </GLField>
          ) : (
            <>
              <GLField label="Pseudo">
                <GLInput
                  value={pseudo}
                  onChange={(event) => setPseudo(event.target.value)}
                  autoComplete="username"
                />
              </GLField>
              <GLField label="Email">
                <GLInput
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                />
              </GLField>
              <p className="gl-hint">
                Classe: {profile?.class_name || '-'} | Equipe: {profile?.team_name || '-'}
              </p>
            </>
          )}
          <GLField label="Description">
            <GLTextarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={300}
            />
          </GLField>
          <GLField label="Mot de passe actuel">
            <GLInput
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
            />
          </GLField>
        </form>
      </section>

      <GLPasswordChangeForm
        isAdmin={isAdmin}
        onChanged={async () => {
          await onReloadProfile?.();
          if (!isAdmin) onSessionUpdated?.({ auth: { ...auth, passwordMustReset: false } });
        }}
      />

      {!isAdmin ? (
        <GLForetmapLinkPanel
          enabled={config?.allowPlayerLinkForetmap === true}
          profile={profile}
          onReload={onReloadProfile}
        />
      ) : null}
    </div>
  );
}
