import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api, AccountDeletedError, getAuthClaims, getStoredSession, saveStoredSession, clearStoredSession } from './services/api';
import { useForetmapRealtime } from './hooks/useForetmapRealtime';
import { RT_PROF_TOOLTIPS } from './constants/realtime';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  Toast,
  TasksView,
  PlantManager,
  PlantViewer,
  ObservationNotebook,
} from './components/foretmap-views';
import { MapView } from './components/map-views';
import { AuthScreen, PinModal } from './components/auth-views';
import { StudentProfileEditor, StudentStats, TeacherStats } from './components/stats-views';
import { AuditLog } from './components/audit-views';
import { AboutView } from './components/about-views';
import { StudentAvatar } from './components/student-avatar';
import { TutorialsView } from './components/tutorials-views';
import { VisitView } from './components/visit-views';
import { ProfilesAdminView } from './components/profiles-views';

const OAUTH_ERROR_MESSAGES = {
  oauth_not_configured: 'Connexion Google indisponible (configuration serveur incomplète).',
  oauth_google_refused: 'Connexion Google annulée.',
  oauth_invalid_state: 'Connexion Google invalide (session expirée).',
  oauth_missing_code: 'Connexion Google impossible (code manquant).',
  oauth_missing_id_token: 'Connexion Google impossible (token manquant).',
  oauth_invalid_token: 'Connexion Google impossible (token invalide).',
  oauth_claims_invalid: 'Connexion Google refusée (compte non vérifié).',
  oauth_email_not_allowed: 'Adresse Google non autorisée pour ForetMap.',
  oauth_teacher_inactive: 'Compte professeur inactif.',
  oauth_teacher_no_role: 'Aucun rôle professeur attribué à ce compte.',
  oauth_server_error: 'Erreur serveur pendant la connexion Google.',
};

function decodeBase64UrlJson(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(window.atob(padded));
}

