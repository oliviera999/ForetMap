import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { statusBadge } from '../utils/badges';
import { getDicebearAvatarUrl, getStudentAvatarUrl } from '../utils/avatar';
import { getRoleTerms } from '../utils/n3-terminology';
import { StudentAvatar } from './student-avatar';
import { compressImage } from '../utils/image';

function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2400); return () => clearTimeout(t); }, []);
  return <div className="toast" role="status" aria-live="polite" aria-atomic="true">{msg}</div>;
}

function StudentStats({ student, isN3Affiliated = false }) {
  const roleTerms = getRoleTerms(isN3Affiliated);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api(`/api/stats/me/${student.id}`).then(setData).catch(err => {
      console.error('[ForetMap] stats élève', err);
      setError(err?.message || 'Impossible de charger vos statistiques.');
    });
  }, [student.id]);

  if (!data && !error) return <div className="loader" style={{ height: '60vh' }}><div className="loader-leaf">🌿</div><p>Chargement...</p></div>;
  if (!data && error) return (
    <div className="empty" style={{ minHeight: '40vh' }}>
      <div className="empty-icon">⚠️</div>
      <p>{error}</p>
    </div>
  );

  const { stats, assignments } = data;
  const defaultIconBySlug = {
    eleve_novice: '🪨',
    eleve_avance: '🌿',
    eleve_chevronne: '🏆',
  };
  const RANKS = (Array.isArray(data?.progression?.steps) && data.progression.steps.length > 0
    ? data.progression.steps
    : [
      { roleSlug: 'eleve_novice', min: 0, label: 'Élève novice' },
      { roleSlug: 'eleve_avance', min: 5, label: 'Élève avancé' },
      { roleSlug: 'eleve_chevronne', min: 10, label: 'Élève chevronné' },
    ])
    .map((step, i) => ({
      ...step,
      color: i === 0 ? '#94a3b8' : i === 1 ? '#52b788' : '#1a4731',
      icon: String(step.emoji || '').trim() || defaultIconBySlug[String(step.roleSlug || '').toLowerCase()] || '🌿',
    }))
    .sort((a, b) => a.min - b.min);
  const currentRank = [...RANKS].reverse().find(r => stats.done >= r.min) || RANKS[0];
  const nextRank = RANKS[RANKS.indexOf(currentRank) + 1];
  const progressPct = nextRank
    ? Math.min(100, ((stats.done - currentRank.min) / (nextRank.min - currentRank.min)) * 100)
    : 100;

  return (
    <div className="fade-in">
      <div className="stats-title-row">
        <div className="stats-title-left">
          <StudentAvatar student={data} size={34} />
          <h2 className="section-title" style={{ marginBottom: 0 }}>📊 Mes statistiques</h2>
        </div>
        <span
          style={{ background: 'var(--parchment)', borderRadius: 20, padding: '4px 12px', fontSize: '.8rem', fontWeight: 600, color: 'var(--soil)' }}
          title="Profil élève actuel"
        >
          Profil actuel : {currentRank.icon} {currentRank.label}
        </span>
      </div>
      <p className="section-sub">Bonjour {data.first_name} ! Voici ton bilan dans la forêt.</p>
      {data.pseudo && <p className="section-sub" style={{ marginTop: 0 }}>Pseudo public : @{data.pseudo}</p>}
      {data.description && <p className="section-sub" style={{ marginTop: 0 }}>{data.description}</p>}

      <div className="rank-progress">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--forest)' }}>
            Profil actuel : {currentRank.icon} {currentRank.label}
          </span>
          {nextRank && <span style={{ fontSize: '.76rem', color: '#aaa' }}>Prochain profil : {nextRank.icon} {nextRank.label} ({nextRank.min - stats.done} tâche{nextRank.min - stats.done > 1 ? 's' : ''} restante{nextRank.min - stats.done > 1 ? 's' : ''})</span>}
          {!nextRank && <span style={{ fontSize: '.76rem', color: currentRank.color, fontWeight: 600 }}>Profil maximum atteint !</span>}
        </div>
        <div className="rank-bar-bg">
          <div className="rank-bar-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="rank-steps">
          {RANKS.map(r => (
            <span key={`${r.roleSlug || r.label}-${r.min}`} className={stats.done >= r.min ? 'current' : ''}>{r.icon}</span>
          ))}
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card highlight">
          <div className="stat-icon">✅</div>
          <div className="stat-number">{stats.done}</div>
          <div className="stat-label">Tâches validées</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⏳</div>
          <div className="stat-number">{stats.pending}</div>
          <div className="stat-label">En cours</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📋</div>
          <div className="stat-number">{stats.submitted}</div>
          <div className="stat-label">En attente {roleTerms.teacherShort}</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🌱</div>
          <div className="stat-number">{stats.total}</div>
          <div className="stat-label">Total prises</div>
        </div>
      </div>

      <h3 style={{ fontFamily: 'Playfair Display,serif', fontSize: '1.1rem', marginBottom: 12, color: 'var(--forest)' }}>Activité récente</h3>
      <div className="activity-list">
        {assignments.length === 0
          ? <div className="empty"><div className="empty-icon">🌿</div><p>Aucune tâche prise pour l'instant</p></div>
          : assignments.slice(0, 10).map((a, i) => (
            <div key={i} className="activity-item">
              <div className={`activity-dot ${a.status}`} />
              <div className="activity-info">
                <div className="activity-title">{a.title}</div>
                <div className="activity-meta">
                  {a.zone_name && `📍 ${a.zone_name} · `}
                  {new Date(a.assigned_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                </div>
              </div>
              {statusBadge(a.status)}
            </div>
          ))
        }
      </div>
    </div>
  );
}

