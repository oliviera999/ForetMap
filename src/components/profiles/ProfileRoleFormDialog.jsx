import { useEffect, useState } from 'react';
import { DialogShell } from '../../shared/components/DialogShell.jsx';
import {
  buildDuplicateRoleProfile,
  buildNewRoleProfile,
  buildRoleDetailsPatch,
} from '../../utils/profilesRoleForm.js';

/**
 * Modale multi-champs pour créer / éditer / dupliquer un profil RBAC
 * (remplace les enchaînements de prompts).
 */
export function ProfileRoleFormDialog({
  open,
  mode, // 'create' | 'edit' | 'duplicate'
  role = null,
  drafts = {},
  /** Profils existants : le rang d'un nouveau palier se déduit de son seuil. */
  roles = [],
  onClose,
  onSubmit,
}) {
  const [slug, setSlug] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [minDone, setMinDone] = useState('');
  const [displayOrder, setDisplayOrder] = useState('100');
  const [localErr, setLocalErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setLocalErr('');
    if (mode === 'edit' && role) {
      setSlug(role.slug || '');
      setDisplayName(role.display_name || '');
      setEmoji((drafts.roleEmoji || role.emoji || '').trim());
      setMinDone(
        drafts.roleMinDoneTasks || (role.min_done_tasks == null ? '' : String(role.min_done_tasks)),
      );
      setDisplayOrder(drafts.roleDisplayOrder || String(role.display_order ?? 0));
    } else if (mode === 'duplicate' && role) {
      setSlug(`${String(role.slug || 'profil').replace(/[^a-z0-9_]+/gi, '_')}_copie`);
      setDisplayName(`${role.display_name || role.slug || 'profil'} (copie)`);
      setEmoji('');
      setMinDone('');
      setDisplayOrder('100');
    } else {
      setSlug('');
      setDisplayName('');
      setEmoji('');
      setMinDone('');
      setDisplayOrder('100');
    }
  }, [open, mode, role, drafts]);

  const title =
    mode === 'edit'
      ? 'Modifier le profil'
      : mode === 'duplicate'
        ? 'Dupliquer le profil'
        : 'Créer un profil';

  const handleSubmit = (e) => {
    e.preventDefault();
    let result;
    if (mode === 'edit') {
      result = buildRoleDetailsPatch(role, {
        display_name: displayName,
        emoji,
        min_done_tasks: minDone,
        display_order: displayOrder,
      });
    } else if (mode === 'duplicate') {
      result = buildDuplicateRoleProfile(role, { slug, display_name: displayName });
    } else {
      result = buildNewRoleProfile(
        {
          slug,
          display_name: displayName,
          emoji,
          min_done_tasks: minDone,
          display_order: displayOrder,
        },
        { roles },
      );
    }
    if (result?.error) {
      setLocalErr(result.error);
      return;
    }
    if (result?.payload) onSubmit?.(result.payload);
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      ariaLabel={title}
      showCloseButton
      dialogClassName="log-modal fade-in"
      dialogStyle={{ maxWidth: 440, width: '92vw' }}
    >
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <form onSubmit={handleSubmit}>
        {(mode === 'create' || mode === 'duplicate') && (
          <label className="field">
            <span>Slug technique</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              autoComplete="off"
              required
            />
          </label>
        )}
        <label className="field">
          <span>Nom affiché</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="off"
            required
          />
        </label>
        {mode !== 'duplicate' && (
          <>
            <label className="field">
              <span>Emoji</span>
              <input value={emoji} onChange={(e) => setEmoji(e.target.value)} autoComplete="off" />
            </label>
            <label className="field">
              <span>Niveau requis (tâches validées)</span>
              <input
                type="number"
                min={0}
                value={minDone}
                onChange={(e) => setMinDone(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Ordre d’affichage</span>
              <input
                type="number"
                min={0}
                value={displayOrder}
                onChange={(e) => setDisplayOrder(e.target.value)}
              />
            </label>
          </>
        )}
        {localErr ? <p className="auth-error">{localErr}</p> : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary">
            Enregistrer
          </button>
        </div>
      </form>
    </DialogShell>
  );
}