// ── APP ───────────────────────────────────────────────────────────────────────
function App() {
  const initialSession = useMemo(() => getStoredSession(), []);
  const DEFAULT_MAPS = useMemo(() => ([
    { id: 'foret', label: 'Forêt comestible', map_image_url: '/map.png', sort_order: 1 },
    { id: 'n3', label: 'N3', map_image_url: '/maps/plan%20n3.jpg', sort_order: 2 },
  ]), []);
  const [student,    setStudent]    = useState(() => initialSession?.student || null);
  const [sessionUser, setSessionUser] = useState(() => initialSession?.user || null);
  const [isTeacher,  setIsTeacher]  = useState(() => {
    const claims = getAuthClaims();
    return Array.isArray(claims?.permissions) && claims.permissions.includes('teacher.access');
  });
  const [showPin,    setShowPin]    = useState(false);
  const [showPublicVisit, setShowPublicVisit] = useState(false);
  const [showStats,  setShowStats]  = useState(false);
  const [showProfile,setShowProfile]= useState(false);
  const [tab,        setTab]        = useState('map');
  const [maps,       setMaps]       = useState(DEFAULT_MAPS);
  const [activeMapId, setActiveMapId] = useState(() => localStorage.getItem('foretmap_active_map') || 'foret');
  const [zones,      setZones]      = useState([]);
  const [tasks,      setTasks]      = useState([]);
  const [taskProjects, setTaskProjects] = useState([]);
  const [plants,     setPlants]     = useState([]);
  const [tutorials,  setTutorials]  = useState([]);
  const [markers,    setMarkers]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [toast,      setToast]      = useState(null);
  const [appVersion, setAppVersion] = useState(null);
  const [refreshMs,  setRefreshMs]  = useState(30000);
  const [serverDown, setServerDown] = useState(false);
  const [authClaims, setAuthClaims] = useState(() => getAuthClaims());
  const failCountRef = useRef(0);

  const hasPermission = useCallback((perm) => {
    return Array.isArray(authClaims?.permissions) && authClaims.permissions.includes(perm);
  }, [authClaims]);

  const hasPermissionInRole = useCallback((perm) => {
    const activePerms = Array.isArray(authClaims?.permissions) ? authClaims.permissions : [];
    const elevatablePerms = Array.isArray(authClaims?.elevatedPermissions) ? authClaims.elevatedPermissions : [];
    return activePerms.includes(perm) || elevatablePerms.includes(perm);
  }, [authClaims]);

  useEffect(() => {
    const hashRaw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    if (!hashRaw) return;
    const hashParams = new URLSearchParams(hashRaw);
    const oauthPayload = hashParams.get('oauth');
    const oauthError = hashParams.get('oauth_error');
    if (!oauthPayload && !oauthError) return;

    const cleanUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState({}, document.title, cleanUrl);

    if (oauthError) {
      setToast(OAUTH_ERROR_MESSAGES[oauthError] || 'Connexion Google refusée.');
      return;
    }
    try {
      const payload = decodeBase64UrlJson(oauthPayload);
      if (payload?.type === 'teacher' && payload?.token) {
        localStorage.setItem('foretmap_teacher_token', payload.token);
        localStorage.setItem('foretmap_auth_token', payload.token);
        saveStoredSession({
          token: payload.token,
          user: {
            id: payload?.auth?.canonicalUserId || payload?.auth?.userId || null,
            userType: 'teacher',
            displayName: payload?.auth?.roleDisplayName || 'Professeur',
          },
        });
        setSessionUser(getStoredSession()?.user || null);
        setAuthClaims(getAuthClaims());
        setIsTeacher(true);
        setToast('Connexion Google professeur réussie.');
        return;
      }
      if (payload?.type === 'student' && payload?.student) {
        const nextStudent = payload.student;
        if (nextStudent?.authToken) {
          localStorage.setItem('foretmap_auth_token', nextStudent.authToken);
        }
        localStorage.setItem('foretmap_student', JSON.stringify(nextStudent));
        saveStoredSession({
          token: nextStudent?.authToken || getStoredSession()?.token || null,
          user: {
            id: nextStudent?.auth?.canonicalUserId || nextStudent?.id || null,
            userType: 'student',
            displayName: nextStudent?.pseudo || `${nextStudent?.first_name || ''} ${nextStudent?.last_name || ''}`.trim() || 'Élève',
            email: nextStudent?.email || null,
          },
          student: nextStudent,
        });
        setStudent(nextStudent);
        setSessionUser(getStoredSession()?.user || null);
        setIsTeacher(false);
        setToast('Connexion Google élève réussie.');
        return;
      }
      setToast('Réponse Google invalide.');
    } catch (_) {
      setToast('Réponse Google illisible.');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('foretmap_active_map', activeMapId);
  }, [activeMapId]);

  useEffect(() => {
    api('/api/version').then(d => setAppVersion(d.version)).catch(err => {
      console.error('[ForetMap] version app', err);
    });
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('foretmap_sw_updated') === '1') {
        sessionStorage.removeItem('foretmap_sw_updated');
        setToast('Nouvelle version installée.');
      }
    } catch (_) {}
  }, []);

  // Called from anywhere when a 401-deleted is detected
  const forceLogout = useCallback(() => {
    clearStoredSession();
    setStudent(null);
    setSessionUser(null);
    setIsTeacher(false);
    setAuthClaims(null);
    setToast('Votre compte a été supprimé par le professeur.');
  }, []);

  const updateStudentSession = useCallback((nextStudent) => {
    setStudent(nextStudent);
    localStorage.setItem('foretmap_student', JSON.stringify(nextStudent));
    saveStoredSession({
      token: getStoredSession()?.token || nextStudent?.authToken || null,
      user: {
        id: nextStudent?.auth?.canonicalUserId || nextStudent?.id || null,
        userType: 'student',
        displayName: nextStudent?.pseudo || `${nextStudent?.first_name || ''} ${nextStudent?.last_name || ''}`.trim() || 'Élève',
        email: nextStudent?.email || null,
      },
      student: nextStudent,
    });
    setSessionUser(getStoredSession()?.user || null);
  }, []);

  // Restore session — validates against server on load
  useEffect(() => {
    const saved = localStorage.getItem('foretmap_student');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        setStudent(s); // show app immediately with cached data
        api('/api/students/register', 'POST', { studentId: s.id })
          .then(fresh => updateStudentSession(fresh))
          .catch(err => {
            if (err instanceof AccountDeletedError || err.deleted) forceLogout();
            else console.error('[ForetMap] validation session élève', err);
          });
      } catch (e) { console.error('[ForetMap] lecture session locale', e); }
    }
    const session = getStoredSession();
    if (session?.user && !session?.student) {
      setSessionUser(session.user);
    }
  }, [forceLogout, updateStudentSession]);

  useEffect(() => {
    const onExpired = () => { setIsTeacher(false); setAuthClaims(null); setSessionUser(null); setToast('Session professeur expirée.'); };
    window.addEventListener('foretmap_teacher_expired', onExpired);
    return () => window.removeEventListener('foretmap_teacher_expired', onExpired);
  }, []);

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.token) return;
    api('/api/auth/me')
      .then((d) => {
        const auth = d?.auth || null;
        if (!auth) return;
        const claims = getAuthClaims();
        setAuthClaims(claims);
        setIsTeacher(Array.isArray(claims?.permissions) && claims.permissions.includes('teacher.access'));
        if (auth.userType === 'teacher') {
          setSessionUser((prev) => ({
            id: auth.canonicalUserId || prev?.id || null,
            userType: 'teacher',
            displayName: auth.roleDisplayName || prev?.displayName || 'Professeur',
            email: prev?.email || null,
          }));
        }
      })
      .catch(() => {
        // Session absente/invalide: on laisse les états locaux existants.
      });
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const mapQuery = `map_id=${encodeURIComponent(activeMapId)}`;
      const [mapsRes, z, t, taskProjectsRes, p, m, tu] = await Promise.all([
        api('/api/maps').catch(() => DEFAULT_MAPS),
        api(`/api/zones?${mapQuery}`),
        api('/api/tasks'),
        api('/api/task-projects').catch(() => []),
        api('/api/plants'),
        api(`/api/map/markers?${mapQuery}`),
        api('/api/tutorials'),
      ]);
      const safeMaps = Array.isArray(mapsRes) && mapsRes.length > 0 ? mapsRes : DEFAULT_MAPS;
      setMaps(safeMaps);
      if (!safeMaps.some(mp => mp.id === activeMapId)) {
        setActiveMapId(safeMaps[0].id);
      }
      setZones(z); setTasks(t); setTaskProjects(Array.isArray(taskProjectsRes) ? taskProjectsRes : []);
      setPlants(p); setMarkers(m); setTutorials(tu);
      failCountRef.current = 0;
      setRefreshMs(30000);
      setServerDown(false);
    } catch(e) {
      if (e instanceof AccountDeletedError) forceLogout();
      else {
        console.error(e);
        const isServerSide = e.status == null || e.status >= 500;
        if (isServerSide) {
          failCountRef.current += 1;
          if (failCountRef.current >= 3) {
            setServerDown(true);
            setRefreshMs(120000);
          }
        }
      }
    }
    setLoading(false);
  }, [activeMapId, DEFAULT_MAPS, forceLogout]);

  const tasksForActiveMap = useMemo(() => (
    tasks.filter((t) => {
      const effectiveMapId = t.map_id_resolved || t.map_id || t.zone_map_id || t.marker_map_id || null;
      return effectiveMapId === activeMapId || effectiveMapId == null;
    })
  ), [tasks, activeMapId]);
  const studentAffiliation = (student?.affiliation || 'both').toLowerCase();
  const canAccessStudentMapTasks = isTeacher || studentAffiliation !== 'n3';

  const rtStatus = useForetmapRealtime({
    student,
    fetchAll,
    forceLogout,
    activeMapId,
    setTasks,
    setZones,
    setPlants,
    setMarkers,
  });

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (isTeacher) return;
    if (!canAccessStudentMapTasks && (tab === 'map' || tab === 'tasks')) {
      setTab('plants');
    }
  }, [isTeacher, canAccessStudentMapTasks, tab]);

  // Auto-refresh (30 s ; 2 min après 3 échecs serveur consécutifs)
  useEffect(() => {
    const id = setInterval(fetchAll, refreshMs);
    return () => clearInterval(id);
  }, [fetchAll, refreshMs]);

  const updateZone = async (id, data) => {
    await api(`/api/zones/${id}`, 'PUT', data);
    await fetchAll();
  };

  if (!student && !isTeacher) return (
    <>
      {toast && <Toast msg={toast} onDone={() => setToast(null)}/>}
      {showPublicVisit ? (
        <div id="app">
          <div className="main" style={{ paddingBottom: 20 }}>
            <VisitView
              student={null}
              isTeacher={false}
              initialMapId={activeMapId}
              onBackToAuth={() => setShowPublicVisit(false)}
              availableTutorials={[]}
            />
          </div>
          <footer className="app-footer">Version {appVersion != null ? appVersion : '…'}</footer>
        </div>
      ) : (
        <AuthScreen
          onLogin={s => {
            const userType = String(s?.auth?.userType || s?.user_type || 'student').toLowerCase();
            if (userType === 'teacher') {
              setStudent(null);
              setSessionUser({
                id: s?.auth?.canonicalUserId || s?.id || null,
                userType: 'teacher',
                displayName: s?.display_name || s?.auth?.roleDisplayName || 'Professeur',
                email: s?.email || null,
              });
            } else {
              updateStudentSession(s);
            }
            const claims = getAuthClaims();
            setAuthClaims(claims);
            setIsTeacher(Array.isArray(claims?.permissions) && claims.permissions.includes('teacher.access'));
          }}
          appVersion={appVersion}
          onVisitGuest={() => setShowPublicVisit(true)}
        />
      )}
    </>
  );
  if (loading) return (
    <div className="loader">
      <div className="loader-leaf">🌿</div>
      <p>Chargement de la forêt...</p>
    </div>
  );

  const currentUser = student || sessionUser || {
    pseudo: null,
    first_name: authClaims?.roleDisplayName || 'Utilisateur',
    last_name: '',
  };

  return (
    <div id="app">
      {serverDown && (
        <div className="fade-in" role="alert" style={{
          margin:'8px 12px 0', padding:'10px 14px', borderRadius:12,
          background:'#fef3c7', border:'1px solid #f59e0b', color:'#78350f', fontSize:'.9rem'
        }}>
          <strong>Serveur indisponible.</strong> Nouvel essai automatique toutes les 2 minutes.
          <button type="button" className="btn btn-sm" style={{marginLeft:10, verticalAlign:'middle'}}
            onClick={() => { failCountRef.current = 0; setRefreshMs(30000); setServerDown(false); fetchAll(); }}>
            Réessayer maintenant
          </button>
        </div>
      )}
      {toast && <Toast msg={toast} onDone={() => setToast(null)}/>}
      {showPin && <PinModal
        onSuccess={() => {
          const claims = getAuthClaims();
          setAuthClaims(claims);
          setIsTeacher(Array.isArray(claims?.permissions) && claims.permissions.includes('teacher.access'));
          setShowPin(false);
          setToast(claims?.elevated ? 'Droits étendus activés 🔓' : 'Session mise à jour');
        }}
        onClose={() => setShowPin(false)}
      />}
      {showStats && !isTeacher && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowStats(false)}>
          <div className="log-modal fade-in" style={{maxHeight:'88vh'}}>
            <button className="modal-close" onClick={() => setShowStats(false)}>✕</button>
            <StudentStats student={student}/>
          </div>
        </div>
      )}
      {showProfile && !isTeacher && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowProfile(false)}>
          <div className="log-modal fade-in" style={{maxHeight:'88vh'}}>
            <button className="modal-close" onClick={() => setShowProfile(false)}>✕</button>
            <StudentProfileEditor
              student={student}
              onUpdated={updateStudentSession}
              onClose={() => setShowProfile(false)}
            />
          </div>
        </div>
      )}

      <header>
        <div className="logo">
          <span>🌿</span> ForêtMap
        </div>
        <div className="header-right">
          <span
            className="app-version-badge"
            title={`Version installée: ${appVersion != null ? appVersion : 'chargement...'}`}
            aria-label={`Version ${appVersion != null ? appVersion : 'en chargement'}`}
          >
            <span className="app-version-badge__version">v{appVersion != null ? appVersion : '…'}</span>
            <span className="app-version-badge__status">à jour</span>
          </span>
          {isTeacher && rtStatus !== 'off' && (
            <span
              className="realtime-prof-wrap"
              title={RT_PROF_TOOLTIPS[rtStatus] || ''}
              aria-label={RT_PROF_TOOLTIPS[rtStatus] || 'État du temps réel'}
              role="status"
            >
              <span className={`realtime-dot realtime-dot--${rtStatus}`} aria-hidden />
            </span>
          )}
          <button
            className="user-badge"
            onClick={() => !isTeacher && setShowStats(true)}
            style={{ cursor: isTeacher ? 'default' : 'pointer' }}
            title={isTeacher ? '' : 'Voir mes statistiques'}
          >
            {!isTeacher && <StudentAvatar student={currentUser} size={20} style={{ border: 'none' }} />}
            <span className="user-badge-text">{currentUser.pseudo || `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || 'Utilisateur'}</span>
          </button>
          {!isTeacher && (
            <button
              className="lock-btn"
              title="Modifier mon profil"
              onClick={() => setShowProfile(true)}
            >
              ✏️
            </button>
          )}
          <button className={`lock-btn ${authClaims?.elevated ? 'active' : ''}`} onClick={() => {
            if (authClaims?.elevated) {
              localStorage.removeItem('foretmap_teacher_token');
              const authToken = localStorage.getItem('foretmap_auth_token');
              if (authToken) {
                saveStoredSession({ token: authToken });
              }
              const claims = getAuthClaims();
              setAuthClaims(claims);
              setToast('Droits étendus désactivés');
            } else {
              setShowPin(true);
            }
          }}>
            {authClaims?.elevated ? <>🔓 <span className="lock-label">Élevé</span></> : '🔒'}
          </button>
          <button className="lock-btn" title="Déconnexion" onClick={() => {
            clearStoredSession();
            setStudent(null); setSessionUser(null); setIsTeacher(false); setAuthClaims(null);
          }}>↩️</button>
        </div>
      </header>

      {isTeacher ? (
        <div className="main teacher-main">
          <div className="top-tabs">
            <button className={`top-tab ${tab === 'map' ? 'active' : ''}`} onClick={() => setTab('map')}>🗺️ Carte & Zones</button>
            <button className={`top-tab ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>
              ✅ Tâches {tasksForActiveMap.filter(t => t.status === 'done').length > 0 && `(${tasksForActiveMap.filter(t => t.status === 'done').length} à valider)`}
            </button>
            <button className={`top-tab ${tab === 'plants' ? 'active' : ''}`} onClick={() => setTab('plants')}>🌱 Biodiversité</button>
            <button className={`top-tab ${tab === 'tuto' ? 'active' : ''}`} onClick={() => setTab('tuto')}>📘 Tuto</button>
            <button className={`top-tab ${tab === 'stats' ? 'active' : ''}`} onClick={() => setTab('stats')}>📊 Stats</button>
            {(
              hasPermissionInRole('admin.roles.manage')
              || hasPermissionInRole('admin.users.assign_roles')
            ) && (
              <button className={`top-tab ${tab === 'profiles' ? 'active' : ''}`} onClick={() => setTab('profiles')}>
                🛡️ Profils & utilisateurs
              </button>
            )}
            <button className={`top-tab ${tab === 'audit' ? 'active' : ''}`} onClick={() => setTab('audit')}>📜 Audit</button>
            <button className={`top-tab ${tab === 'visit' ? 'active' : ''}`} onClick={() => setTab('visit')}>🧭 Visite</button>
            <button className={`top-tab ${tab === 'about' ? 'active' : ''}`} onClick={() => setTab('about')}>ℹ️ À propos</button>
          </div>
          {tab === 'map'    && <MapView zones={zones} markers={markers} tasks={tasks} plants={plants} maps={maps} activeMapId={activeMapId} onMapChange={setActiveMapId} isTeacher student={currentUser} onZoneUpdate={updateZone} onRefresh={fetchAll}/>}
          {tab === 'tasks'  && <TasksView  tasks={tasks} taskProjects={taskProjects} zones={zones} markers={markers} maps={maps} tutorials={tutorials} activeMapId={activeMapId} isTeacher student={currentUser} onRefresh={fetchAll} onForceLogout={forceLogout}/>}
          {tab === 'plants' && <PlantManager plants={plants} onRefresh={fetchAll}/>}
          {tab === 'tuto'   && <TutorialsView tutorials={tutorials} isTeacher onRefresh={fetchAll} onForceLogout={forceLogout} />}
          {tab === 'stats'  && (hasPermission('stats.read.all') ? <TeacherStats/> : <div className="empty"><p>Permission insuffisante</p></div>)}
          {tab === 'profiles' && <ProfilesAdminView/>}
          {tab === 'audit'  && (hasPermission('audit.read') ? <AuditLog/> : <div className="empty"><p>Permission insuffisante</p></div>)}
          {tab === 'visit'  && <VisitView student={currentUser} isTeacher availableTutorials={tutorials} initialMapId={activeMapId} onForceLogout={forceLogout} />}
          {tab === 'about'  && <AboutView appVersion={appVersion}/>}
        </div>
      ) : (
        <>
          <div className="main">
            {tab === 'map'    && canAccessStudentMapTasks && <MapView zones={zones} markers={markers} tasks={tasks} plants={plants} maps={maps} activeMapId={activeMapId} onMapChange={setActiveMapId} isTeacher={false} student={student} onZoneUpdate={updateZone} onRefresh={fetchAll}/>}
            {tab === 'tasks'  && canAccessStudentMapTasks && <TasksView tasks={tasks} taskProjects={taskProjects} zones={zones} markers={markers} maps={maps} tutorials={tutorials} activeMapId={activeMapId} isTeacher={false} student={student} onRefresh={fetchAll} onForceLogout={forceLogout}/>}
            {tab === 'plants' && <PlantViewer plants={plants} zones={zones}/>}
            {tab === 'tuto' && <TutorialsView tutorials={tutorials} isTeacher={false} onRefresh={fetchAll} onForceLogout={forceLogout} />}
            {tab === 'notebook' && <ObservationNotebook student={student} zones={zones}/>}
            {tab === 'visit' && <VisitView student={student} isTeacher={false} availableTutorials={tutorials} initialMapId={activeMapId} onForceLogout={forceLogout} />}
            {tab === 'about' && <AboutView appVersion={appVersion}/>}
          </div>
          <nav className="bottom-nav">
            {canAccessStudentMapTasks && (
              <button className={`nav-btn ${tab === 'map' ? 'active' : ''}`} onClick={() => setTab('map')}>
                <span className="nav-icon">🗺️</span> Carte
              </button>
            )}
            {canAccessStudentMapTasks && (
              <button className={`nav-btn ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>
                <span className="nav-icon">✅</span>
                Tâches {tasksForActiveMap.filter(t => t.assignments?.some(a => a.student_first_name === student.first_name && a.student_last_name === student.last_name) && (t.status === 'available' || t.status === 'in_progress')).length > 0
                  && `(${tasksForActiveMap.filter(t => t.assignments?.some(a => a.student_first_name === student.first_name && a.student_last_name === student.last_name) && (t.status === 'available' || t.status === 'in_progress')).length})`}
              </button>
            )}
            <button className={`nav-btn ${tab === 'plants' ? 'active' : ''}`} onClick={() => setTab('plants')}>
              <span className="nav-icon">🌱</span> Biodiversité
            </button>
            <button className={`nav-btn ${tab === 'tuto' ? 'active' : ''}`} onClick={() => setTab('tuto')}>
              <span className="nav-icon">📘</span> Tuto
            </button>
            <button className={`nav-btn ${tab === 'notebook' ? 'active' : ''}`} onClick={() => setTab('notebook')}>
              <span className="nav-icon">📓</span> Carnet
            </button>
            <button className={`nav-btn ${tab === 'visit' ? 'active' : ''}`} onClick={() => setTab('visit')}>
              <span className="nav-icon">🧭</span> Visite
            </button>
            <button className={`nav-btn ${tab === 'about' ? 'active' : ''}`} onClick={() => setTab('about')}>
              <span className="nav-icon">ℹ️</span> À propos
            </button>
          </nav>
        </>
      )}
      <footer className="app-footer">Version {appVersion != null ? appVersion : '…'}</footer>
    </div>
  );
}


export { App };