function StudentProfileEditor({ student, onUpdated, onClose, isN3Affiliated = false }) {
  const roleTerms = getRoleTerms(isN3Affiliated);
  const fallbackDisplayName = String(student?.display_name || student?.displayName || student?.email || 'Utilisateur').trim();
  const displayFirstName = String(student?.first_name || '').trim() || fallbackDisplayName;
  const displayLastName = String(student?.last_name || '').trim();
  const profileType = (() => {
    const roleSlug = String(student?.auth?.roleSlug || '').toLowerCase();
    if (roleSlug === 'admin') return 'admin';
    if (roleSlug.startsWith('prof')) return roleTerms.teacherShort;
    if (roleSlug.startsWith('eleve')) return roleTerms.studentSingular;
    const userType = String(student?.auth?.userType || student?.user_type || '').toLowerCase();
    if (userType === 'teacher' || userType === 'user') return roleTerms.teacherShort;
    if (userType === 'student') return roleTerms.studentSingular;
    return roleTerms.studentSingular;
  })();

  const [pseudo, setPseudo] = useState(student?.pseudo || '');
  const [email, setEmail] = useState(student?.email || '');
  const [description, setDescription] = useState(student?.description || '');
  const [affiliation, setAffiliation] = useState(student?.affiliation || 'both');
  const [avatarPreview, setAvatarPreview] = useState(getStudentAvatarUrl(student));
  const [avatarData, setAvatarData] = useState(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [avatarProcessing, setAvatarProcessing] = useState(false);
  const [err, setErr] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const estimateDataUrlBytes = (dataUrl) => {
    const payload = String(dataUrl || '').split(',')[1] || '';
    if (!payload) return 0;
    const padding = payload.endsWith('==') ? 2 : (payload.endsWith('=') ? 1 : 0);
    return Math.floor((payload.length * 3) / 4) - padding;
  };

  const onAvatarSelected = async (file) => {
    if (!file) return;
    if (!String(file.type || '').startsWith('image/')) {
      setErr('Format image invalide (image requise)');
      return;
    }
    setErr('');
    setAvatarProcessing(true);
    try {
      // Uniformise les uploads (galerie/caméra) et limite la taille.
      const compressed = await compressImage(file, 1200, 0.72);
      if (estimateDataUrlBytes(compressed) > 2 * 1024 * 1024) {
        setErr('Image trop lourde après compression (max 2 Mo)');
        return;
      }
      setAvatarData(compressed);
      setAvatarPreview(compressed);
      setRemoveAvatar(false);
    } catch (e) {
      setErr(e?.message || 'Image invalide');
    } finally {
      setAvatarProcessing(false);
    }
  };

  const save = async () => {
    setErr('');
    setOkMsg('');
    if (!currentPassword) return setErr('Mot de passe actuel requis');
    if (pseudo.trim() && !/^[A-Za-z0-9_.-]{3,30}$/.test(pseudo.trim())) {
      return setErr('Pseudo invalide (3-30 caractères, lettres/chiffres/._-)');
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setErr('Email invalide');
    }
    if (description.trim().length > 300) {
      return setErr('Description trop longue (max 300 caractères)');
    }

    setLoading(true);
    try {
      const payload = {
        pseudo: pseudo.trim() || null,
        email: email.trim() || null,
        description: description.trim() || null,
        affiliation,
        currentPassword,
      };
      if (avatarData) payload.avatarData = avatarData;
      if (removeAvatar) payload.removeAvatar = true;

      const roleSlug = String(student?.auth?.roleSlug || '').toLowerCase();
      const userType = String(student?.auth?.userType || student?.user_type || '').toLowerCase();
      const isTeacherLike = roleSlug === 'admin' || roleSlug.startsWith('prof') || userType === 'teacher' || userType === 'user';
      const endpoint = isTeacherLike ? '/api/auth/me/profile' : `/api/students/${student.id}/profile`;
      const updated = await api(endpoint, 'PATCH', payload);
      onUpdated(updated);
      setPseudo(updated?.pseudo || '');
      setEmail(updated?.email || '');
      setDescription(updated?.description || '');
      setAffiliation(updated?.affiliation || 'both');
      setCurrentPassword('');
      setAvatarData(null);
      setRemoveAvatar(false);
      setAvatarPreview(getStudentAvatarUrl(updated));
      setOkMsg('Profil mis à jour');
    } catch (e) {
      setErr(e.message || 'Impossible de mettre à jour le profil');
    }
    setLoading(false);
  };

  return (
    <div className="fade-in">
      <h2 className="section-title">👤 Mon profil</h2>
      <p className="section-sub">
        Modifie ton pseudo, ton mail et ta description. Ton mail reste privé.
      </p>

      <div className="field">
        <label>Photo de profil</label>
        <div className="profile-avatar-row">
          {avatarPreview
            ? <img src={avatarPreview} alt="Aperçu avatar" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', border: '1px solid #ddd' }} />
            : <StudentAvatar student={student} size={52} style={{ border: '1px solid #ddd' }} />}
          <div className="profile-avatar-help">
            Par défaut, l&apos;avatar est généré automatiquement via DiceBear.
            Tu peux aussi prendre une photo directement.
          </div>
        </div>
        <div className="profile-avatar-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              if (galleryInputRef.current) galleryInputRef.current.value = '';
              galleryInputRef.current?.click();
            }}
            disabled={loading || avatarProcessing}
          >
            📁 Choisir une photo
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              if (cameraInputRef.current) cameraInputRef.current.value = '';
              cameraInputRef.current?.click();
            }}
            disabled={loading || avatarProcessing}
          >
            📸 Prendre une photo
          </button>
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => onAvatarSelected(e.target.files?.[0])}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={(e) => onAvatarSelected(e.target.files?.[0])}
          />
        </div>
        <div className="profile-avatar-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setAvatarData(null);
              setRemoveAvatar(true);
              setAvatarPreview(getDicebearAvatarUrl(student));
              setErr('');
            }}
            disabled={loading || avatarProcessing}
          >
            Utiliser l&apos;avatar DiceBear
          </button>
        </div>
        {avatarProcessing && (
          <div style={{ fontSize: '.82rem', color: '#4b5563', marginTop: 6 }}>
            Traitement de la photo en cours...
          </div>
        )}
      </div>

      <div className="field">
        <label>Nom complet</label>
        <input value={`${displayFirstName} ${displayLastName}`.trim()} disabled />
      </div>
      <div className="field">
        <label>Type de profil</label>
        <input value={profileType} disabled />
      </div>
      <div className="field">
        <label>Pseudo</label>
        <input value={pseudo} onChange={e => setPseudo(e.target.value)} placeholder="momo_lyautey" />
      </div>
      <div className="field">
        <label>Mail</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="moi@exemple.com" />
      </div>
      <div className="field">
        <label>Mon espace</label>
        <select value={affiliation} onChange={e => setAffiliation(e.target.value)}>
          <option value="both">N3 + Forêt comestible</option>
          <option value="n3">N3 uniquement</option>
          <option value="foret">Forêt comestible uniquement</option>
        </select>
      </div>
      <div className="field">
        <label>Description</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
          maxLength={300}
          placeholder="Je participe souvent à l'arrosage."
        />
      </div>
      <div className="field">
        <label>Mot de passe actuel</label>
        <input
          type="password"
          value={currentPassword}
          onChange={e => setCurrentPassword(e.target.value)}
          placeholder="••••"
        />
      </div>
      {err && <div className="auth-error">⚠️ {err}</div>}
      {okMsg && <div className="toast" style={{ position: 'static', marginTop: 4 }}>{okMsg}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <button className="btn btn-primary" onClick={save} disabled={loading || avatarProcessing} style={{ flex: 1 }}>
          {loading ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button className="btn btn-ghost" onClick={onClose} disabled={loading} style={{ flex: 1 }}>
          Fermer
        </button>
      </div>
    </div>
  );
}

