import React from 'react';

/**
 * Config rapide du profil sélectionné (colonne gauche de l'admin des profils) — extraite de
 * `ProfilesAdminView` (O5/O6). Résumé de progression + champ emoji (aperçu + enregistrement) et
 * champ PIN. Présentation pure : `role` est le profil sélectionné, l'état/les effets restent au parent.
 */
export function ProfilesRoleQuickConfig({
  role,
  roleEmoji = '',
  onRoleEmojiChange,
  onSaveEmoji,
  pin = '',
  onPinChange,
  onSavePin,
  loading = false,
  roleTerms = {},
}) {
  if (!role) return null;
  const isStudentTier = /^eleve_/i.test(String(role.slug || ''));
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: '.78rem', color: '#6b7280', marginBottom: 6 }}>
        Progression: emoji {role.emoji || '—'} · niveau requis {role.min_done_tasks ?? '—'} · ordre{' '}
        {role.display_order ?? 0}
      </div>
      <div className="field" style={{ marginBottom: 10 }}>
        <label htmlFor="profile-emoji-input">Emoji du profil</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <input
            id="profile-emoji-input"
            type="text"
            value={roleEmoji}
            onChange={(e) => onRoleEmojiChange(e.target.value)}
            maxLength={16}
            disabled={loading}
            placeholder="ex. 🌿"
            autoComplete="off"
            style={{
              width: 120,
              padding: '6px 8px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              fontSize: '1.2rem',
              lineHeight: 1.2,
            }}
            aria-label={`Emoji pour le profil ${role.display_name}`}
          />
          <span style={{ fontSize: '1.5rem', lineHeight: 1 }} title="Aperçu" aria-hidden>
            {roleEmoji.trim() || '—'}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onSaveEmoji} disabled={loading}>
            Enregistrer l’emoji
          </button>
        </div>
        <p style={{ fontSize: '.72rem', color: '#6b7280', margin: '6px 0 0', lineHeight: 1.4 }}>
          {isStudentTier
            ? `Obligatoire pour un profil ${roleTerms.studentSingular} (max. 16 caractères).`
            : 'Optionnel pour les autres profils (max. 16 caractères).'}
        </p>
      </div>
      <div className="field">
        <label>PIN du profil {role.display_name}</label>
        <input
          type="password"
          value={pin}
          onChange={(e) => onPinChange(e.target.value)}
          placeholder="Nouveau PIN"
        />
      </div>
      <button className="btn btn-secondary btn-sm" onClick={onSavePin} disabled={loading}>
        Enregistrer PIN
      </button>
    </div>
  );
}
