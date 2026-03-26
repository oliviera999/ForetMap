import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { statusBadge } from '../utils/badges';
import { getDicebearAvatarUrl, getStudentAvatarUrl } from '../utils/avatar';
import { getRoleTerms } from '../utils/n3-terminology';
import { StudentAvatar } from './student-avatar';

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
  const RANKS = [
    { min: 0, label: '🪨 Nouveau', color: '#94a3b8' },
    { min: 1, label: '🌱 Débutant', color: '#86efac' },
    { min: 5, label: '🌿 Actif', color: '#52b788' },
    { min: 10, label: '🏆 Expert', color: '#1a4731' },
  ];
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
        <span style={{ background: 'var(--parchment)', borderRadius: 20, padding: '4px 12px', fontSize: '.8rem', fontWeight: 600, color: 'var(--soil)' }}>{currentRank.label}</span>
      </div>
      <p className="section-sub">Bonjour {data.first_name} ! Voici ton bilan dans la forêt.</p>
      {data.pseudo && <p className="section-sub" style={{ marginTop: 0 }}>Pseudo public : @{data.pseudo}</p>}
      {data.description && <p className="section-sub" style={{ marginTop: 0 }}>{data.description}</p>}

      <div className="rank-progress">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--forest)' }}>{currentRank.label}</span>
          {nextRank && <span style={{ fontSize: '.76rem', color: '#aaa' }}>Prochain : {nextRank.label} ({nextRank.min - stats.done} tâche{nextRank.min - stats.done > 1 ? 's' : ''} restante{nextRank.min - stats.done > 1 ? 's' : ''})</span>}
          {!nextRank && <span style={{ fontSize: '.76rem', color: currentRank.color, fontWeight: 600 }}>Rang maximum atteint !</span>}
        </div>
        <div className="rank-bar-bg">
          <div className="rank-bar-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="rank-steps">
          {RANKS.map(r => (
            <span key={r.min} className={stats.done >= r.min ? 'current' : ''}>{r.label.split(' ')[0]}</span>
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
  const [err, setErr] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const onAvatarSelected = (file) => {
    if (!file) return;
    const allowed = new Set(['image/png', 'image/jpeg', 'image/webp']);
    if (!allowed.has(file.type)) {
      setErr('Format image invalide (png/jpg/webp)');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setErr('Image trop lourde (max 2 Mo)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setAvatarData(dataUrl);
      setAvatarPreview(dataUrl);
      setRemoveAvatar(false);
    };
    reader.readAsDataURL(file);
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
          </div>
        </div>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={e => onAvatarSelected(e.target.files?.[0])}
        />
        <div className="profile-avatar-actions">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setAvatarData(null);
              setRemoveAvatar(true);
              setAvatarPreview(getDicebearAvatarUrl(student));
            }}
          >
            Utiliser l&apos;avatar DiceBear
          </button>
        </div>
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
        <button className="btn btn-primary" onClick={save} disabled={loading} style={{ flex: 1 }}>
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
            return (
              <div key={s.id} className="lb-row" style={{ gap: 8 }}>
                <div className={`lb-rank ${rankClass(realRank)}`}>{rankIcon(realRank)}</div>
                <StudentAvatar student={s} size={30} style={{ border: '1px solid #ddd' }} />
                <div className="lb-name" style={{ flex: 1, minWidth: 0 }}>
                  <strong>{s.first_name} {s.last_name}</strong>
                  <small>
                    {s.last_seen
                      ? `Vu le ${new Date(s.last_seen).toLocaleDateString('fr-FR')}`
                      : 'Jamais connecté'}
                  </small>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                  <div className="lb-stat">
                    <div className="lb-stat-num" style={{ color: 'var(--sage)' }}>{s.stats.done}</div>
                    <div className="lb-stat-label">✅</div>
                  </div>
                  <div className="lb-stat">
                    <div className="lb-stat-num" style={{ color: '#f59e0b' }}>{s.stats.pending}</div>
                    <div className="lb-stat-label">⏳</div>
                  </div>
                  <div className="lb-stat">
                    <div className="lb-stat-num">{s.stats.total}</div>
                    <div className="lb-stat-label">total</div>
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