function TeacherStats({ isN3Affiliated = false }) {
  const roleTerms = getRoleTerms(isN3Affiliated);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);

  const load = useCallback(() => api('/api/stats/all').then((rows) => {
    setData(rows);
    setError('');
  }).catch(err => {
    console.error('[ForetMap] stats tous', err);
    setData([]);
    setError(err?.message || 'Impossible de charger les statistiques.');
    setToast('Impossible de charger les statistiques.');
  }), []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onRealtime = (e) => {
      if (e.detail && e.detail.domain === 'students') load();
    };
    window.addEventListener('foretmap_realtime', onRealtime);
    return () => window.removeEventListener('foretmap_realtime', onRealtime);
  }, [load]);

  if (!data) return <div className="loader" style={{ height: '60vh' }}><div className="loader-leaf">🌿</div><p>Chargement...</p></div>;

  const filtered = data.filter(s =>
    `${s.first_name} ${s.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  const maxDone = Math.max(...data.map(s => s.stats.done), 1);
  const rankIcon = i => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
  const rankClass = i => i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';

  const totalValidated = data.reduce((s, d) => s + d.stats.done, 0);
  const totalPending = data.reduce((s, d) => s + d.stats.pending, 0);
  const activeStudents = data.filter(d => d.stats.total > 0).length;

  return (
    <div className="fade-in">
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h2 className="section-title">📊 Statistiques des {roleTerms.studentPlural}</h2>
      </div>
      <p className="section-sub">{data.length} {data.length > 1 ? roleTerms.studentPlural : roleTerms.studentSingular} inscrit{data.length > 1 ? 's' : ''}</p>
      {error && (
        <div className="auth-error" style={{ marginBottom: 10 }}>
          ⚠️ {error}
        </div>
      )}

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
        <div className="stat-card highlight">
          <div className="stat-icon">✅</div>
          <div className="stat-number">{totalValidated}</div>
          <div className="stat-label">Tâches validées</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⏳</div>
          <div className="stat-number">{totalPending}</div>
          <div className="stat-label">En cours</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">👤</div>
          <div className="stat-number">{activeStudents}</div>
          <div className="stat-label">Actifs</div>
        </div>
      </div>

      <div className="field" style={{ marginBottom: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder={`🔍 Rechercher un(e) ${roleTerms.studentSingular}...`}
          style={{ background: 'white' }} />
      </div>

      <div className="leaderboard">
        {filtered.length === 0
          ? <div className="empty" style={{ padding: 32 }}>
            <div className="empty-icon">👤</div>
            <p>{search ? `Aucun(e) ${roleTerms.studentSingular} trouvé(e)` : `Aucun(e) ${roleTerms.studentSingular} inscrit(e)`}</p>
          </div>
          : filtered.map((s) => {
            const realRank = data.findIndex(d => d.id === s.id);
            const completionRate = s.stats.total > 0
              ? Math.round((s.stats.done / s.stats.total) * 100)
              : 0;
            return (
              <div key={s.id} className="lb-row" style={{ gap: 8 }}>
                <div className={`lb-rank ${rankClass(realRank)}`}>{rankIcon(realRank)}</div>
                <StudentAvatar student={s} size={30} style={{ border: '1px solid #ddd' }} />
                <div className="lb-name" style={{ flex: 1, minWidth: 0 }}>
                  <strong>{s.first_name} {s.last_name}</strong>
                  {s.pseudo && (
                    <div className="lb-pseudo" style={{ fontSize: '.72rem', color: '#4b5563', marginTop: 1 }}>
                      @{s.pseudo}
                    </div>
                  )}
                  {s.description && (
                    <div
                      className="lb-description"
                      style={{
                        fontSize: '.72rem',
                        color: '#6b7280',
                        marginTop: 2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: 220,
                      }}
                      title={s.description}
                    >
                      {s.description}
                    </div>
                  )}
                  {s?.progression?.roleDisplayName && (
                    <div className="lb-profile-badge-wrap" style={{ marginTop: 2 }}>
                      <span className="lb-profile-badge" style={{
                        display: 'inline-block',
                        fontSize: '.7rem',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: '#ecfdf5',
                        color: '#065f46',
                        border: '1px solid #a7f3d0',
                      }}
                      >
                        Profil : {s.progression.roleEmoji ? `${s.progression.roleEmoji} ` : ''}{s.progression.roleDisplayName}
                      </span>
                    </div>
                  )}
                  <small>
                    {s.last_seen
                      ? `Vu le ${new Date(s.last_seen).toLocaleDateString('fr-FR')}`
                      : 'Jamais connecté'}
                  </small>
                </div>
                <div className="lb-stats" style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                  <div className="lb-stat lb-stat-done">
                    <div className="lb-stat-num" style={{ color: 'var(--sage)' }}>{s.stats.done}</div>
                    <div className="lb-stat-label">✅</div>
                  </div>
                  <div className="lb-stat lb-stat-submitted">
                    <div className="lb-stat-num" style={{ color: '#6366f1' }}>{s.stats.submitted}</div>
                    <div className="lb-stat-label">📋</div>
                  </div>
                  <div className="lb-stat lb-stat-pending">
                    <div className="lb-stat-num" style={{ color: '#f59e0b' }}>{s.stats.pending}</div>
                    <div className="lb-stat-label">⏳</div>
                  </div>
                  <div className="lb-stat lb-stat-total">
                    <div className="lb-stat-num">{s.stats.total}</div>
                    <div className="lb-stat-label">total</div>
                  </div>
                  <div className="lb-stat lb-stat-rate" title="Part des tâches validées sur le total des tâches prises">
                    <div className="lb-stat-num" style={{ color: '#0f766e' }}>{completionRate}%</div>
                    <div className="lb-stat-label">🎯</div>
                  </div>
                  <div style={{ width: 60, display: 'none' }} className="lb-bar-desktop">
                    <div className="lb-bar-bg">
                      <div className="lb-bar-fill" style={{ width: `${(s.stats.done / maxDone) * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        }
      </div>
    </div>
  );
}

export { StudentStats, StudentProfileEditor, TeacherStats };
