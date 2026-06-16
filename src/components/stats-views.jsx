import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api } from '../services/api';
import { statusBadge } from '../utils/badges';
import { getDicebearAvatarUrl, getStudentAvatarUrl } from '../utils/avatar';
import { getRoleTerms } from '../utils/n3-terminology';
import { StudentAvatar } from './student-avatar';
import { compressImageWithPreset } from '../utils/image';
import { MarkdownTextarea } from './MarkdownTextarea.jsx';
import {
  estimateDataUrlBytes,
  deriveProfileTypeLabel,
  profileUpdateEndpoint,
  buildProfileAffiliationOptions,
  buildVisitMascotOptions,
  validateProfileEditorFields,
} from '../utils/studentProfileFields.js';
import { useHelp } from '../hooks/useHelp';
import { HelpPanel } from './HelpPanel';
import { HELP_PANELS } from '../constants/help';
import { StatCard, StatsSummaryGrid } from '../shared/components/StatsSummaryGrid.jsx';
import { TimedToast } from '../shared/components/TimedToast.jsx';
import { TeacherObservationsPanel } from './stats/TeacherObservationsPanel.jsx';
import { TeacherLeaderboard } from './stats/TeacherLeaderboard.jsx';
import { deriveStudentProgressionView } from '../utils/studentStatsProgression.js';
import { usePublicSettings } from '../contexts/PublicSettingsContext.jsx';
import { useSession } from '../contexts/SessionContext.jsx';

function StudentStats({ student }) {
  const { isN3Affiliated = false } = useSession();
  const roleTerms = getRoleTerms(isN3Affiliated);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api(`/api/stats/me/${student.id}`)
      .then(setData)
      .catch((err) => {
        console.error('[ForetMap] stats n3beur', err);
        setError(err?.message || 'Impossible de charger tes stats pour l’instant.');
      });
  }, [student.id]);

  if (!data && !error)
    return (
      <div className="loader" style={{ height: '60vh' }}>
        <div className="loader-leaf">🌿</div>
        <p>Chargement...</p>
      </div>
    );
  if (!data && error)
    return (
      <div className="empty" style={{ minHeight: '40vh' }}>
        <div className="empty-icon">⚠️</div>
        <p>{error}</p>
      </div>
    );

  const { stats, assignments } = data;
  const {
    ranks: RANKS,
    autoProgressionEnabled,
    taskTier,
    taskTierIndex,
    actualTier,
    nextRank,
    progressPct,
    profileAheadOfTasks,
    profileBehindOfTasks,
    showTaskObjective,
    tasksRemaining,
  } = deriveStudentProgressionView(data?.progression, stats.done);

  return (
    <div className="fade-in">
      <div className="stats-title-row">
        <div className="stats-title-left">
          <StudentAvatar student={data} size={34} />
          <h2 className="section-title" style={{ marginBottom: 0 }}>
            📊 Mes statistiques
          </h2>
        </div>
        <span
          style={{
            background: 'var(--parchment)',
            borderRadius: 20,
            padding: '4px 12px',
            fontSize: '.8rem',
            fontWeight: 600,
            color: 'var(--soil)',
          }}
          title="Palier n3beur actuel"
        >
          Profil actuel : {actualTier.icon} {actualTier.label}
        </span>
      </div>
      <p className="section-sub">
        Salut {data.first_name} ! Voici ton bilan terrain — merci pour ce que tu fais pousser.
      </p>
      {data.pseudo && (
        <p className="section-sub" style={{ marginTop: 0 }}>
          Pseudo public : @{data.pseudo}
        </p>
      )}
      {data.description && (
        <p className="section-sub" style={{ marginTop: 0 }}>
          {data.description}
        </p>
      )}
      {!autoProgressionEnabled && (
        <p
          className="section-sub"
          style={{
            marginTop: 10,
            padding: '10px 12px',
            background: '#fef9c3',
            borderRadius: 10,
            color: '#713f12',
            fontSize: '.88rem',
            lineHeight: 1.45,
          }}
        >
          La montée de palier auto est coupée : ton badge affiché suit un réglage manuel. La barre
          ci-dessous reste un repère (objectifs de tâches validées).
        </p>
      )}

      {profileAheadOfTasks && (
        <p className="section-sub" style={{ marginTop: 8, fontSize: '.85rem', color: '#555' }}>
          Objectif tâches validées : {taskTier.icon} {taskTier.label} (ton profil attribué est plus
          avancé).
        </p>
      )}
      {profileBehindOfTasks && (
        <p className="section-sub" style={{ marginTop: 8, fontSize: '.85rem', color: '#555' }}>
          Objectif tâches validées : {taskTier.icon} {taskTier.label} — ton profil sera mis à jour
          automatiquement.
        </p>
      )}
      <div className="rank-progress">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--forest)' }}>
            {showTaskObjective ? 'Objectif (tâches validées)' : 'Progression'} : {taskTier.icon}{' '}
            {taskTier.label}
          </span>
          {nextRank && (
            <span style={{ fontSize: '.76rem', color: '#aaa' }}>
              Prochain palier : {nextRank.icon} {nextRank.label} ({tasksRemaining} tâche
              {tasksRemaining > 1 ? 's' : ''} restante{tasksRemaining > 1 ? 's' : ''})
            </span>
          )}
          {!nextRank && (
            <span style={{ fontSize: '.76rem', color: taskTier.color, fontWeight: 600 }}>
              Palier maximum atteint (tâches validées) !
            </span>
          )}
        </div>
        <div className="rank-bar-bg">
          <div className="rank-bar-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="rank-steps">
          {RANKS.map((r, i) => (
            <span
              key={`${r.roleSlug || r.label}-${r.min}`}
              className={taskTierIndex >= 0 && i <= taskTierIndex ? 'current' : ''}
              title={r.label}
            >
              {r.icon}
            </span>
          ))}
        </div>
      </div>

      <StatsSummaryGrid>
        <StatCard icon="✅" value={stats.done} label="Tâches validées" highlight />
        <StatCard icon="⏳" value={stats.pending} label="En cours" />
        <StatCard
          icon="📋"
          value={stats.submitted}
          label={`En attente ${roleTerms.teacherShort}`}
        />
        <StatCard icon="🌱" value={stats.total} label="Total prises" />
      </StatsSummaryGrid>

      <h3
        style={{
          fontFamily: 'Playfair Display,serif',
          fontSize: '1.05rem',
          margin: '20px 0 10px',
          color: 'var(--forest)',
        }}
      >
        Biodiversité & tutoriels
      </h3>
      <StatsSummaryGrid>
        <StatCard
          icon="🌿"
          value={Number(stats.plant_species_observed ?? 0).toLocaleString('fr-FR')}
          label="Espèces observées (fiches)"
        />
        <StatCard
          icon="🔭"
          value={Number(stats.plant_observation_events ?? 0).toLocaleString('fr-FR')}
          label="Observations fiches plantes"
        />
        <StatCard
          icon="📖"
          value={Number(stats.tutorials_read ?? 0).toLocaleString('fr-FR')}
          label="Tutoriels lus"
        />
      </StatsSummaryGrid>

      <h3
        style={{
          fontFamily: 'Playfair Display,serif',
          fontSize: '1.1rem',
          marginBottom: 12,
          color: 'var(--forest)',
        }}
      >
        Activité récente
      </h3>
      <div className="activity-list">
        {assignments.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🌿</div>
            <p>Aucune tâche prise pour l'instant</p>
          </div>
        ) : (
          assignments.slice(0, 10).map((a, i) => (
            <div
              key={
                a?.id != null
                  ? String(a.id)
                  : `activity-${a?.task_id ?? 'x'}-${a?.assigned_at ?? i}-${i}`
              }
              className="activity-item"
            >
              <div className={`activity-dot ${a.status}`} />
              <div className="activity-info">
                <div className="activity-title">{a.title}</div>
                <div className="activity-meta">
                  {a.zone_name && `📍 ${a.zone_name} · `}
                  {new Date(a.assigned_at).toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: 'short',
                  })}
                </div>
              </div>
              {statusBadge(a.status)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StudentProfileEditor({ student, onUpdated, onClose, maps = [] }) {
  const publicSettings = usePublicSettings();
  const { isN3Affiliated = false } = useSession();
  const roleTerms = getRoleTerms(isN3Affiliated);
  const fallbackDisplayName = String(
    student?.display_name || student?.displayName || student?.email || 'Utilisateur',
  ).trim();
  const displayFirstName = String(student?.first_name || '').trim() || fallbackDisplayName;
  const displayLastName = String(student?.last_name || '').trim();
  const profileType = deriveProfileTypeLabel(student, roleTerms);

  const [pseudo, setPseudo] = useState(student?.pseudo || '');
  const [email, setEmail] = useState(student?.email || '');
  const [description, setDescription] = useState(student?.description || '');
  const [affiliation, setAffiliation] = useState(student?.affiliation || 'both');
  const [visitMascotCatalogId, setVisitMascotCatalogId] = useState(
    student?.visit_mascot_catalog_id || '',
  );
  const affiliationSelectOptions = useMemo(
    () => buildProfileAffiliationOptions(maps, affiliation, student?.affiliation),
    [maps, affiliation, student?.affiliation],
  );
  const visitMascotOptions = useMemo(
    () => buildVisitMascotOptions(publicSettings?.visit?.mascot?.allowed_ids),
    [publicSettings?.visit?.mascot?.allowed_ids],
  );
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
      const compressed = await compressImageWithPreset(file, 'taskForm');
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
    const validationError = validateProfileEditorFields({
      pseudo,
      email,
      description,
      currentPassword,
    });
    if (validationError) return setErr(validationError);

    setLoading(true);
    try {
      const payload = {
        pseudo: pseudo.trim() || null,
        email: email.trim() || null,
        description: description.trim() || null,
        affiliation,
        visit_mascot_catalog_id: visitMascotCatalogId || null,
        currentPassword,
      };
      if (avatarData) payload.avatarData = avatarData;
      if (removeAvatar) payload.removeAvatar = true;

      const updated = await api(profileUpdateEndpoint(student), 'PATCH', payload);
      onUpdated(updated);
      setPseudo(updated?.pseudo || '');
      setEmail(updated?.email || '');
      setDescription(updated?.description || '');
      setAffiliation(updated?.affiliation || 'both');
      setVisitMascotCatalogId(updated?.visit_mascot_catalog_id || '');
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
          {avatarPreview ? (
            <img
              src={avatarPreview}
              alt="Aperçu avatar"
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '1px solid #ddd',
              }}
            />
          ) : (
            <StudentAvatar student={student} size={52} style={{ border: '1px solid #ddd' }} />
          )}
          <div className="profile-avatar-help">
            Par défaut, l&apos;avatar est généré automatiquement via DiceBear. Tu peux aussi prendre
            une photo directement.
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
        <input
          value={pseudo}
          onChange={(e) => setPseudo(e.target.value)}
          placeholder="momo_lyautey"
        />
      </div>
      <div className="field">
        <label>Mail</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="moi@exemple.com"
        />
      </div>
      <div className="field">
        <label>Mon espace</label>
        <select value={affiliation} onChange={(e) => setAffiliation(e.target.value)}>
          {affiliationSelectOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Mascotte préférée (visite)</label>
        <select
          value={visitMascotCatalogId}
          onChange={(e) => setVisitMascotCatalogId(e.target.value)}
        >
          <option value="">Défaut global du site</option>
          {visitMascotOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Description</label>
        <MarkdownTextarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
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
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="••••"
        />
      </div>
      {err && <div className="auth-error">⚠️ {err}</div>}
      {okMsg && <div className="fm-toast fm-toast--inline">{okMsg}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        <button
          className="btn btn-primary"
          onClick={save}
          disabled={loading || avatarProcessing}
          style={{ flex: 1 }}
        >
          {loading ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button className="btn btn-ghost" onClick={onClose} disabled={loading} style={{ flex: 1 }}>
          Fermer
        </button>
      </div>
    </div>
  );
}

function TeacherStats() {
  const { isN3Affiliated = false } = useSession();
  const roleTerms = getRoleTerms(isN3Affiliated);
  const { isHelpEnabled, hasSeenSection, markSectionSeen, trackPanelOpen, trackPanelDismiss } =
    useHelp({ publicSettings: null, isTeacher: true });
  const helpGroupFilters = HELP_PANELS.groupFilters;
  const [students, setStudents] = useState(null);
  const [site, setSite] = useState(null);
  const [groups, setGroups] = useState([]);
  const [filterGroupId, setFilterGroupId] = useState('');
  const [observations, setObservations] = useState([]);
  const [obsLoading, setObsLoading] = useState(false);
  const [obsError, setObsError] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);

  const load = useCallback(
    () =>
      api(`/api/stats/all${filterGroupId ? `?group_id=${encodeURIComponent(filterGroupId)}` : ''}`)
        .then((payload) => {
          const rows = Array.isArray(payload) ? payload : (payload?.students ?? []);
          setStudents(rows);
          setSite(Array.isArray(payload) ? null : (payload?.site ?? null));
          setError('');
        })
        .catch((err) => {
          console.error('[ForetMap] stats tous', err);
          setStudents([]);
          setSite(null);
          setError(err?.message || 'Impossible de charger les statistiques.');
          setToast('Impossible de charger les statistiques.');
        }),
    [filterGroupId],
  );

  const loadObservations = useCallback(async () => {
    setObsLoading(true);
    setObsError('');
    try {
      const rows = await api(
        `/api/observations/all${filterGroupId ? `?group_id=${encodeURIComponent(filterGroupId)}` : ''}`,
      );
      setObservations(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setObservations([]);
      setObsError(err?.message || 'Impossible de charger les observations globales.');
    } finally {
      setObsLoading(false);
    }
  }, [filterGroupId]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    api('/api/groups/options')
      .then((payload) => setGroups(Array.isArray(payload?.groups) ? payload.groups : []))
      .catch(() => setGroups([]));
  }, []);

  useEffect(() => {
    const onRealtime = (e) => {
      if (e.detail && e.detail.domain === 'students') load();
    };
    window.addEventListener('foretmap_realtime', onRealtime);
    return () => window.removeEventListener('foretmap_realtime', onRealtime);
  }, [load]);

  if (students === null)
    return (
      <div className="loader" style={{ height: '60vh' }}>
        <div className="loader-leaf">🌿</div>
        <p>Chargement...</p>
      </div>
    );

  const data = students;
  const totalValidated = data.reduce((s, d) => s + d.stats.done, 0);
  const totalPending = data.reduce((s, d) => s + d.stats.pending, 0);
  const activeStudents = data.filter((d) => d.stats.total > 0).length;
  const siteSpecies = Number(site?.plant_species_observed ?? 0);
  const siteObsEvents = Number(site?.plant_observation_events ?? 0);
  const siteTutorials = Number(site?.tutorials_read ?? 0);

  return (
    <div className="fade-in">
      {toast && <TimedToast msg={toast} onDone={() => setToast(null)} />}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        <h2 className="section-title">📊 Statistiques des {roleTerms.studentPlural}</h2>
        {isHelpEnabled && (
          <HelpPanel
            sectionId="stats-group-filter"
            title={helpGroupFilters.title}
            entries={helpGroupFilters.items}
            isTeacher
            isPulsing={!hasSeenSection('stats-group-filter')}
            onMarkSeen={markSectionSeen}
            onOpen={trackPanelOpen}
            onDismiss={trackPanelDismiss}
          />
        )}
      </div>
      <p className="section-sub">
        {data.length} {data.length > 1 ? roleTerms.studentPlural : roleTerms.studentSingular} dans
        les stats collectives
      </p>
      {error && (
        <div className="auth-error" style={{ marginBottom: 10 }}>
          ⚠️ {error}
        </div>
      )}

      <StatsSummaryGrid
        style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginBottom: 16 }}
      >
        <StatCard icon="✅" value={totalValidated} label="Tâches validées" highlight />
        <StatCard icon="⏳" value={totalPending} label="En cours" />
        <StatCard icon="👤" value={activeStudents} label="Actifs" />
      </StatsSummaryGrid>

      <p className="section-sub" style={{ marginTop: 0, marginBottom: 8 }}>
        Tout le site (biodiversité & tutoriels)
      </p>
      <StatsSummaryGrid
        style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginBottom: 20 }}
      >
        <StatCard
          icon="🌿"
          value={siteSpecies.toLocaleString('fr-FR')}
          label="Espèces observées (catalogue)"
        />
        <StatCard
          icon="🔭"
          value={siteObsEvents.toLocaleString('fr-FR')}
          label="Observations fiches plantes"
        />
        <StatCard
          icon="📖"
          value={siteTutorials.toLocaleString('fr-FR')}
          label="Marquages tutoriel lus"
        />
      </StatsSummaryGrid>

      <div className="field" style={{ marginBottom: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`🔍 Rechercher un(e) ${roleTerms.studentSingular}...`}
          style={{ background: 'white' }}
        />
      </div>
      <div className="field" style={{ marginBottom: 12 }}>
        <select value={filterGroupId} onChange={(e) => setFilterGroupId(e.target.value)}>
          <option value="">Tous les groupes</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <TeacherObservationsPanel
        roleTerms={roleTerms}
        observations={observations}
        obsLoading={obsLoading}
        obsError={obsError}
        onLoad={loadObservations}
      />

      <TeacherLeaderboard students={data} search={search} roleTerms={roleTerms} />
    </div>
  );
}

export { StudentStats, StudentProfileEditor, TeacherStats };
